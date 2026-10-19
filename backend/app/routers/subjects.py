"""Gestión de asignaturas (materias), temas y guía de estudio."""
from __future__ import annotations

import shutil

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user, get_owned_subject
from ..models import Document, ExamAttempt, Subject, Topic, User
from ..schemas import SubjectIn, SubjectOut, SubjectUpdate, TopicOut
from ..services.processing import recompute_importance, regenerate_subject_summary

router = APIRouter(prefix="/api/subjects", tags=["Asignaturas"])


def subject_out(db: Session, subject: Subject) -> dict:
    docs = db.query(Document).filter(Document.subject_id == subject.id).all()
    topics_count = (
        db.query(func.count(Topic.id)).filter(Topic.subject_id == subject.id).scalar() or 0
    )
    attempts_count = (
        db.query(func.count(ExamAttempt.id))
        .filter(ExamAttempt.subject_id == subject.id, ExamAttempt.status == "finished")
        .scalar()
        or 0
    )
    return {
        "id": subject.id,
        "name": subject.name,
        "description": subject.description or "",
        "color": subject.color,
        "analysis_status": subject.analysis_status,
        "summary": subject.summary,
        "created_at": subject.created_at,
        "updated_at": subject.updated_at,
        "documents_count": len(docs),
        "documents_ready": sum(1 for d in docs if d.status == "ready"),
        "documents_processing": sum(1 for d in docs if d.status in {"uploaded", "processing"}),
        "topics_count": topics_count,
        "attempts_count": attempts_count,
    }


@router.get("", response_model=list[SubjectOut])
def list_subjects(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[dict]:
    subjects = (
        db.query(Subject)
        .filter(Subject.user_id == user.id)
        .order_by(Subject.created_at.desc())
        .all()
    )
    return [subject_out(db, s) for s in subjects]


@router.post("", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
def create_subject(
    payload: SubjectIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    subject = Subject(
        user_id=user.id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        color=payload.color or "violet",
    )
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject_out(db, subject)


@router.get("/{subject_id}", response_model=SubjectOut)
def get_subject(
    subject_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_owned_subject(subject_id, db, user)
    return subject_out(db, subject)


@router.patch("/{subject_id}", response_model=SubjectOut)
def update_subject(
    subject_id: str,
    payload: SubjectUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_owned_subject(subject_id, db, user)
    if payload.name is not None:
        subject.name = payload.name.strip()
    if payload.description is not None:
        subject.description = payload.description.strip()
    if payload.color is not None:
        subject.color = payload.color
    db.commit()
    db.refresh(subject)
    return subject_out(db, subject)


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(
    subject_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    subject = get_owned_subject(subject_id, db, user)
    folder = settings.storage_path / "users" / user.id / subject.id
    if folder.exists():
        shutil.rmtree(folder, ignore_errors=True)
    db.delete(subject)  # cascada: documentos, temas, sets, intentos...
    db.commit()


@router.get("/{subject_id}/topics", response_model=list[TopicOut])
def list_topics(
    subject_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    subject = get_owned_subject(subject_id, db, user)
    topics = (
        db.query(Topic)
        .filter(Topic.subject_id == subject.id)
        .order_by(Topic.importance.desc())
        .all()
    )
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description or "",
            "keywords": t.keywords or [],
            "importance": t.importance,
            "reasons": (t.importance_factors or {}).get("reasons", []),
            "scores": (t.importance_factors or {}).get("scores", {}),
            "mention_count": t.mention_count,
            "document_ids": t.document_ids or [],
            "llm_hint": t.llm_hint,
            "updated_at": t.updated_at,
        }
        for t in topics
    ]


@router.post("/{subject_id}/reanalyze", status_code=status.HTTP_202_ACCEPTED)
def reanalyze_subject(
    subject_id: str,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Recalcula relevancia de temas y regenera la guía de estudio."""
    subject = get_owned_subject(subject_id, db, user)

    def _job(subject_id: str) -> None:
        from ..database import SessionLocal

        job_db = SessionLocal()
        try:
            subject_row = job_db.get(Subject, subject_id)
            if subject_row is None:
                return
            recompute_importance(job_db, subject_row)
            try:
                regenerate_subject_summary(job_db, subject_row)
            except Exception:  # noqa: BLE001
                pass
        finally:
            job_db.close()

    background.add_task(_job, subject.id)
    return {"detail": "Recálculo iniciado."}
