"""Simulador de examen: crear intentos, responder, finalizar y ver resultados."""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..ai import AIError, AINotConfiguredError
from ..database import get_db
from ..deps import get_current_user
from ..models import (
    AttemptAnswer,
    ExamAttempt,
    Question,
    QuestionSet,
    StudyPlan,
    Subject,
    User,
)
from ..schemas import AttemptAnswerIn, AttemptCreateIn, StudyPlanOut
from ..services.grading import finalize_attempt
from ..services.stats import build_study_plan, topic_performance

router = APIRouter(prefix="/api/attempts", tags=["Exámenes"])

HIGH_RELEVANCE_THRESHOLD = 60


def _get_owned_attempt(attempt_id: str, db: Session, user: User) -> ExamAttempt:
    attempt = db.get(ExamAttempt, attempt_id)
    if attempt is None or attempt.user_id != user.id:
        raise HTTPException(status_code=404, detail="Intento de examen no encontrado.")
    return attempt


def _deadline(attempt: ExamAttempt) -> datetime | None:
    if attempt.time_limit_sec <= 0:
        return None
    started = attempt.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return started + timedelta(seconds=attempt.time_limit_sec)


def _ensure_finalized_if_expired(db: Session, attempt: ExamAttempt) -> None:
    if attempt.status != "in_progress":
        return
    deadline = _deadline(attempt)
    if deadline is not None and datetime.now(timezone.utc) >= deadline:
        finalize_attempt(db, attempt)


def _attempt_brief(db: Session, attempt: ExamAttempt) -> dict:
    subject = db.get(Subject, attempt.subject_id)
    answers = db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id).all()
    answered = sum(1 for a in answers if a.answer is not None)
    return {
        "id": attempt.id,
        "subject_id": attempt.subject_id,
        "subject_name": subject.name if subject else "",
        "set_id": attempt.set_id,
        "title": attempt.title,
        "mode": attempt.mode,
        "status": attempt.status,
        "time_limit_sec": attempt.time_limit_sec,
        "started_at": attempt.started_at,
        "finished_at": attempt.finished_at,
        "score": attempt.score,
        "duration_sec": attempt.duration_sec,
        "questions_count": len(attempt.question_order or []),
        "answered_count": answered,
    }


