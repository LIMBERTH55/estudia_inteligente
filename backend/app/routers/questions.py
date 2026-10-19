"""Generación y consulta de conjuntos de preguntas."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, get_owned_subject
from ..models import ExamAttempt, Question, QuestionSet, User
from ..schemas import QuestionSetIn, QuestionSetListItem, QuestionSetOut
from ..services.questions import generate_question_set

router = APIRouter(tags=["Preguntas"])


def _question_preview(q: Question, *, include_answers: bool = False) -> dict:
    data = {
        "id": q.id,
        "qtype": q.qtype,
        "difficulty": q.difficulty,
        "topic": q.topic,
        "statement": q.statement,
        "options": q.options or [],
        "pairs": q.pairs or [],
        "relevance": q.relevance,
        "relevance_reasons": q.relevance_reasons or [],
        "source_refs": q.source_refs or [],
        "points": q.points,
    }
    if include_answers:
        data["correct_answer"] = q.correct_answer or {}
        data["explanation"] = q.explanation
    return data


def _get_owned_set(set_id: str, db: Session, user: User) -> QuestionSet:
    qset = db.get(QuestionSet, set_id)
    if qset is None or qset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conjunto de preguntas no encontrado.")
    return qset


@router.post(
    "/api/subjects/{subject_id}/question-sets",
    response_model=QuestionSetOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_question_set(
    subject_id: str,
    payload: QuestionSetIn,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_owned_subject(subject_id, db, user)
    # Validación temprana: ¿hay material analizado?
    from ..models import Document

    ready = (
        db.query(Document)
        .filter(Document.subject_id == subject.id, Document.status == "ready")
        .count()
    )
    if ready == 0:
        raise HTTPException(
            status_code=400,
            detail="Esta asignatura no tiene documentos analizados todavía. Sube material y espera el análisis.",
        )
    qset = QuestionSet(
        subject_id=subject.id,
        user_id=user.id,
        status="generating",
        config=payload.model_dump(),
    )
    db.add(qset)
    db.commit()
    db.refresh(qset)
    background.add_task(generate_question_set, qset.id)
    return {
        "id": qset.id,
        "subject_id": qset.subject_id,
        "status": qset.status,
        "error": qset.error,
        "config": qset.config,
        "created_at": qset.created_at,
        "questions": [],
    }


@router.get("/api/question-sets/{set_id}", response_model=QuestionSetOut)
def get_question_set(
    set_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    qset = _get_owned_set(set_id, db, user)
    questions = []
    if qset.status == "ready":
        rows = (
            db.query(Question)
            .filter(Question.set_id == qset.id)
            .order_by(Question.relevance.desc())
            .all()
        )
        questions = [_question_preview(q) for q in rows]
    return {
        "id": qset.id,
        "subject_id": qset.subject_id,
        "status": qset.status,
        "error": qset.error,
        "config": qset.config,
        "created_at": qset.created_at,
        "questions": questions,
    }


@router.get("/api/subjects/{subject_id}/question-sets", response_model=list[QuestionSetListItem])
def list_question_sets(
    subject_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    subject = get_owned_subject(subject_id, db, user)
    sets = (
        db.query(QuestionSet)
        .filter(QuestionSet.subject_id == subject.id)
        .order_by(QuestionSet.created_at.desc())
        .all()
    )
    result = []
    for qset in sets:
        count = db.query(Question).filter(Question.set_id == qset.id).count()
        result.append(
            {
                "id": qset.id,
                "subject_id": qset.subject_id,
                "status": qset.status,
                "error": qset.error,
                "config": qset.config,
                "created_at": qset.created_at,
                "questions_count": count,
            }
        )
    return result


@router.delete("/api/question-sets/{set_id}", status_code=204)
def delete_question_set(
    set_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    qset = _get_owned_set(set_id, db, user)
    attempts = db.query(ExamAttempt).filter(ExamAttempt.set_id == qset.id).count()
    if attempts > 0:
        raise HTTPException(
            status_code=409,
            detail="Este conjunto ya tiene exámenes asociados; no se puede eliminar.",
        )
    db.delete(qset)
    db.commit()
