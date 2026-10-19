"""Tutor virtual: responde preguntas del estudiante usando sus documentos (RAG)."""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..ai import get_provider
from ..ai.prompts import TUTOR_SYSTEM, tutor_prompt
from ..ai.schemas import TutorReply
from ..models import ChatSession
from .rag import build_context, search_chunks

logger = logging.getLogger(__name__)

NO_MATERIAL_MESSAGE = (
    "Todavía no tengo documentos analizados en esta asignatura, así que no puedo responder "
    "con base en tu material. Sube al menos un documento y espera a que termine el análisis, "
    "y luego vuelve a preguntarme. 😉"
)


def _history_text(session: ChatSession, limit: int = 6) -> str:
    messages = list(session.messages)[-limit:]
    lines = []
    for msg in messages:
        role = "Estudiante" if msg.role == "user" else "Tutor"
        content = (msg.content or "").strip().replace("\n", " ")
        lines.append(f"{role}: {content[:280]}")
    return "\n".join(lines)


def answer_question(db: Session, session: ChatSession, question: str) -> dict:
    """Genera la respuesta del tutor. Devuelve dict con answer, sources, grounded, suggested."""
    hits, mode = search_chunks(db, session.subject_id, question, k=6)
    if not hits:
        return {
            "answer": NO_MATERIAL_MESSAGE,
            "sources": [],
            "grounded": False,
            "suggested_questions": [],
            "rag_mode": mode,
        }

    context = build_context(hits, max_chars=9000)
    history = _history_text(session)
    provider = get_provider()
    reply: TutorReply = provider.generate_json(
        tutor_prompt(question, context, history),
        TutorReply,
        system=TUTOR_SYSTEM,
        temperature=0.5,
    )

    sources = []
    for hit in hits[:4]:
        sources.append(
            {
                "document_id": hit.document_id,
                "document_name": hit.document_name,
                "page": hit.page,
                "section": hit.section,
                "excerpt": hit.content[:260].strip(),
                "score": hit.score,
            }
        )

    return {
        "answer": reply.answer,
        "sources": sources,
        "grounded": reply.grounded,
        "suggested_questions": reply.suggested_questions[:3],
        "rag_mode": mode,
    }
