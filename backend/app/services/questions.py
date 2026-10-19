"""Generación de preguntas de examen a partir del material analizado.

- Solo usa contenido de los documentos (contexto RAG + temas detectados).
- Verifica cada cita (source_quote) contra los fragmentos reales del material.
- Se ejecuta en segundo plano: el frontend consulta el estado del set.
"""
from __future__ import annotations

import json
import logging
import re

from sqlalchemy.orm import Session

from ..ai import AIError, AINotConfiguredError, get_provider
from ..ai.prompts import QUESTION_GEN_SYSTEM, question_generation_prompt
from ..ai.schemas import GeneratedQuestion, GeneratedQuestions
from ..database import SessionLocal
from ..models import Document, DocumentChunk, Question, QuestionSet, Subject, Topic
from .rag import SearchHit, build_context, search_chunks, search_for_topic
from .relevance import normalize

logger = logging.getLogger(__name__)

QTYPES = {"mc", "tf", "open", "fill", "match", "problem", "analysis"}
BATCH_SIZE = 8
MAX_CONTEXT_CHARS = 26000
POINTS_BY_DIFFICULTY = {"facil": 1.0, "intermedia": 1.5, "dificil": 2.0}


def _normalize_question(gq: GeneratedQuestion) -> dict | None:
    """Valida y normaliza una pregunta generada. Devuelve None si es inválida."""
    statement = (gq.statement or "").strip()
    if len(statement) < 12:
        return None
    qtype = gq.qtype
    if qtype not in QTYPES:
        return None
    correct: dict = {}
    options: list[str] = []
    pairs: list[dict[str, str]] = []

    if qtype == "mc":
        options = [o.strip() for o in (gq.options or []) if o and o.strip()]
        if len(options) != 4 or gq.correct_index is None or not (0 <= gq.correct_index <= 3):
            return None
        correct = {"index": int(gq.correct_index)}
    elif qtype == "tf":
        if gq.correct_bool is None:
            return None
        correct = {"value": bool(gq.correct_bool)}
    elif qtype == "fill":
        accepted = [a.strip() for a in (gq.accepted_answers or []) if a and a.strip()]
        if not accepted or "____" not in statement:
            return None
        correct = {"accepted": accepted}
    elif qtype == "match":
        pairs = [
            {"left": p.left.strip(), "right": p.right.strip()}
            for p in (gq.pairs or [])
            if p.left and p.right and p.left.strip() and p.right.strip()
        ]
        if len(pairs) < 2:
            return None
        correct = {"pairs": pairs}
    else:  # open | problem | analysis
        if not (gq.model_answer or "").strip():
            return None
        correct = {"model": gq.model_answer.strip()}

    return {
        "qtype": qtype,
        "difficulty": gq.difficulty if gq.difficulty in POINTS_BY_DIFFICULTY else "intermedia",
        "topic": (gq.topic or "").strip()[:300],
        "statement": statement,
        "options": options,
        "pairs": pairs,
        "correct_answer": correct,
        "explanation": (gq.explanation or "").strip(),
        "source_quote": (gq.source_quote or "").strip()[:400],
        "source_page": gq.source_page,
    }


def _match_topic(qtopic: str, topic_map: dict[str, Topic], all_topics: list[Topic]) -> Topic | None:
    key = normalize(qtopic or "")
    if not key:
        return None
    if key in topic_map:
        return topic_map[key]
    # Coincidencia parcial: mejor solapamiento de términos con nombre + palabras clave
    q_tokens = {t for t in re.findall(r"[a-z0-9ñ]{4,}", key)}
    if not q_tokens:
        return None
    best: tuple[float, Topic | None] = (0.0, None)
    for topic in all_topics:
        topic_tokens = {
            t
            for t in re.findall(
                r"[a-z0-9ñ]{4,}", normalize(topic.name + " " + " ".join(topic.keywords or []))
            )
        }
        if not topic_tokens:
            continue
        overlap = len(q_tokens & topic_tokens) / len(q_tokens)
        if overlap > best[0]:
            best = (overlap, topic)
    return best[1] if best[0] >= 0.34 else None


