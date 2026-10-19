"""Calificación de exámenes: objetivas automáticas + abiertas con IA y rúbrica."""
from __future__ import annotations

import logging
import re
import unicodedata
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..ai import get_provider
from ..ai.prompts import GRADING_SYSTEM, grading_prompt
from ..ai.schemas import GradeOpenAnswers
from ..models import AttemptAnswer, ExamAttempt, Question

logger = logging.getLogger(__name__)

OPEN_TYPES = {"open", "problem", "analysis"}


def _norm(text: str) -> str:
    """Normaliza respuestas de texto: minúsculas, sin acentos ni puntuación extra."""
    text = unicodedata.normalize("NFD", (text or "").lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[^\w\sáéíóúüñ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def grade_objective(question: Question, answer: dict | None) -> tuple[bool, float, str | None]:
    """Califica preguntas objetivas. Devuelve (is_correct, ratio 0-1, feedback)."""
    correct = question.correct_answer or {}
    if not answer:
        return False, 0.0, "Sin respuesta."

    if question.qtype == "mc":
        idx = answer.get("index")
        good = correct.get("index")
        if idx is None:
            return False, 0.0, "Sin respuesta."
        ok = idx == good
        if ok:
            return True, 1.0, "Correcto."
        correct_text = ""
        if isinstance(good, int) and 0 <= good < len(question.options or []):
            correct_text = f"La opción correcta era: «{question.options[good]}»."
        return False, 0.0, f"Incorrecto. {correct_text}".strip()

    if question.qtype == "tf":
        val = answer.get("value")
        if val is None:
            return False, 0.0, "Sin respuesta."
        ok = bool(val) == bool(correct.get("value"))
        return ok, 1.0 if ok else 0.0, "Correcto." if ok else "Incorrecto: el valor de verdad es el opuesto."

    if question.qtype == "fill":
        values = answer.get("values") or []
        accepted = correct.get("accepted") or []
        if not values:
            return False, 0.0, "Sin respuesta."
        total = len(accepted)
        hits = 0
        for i, acc in enumerate(accepted):
            given = values[i] if i < len(values) else ""
            if _norm(given) and _norm(given) == _norm(acc):
                hits += 1
        ratio = hits / total if total else 0.0
        ok = hits == total and total > 0
        official = ", ".join(f"«{a}»" for a in accepted)
        feedback = (
            f"Correcto: {hits}/{total} espacios."
            if not ok
            else "Correcto."
        )
        if not ok:
            feedback += f" Respuesta(s) esperada(s): {official}."
        return ok, ratio, feedback

    if question.qtype == "match":
        given = answer.get("pairs") or []
        official = correct.get("pairs") or []
        if not given:
            return False, 0.0, "Sin respuesta."
        given_map = {_norm(p.get("left", "")): _norm(p.get("right", "")) for p in given if isinstance(p, dict)}
        total = len(official)
        hits = 0
        for pair in official:
            left = _norm(pair.get("left", ""))
            right = _norm(pair.get("right", ""))
            if left in given_map and given_map[left] == right:
                hits += 1
        ratio = hits / total if total else 0.0
        ok = hits == total and total > 0
        feedback = f"{hits}/{total} pares correctos." if not ok else "Correcto."
        return ok, ratio, feedback

    return False, 0.0, None


def _score_attempt(db: Session, attempt: ExamAttempt) -> None:
    """Calcula la calificación final (sobre 100) usando los puntos otorgados."""
    answers = db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id).all()
    considered = 0.0
    awarded = 0.0
    correct_count = 0
    for ans in answers:
        if ans.points_awarded is None:
            continue
        question = db.get(Question, ans.question_id)
        if question is None:
            continue
        considered += question.points
        awarded += ans.points_awarded
        if ans.is_correct:
            correct_count += 1
    attempt.max_points = considered
    attempt.score = round(100.0 * awarded / considered, 1) if considered > 0 else 0.0
    attempt.status = "finished"
    attempt.finished_at = datetime.now(timezone.utc)
    if attempt.started_at is not None:
        started = attempt.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        attempt.duration_sec = max(0, int((attempt.finished_at - started).total_seconds()))
    db.commit()


def finalize_attempt(db: Session, attempt: ExamAttempt) -> None:
    """Califica todas las respuestas y cierra el intento."""
    questions = db.query(Question).filter(Question.set_id == attempt.set_id).all()
    qmap = {q.id: q for q in questions}
    answers = db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id).all()

    open_items: list[dict] = []
    open_answers: dict[int, AttemptAnswer] = {}

    for ans in answers:
        question = qmap.get(ans.question_id)
        if question is None:
            continue
        if question.qtype in OPEN_TYPES:
            open_items.append(
                {
                    "index": len(open_items),
                    "qtype": question.qtype,
                    "statement": question.statement,
                    "model_answer": (question.correct_answer or {}).get("model", ""),
                    "source_quote": (question.source_refs or [{}])[0].get("quote", "") if question.source_refs else "",
                    "student_answer": (ans.answer or {}).get("text", ""),
                }
            )
            open_answers[open_items[-1]["index"]] = ans
        else:
            is_correct, ratio, feedback = grade_objective(question, ans.answer)
            ans.is_correct = is_correct
            ans.points_awarded = round(ratio * question.points, 3)
            ans.ai_feedback = feedback
    db.commit()

    # Preguntas abiertas: una sola llamada a la IA con todas
    if open_items:
        try:
            provider = get_provider()
            result = provider.generate_json(
                grading_prompt(open_items),
                GradeOpenAnswers,
                system=GRADING_SYSTEM,
                temperature=0.2,
            )
            graded_by_index = {g.index: g for g in result.grades}
            for index, ans in open_answers.items():
                question = qmap.get(ans.question_id)
                grade = graded_by_index.get(index)
                if grade is None:
                    ans.is_correct = None
                    ans.points_awarded = None
                    ans.ai_feedback = "La IA no devolvió calificación para esta respuesta."
                    continue
                ratio = max(0.0, min(1.0, grade.score_ratio))
                ans.is_correct = grade.is_correct
                if question is not None:
                    ans.points_awarded = round(ratio * question.points, 3)
                feedback = grade.feedback.strip()
                if grade.missing_points:
                    feedback += "\n\nPuntos a reforzar: " + "; ".join(grade.missing_points[:5])
                ans.ai_feedback = feedback
        except Exception as exc:  # noqa: BLE001
            logger.warning("No se pudieron calificar preguntas abiertas con IA: %s", exc)
            for ans in open_answers.values():
                ans.is_correct = None
                ans.points_awarded = None
                ans.ai_feedback = (
                    "Esta respuesta abierta no pudo calificarse con IA "
                    f"({exc}). Corrige manualmente o vuelve a intentarlo cuando la IA esté disponible."
                )
        db.commit()

    _score_attempt(db, attempt)
