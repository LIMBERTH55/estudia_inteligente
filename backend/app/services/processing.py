"""Pipeline de procesamiento de documentos (se ejecuta en segundo plano).

Flujo: extracción -> fragmentación -> embeddings -> análisis de temas con IA ->
unificación del temario -> cálculo de relevancia -> guía de la asignatura.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..ai import AIError, AINotConfiguredError, get_provider
from ..ai.prompts import (
    DOCUMENT_ANALYSIS_SYSTEM,
    SUBJECT_SUMMARY_SYSTEM,
    TOPIC_MERGE_SYSTEM,
    document_analysis_prompt,
    subject_summary_prompt,
    topic_merge_prompt,
)
from ..ai.schemas import ExtractedTopic, SubjectSummary, TopicExtraction, TopicMerge
from ..database import SessionLocal
from ..models import Document, DocumentChunk, Subject, Topic
from .chunking import chunk_pages
from .extraction import extract_document
from .rag import embed_chunks
from .relevance import gather_signals, importance_from_signals, normalize

logger = logging.getLogger(__name__)

MAX_ANALYSIS_CHARS = 150_000  # límite de contexto para el análisis de un documento


class ProcessingError(Exception):
    """Error controlado del pipeline (mensaje apto para el usuario)."""


def _update(db: Session, doc: Document, stage: str, progress: int) -> None:
    doc.stage = stage
    doc.progress = max(0, min(99, progress))
    db.commit()


def _refresh_subject_status(db: Session, subject: Subject) -> None:
    docs = db.query(Document).filter(Document.subject_id == subject.id).all()
    if not docs:
        subject.analysis_status = "pending"
    elif all(d.status == "ready" for d in docs):
        subject.analysis_status = "ready"
    elif any(d.status == "ready" for d in docs):
        subject.analysis_status = "partial"
    else:
        subject.analysis_status = "pending"


def recompute_importance(
    db: Session,
    subject: Subject,
    *,
    prune: bool = True,
    include_doc_ids: set[str] | None = None,
) -> None:
    """Recalcula señales e importancia de todos los temas de la asignatura.

    ``include_doc_ids`` permite contar los fragmentos de documentos que todavía
    están en estado ``processing`` (el que se acaba de analizar), que de otro
    modo quedarían fuera de la consulta y harían parecer que el material está vacío.
    """
    include_doc_ids = include_doc_ids or set()
    status_filter = Document.status == "ready"
    if include_doc_ids:
        status_filter = or_(status_filter, Document.id.in_(include_doc_ids))
    chunk_rows = (
        db.query(DocumentChunk, Document)
        .join(Document, DocumentChunk.document_id == Document.id)
        .filter(DocumentChunk.subject_id == subject.id, status_filter)
        .all()
    )
    chunks = [(c, d) for c, d in chunk_rows]
    docs_total = len({d.id for _c, d in chunks}) or 1
    has_exam = any(d.kind == "exam" for _c, d in chunks)

    topics = db.query(Topic).filter(Topic.subject_id == subject.id).all()
    signals_by_topic = {}
    for topic in topics:
        signals = gather_signals(topic.name, topic.keywords or [], topic.llm_hint, chunks)
        signals_by_topic[topic.id] = signals

    max_mentions = max((s.mentions for s in signals_by_topic.values()), default=0)

    for topic in topics:
        signals = signals_by_topic[topic.id]
        importance, factors, reasons = importance_from_signals(
            signals,
            llm_hint=topic.llm_hint,
            total_docs=docs_total,
            max_mentions=max_mentions,
            has_exam_docs=has_exam,
        )
        topic.importance = importance
        topic.importance_factors = {"scores": factors, "reasons": reasons}
        topic.mention_count = signals.mentions
        topic.document_ids = sorted(signals.doc_ids)

    # Nunca se elimina un tema por tener 0 coincidencias textuales: la IA pudo
    # redactarlo con sinónimos válidos del material. Solo se limpia el temario
    # cuando la asignatura se quedó sin documentos listos.
    if prune and not chunks:
        for topic in topics:
            db.delete(topic)
    db.commit()


def _merge_topics_with_llm(db: Session, subject: Subject, new_topics: list[ExtractedTopic]) -> None:
    """Integra los temas detectados en un documento con el temario de la asignatura."""
    provider = get_provider()
    existing = db.query(Topic).filter(Topic.subject_id == subject.id).all()
    if not existing:
        for t in new_topics:
            db.add(
                Topic(
                    subject_id=subject.id,
                    name=t.name.strip()[:300],
                    description=t.description,
                    keywords=t.keywords[:8],
                    llm_hint=t.importance_hint,
                )
            )
        db.commit()
        return

    import json

    existing_json = json.dumps(
        [
            {
                "name": t.name,
                "description": t.description,
                "importance_hint": t.llm_hint if t.llm_hint is not None else t.importance,
                "keywords": t.keywords or [],
                "is_core": (t.importance_factors.get("scores", {}).get("structure", 0) or 0) >= 50,
            }
            for t in existing
        ],
        ensure_ascii=False,
    )
    new_json = json.dumps(
        [t.model_dump() for t in new_topics],
        ensure_ascii=False,
    )

    try:
        merged = provider.generate_json(
            topic_merge_prompt(existing_json, new_json),
            TopicMerge,
            system=TOPIC_MERGE_SYSTEM,
            temperature=0.2,
        )
    except AIError as exc:
        # Sin fusión IA: agregar solo los temas que no existan ya con ese nombre
        logger.warning("Unificación de temas con IA falló (%s); se integran sin fusionar.", exc)
        existing_names = {normalize(t.name) for t in existing}
        for t in new_topics:
            if normalize(t.name) not in existing_names:
                db.add(
                    Topic(
                        subject_id=subject.id,
                        name=t.name.strip()[:300],
                        description=t.description,
                        keywords=t.keywords[:8],
                        llm_hint=t.importance_hint,
                    )
                )
        db.commit()
        return

    by_name = {normalize(t.name): t for t in existing}
    used_ids: set[str] = set()
    for mt in merged.topics:
        key = normalize(mt.name)
        row = by_name.get(key)
        if row is not None:
            row.description = mt.description or row.description
            row.keywords = mt.keywords[:8] if mt.keywords else row.keywords
            row.llm_hint = max(mt.importance_hint, row.llm_hint or 0)
            used_ids.add(row.id)
        else:
            # ¿Existe un tema muy parecido? (sinónimo que la IA no fusionó por nombre)
            row = Topic(
                subject_id=subject.id,
                name=mt.name.strip()[:300],
                description=mt.description,
                keywords=mt.keywords[:8],
                llm_hint=mt.importance_hint,
            )
            db.add(row)
            db.flush()
            by_name[key] = row
            used_ids.add(row.id)
    # No se eliminan temas existentes aquí: se conserva el historial del temario.
    db.commit()


def regenerate_subject_summary(
    db: Session, subject: Subject, *, include_doc_ids: set[str] | None = None
) -> None:
    """Genera (o regenera) la guía de estudio de la asignatura si hay documentos listos.

    ``include_doc_ids`` incluye documentos en estado ``processing`` (el que se
    acaba de analizar), igual que en ``recompute_importance``.
    """
    provider = get_provider()
    include_doc_ids = include_doc_ids or set()
    status_filter = Document.status == "ready"
    if include_doc_ids:
        status_filter = or_(status_filter, Document.id.in_(include_doc_ids))
    docs = (
        db.query(Document)
        .filter(Document.subject_id == subject.id, status_filter)
        .all()
    )
    if not docs:
        subject.summary = None
        db.commit()
        return

    topics = (
        db.query(Topic)
        .filter(Topic.subject_id == subject.id)
        .order_by(Topic.importance.desc())
        .all()
    )
    import json

    topics_json = json.dumps(
        [
            {"tema": t.name, "relevancia": t.importance, "descripcion": t.description}
            for t in topics
        ],
        ensure_ascii=False,
    )
    summaries = "\n\n".join(
        f"### Documento: {d.original_name}\n{d.ai_summary or '(sin resumen)'}" for d in docs
    )
    result = provider.generate_json(
        subject_summary_prompt(subject.name, topics_json, summaries[:60000]),
        SubjectSummary,
        system=SUBJECT_SUMMARY_SYSTEM,
        temperature=0.4,
    )
    subject.summary = result.summary_markdown
    db.commit()


def process_document(document_id: str) -> None:
    """Procesa un documento de principio a fin. Se ejecuta en un hilo aparte."""
    db = SessionLocal()
    doc = None
    try:
        doc = db.get(Document, document_id)
        if doc is None:
            return
        subject = db.get(Subject, doc.subject_id)
        if subject is None:
            return

        doc.status = "processing"
        doc.error = None
        _update(db, doc, "Extrayendo texto del documento", 5)

        path = Path(doc.stored_path)
        if not path.exists():
            raise ProcessingError("El archivo ya no está disponible en el servidor. Vuelve a subirlo.")

        def cb(pct: int, stage: str) -> None:
            _update(db, doc, stage, 5 + int(pct * 0.4))

        extraction = extract_document(path, doc.filetype, cb)
        if not extraction.pages or extraction.word_count < 15:
            raise ProcessingError(
                "No se pudo extraer texto suficiente del documento. "
                "Si es un PDF escaneado o una imagen, verifica que la IA esté configurada para OCR."
            )
        doc.page_count = extraction.page_count
        doc.word_count = extraction.word_count
        doc.ocr_used = extraction.ocr_used
        db.commit()

        _update(db, doc, "Fragmentando contenido para búsqueda", 50)
        chunks_data = chunk_pages(extraction.pages)
        if not chunks_data:
            raise ProcessingError("El documento no contiene texto fragmentable.")

        db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).delete()
        db.commit()
        chunk_rows = [
            DocumentChunk(
                document_id=doc.id,
                subject_id=doc.subject_id,
                chunk_index=i,
                content=c.content,
                page=c.page,
                section=c.section,
                is_heading=c.is_heading,
            )
            for i, c in enumerate(chunks_data)
        ]
        db.add_all(chunk_rows)
        db.commit()

        _update(db, doc, "Generando índice de búsqueda (embeddings)", 58)
        try:
            semantic_ok = embed_chunks(db, chunk_rows)
        except AINotConfiguredError:
            semantic_ok = False
        except AIError as exc:
            logger.warning("Embeddings no disponibles para %s: %s", doc.id, exc)
            semantic_ok = False
        doc.rag_mode = "semantic" if semantic_ok else "keyword"
        db.commit()

        _update(db, doc, "Analizando contenido y detectando temas con IA", 68)
        provider = get_provider()
        full_text = "\n\n".join(p.text for p in extraction.pages)
        if len(full_text) > MAX_ANALYSIS_CHARS:
            full_text = full_text[:MAX_ANALYSIS_CHARS] + "\n\n[...contenido truncado por longitud...]"
        analysis = provider.generate_json(
            document_analysis_prompt(doc.original_name, full_text),
            TopicExtraction,
            system=DOCUMENT_ANALYSIS_SYSTEM,
            temperature=0.3,
        )
        doc.ai_summary = analysis.document_summary
        db.commit()

        _update(db, doc, "Unificando el temario de la asignatura", 82)
        _merge_topics_with_llm(db, subject, analysis.topics)

        _update(db, doc, "Calculando relevancia de los temas", 90)
        recompute_importance(db, subject, include_doc_ids={doc.id})

        _update(db, doc, "Actualizando la guía de estudio", 95)
        try:
            regenerate_subject_summary(db, subject, include_doc_ids={doc.id})
        except (AIError, AINotConfiguredError) as exc:
            logger.warning("No se pudo regenerar la guía de la asignatura: %s", exc)

        warnings = extraction.warnings
        doc.stage = "Análisis completado"
        if warnings:
            doc.stage = "Análisis completado con avisos: " + " ".join(warnings)[:300]
        doc.status = "ready"
        doc.progress = 100
        doc.processed_at = datetime.now(timezone.utc)
        _refresh_subject_status(db, subject)
        db.commit()
        logger.info("Documento %s procesado correctamente.", doc.original_name)

    except (AINotConfiguredError, AIError) as exc:
        if doc is not None:
            # Si el documento ya tenía un análisis válido (p. ej. al pulsar
            # «Volver a analizar»), se conserva para no dejar la materia
            # inutilizable por una caída puntual de la IA.
            had_analysis = bool(doc.ai_summary) and (
                db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).count() > 0
            )
            if had_analysis:
                doc.status = "ready"
                doc.progress = 100
                doc.error = None
                doc.stage = "Análisis anterior conservado: falló el reprocesamiento con IA"
            else:
                doc.status = "error"
                doc.error = str(exc)
                doc.stage = "Error de IA durante el análisis"
            if doc.subject_id:
                subject = db.get(Subject, doc.subject_id)
                if subject:
                    _refresh_subject_status(db, subject)
            db.commit()
        logger.warning("Error de IA procesando documento %s: %s", document_id, exc)
    except ProcessingError as exc:
        if doc is not None:
            doc.status = "error"
            doc.error = str(exc)
            doc.stage = "Error al procesar el documento"
            db.commit()
        logger.warning("Error procesando documento %s: %s", document_id, exc)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error inesperado procesando documento %s", document_id)
        if doc is not None:
            doc.status = "error"
            doc.error = f"Error inesperado del servidor: {exc}"
            doc.stage = "Error inesperado"
            db.commit()
    finally:
        db.close()
