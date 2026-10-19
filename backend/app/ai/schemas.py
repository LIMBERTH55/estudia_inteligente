"""Esquemas Pydantic para las salidas estructuradas de la IA."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Difficulty = Literal["facil", "intermedia", "dificil"]
QuestionType = Literal["mc", "tf", "open", "fill", "match", "problem", "analysis"]


# ---------- Análisis de documentos ----------

class ExtractedTopic(BaseModel):
    name: str = Field(description="Nombre corto del tema (2-8 palabras)")
    description: str = Field(description="Explicación del tema en 1-2 oraciones")
    importance_hint: int = Field(ge=0, le=100, description="Importancia aparente del tema dentro del documento, 0-100")
    keywords: list[str] = Field(description="3-6 palabras clave del tema")
    is_core: bool = Field(description="True si el tema incluye definiciones formales, fórmulas o procedimientos centrales del material")


class TopicExtraction(BaseModel):
    topics: list[ExtractedTopic] = Field(description="Temas principales detectados en el documento")
    document_summary: str = Field(description="Resumen del documento en Markdown, organizado por secciones/temas, en el idioma del material")


class MergedTopic(BaseModel):
    name: str
    description: str
    importance_hint: int = Field(ge=0, le=100)
    keywords: list[str]
    is_core: bool


class TopicMerge(BaseModel):
    topics: list[MergedTopic] = Field(description="Lista unificada de temas de la asignatura, sin duplicados ni sinónimos repetidos")


class SubjectSummary(BaseModel):
    summary_markdown: str = Field(description="Resumen general de la asignatura en Markdown, organizado por temas y ordenado por relevancia estimada")


# ---------- Generación de preguntas ----------

class MatchPair(BaseModel):
    left: str
    right: str


class GeneratedQuestion(BaseModel):
    qtype: QuestionType
    difficulty: Difficulty
    topic: str = Field(description="Nombre del tema del material al que pertenece la pregunta")
    statement: str = Field(description="Enunciado de la pregunta. Para 'fill' incluye uno o varios espacios marcados con ____")
    options: list[str] = Field(default_factory=list, description="Solo para 'mc': exactamente 4 opciones")
    pairs: list[MatchPair] = Field(default_factory=list, description="Solo para 'match': entre 3 y 5 pares para relacionar")
    correct_index: int | None = Field(default=None, description="Solo para 'mc': índice 0-3 de la opción correcta")
    correct_bool: bool | None = Field(default=None, description="Solo para 'tf': valor de verdad correcto")
    accepted_answers: list[str] = Field(default_factory=list, description="Solo para 'fill': respuestas aceptadas para cada espacio, en orden")
    model_answer: str = Field(default="", description="Respuesta modelo para 'open', 'problem' y 'analysis'")
    explanation: str = Field(description="Explicación de por qué la respuesta es correcta, en 2-4 oraciones")
    source_quote: str = Field(description="Cita textual EXACTA del material que respalda la pregunta (máx. 300 caracteres)")
    source_page: int | None = Field(default=None, description="Página del documento donde aparece la cita, si se conoce")


class GeneratedQuestions(BaseModel):
    questions: list[GeneratedQuestion]


# ---------- Calificación ----------

class AnswerGrade(BaseModel):
    index: int = Field(description="Índice de la pregunta calificada (según la lista recibida)")
    score_ratio: float = Field(ge=0, le=1, description="Puntaje obtenido de 0 a 1 según la rúbrica")
    is_correct: bool = Field(description="True si la respuesta puede considerarse correcta (>= 0.6)")
    feedback: str = Field(description="Retroalimentación en 2-4 oraciones: qué estuvo bien y qué faltó")
    missing_points: list[str] = Field(default_factory=list, description="Puntos importantes que el estudiante omitió")


class GradeOpenAnswers(BaseModel):
    grades: list[AnswerGrade]


# ---------- Tutor virtual ----------

class TutorReply(BaseModel):
    answer: str = Field(description="Respuesta al estudiante, en Markdown, usando lenguaje claro y ejemplos del material cuando existan")
    grounded: bool = Field(description="True si la respuesta está respaldada por los fragmentos del material; False si no hay información suficiente en los documentos")
    suggested_questions: list[str] = Field(default_factory=list, description="2-3 preguntas de seguimiento que el estudiante podría hacer")


# ---------- Plan de estudio ----------

class StudyPlanBlock(BaseModel):
    topic: str
    priority: Literal["alta", "media", "baja"]
    reason: str
    actions: list[str] = Field(description="Acciones concretas de estudio para este tema")
    estimated_minutes: int = Field(description="Minutos estimados de estudio sugeridos para este tema")


class StudyPlanDay(BaseModel):
    day_label: str = Field(description="Etiqueta del día, por ejemplo 'Día 1' o 'Sesión 1'")
    focus: str
    activities: list[str]


class StudyPlanContent(BaseModel):
    headline: str = Field(description="Título breve del plan")
    blocks: list[StudyPlanBlock] = Field(description="Prioridades de estudio ordenadas de mayor a menor prioridad")
    session_plan: list[StudyPlanDay] = Field(description="Un plan de sesiones de estudio concretas")
    general_tips: list[str] = Field(description="Consejos generales de estudio personalizados")
