"""Interfaz común de proveedores de IA y fábrica de proveedores.

El objetivo es que la plataforma funcione con distintos motores (Gemini,
OpenAI y compatibles) sin cambiar el resto del código. Todos los métodos son
síncronos: los routers async los ejecutan con ``asyncio.to_thread`` y el
pipeline de procesamiento en segundo plano los llama directamente.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class AIError(Exception):
    """Error genérico de la capa de IA (mensaje apto para mostrar al usuario)."""


class AINotConfiguredError(AIError):
    """El proveedor de IA no está configurado (falta API key o proveedor)."""

    def __init__(self, message: str = "La IA no está configurada. Agrega tu API key en backend/.env (GEMINI_API_KEY) y reinicia el servidor.") -> None:
        super().__init__(message)


@dataclass
class ImageInput:
    """Imagen para tareas de visión (OCR de fotos de apuntes, PDFs escaneados)."""

    data: bytes
    mime_type: str


class AIProvider(ABC):
    """Contrato que todo proveedor de IA debe cumplir."""

    name: str = "base"
    model: str = ""
    embedding_model: str | None = None

    # ---------- Generación ----------

    @abstractmethod
    def generate_json(
        self,
        prompt: str,
        schema: type[T],
        *,
        system: str | None = None,
        images: list[ImageInput] | None = None,
        temperature: float = 0.4,
    ) -> T:
        """Genera contenido y lo devuelve validado contra un esquema Pydantic."""

    @abstractmethod
    def generate_text(
        self,
        prompt: str,
        *,
        system: str | None = None,
        images: list[ImageInput] | None = None,
        temperature: float = 0.5,
    ) -> str:
        """Genera texto libre (tutor virtual, resúmenes)."""

    # ---------- Embeddings ----------

    @property
    def supports_embeddings(self) -> bool:
        return False

    def embed(self, texts: list[str], *, task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
        raise AINotConfiguredError("Embeddings no disponibles con la configuración actual.")


# ---------------------------------------------------------------------------
# Fábrica
# ---------------------------------------------------------------------------

_provider: AIProvider | None = None
_provider_error: str | None = None


def _build_provider() -> AIProvider | None:
    global _provider_error
    from ..config import settings

    provider = (settings.ai_provider or "none").strip().lower()
    try:
        if provider == "gemini":
            from .gemini import GeminiProvider

            return GeminiProvider(
                api_key=settings.gemini_api_key,
                model=settings.gemini_model,
                embedding_model=settings.gemini_embedding_model,
            )
        if provider == "openai_compat":
            from .openai_compat import OpenAICompatProvider

            return OpenAICompatProvider(
                api_key=settings.openai_compat_api_key,
                base_url=settings.openai_compat_base_url,
                model=settings.openai_compat_model,
                embedding_model=settings.openai_compat_embedding_model,
            )
    except AINotConfiguredError as exc:
        _provider_error = str(exc)
        return None
    except Exception as exc:  # SDK ausente o error de inicialización
        _provider_error = f"No se pudo inicializar el proveedor de IA '{provider}': {exc}"
        return None
    _provider_error = f"Proveedor de IA desconocido: '{provider}'. Usa 'gemini' u 'openai_compat' en backend/.env."
    return None


def get_provider() -> AIProvider:
    """Devuelve el proveedor activo o lanza AINotConfiguredError con guía."""
    global _provider
    if _provider is None:
        _provider = _build_provider()
    if _provider is None:
        raise AINotConfiguredError(_provider_error or None)
    return _provider


def provider_status() -> dict:
    """Estado del proveedor para el endpoint /api/ai/status (sin exponer la key)."""
    global _provider
    if _provider is None:
        _provider = _build_provider()
    if _provider is None:
        return {"configured": False, "provider": None, "model": None, "embeddings": False, "detail": _provider_error}
    return {
        "configured": True,
        "provider": _provider.name,
        "model": _provider.model,
        "embeddings": _provider.supports_embeddings,
        "detail": None,
    }
