"""Esquemas de la API (entrada/salida) de ExamPredict AI."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------- Usuarios / auth ----------

class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("Correo electrónico inválido.")
        return v


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    created_at: datetime


class UpdateProfileIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class DeleteAccountIn(BaseModel):
    password: str


# ---------- Asignaturas ----------

class SubjectIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=2000)
    color: str = Field(default="violet", max_length=20)


class SubjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    color: str | None = Field(default=None, max_length=20)


class SubjectOut(BaseModel):
    id: str
    name: str
    description: str
    color: str
    analysis_status: str
    summary: str | None
    created_at: datetime
    updated_at: datetime
    documents_count: int = 0
    documents_ready: int = 0
    documents_processing: int = 0
    topics_count: int = 0
    attempts_count: int = 0


class TopicOut(BaseModel):
    id: str
    name: str
    description: str
    keywords: list[str]
    importance: int
    reasons: list[str]
    scores: dict[str, Any]
    mention_count: int
    document_ids: list[str]
    llm_hint: int | None
    updated_at: datetime


# ---------- Documentos ----------

class DocumentOut(BaseModel):
    id: str
    subject_id: str
    original_name: str
    filetype: str
    kind: str
    size_bytes: int
    status: str
    stage: str
    progress: int
    error: str | None
    page_count: int
    word_count: int
    ocr_used: bool
    rag_mode: str | None
    ai_summary: str | None
    created_at: datetime
    processed_at: datetime | None


class UploadResult(BaseModel):
    uploaded: list[DocumentOut]
    rejected: list[dict[str, str]]


# ---------- Preguntas ----------

class QuestionSetIn(BaseModel):
    count: int = Field(default=10, ge=1, le=60)
    difficulty: Literal["facil", "intermedia", "dificil"] | None = None
    types: list[Literal["mc", "tf", "open", "fill", "match", "problem", "analysis"]] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)


class QuestionPreviewOut(BaseModel):
    id: str
    qtype: str
    difficulty: str
    topic: str
    statement: str
    options: list[str]
    pairs: list[dict[str, str]]
    relevance: int
    relevance_reasons: list[str]
    source_refs: list[dict[str, Any]]
    points: float


class QuestionSetOut(BaseModel):
    id: str
    subject_id: str
    status: str
    error: str | None
    config: dict[str, Any]
    created_at: datetime
    questions: list[QuestionPreviewOut] = Field(default_factory=list)


class QuestionSetListItem(BaseModel):
    id: str
    subject_id: str
    status: str
    error: str | None
    config: dict[str, Any]
    created_at: datetime
    questions_count: int


# ---------- Intentos de examen ----------

class AttemptCreateIn(BaseModel):
    set_id: str
    title: str = Field(default="", max_length=200)
    mode: Literal["exam", "practice"] = "exam"
    time_limit_sec: int = Field(default=0, ge=0, le=3600 * 6)
    question_count: int | None = Field(default=None, ge=1, le=60)
    only_high_relevance: bool = False


class AttemptAnswerIn(BaseModel):
    answer: dict[str, Any] | None = None
    flagged: bool = False


class AttemptOut(BaseModel):
    id: str
    subject_id: str
    subject_name: str
    set_id: str
    title: str
    mode: str
    status: str
    time_limit_sec: int
    started_at: datetime
    finished_at: datetime | None
    score: float | None
    duration_sec: int | None
    questions_count: int
    answered_count: int


# ---------- Tutor ----------

class ChatSessionIn(BaseModel):
    subject_id: str
    title: str = Field(default="", max_length=200)


class ChatMessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class ChatMessageOut(BaseModel):
    id: str
    role: str
    content: str
    sources: list[dict[str, Any]]
    grounded: bool | None
    created_at: datetime


class ChatSessionOut(BaseModel):
    id: str
    subject_id: str
    title: str
    created_at: datetime
    message_count: int = 0
    last_message: str | None = None


# ---------- Planes de estudio ----------

class StudyPlanOut(BaseModel):
    id: str
    subject_id: str
    attempt_id: str | None
    content: dict[str, Any]
    created_at: datetime