def _verify_source(
    quote: str, chunks: list[tuple[DocumentChunk, Document]]
) -> dict:
    """Busca la cita textual en los fragmentos reales para verificar y ubicar la referencia."""
    ref: dict = {
        "quote": quote,
        "document_id": None,
        "document_name": None,
        "page": None,
        "section": None,
        "verified": False,
    }
    if not quote:
        return ref
    q_norm = re.sub(r"\s+", " ", normalize(quote))
    probes = [q_norm[:80], q_norm[:50], q_norm[:35]]
    for probe in probes:
        if len(probe) < 12:
            continue
        for chunk, doc in chunks:
            c_norm = re.sub(r"\s+", " ", normalize(chunk.content))
            if probe in c_norm:
                ref.update(
                    {
                        "document_id": doc.id,
                        "document_name": doc.original_name,
                        "page": chunk.page,
                        "section": chunk.section,
                        "verified": True,
                    }
                )
                return ref
    return ref


def _build_generation_context(db: Session, subject: Subject, topics: list[Topic]) -> str:
    """Contexto RAG: fragmentos de los temas seleccionados, marcados con su relevancia."""
    fragments: list[str] = []
    seen: set[str] = set()
    used_chars = 0

    def add(hits: list[SearchHit], topic_label: str | None) -> None:
        nonlocal used_chars
        for hit in hits:
            key = f"{hit.document_id}:{hit.content[:60]}"
            if key in seen:
                continue
            seen.add(key)
            loc = []
            if hit.page:
                loc.append(f"pág. {hit.page}")
            if hit.section:
                loc.append(f"sección: {hit.section}")
            header = f"[{hit.document_name}{' (' + ', '.join(loc) + ')' if loc else ''}]"
            if topic_label:
                header += f" (tema: {topic_label})"
            block = f"{header}\n{hit.content}\n"
            if used_chars + len(block) > MAX_CONTEXT_CHARS:
                return
            fragments.append(block)
            used_chars += len(block)

    for topic in topics:
        if used_chars >= MAX_CONTEXT_CHARS:
            break
        label = f"{topic.name} — relevancia {topic.importance}/100"
        add(search_for_topic(db, subject.id, topic.name, k=2), label)

    if not fragments:
        hits, _mode = search_chunks(db, subject.id, subject.name, k=8)
        add(hits, None)

    return "\n".join(fragments)


def _prepare_ai_template(topic: Topic | None, difficulty: str) -> dict:
    return {"topic": topic, "difficulty": difficulty}


