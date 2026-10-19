"""Proveedor compatible con la API de OpenAI (OpenAI, OpenRouter, Ollama, vLLM...).

Se usa httpx directamente para no agregar dependencias. Requiere que el servicio
soporte ``/chat/completions`` y ``/embeddings``.
"""
from __future__ import annotations

import json
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .provider import AIError, AINotConfiguredError, AIProvider, ImageInput

T = TypeVar("T", bound=BaseModel)

_JSON_INSTRUCTIONS = (
    "Responde ÚNICAMENTE con un objeto JSON válido que cumpla exactamente este esquema JSON Schema. "
    "Sin markdown, sin explicaciones fuera del JSON.\n\nJSON Schema:\n{schema}"
)


class OpenAICompatProvider(AIProvider):
    name = "openai_compat"

    def __init__(self, api_key: str, base_url: str, model: str, embedding_model: str | None) -> None:
        if not api_key.strip():
            raise AINotConfiguredError(
                "Falta la API key del proveedor OpenAI-compatible (OPENAI_COMPAT_API_KEY en backend/.env)."
            )
        self.base_url = base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {api_key.strip()}"}
        self.model = model
        self.embedding_model = embedding_model or None

    def _messages(self, prompt: str, system: str | None, images: list[ImageInput] | None):
        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        if images:
            content: list[dict] = [{"type": "text", "text": prompt}]
            import base64

            for img in images:
                b64 = base64.b64encode(img.data).decode()
                content.append(
                    {"type": "image_url", "image_url": {"url": f"data:{img.mime_type};base64,{b64}"}}
                )
            messages.append({"role": "user", "content": content})
        else:
            messages.append({"role": "user", "content": prompt})
        return messages

    def _chat(self, messages: list[dict], *, temperature: float, json_mode: bool) -> str:
        payload: dict = {"model": self.model, "messages": messages, "temperature": temperature}
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            with httpx.Client(timeout=180) as client:
                resp = client.post(
                    f"{self.base_url}/chat/completions", headers=self.headers, json=payload
                )
        except httpx.HTTPError as exc:
            raise AIError(f"No se pudo contactar al proveedor de IA ({self.base_url}): {exc}") from exc
        if resp.status_code == 401:
            raise AIError("La API key del proveedor de IA es inválida (401).")
        if resp.status_code == 429:
            raise AIError("Se agotó la cuota del proveedor de IA (429). Espera e inténtalo de nuevo.")
        if resp.status_code >= 400:
            raise AIError(f"El proveedor de IA devolvió un error {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise AIError("Respuesta inesperada del proveedor de IA.") from exc

    def generate_json(
        self,
        prompt: str,
        schema: type[T],
        *,
        system: str | None = None,
        images: list[ImageInput] | None = None,
        temperature: float = 0.4,
    ) -> T:
        schema_json = json.dumps(schema.model_json_schema(), ensure_ascii=False)[:20000]
        instr = _JSON_INSTRUCTIONS.format(schema=schema_json)
        sys_msg = f"{system}\n\n{instr}" if system else instr
        text = self._chat(self._messages(prompt, sys_msg, images), temperature=temperature, json_mode=True)
        try:
            return schema.model_validate_json(text)
        except ValidationError as exc:
            raise AIError("La IA devolvió datos con un formato inesperado. Inténtalo de nuevo.") from exc

    def generate_text(
        self,
        prompt: str,
        *,
        system: str | None = None,
        images: list[ImageInput] | None = None,
        temperature: float = 0.5,
    ) -> str:
        return self._chat(self._messages(prompt, system, images), temperature=temperature, json_mode=False)

    @property
    def supports_embeddings(self) -> bool:
        return bool(self.embedding_model)

    def embed(self, texts: list[str], *, task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
        if not self.embedding_model:
            raise AINotConfiguredError("No hay modelo de embeddings configurado.")
        vectors: list[list[float]] = []
        batch = 64
        for i in range(0, len(texts), batch):
            try:
                with httpx.Client(timeout=180) as client:
                    resp = client.post(
                        f"{self.base_url}/embeddings",
                        headers=self.headers,
                        json={"model": self.embedding_model, "input": texts[i : i + batch]},
                    )
            except httpx.HTTPError as exc:
                raise AIError(f"No se pudo contactar al proveedor de embeddings: {exc}") from exc
            if resp.status_code >= 400:
                raise AIError(f"Error de embeddings ({resp.status_code}): {resp.text[:200]}")
            data = resp.json()
            for item in sorted(data.get("data", []), key=lambda d: d.get("index", 0)):
                vectors.append([round(float(v), 6) for v in item["embedding"]])
        return vectors
