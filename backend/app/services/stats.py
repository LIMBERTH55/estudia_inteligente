"""Estadísticas del estudiante y planes de estudio personalizados."""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..ai import get_provider
from ..ai.prompts import STUDY_PLAN_SYSTEM, study_plan_prompt
from ..ai.schemas import StudyPlanContent
from ..models import (
    AttemptAnswer,
    Document,
    ExamAttempt,
    Question,
    QuestionSet,
    StudyPlan,
    Subject,
    Topic,
    User,
)


def _finished_attempts(db: Session, user_id: str, subject_id: str | None = None):
    query = db.query(ExamAttempt).filter(
        ExamAttempt.user_id == user_id, ExamAttempt.status == "finished"
    )
    if subject_id:
        query = query.filter(ExamAttempt.subject_id == subject_id)
    return query.order_by(ExamAttempt.finished_at.asc()).all()


def topic_performance(db: Session, user_id: str, subject_id: str) -> list[dict]:
    """Aciertos por tema en los intentos finalizados de una asignatura."""
    rows = (
        db.query(Question.topic, AttemptAnswer.is_correct)
        .join(AttemptAnswer, AttemptAnswer.question_id == Question.id)
        .join(ExamAttempt, ExamAttempt.id == AttemptAnswer.attempt_id)
        .filter(
            ExamAttempt.user_id == user_id,
            ExamAttempt.subject_id == subject_id,
            ExamAttempt.status == "finished",
            AttemptAnswer.is_correct.isnot(None),
        )
        .all()
    )
    stats: dict[str, dict] = {}
    for topic, is_correct in rows:
        entry = stats.setdefault(topic or "(sin tema)", {"answered": 0, "correct": 0})
        entry["answered"] += 1
        if is_correct:
            entry["correct"] += 1
    result = []
    topics = {
        t.name: t
        for t in db.query(Topic).filter(Topic.subject_id == subject_id).all()
    }
    for name, entry in sorted(stats.items(), key=lambda kv: -kv[1]["answered"]):
        accuracy = round(100.0 * entry["correct"] / entry["answered"], 1) if entry["answered"] else 0.0
        trow = topics.get(name)
        result.append(
            {
                "topic": name,
                "answered": entry["answered"],
                "correct": entry["correct"],
                "accuracy": accuracy,
                "relevance": trow.importance if trow else None,
            }
        )
    return result


def subject_stats(db: Session, user_id: str, subject: Subject) -> dict:
    attempts = _finished_attempts(db, user_id, subject.id)
    scores = [a.score or 0.0 for a in attempts]
    series = [
        {
            "attempt_id": a.id,
            "title": a.title,
            "date": a.finished_at.isoformat() if a.finished_at else None,
            "score": a.score,
            "mode": a.mode,
        }
        for a in attempts[-12:]
    ]
    return {
        "subject_id": subject.id,
        "attempts_count": len(attempts),
        "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
        "last_score": scores[-1] if scores else None,
        "best_score": max(scores) if scores else None,
        "score_series": series,
        "topics": topic_performance(db, user_id, subject.id),
    }


