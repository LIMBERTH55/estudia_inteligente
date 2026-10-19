"""Recuperación de información (RAG): búsqueda semántica y por palabras clave.

Si el proveedor de IA soporta embeddings se usa búsqueda semántica (coseno).
Si no (o falla), se degrada con transparencia a búsqueda por palabras clave
(BM25 simplificado), sin inventar resultados.
"""
from __future__ import annotations

import logging
import math
import re
from collections import Counter
from dataclasses import dataclass

import numpy as np
from sqlalchemy.orm import Session

from ..ai import AIError, get_provider
from ..models import Document, DocumentChunk
from .relevance import normalize

logger = logging.getLogger(__name__)

STOPWORDS = {
    "de", "la", "que", "el", "en", "y", "a", "los", "del", "se", "las", "por", "un", "para",
    "con", "no", "una", "su", "al", "lo", "como", "mas", "pero", "sus", "le", "ya", "o",
    "este", "si", "porque", "esta", "entre", "cuando", "muy", "sin", "sobre", "tambien",
    "me", "hasta", "hay", "donde", "quien", "desde", "todo", "nos", "durante", "todos",
    "uno", "les", "ni", "contra", "otros", "ese", "eso", "ante", "ellos", "e", "esto",
    "mi", "antes", "algunos", "que", "unos", "yo", "otro", "otras", "otra", "el", "tanto",
    "esa", "estos", "mucho", "quienes", "nada", "muchos", "cual", "poco", "ella", "estar",
    "estas", "algunas", "algo", "nosotros", "mi", "mis", "tu", "te", "ti", "es", "son",
    "fue", "ser", "tiene", "tienen", "puede", "pueden", "hacer", "parte", "cada", "vez",
}


def tokenize(text: str) -> list[str]:
    norm = normalize(text)
    return [t for t in re.findall(r"[a-z0-9ñ]{3,}", norm) if t not in STOPWORDS]


@dataclass
class SearchHit:
    document_id: str
    document_name: str
    page: int | None
    section: str | None
    content: str
    score: float


def embed_chunks(db: Session, chunks: list[DocumentChunk]) -> bool:
    """Calcula y guarda embeddings para los fragmentos. Devuelve True si se logró."""
    provider = get_provider()
    if not provider.supports_embeddings or not chunks:
        return False
    try:
        vectors = provider.embed([c.content for c in chunks], task_type="RETRIEVAL_DOCUMENT")
    except AIError as exc:
        logger.warning("Embeddings fallaron, se usará búsqueda por palabras clave: %s", exc)
        return False
    if len(vectors) != len(chunks):
        logger.warning("Cantidad de embeddings inesperada (%s vs %s)", len(vectors), len(chunks))
        return False
    for chunk, vector in zip(chunks, vectors):
        chunk.embedding = vector
    db.commit()
    return True


def _load_chunks(db: Session, subject_id: str) -> list[tuple[DocumentChunk, Document]]:
    rows = (
        db.query(DocumentChunk, Document)
        .join(Document, DocumentChunk.document_id == Document.id)
        .filter(DocumentChunk.subject_id == subject_id, Document.status == "ready")
        .all()
    )
    return [(chunk, doc) for chunk, doc in rows]


def _semantic_search(
    db: Session, subject_id: str, query: str, k: int
) -> list[SearchHit] | None:
    provider = get_provider()
    if not provider.supports_embeddings:
        return None
    rows = _load_chunks(db, subject_id)
    embedded = [(c, d) for c, d in rows if c.embedding]
    if not embedded:
        return None
    try:
        query_vec = np.array(
            provider.embed([query], task_type="RETRIEVAL_QUERY")[0], dtype=np.float32
        )
    except AIError as exc:
        logger.warning("Embedding de consulta falló: %s", exc)
        return None
    qn = np.linalg.norm(query_vec)
    if qn == 0:
        return None
    scored: list[tuple[float, DocumentChunk, Document]] = []
    for chunk, doc in embedded:
        vec = np.array(chunk.embedding, dtype=np.float32)
        vn = np.linalg.norm(vec)
        if vn == 0 or vec.shape != query_vec.shape:
            continue
        score = float(np.dot(query_vec, vec) / (qn * vn))
        scored.append((score, chunk, doc))
    scored.sort(key=lambda t: t[0], reverse=True)
    return [
        SearchHit(
            document_id=doc.id,
            document_name=doc.original_name,
            page=chunk.page,
            section=chunk.section,
            content=chunk.content,
            score=round(score, 4),
        )
        for score, chunk, doc in scored[:k]
        if score > 0.15
    ]


def _keyword_search(db: Session, subject_id: str, query: str, k: int) -> list[SearchHit]:
    rows = _load_chunks(db, subject_id)
    if not rows:
        return []
    terms = tokenize(query)
    if not terms:
        terms = [t for t in normalize(query).split() if len(t) >= 3]
    scored: list[tuple[float, DocumentChunk, Document]] = []
    n_docs = len(rows)
    # Frecuencia de documentos por término (para IDF)
    df: Counter[str] = Counter()
    tokenized: list[Counter[str]] = []
    for chunk, _doc in rows:
        counts = Counter(tokenize(chunk.content))
        tokenized.append(counts)
        for term in terms:
            if counts.get(term):
                df[term] += 1
    avg_len = sum(sum(c.values()) for c in tokenized) / max(n_docs, 1)
    for (chunk, doc), counts in zip(rows, tokenized):
        length = sum(counts.values()) or 1
        score = 0.0
        for term in terms:
            tf = counts.get(term, 0)
            if not tf:
                continue
            idf = math.log(1 + (n_docs - df[term] + 0.5) / (df[term] + 0.5))
            score += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * length / avg_len))
        if score > 0:
            scored.append((score, chunk, doc))
    scored.sort(key=lambda t: t[0], reverse=True)
    max_score = scored[0][0] if scored else 1.0
    return [
        SearchHit(
            document_id=doc.id,
            document_name=doc.original_name,
            page=chunk.page,
            section=chunk.section,
            content=chunk.content,
            score=round(score / max_score, 4),
        )
        for score, chunk, doc in scored[:k]
    ]


def search_chunks(db: Session, subject_id: str, query: str, k: int = 6) -> tuple[list[SearchHit], str]:
    """Busca fragmentos relevantes. Devuelve (resultados, modo) donde modo es 'semantic' o 'keyword'."""
    hits = _semantic_search(db, subject_id, query, k)
    if hits is not None:
        return hits, "semantic"
    return _keyword_search(db, subject_id, query, k), "keyword"


def search_for_topic(db: Session, subject_id: str, topic_name: str, k: int = 3) -> list[SearchHit]:
    hits, _mode = search_chunks(db, subject_id, topic_name, k)
    return hits


def build_context(hits: list[SearchHit], max_chars: int = 16000) -> str:
    """Construye el bloque de contexto numerado para los prompts."""
    parts: list[str] = []
    used = 0
    for i, hit in enumerate(hits, start=1):
        loc = []
        if hit.page:
            loc.append(f"pág. {hit.page}")
        if hit.section:
            loc.append(f"sección: {hit.section}")
        location = f" ({', '.join(loc)})" if loc else ""
        block = f"[{i}] {hit.document_name}{location}\n{hit.content}\n"
        if used + len(block) > max_chars:
            break
        parts.append(block)
        used += len(block)
    return "\n".join(parts)