def generate_question_set(set_id: str) -> None:
    """Tarea en segundo plano: genera las preguntas de un QuestionSet."""
    db = SessionLocal()
    qset: QuestionSet | None = None
    try:
        qset = db.get(QuestionSet, set_id)
        if qset is None:
            return
        subject = db.get(Subject, qset.subject_id)
        if subject is None:
            qset.status = "error"
            qset.error = "La asignatura no existe."
            db.commit()
            return

        config = dict(qset.config or {})
        count = max(1, min(60, int(config.get("count", 10))))
        difficulty = config.get("difficulty")
        if difficulty not in POINTS_BY_DIFFICULTY:
            difficulty = None
        requested_types = [t for t in (config.get("types") or []) if t in QTYPES]
        allowed_types = requested_types or sorted(QTYPES)
        topic_filter = {normalize(t) for t in (config.get("topics") or [])}

        all_topics = (
            db.query(Topic)
            .filter(Topic.subject_id == subject.id)
            .order_by(Topic.importance.desc())
            .all()
        )
        topics = [t for t in all_topics if not topic_filter or normalize(t.name) in topic_filter]
        if not topics:
            topics = all_topics[: max(4, min(8, len(all_topics)))]
        if not all_topics:
            raise AIError(
                "La asignatura todavía no tiene temas analizados. Sube documentos y espera a que termine el análisis."
            )

        context = _build_generation_context(db, subject, topics)
        if not context.strip():
            raise AIError(
                "No hay contenido disponible para generar preguntas. Verifica que los documentos estén analizados."
            )

        provider = get_provider()

        # Fragmentos para verificar las citas
        chunk_rows = (
            db.query(DocumentChunk, Document)
            .join(Document, DocumentChunk.document_id == Document.id)
            .filter(DocumentChunk.subject_id == subject.id, Document.status == "ready")
            .all()
        )
        chunks = [(c, d) for c, d in chunk_rows]

        generated: list[tuple[GeneratedQuestion, dict]] = []
        remaining = count
        batch_number = 0
        total_batches = (count + BATCH_SIZE - 1) // BATCH_SIZE
        while remaining > 0 and len(generated) < count:
            batch_number += 1
            batch_count = min(BATCH_SIZE, remaining)
            avoid = " | ".join(g.statement[:70] for g, _ in generated[-12:])
            prompt = question_generation_prompt(
                subject.name, batch_count, difficulty, allowed_types, context
            )
            if total_batches > 1:
                prompt += (
                    f"\n\nNOTA: esta es la parte {batch_number} de {total_batches} de una generación "
                    f"total de {count} preguntas. Genera EXACTAMENTE {batch_count} preguntas NUEVAS."
                )
                if avoid:
                    prompt += f" No repitas estas ya generadas: {avoid}"
            result = provider.generate_json(
                prompt,
                GeneratedQuestions,
                system=QUESTION_GEN_SYSTEM,
                temperature=0.6,
            )
            accepted_in_batch = 0
            for gq in result.questions:
                if len(generated) >= count:
                    break
                norm = _normalize_question(gq)
                if norm is None:
                    continue
                # Evitar enunciados duplicados
                if any(norm["statement"] == g[1]["statement"] for g in generated):
                    continue
                generated.append((gq, norm))
                accepted_in_batch += 1
            if accepted_in_batch == 0:
                # La IA no aportó nada válido en esta tanda: evitar bucle infinito
                remaining -= batch_count
                if len(generated) == 0:
                    break
            else:
                remaining = count - len(generated)

        if not generated:
            raise AIError(
                "La IA no devolvió preguntas válidas para este material. Inténtalo de nuevo o ajusta la configuración."
            )

        topic_map = {normalize(t.name): t for t in all_topics}
        for gq, norm in generated:
            topic = _match_topic(norm["topic"], topic_map, all_topics)
            if topic is not None:
                relevance = topic.importance
                reasons = [
                    f"Tema «{topic.name}» con relevancia estimada {topic.importance}/100."
                ] + list((topic.importance_factors or {}).get("reasons", []))
            else:
                relevance = 50
                reasons = [
                    "La pregunta proviene de contenido del material que no coincide exactamente con un tema clasificado; "
                    "relevancia estimada neutra (50/100)."
                ]
            source_ref = _verify_source(norm["source_quote"], chunks)
            if norm["source_quote"]:
                reasons.append(
                    "Respaldada por una cita verificada del material."
                    if source_ref["verified"]
                    else "La cita declarada no pudo verificarse textualmente en el material."
                )
            source_ref["llm_page"] = norm["source_page"]

            question = Question(
                set_id=qset.id,
                subject_id=subject.id,
                qtype=norm["qtype"],
                difficulty=norm["difficulty"],
                topic=topic.name if topic else norm["topic"],
                statement=norm["statement"],
                options=norm["options"],
                pairs=norm["pairs"],
                correct_answer=norm["correct_answer"],
                explanation=norm["explanation"],
                source_refs=[source_ref],
                relevance=relevance,
                relevance_reasons=reasons,
                points=POINTS_BY_DIFFICULTY[norm["difficulty"]],
            )
            db.add(question)

        config["generated"] = len(generated)
        config["requested"] = count
        if len(generated) < count:
            config["note"] = (
                f"Se generaron {len(generated)} de {count} preguntas solicitadas; "
                "el material disponible limitó la generación."
            )
        qset.config = config
        qset.status = "ready"
        qset.error = None
        db.commit()
        logger.info("Set de preguntas %s generado: %s preguntas.", set_id, len(generated))

    except (AINotConfiguredError, AIError) as exc:
        if qset is not None:
            qset.status = "error"
            qset.error = str(exc)
            db.commit()
        logger.warning("Error de IA generando set %s: %s", set_id, exc)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error inesperado generando set %s", set_id)
        if qset is not None:
            qset.status = "error"
            qset.error = f"Error inesperado del servidor: {exc}"
            db.commit()
    finally:
        db.close()
