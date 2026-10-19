"""Motor de estimación de relevancia (0-100) para temas del material.

El índice NO predice el examen real: es una estimación de prioridad basada en
evidencias del material analizado (frecuencia, repetición, estructura, énfasis
y exámenes anteriores si el estudiante los aporta). Cada factor se guarda para
poder explicar el resultado.
"""
from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field

from ..models import Document, DocumentChunk, Topic

# Patrones heurísticos (en texto normalizado, sin acentos)
RE_DEFINITION = re.compile(
    r"se define como|es un[a]? |consiste en|se refiere a|definici[oó]n|denominad|llamad|significa que"
)
RE_FORMULA = re.compile(r"f[oó]rmula|ecuaci[oó]n|teorema|\bsuma de\b|\bproducto de\b|\bley de\b|=\s*\d")
RE_PROCEDURE = re.compile(
    r"procedimiento|pasos|\balgoritmo\b|m[eé]todo|secuencia de|instrucciones|primero .{0,40}luego"
)

WEIGHTS = {
    "frequency": 0.25,
    "coverage": 0.15,
    "structure": 0.20,
    "heading": 0.05,
    "llm": 0.25,
    "exam": 0.10,
}


def normalize(text: str) -> str:
    """Minúsculas y sin acentos, para comparaciones robustas."""
    text = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


@dataclass
class TopicSignals:
    mentions: int = 0
    doc_ids: set[str] = field(default_factory=set)
    definition_hits: int = 0
    formula_hits: int = 0
    procedure_hits: int = 0
    heading_hits: int = 0
    exam_hits: int = 0


def _topic_matches_chunk(topic_name: str, keywords: list[str], content_norm: str) -> bool:
    name_norm = normalize(topic_name)
    if len(name_norm) >= 4 and name_norm in content_norm:
        return True
    # Si el nombre es una sola palabra, exigir palabra completa
    if " " not in name_norm and re.search(rf"\b{re.escape(name_norm)}\b", content_norm):
        return True
    hits = sum(1 for kw in keywords if len(kw) >= 4 and normalize(kw) in content_norm)
    return hits >= 2


def gather_signals(
    topic_name: str,
    keywords: list[str],
    llm_hint: int | None,
    chunks: list[tuple[DocumentChunk, Document]],
) -> TopicSignals:
    """Recorre los fragmentos de la asignatura y acumula evidencias del tema."""
    signals = TopicSignals()
    for chunk, doc in chunks:
        content_norm = normalize(chunk.content)
        if not _topic_matches_chunk(topic_name, keywords, content_norm):
            continue
        signals.mentions += 1
        signals.doc_ids.add(doc.id)
        if doc.kind == "exam":
            signals.exam_hits += 1
        if RE_DEFINITION.search(content_norm):
            signals.definition_hits += 1
        if RE_FORMULA.search(content_norm):
            signals.formula_hits += 1
        if RE_PROCEDURE.search(content_norm):
            signals.procedure_hits += 1
        section_norm = normalize(chunk.section or "")
        if chunk.is_heading or (section_norm and normalize(topic_name) in section_norm):
            signals.heading_hits += 1
    return signals


def importance_from_signals(
    signals: TopicSignals,
    *,
    llm_hint: int | None,
    total_docs: int,
    max_mentions: int,
    has_exam_docs: bool,
) -> tuple[int, dict, list[str]]:
    """Combina las señales en un índice 0-100 + factores + razones legibles."""
    factors: dict[str, float] = {}
    reasons: list[str] = []

    # 1. Frecuencia (escala logarítmica relativa al tema más mencionado)
    ref = max(max_mentions, 1)
    frequency = 100.0 * math.log1p(signals.mentions) / math.log1p(ref) if signals.mentions > 0 else 0.0
    factors["frequency"] = round(frequency, 1)

    # 2. Cobertura: en cuántos documentos distintos aparece
    coverage = 100.0 * (len(signals.doc_ids) / total_docs) if total_docs > 0 else 0.0
    factors["coverage"] = round(coverage, 1)

    # 3. Estructura: definiciones, fórmulas y procedimientos
    d = min(1.0, signals.definition_hits / 3)
    f = min(1.0, signals.formula_hits / 2)
    p = min(1.0, signals.procedure_hits / 2)
    structure = 100.0 * (0.45 * d + 0.30 * f + 0.25 * p)
    factors["structure"] = round(structure, 1)

    # 4. Énfasis en títulos/secciones
    heading = 100.0 * min(1.0, signals.heading_hits / 2)
    factors["heading"] = round(heading, 1)

    # 5. Juicio del análisis de IA (opcional)
    if llm_hint is not None:
        factors["llm"] = float(llm_hint)

    # 6. Coincidencia con exámenes anteriores (opcional)
    if has_exam_docs:
        factors["exam"] = 100.0 * min(1.0, signals.exam_hits / 3)

    total_weight = sum(WEIGHTS[k] for k in factors)
    raw = sum(factors[k] * WEIGHTS[k] for k in factors) / total_weight if total_weight else 0.0
    importance = int(round(max(0.0, min(100.0, raw))))

    # Razones legibles (ordenadas por aporte)
    ordered = sorted(factors.items(), key=lambda kv: kv[1] * WEIGHTS.get(kv[0], 0), reverse=True)
    for key, value in ordered:
        if key == "frequency" and value >= 55:
            reasons.append(f"Alta frecuencia: aparece en {signals.mentions} fragmentos del material.")
        elif key == "coverage" and value >= 55:
            reasons.append(f"Se repite en {len(signals.doc_ids)} de {total_docs} documento(s) de la materia.")
        elif key == "structure" and value >= 50:
            reasons.append("Contiene definiciones, fórmulas o procedimientos centrales del material.")
        elif key == "heading" and value >= 60:
            reasons.append("Aparece en títulos o secciones destacadas.")
        elif key == "llm" and value >= 65:
            reasons.append(f"El análisis del contenido la marcó como tema central ({int(value)}/100).")
        elif key == "exam" and value >= 45:
            reasons.append("Coincide con contenido de exámenes anteriores que subiste.")
    if not reasons:
        reasons.append("Relevancia estimada a partir de las menciones en el material.")

    return importance, factors, reasons