def _reveal(question: Question, answer: AttemptAnswer | None) -> dict | None:
    """Respuesta correcta + explicación (solo modo práctica o examen finalizado)."""
    return {
        "correct_answer": question.correct_answer or {},
        "explanation": question.explanation or "",
        "is_correct": answer.is_correct if answer else None,
        "points_awarded": answer.points_awarded if answer else None,
        "feedback": answer.ai_feedback if answer else None,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_attempt(
    payload: AttemptCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    qset = db.get(QuestionSet, payload.set_id)
    if qset is None or qset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conjunto de preguntas no encontrado.")
    if qset.status != "ready":
        raise HTTPException(status_code=400, detail="Las preguntas de este conjunto aún no están listas.")

    questions = db.query(Question).filter(Question.set_id == qset.id).all()
    if not questions:
        raise HTTPException(status_code=400, detail="El conjunto no tiene preguntas.")

    if payload.only_high_relevance:
        questions.sort(key=lambda q: q.relevance, reverse=True)
        if payload.question_count:
            questions = questions[: payload.question_count]
        high = [q for q in questions if q.relevance >= HIGH_RELEVANCE_THRESHOLD]
        selected = high or questions[: min(len(questions), payload.question_count or len(questions))]
    else:
        if payload.question_count and payload.question_count < len(questions):
            selected = random.sample(questions, payload.question_count)
        else:
            selected = list(questions)

    random.shuffle(selected)
    subject = db.get(Subject, qset.subject_id)
    title = payload.title.strip() or f"Examen de {subject.name if subject else 'asignatura'}"

    attempt = ExamAttempt(
        user_id=user.id,
        subject_id=qset.subject_id,
        set_id=qset.id,
        title=title[:200],
        mode=payload.mode,
        status="in_progress",
        time_limit_sec=payload.time_limit_sec,
        question_order=[q.id for q in selected],
    )
    db.add(attempt)
    db.flush()
    for question in selected:
        db.add(
            AttemptAnswer(
                attempt_id=attempt.id,
                question_id=question.id,
                answer=None,
                flagged=False,
            )
        )
    db.commit()
    db.refresh(attempt)
    return _attempt_brief(db, attempt)


@router.get("", response_model=list[dict])
def list_attempts(
    subject_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    query = db.query(ExamAttempt).filter(ExamAttempt.user_id == user.id)
    if subject_id:
        query = query.filter(ExamAttempt.subject_id == subject_id)
    attempts = query.order_by(ExamAttempt.started_at.desc()).all()
    # Auto-finalizar los que hayan expirado (según su límite de tiempo)
    for attempt in attempts:
        _ensure_finalized_if_expired(db, attempt)
    return [_attempt_brief(db, a) for a in attempts]


@router.get("/{attempt_id}")
def get_attempt_state(
    attempt_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    attempt = _get_owned_attempt(attempt_id, db, user)
    _ensure_finalized_if_expired(db, attempt)

    questions = {
        q.id: q
        for q in db.query(Question).filter(Question.set_id == attempt.set_id).all()
    }
    answers = {
        a.question_id: a
        for a in db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id).all()
    }

    remaining = None
    deadline = _deadline(attempt)
    if remaining_needed := (attempt.status == "in_progress" and deadline is not None):
        remaining = max(0, int((deadline - datetime.now(timezone.utc)).total_seconds()))

    state_questions = []
    for qid in attempt.question_order or []:
        question = questions.get(qid)
        if question is None:
            continue
        row = {
            "id": question.id,
            "qtype": question.qtype,
            "difficulty": question.difficulty,
            "topic": question.topic,
            "statement": question.statement,
            "options": question.options or [],
            "pairs": question.pairs or [],
            "relevance": question.relevance,
            "relevance_reasons": question.relevance_reasons or [],
            "source_refs": question.source_refs or [],
            "points": question.points,
        }
        answer = answers.get(question.id)
        if attempt.mode == "practice" and answer is not None and answer.answer is not None:
            row["reveal"] = _reveal(question, answer)
        if attempt.status == "finished":
            row["reveal"] = _reveal(question, answer)
        state_questions.append(row)

    return {
        "attempt": _attempt_brief(db, attempt),
        "remaining_sec": remaining,
        "questions": state_questions,
        "answers": {
            qid: {"answer": a.answer, "flagged": a.flagged}
            for qid, a in answers.items()
        },
    }


@router.patch("/{attempt_id}/answers/{question_id}")
def save_answer(
    attempt_id: str,
    question_id: str,
    payload: AttemptAnswerIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    attempt = _get_owned_attempt(attempt_id, db, user)
    _ensure_finalized_if_expired(db, attempt)
    if attempt.status != "in_progress":
        raise HTTPException(status_code=409, detail="El examen ya fue entregado; no admite cambios.")
    if question_id not in (attempt.question_order or []):
        raise HTTPException(status_code=404, detail="La pregunta no pertenece a este examen.")

    answer = (
        db.query(AttemptAnswer)
        .filter(AttemptAnswer.attempt_id == attempt.id, AttemptAnswer.question_id == question_id)
        .first()
    )
    if answer is None:
        raise HTTPException(status_code=404, detail="Respuesta no encontrada.")

    answer.answer = payload.answer
    answer.flagged = payload.flagged
    db.commit()

    reveal = None
    if attempt.mode == "practice" and payload.answer is not None:
        question = db.get(Question, question_id)
        if question is not None and question.qtype not in {"open", "problem", "analysis"}:
            from ..services.grading import grade_objective

            is_correct, ratio, feedback = grade_objective(question, payload.answer)
            answer.is_correct = is_correct
            answer.points_awarded = round(ratio * question.points, 3)
            answer.ai_feedback = feedback
            db.commit()
            reveal = _reveal(question, answer)
    return {"saved": True, "reveal": reveal, "flagged": payload.flagged}


@router.post("/{attempt_id}/finish")
def finish_attempt(
    attempt_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    attempt = _get_owned_attempt(attempt_id, db, user)
    if attempt.status in {"finished", "grading"}:
        return _attempt_brief(db, attempt)
    finalize_attempt(db, attempt)
    db.refresh(attempt)
    return _attempt_brief(db, attempt)


@router.get("/{attempt_id}/results")
def attempt_results(
    attempt_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    attempt = _get_owned_attempt(attempt_id, db, user)
    _ensure_finalized_if_expired(db, attempt)
    if attempt.status != "finished":
        raise HTTPException(
            status_code=409,
            detail="El examen todavía está en curso. Finalízalo para ver los resultados.",
        )

    questions = {
        q.id: q
        for q in db.query(Question).filter(Question.set_id == attempt.set_id).all()
    }
    answers = {
        a.question_id: a
        for a in db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id).all()
    }
    rows = []
    for qid in attempt.question_order or []:
        question = questions.get(qid)
        if question is None:
            continue
        answer = answers.get(question.id)
        rows.append(
            {
                "id": question.id,
                "qtype": question.qtype,
                "difficulty": question.difficulty,
                "topic": question.topic,
                "statement": question.statement,
                "options": question.options or [],
                "pairs": question.pairs or [],
                "correct_answer": question.correct_answer or {},
                "explanation": question.explanation,
                "source_refs": question.source_refs or [],
                "relevance": question.relevance,
                "relevance_reasons": question.relevance_reasons or [],
                "points": question.points,
                "answer": answer.answer if answer else None,
                "flagged": answer.flagged if answer else False,
                "is_correct": answer.is_correct if answer else None,
                "points_awarded": answer.points_awarded if answer else None,
                "feedback": answer.ai_feedback if answer else None,
            }
        )
    graded = sum(1 for r in rows if r["points_awarded"] is not None)
    return {
        "attempt": _attempt_brief(db, attempt),
        "questions": rows,
        "by_topic": topic_performance(db, user.id, attempt.subject_id),
        "graded_count": graded,
        "ungraded_count": len(rows) - graded,
    }


@router.delete("/{attempt_id}", status_code=204)
def delete_attempt(
    attempt_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    attempt = _get_owned_attempt(attempt_id, db, user)
    db.delete(attempt)
    db.commit()


@router.post("/{attempt_id}/study-plan", response_model=StudyPlanOut)
def create_study_plan(
    attempt_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudyPlan:
    attempt = _get_owned_attempt(attempt_id, db, user)
    if attempt.status != "finished":
        raise HTTPException(status_code=400, detail="Primero finaliza el examen para generar tu plan de estudio.")
    try:
        return build_study_plan(db, attempt)
    except AINotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/{attempt_id}/study-plan", response_model=StudyPlanOut | None)
def get_attempt_study_plan(
    attempt_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudyPlan | None:
    attempt = _get_owned_attempt(attempt_id, db, user)
    return (
        db.query(StudyPlan)
        .filter(StudyPlan.attempt_id == attempt.id)
        .order_by(StudyPlan.created_at.desc())
        .first()
    )
