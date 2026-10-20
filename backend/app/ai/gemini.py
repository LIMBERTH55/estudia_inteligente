"""Proveedor Google Gemini (SDK oficial google-genai)."""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Callable, TypeVar

from pydantic import BaseModel, ValidationError

from .provider import AIError, AINotConfiguredError, AIProvider, ImageInput

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

_TRANSIENT_MARKERS = (
    "503",
    "unavailable",
    "overloaded",
    "429",
    "rate limit",
    "rate_limit",
    "quota",
    "deadline",
    "timeout",
    "timed out",
    "500 internal",
    "internal error",
    "server error",
)


def _is_transient(exc: Exception) -> bool:
    low = str(exc).lower()
    return any(marker in low for marker in _TRANSIENT_MARKERS)


def _with_retries(call: Callable[[], T], *, attempts: int = 4, base_delay: float = 4.0) -> T:
    """Reintenta llamadas a Gemini ante saturaciones/limitaciones transitorias."""
    for index in range(attempts):
        try:
            return call()
        except Exception as exc:  # noqa: BLE001
            if index >= attempts - 1 or not _is_transient(exc):
                raise
            delay = base_delay * (2**index)
            logger.warning(
                "Error transitorio de Gemini (%s). Reintento %s/%s en %.0fs…",
                exc,
                index + 1,
                attempts - 1,
                delay,
            )
            time.sleep(delay)
    raise AssertionError("unreachable")


def _friendly_error(exc: Exception) -> str:
    text = str(exc)
    low = text.lower()
    if "api key" in low or "api_key" in low or "unauthenticated" in low or "invalid key" in low:
        return "La API key de Gemini no es válida. Revísala en backend/.env (GEMINI_API_KEY)."
    if "perday" in low or "per day" in low or "per-day" in low:
        match = re.search(r"retry in ([0-9hms\.]+)", low)
        when = f" Se renueva en {match.group(1).split('.')[0]}." if match else ""
        return (
            "Se agotó la cuota diaria gratuita de Gemini para este modelo."
            f"{when} Mientras tanto puedes esperar a la renovación, cambiar de modelo en "
            "GEMINI_MODEL (cada modelo tiene su propia cuota) o activar facturación en Google AI Studio."
        )
    if "quota" in low or "429" in low or "rate" in low:
        return "Se agotó la cuota de la API de Gemini (límite gratuito o de facturación). Espera unos minutos e inténtalo de nuevo."
    if "not found" in low and "model" in low:
        return f"El modelo solicitado no existe o no está disponible: {text[:200]}"
    if "deadline" in low or "timeout" in low or "timed out" in low:
        return "La solicitud a Gemini tardó demasiado. Inténtalo de nuevo."
    if "503" in low or "unavailable" in low or "overloaded" in low:
        return "El servicio de Gemini está temporalmente saturado. Inténtalo de nuevo en unos segundos."
    return f"Error de Gemini: {text[:300]}"


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str, embedding_model: str | None) -> None:
        if not api_key.strip():
            raise AINotConfiguredError(
                "Falta la API key de Gemini. Obtén una gratis en https://aistudio.google.com/apikey "
                "y agrégala en backend/.env como GEMINI_API_KEY=... y reinicia el servidor."
            )
        from google import genai

        self._genai_types = __import__("google.genai.types", fromlist=["types"])
        self.client = genai.Client(api_key=api_key.strip())
        self.model = model
        self.embedding_model = embedding_model or None

    # ---------- helpers ----------

    def _contents(self, prompt: str, images: list[ImageInput] | None):
        parts: list = [prompt]
        for img in images or []:
            parts.append(self._genai_types.Part.from_bytes(data=img.data, mime_type=img.mime_type))
        return parts

    # ---------- generación ----------

    def generate_json(
        self,
        prompt: str,
        schema: type[T],
        *,
        system: str | None = None,
        images: list[ImageInput] | None = None,
        temperature: float = 0.4,
    ) -> T:
        types = self._genai_types
        try:
            resp = _with_retries(
                lambda: self.client.models.generate_content(
                    model=self.model,
                    contents=self._contents(prompt, images),
                    config=types.GenerateContentConfig(
                        system_instruction=system,
                        temperature=temperature,
                        response_mime_type="application/json",
                        response_schema=schema,
                    ),
                )
            )
        except Exception as exc:  # noqa: BLE001
            raise AIError(_friendly_error(exc)) from exc

        parsed = getattr(resp, "parsed", None)
        if isinstance(parsed, schema):
            return parsed
        if isinstance(parsed, dict):
            try:
                return schema.model_validate(parsed)
            except ValidationError:
                pass
        text = getattr(resp, "text", None) or ""
        if not text.strip():
            raise AIError("Gemini devolvió una respuesta vacía. Inténtalo de nuevo.")
        try:
            return schema.model_validate_json(text)
        except ValidationError as exc:
            logger.warning("JSON de Gemini no cumple el esquema: %s", text[:500])
            raise AIError(
                "La IA devolvió datos con un formato inesperado. Inténtalo de nuevo."
            ) from exc

    def generate_text(
        self,
        prompt: str,
        *,
        system: str | None = None,
        images: list[ImageInput] | None = None,
        temperature: float = 0.5,
    ) -> str:
        types = self._genai_types
        try:
            resp = _with_retries(
                lambda: self.client.models.generate_content(
                    model=self.model,
                    contents=self._contents(prompt, images),
                    config=types.GenerateContentConfig(
                        system_instruction=system,
                        temperature=temperature,
                    ),
                )
            )
        except Exception as exc:  # noqa: BLE001
            raise AIError(_friendly_error(exc)) from exc
        text = getattr(resp, "text", None) or ""
        if not text.strip():
            raise AIError("Gemini devolvió una respuesta vacía. Inténtalo de nuevo.")
        return text.strip()

    # ---------- embeddings ----------

    @property
    def supports_embeddings(self) -> bool:
        return bool(self.embedding_model)

    def embed(self, texts: list[str], *, task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
        if not self.embedding_model:
            raise AINotConfiguredError("No hay modelo de embeddings configurado.")
        types = self._genai_types
        vectors: list[list[float]] = []
        batch = 32
        for i in range(0, len(texts), batch):
            chunk = texts[i : i + batch]
            try:
                resp = _with_retries(
                    lambda: self.client.models.embed_content(
                        model=self.embedding_model,
                        contents=chunk,
                        config=types.EmbedContentConfig(task_type=task_type),
                    )
                )
            except Exception as exc:  # noqa: BLE001
                raise AIError(_friendly_error(exc)) from exc
            embeddings = getattr(resp, "embeddings", None) or []
            if len(embeddings) != len(chunk):
                raise AIError("Gemini devolvió un número inesperado de embeddings.")
            for emb in embeddings:
                values = getattr(emb, "values", None)
                if values is None:
                    raise AIError("Embedding vacío recibido de Gemini.")
                vectors.append([round(float(v), 6) for v in values])
        return vectors


def parse_json_block(text: str) -> dict:
    """Extrae un objeto JSON de una respuesta de texto (tolerante a ```json ...```)."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise AIError("La respuesta de la IA no contiene JSON válido.")
    return json.loads(text[start : end + 1])
