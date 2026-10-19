"""Fragmentación (chunking) del texto extraído para búsqueda y contexto de IA."""
from __future__ import annotations

from dataclasses import dataclass

from .extraction import PageContent

TARGET_CHARS = 1100
OVERLAP_CHARS = 160
MIN_CHUNK_CHARS = 120


@dataclass
class Chunk:
    content: str
    page: int | None
    section: str | None
    is_heading: bool


def _split_long_text(text: str, page: int | None, section: str | None) -> list[Chunk]:
    chunks: list[Chunk] = []
    start = 0
    while start < len(text):
        end = min(start + TARGET_CHARS, len(text))
        # Cortar preferiblemente en un salto de línea o punto cercano
        if end < len(text):
            for sep in ("\n\n", "\n", ". ", " "):
                cut = text.rfind(sep, start + TARGET_CHARS // 2, end)
                if cut != -1:
                    end = cut + len(sep)
                    break
        piece = text[start:end].strip()
        if len(piece) >= MIN_CHUNK_CHARS:
            chunks.append(Chunk(content=piece, page=page, section=section, is_heading=False))
        if end >= len(text):
            break
        start = max(end - OVERLAP_CHARS, start + 1)
    return chunks


def chunk_pages(pages: list[PageContent]) -> list[Chunk]:
    """Convierte páginas extraídas en fragmentos manejables conservando página/sección.

    - Detecta encabezados (líneas que empiezan con '## ' o líneas cortas tipo título)
      y los usa como contexto de sección.
    - Mantiene el bloque contiguo por página para conservar coherencia.
    """
    chunks: list[Chunk] = []
    current_section: str | None = None

    for page in pages:
        text = page.text.strip()
        if not text:
            continue
        if page.section:
            current_section = page.section

        # Dividir por encabezados explícitos si existen (## Título)
        lines = text.split("\n")
        buffer: list[str] = []
        buffer_section = current_section

        def flush() -> None:
            nonlocal buffer
            joined = "\n".join(buffer).strip()
            if not joined:
                buffer = []
                return
            if len(joined) <= TARGET_CHARS * 1.6:
                if len(joined) >= MIN_CHUNK_CHARS:
                    chunks.append(
                        Chunk(
                            content=joined,
                            page=page.page,
                            section=buffer_section,
                            is_heading=joined.startswith("## "),
                        )
                    )
            else:
                chunks.extend(_split_long_text(joined, page.page, buffer_section))
            buffer = []

        for line in lines:
            stripped = line.strip()
            is_heading = stripped.startswith("## ") or (
                # Heurística: línea corta sin punto final, seguida de contenido
                len(stripped) > 2
                and len(stripped) <= 90
                and not stripped.endswith((".", ":", ";", ",", "?", "!", "|"))
                and stripped[:1].isupper()
                and len(stripped.split()) <= 12
            )
            if is_heading and stripped:
                flush()
                heading_text = stripped.lstrip("#").strip()
                buffer_section = heading_text[:280]
                current_section = buffer_section
                buffer.append(f"## {heading_text}")
                # El encabezado acompaña al contenido que le sigue
                continue
            buffer.append(line)
        flush()

    return chunks
