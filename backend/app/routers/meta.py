"""Endpoints de panel (dashboard), estadísticas y estado del sistema/IA."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..ai import provider_status
from ..database import get_db
from ..deps import get_current_user, get_owned_subject
from ..models import StudyPlan, User
from ..schemas import StudyPlanOut
from ..services.stats import dashboard, subject_stats

router = APIRouter(prefix="/api", tags=["Panel y estadísticas"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "ExamPredict AI"}


@router.get("/ai/status")
def ai_status(user: User = Depends(get_current_user)) -> dict:
    return provider_status()


@router.get("/dashboard")
def get_dashboard(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    return dashboard(db, user)


@router.get("/subjects/{subject_id}/stats")
def get_subject_stats(
    subject_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_owned_subject(subject_id, db, user)
    return subject_stats(db, user.id, subject)


@router.get("/study-plans", response_model=list[StudyPlanOut])
def list_study_plans(
    subject_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[StudyPlan]:
    query = db.query(StudyPlan).filter(StudyPlan.user_id == user.id)
    if subject_id:
        query = query.filter(StudyPlan.subject_id == subject_id)
    return query.order_by(StudyPlan.created_at.desc()).limit(30).all()