def dashboard(db: Session, user: User) -> dict:
    subjects = (
        db.query(Subject)
        .filter(Subject.user_id == user.id)
        .order_by(Subject.created_at.desc())
        .all()
    )
    subject_cards = []
    for subject in subjects:
        docs = db.query(Document).filter(Document.subject_id == subject.id).all()
        attempts = _finished_attempts(db, user.id, subject.id)
        last_score = attempts[-1].score if attempts else None
        subject_cards.append(
            {
                "id": subject.id,
                "name": subject.name,
                "color": subject.color,
                "analysis_status": subject.analysis_status,
                "documents_count": len(docs),
                "documents_ready": sum(1 for d in docs if d.status == "ready"),
                "documents_processing": sum(1 for d in docs if d.status in {"uploaded", "processing"}),
                "topics_count": db.query(func.count(Topic.id)).filter(Topic.subject_id == subject.id).scalar() or 0,
                "attempts_count": len(attempts),
                "last_score": last_score,
                "created_at": subject.created_at.isoformat() if subject.created_at else None,
            }
        )

    all_attempts = _finished_attempts(db, user.id)
    scores = [a.score or 0.0 for a in all_attempts]
    recent = (
        db.query(ExamAttempt)
        .filter(ExamAttempt.user_id == user.id)
        .order_by(ExamAttempt.started_at.desc())
        .limit(6)
        .all()
    )
    recent_rows = []
    for attempt in recent:
        subject = db.get(Subject, attempt.subject_id)
        recent_rows.append(
            {
                "id": attempt.id,
                "title": attempt.title,
                "subject_name": subject.name if subject else "",
                "mode": attempt.mode,
                "status": attempt.status,
                "score": attempt.score,
                "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
            }
        )

    priority_topics = (
        db.query(Topic, Subject.name)
        .join(Subject, Topic.subject_id == Subject.id)
        .filter(Subject.user_id == user.id)
        .order_by(Topic.importance.desc())
        .limit(6)
        .all()
    )

    docs_total = (
        db.query(func.count(Document.id)).filter(Document.user_id == user.id).scalar() or 0
    )
    docs_ready = (
        db.query(func.count(Document.id))
        .filter(Document.user_id == user.id, Document.status == "ready")
        .scalar()
        or 0
    )
    sets_total = (
        db.query(func.count(QuestionSet.id))
        .filter(QuestionSet.user_id == user.id)
        .scalar()
        or 0
    )

    return {
        "subjects": subject_cards,
        "totals": {
            "subjects": len(subjects),
            "documents": docs_total,
            "documents_ready": docs_ready,
            "question_sets": sets_total,
            "attempts": len(all_attempts),
            "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
            "last_score": scores[-1] if scores else None,
        },
        "priority_topics": [
            {
                "topic": t.name,
                "subject_id": s_id,
                "subject_name": s_name,
                "importance": t.importance,
            }
            for t, s_name in priority_topics
            for s_id in [t.subject_id]
        ],
        "recent_attempts": recent_rows,
        "score_series": [
            {
                "date": a.finished_at.isoformat() if a.finished_at else None,
                "score": a.score,
                "title": a.title,
            }
            for a in all_attempts[-12:]
        ],
    }


def build_study_plan(db: Session, attempt: ExamAttempt) -> StudyPlan:
    """Genera un plan de estudio personalizado a partir de un intento finalizado."""
    subject = db.get(Subject, attempt.subject_id)
    if subject is None:
        raise ValueError("Asignatura no encontrada.")

    answers = db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id).all()
    by_topic: dict[str, dict] = {}
    wrong_rows: list[str] = []
    for ans in answers:
        question = db.get(Question, ans.question_id)
        if question is None or ans.is_correct is None:
            continue
        entry = by_topic.setdefault(question.topic or "(sin tema)", {"answered": 0, "correct": 0})
        entry["answered"] += 1
        if ans.is_correct:
            entry["correct"] += 1
        else:
            wrong_rows.append(
                f"- ({question.topic}) {question.statement[:180]} — "
                f"Tu respuesta: {str((ans.answer or {}).get('text') or ans.answer)[:140]}. "
                f"Explicación: {(question.explanation or '')[:180]}"
            )

    topic_rows = "\n".join(
        f"- {name}: {e['correct']}/{e['answered']} correctas" for name, e in by_topic.items()
    ) or "(sin datos de temas)"
    wrong_text = "\n".join(wrong_rows[:14]) or "(no hubo preguntas falladas con calificación automática)"

    provider = get_provider()
    content = provider.generate_json(
        study_plan_prompt(subject.name, attempt.score, topic_rows, wrong_text),
        StudyPlanContent,
        system=STUDY_PLAN_SYSTEM,
        temperature=0.4,
    )

    plan = StudyPlan(
        user_id=attempt.user_id,
        subject_id=attempt.subject_id,
        attempt_id=attempt.id,
        content=content.model_dump(),
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan
