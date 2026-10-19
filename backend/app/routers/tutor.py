"""Tutor virtual: sesiones de chat por asignatura."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..ai import AIError, AINotConfiguredError
from ..database import get_db
from ..deps import get_current_user, get_owned_subject
from ..models import ChatMessage, ChatSession, Subject, User
from ..schemas import ChatMessageIn, ChatMessageOut, ChatSessionIn, ChatSessionOut
from ..services.tutor import answer_question

router = APIRouter(prefix="/api/tutor", tags=["Tutor virtual"])


def _get_owned_session(session_id: str, db: Session, user: User) -> ChatSession:
    session = db.get(ChatSession, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversación no encontrada.")
    return session


@router.post("/sessions", response_model=ChatSessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: ChatSessionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_owned_subject(payload.subject_id, db, user)
    title = payload.title.strip() or f"Tutoría de {subject.name}"
    session = ChatSession(user_id=user.id, subject_id=subject.id, title=title[:200])
    db.add(session)
    db.commit()
    db.refresh(session)
    return {
        "id": session.id,
        "subject_id": session.subject_id,
        "title": session.title,
        "created_at": session.created_at,
        "message_count": 0,
        "last_message": None,
    }


@router.get("/sessions", response_model=list[ChatSessionOut])
def list_sessions(
    subject_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    query = db.query(ChatSession).filter(ChatSession.user_id == user.id)
    if subject_id:
        query = query.filter(ChatSession.subject_id == subject_id)
    sessions = query.order_by(ChatSession.created_at.desc()).all()
    result = []
    for session in sessions:
        last = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at.desc())
            .first()
        )
        count = db.query(ChatMessage).filter(ChatMessage.session_id == session.id).count()
        result.append(
            {
                "id": session.id,
                "subject_id": session.subject_id,
                "title": session.title,
                "created_at": session.created_at,
                "message_count": count,
                "last_message": (last.content[:120] if last else None),
            }
        )
    return result


@router.get("/sessions/{session_id}")
def get_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    session = _get_owned_session(session_id, db, user)
    subject = db.get(Subject, session.subject_id)
    messages = [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "sources": m.sources or [],
            "grounded": m.grounded,
            "created_at": m.created_at,
        }
        for m in sorted(session.messages, key=lambda m: m.created_at or datetime.min.replace(tzinfo=timezone.utc))
    ]
    return {
        "id": session.id,
        "subject_id": session.subject_id,
        "subject_name": subject.name if subject else "",
        "title": session.title,
        "created_at": session.created_at,
        "messages": messages,
    }


@router.post("/sessions/{session_id}/messages")
def send_message(
    session_id: str,
    payload: ChatMessageIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    session = _get_owned_session(session_id, db, user)
    user_msg = ChatMessage(session_id=session.id, role="user", content=payload.content.strip())
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    try:
        result = answer_question(db, session, payload.content.strip())
    except AINotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    assistant = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=result["answer"],
        sources=result["sources"],
        grounded=result["grounded"],
    )
    db.add(assistant)
    db.commit()
    db.refresh(assistant)

    # Si la sesión era la primera pregunta, usar su inicio como título
    if session.title.startswith("Tutoría de") and "(" not in session.title:
        session.title = (payload.content.strip()[:80] + ("…" if len(payload.content) > 80 else ""))[:200]
        db.commit()

    return {
        "user_message": {
            "id": user_msg.id,
            "role": user_msg.role,
            "content": user_msg.content,
            "sources": [],
            "grounded": None,
            "created_at": user_msg.created_at,
        },
        "assistant_message": {
            "id": assistant.id,
            "role": assistant.role,
            "content": assistant.content,
            "sources": assistant.sources or [],
            "grounded": assistant.grounded,
            "created_at": assistant.created_at,
        },
        "rag_mode": result.get("rag_mode"),
        "suggested_questions": result.get("suggested_questions", []),
    }


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    session = _get_owned_session(session_id, db, user)
    db.delete(session)
    db.commit()
