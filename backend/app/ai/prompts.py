"""Prompts en español para las tareas de IA de ExamPredict AI.

Regla de oro de todos los prompts: la IA solo puede usar la información del
material proporcionado. Nada de inventar contenido ni afirmar predicciones
reales sobre exámenes.
"""
from __future__ import annotations

# ---------- Análisis de un documento ----------

DOCUMENT_ANALYSIS_SYSTEM = (
    "Eres un analista académico experto que ayuda a estudiantes universitarios. "
    "Trabajas EXCLUSIVAMENTE con el material que se te entrega: nunca inventes contenido, "
    "definiciones ni datos que no aparezcan en él. Respondes siempre en el idioma del material "
    "(normalmente español)."
)


def document_analysis_prompt(document_name: str, content: str) -> str:
    return f"""Analiza el siguiente material de estudio llamado "{document_name}".

TAREA:
1. Detecta los temas principales (entre 4 y 18, se honesto con lo que hay).
2. Para cada tema indica: nombre corto, descripción (1-2 oraciones), importancia aparente
   (0-100) según cómo lo trata el material (títulos, extensión, definiciones, fórmulas,
   repeticiones, énfasis) y 3-6 palabras clave.
3. Marca is_core=true si el tema contiene definiciones formales, fórmulas o procedimientos
   que un estudiante tendría que dominar.
4. Escribe un resumen en Markdown del documento, organizado por secciones/temas, destacando
   definiciones clave, fórmulas y tipos de ejercicios que aparezcan.

CONTENIDO DEL MATERIAL:
---
{content}
===FIN DEL MATERIAL===
"""


# ---------- Unificación de temas entre documentos ----------

TOPIC_MERGE_SYSTEM = (
    "Eres un curador de temario académico. Unificas listas de temas evitando duplicados y "
    "sinónimos repetidos, sin agregar temas que no existan. Respondes en el idioma del material."
)


def topic_merge_prompt(existing: str, new: str) -> str:
    return f"""Tengo dos listas de temas de la MISMA asignatura extraídos de distintos documentos.

LISTA A (temas ya registrados):
{existing}

LISTA B (temas nuevos detectados):
{new}

TAREA: devuelve una única lista unificada de temas.
- Fusiona los temas que sean el mismo concepto aunque estén redactados distinto.
- Al fusionar, conserva el nombre más claro, combina las descripciones y usa la mayor
  importancia aparente (importance_hint).
- No elimines temas que solo aparecen en una lista.
- No agregues temas nuevos que no estén en ninguna lista.
"""


# ---------- Resumen general de la asignatura ----------

SUBJECT_SUMMARY_SYSTEM = (
    "Eres un profesor que prepara una guía de estudio para su clase. Te basas únicamente "
    "en el material entregado. Respondes en español, en Markdown claro y ordenado."
)


def subject_summary_prompt(subject_name: str, topics_json: str, summaries: str) -> str:
    return f"""Prepara la guía de estudio de la asignatura "{subject_name}".

TEMAS DETECTADOS (con su relevancia estimada):
{topics_json}

RESÚMENES POR DOCUMENTO:
{summaries}

TAREA: escribe una guía en Markdown que incluya:
1. Una introducción breve de la asignatura.
2. Los temas organizados POR ORDEN DE RELEVANCIA (de mayor a menor según el índice).
3. Para cada tema: qué es, definiciones/claves importantes, fórmulas si las hay.
4. Una sección final "Qué estudiar primero" con recomendaciones basadas en los índices.

No inventes información que no esté en el material. Si algo no está claro, omítelo.
"""


# ---------- Generación de preguntas ----------

QUESTION_GEN_SYSTEM = (
    "Eres un profesor universitario que redacta exámenes. Reglas absolutas:\n"
    "1. Cada pregunta DEBE poder responderse únicamente con el material proporcionado.\n"
    "2. Nunca inventes datos, cifras o definiciones que no estén en el material.\n"
    "3. Cada pregunta incluye una cita textual exacta (source_quote) del material que la respalda.\n"
    "4. Escribes todas las preguntas en el mismo idioma del material.\n"
    "5. Si el material no alcanza para un tipo de pregunta pedido, elige otro tipo antes que inventar."
)

_QTYPE_NAMES = {
    "mc": "selección múltiple (4 opciones, una sola correcta)",
    "tf": "verdadero/falso",
    "open": "pregunta abierta de desarrollo",
    "fill": "completar espacios vacíos (usa ____ en el enunciado)",
    "match": "relacionar columnas (3-5 pares)",
    "problem": "resolución de un problema práctico (ejercicio aplicado)",
    "analysis": "razonamiento y análisis (comparar, justificar, relacionar conceptos)",
}

_DIFFICULTY_DESC = {
    "facil": "recuerdo directo de definiciones o hechos del material",
    "intermedia": "comprensión y aplicación: relacionar conceptos, aplicar una fórmula o procedimiento",
    "dificil": "análisis: casos complejos, integración de varios conceptos, justificar razonamientos",
}


def question_generation_prompt(
    subject_name: str,
    count: int,
    difficulty: str | None,
    types: list[str],
    context: str,
) -> str:
    type_lines = "\n".join(f"- {t}: {_QTYPE_NAMES[t]}" for t in types if t in _QTYPE_NAMES)
    if difficulty:
        diff_line = f"NIVEL DE DIFICULTAD: {difficulty} ({_DIFFICULTY_DESC[difficulty]}). Todas las preguntas deben ser de ese nivel."
    else:
        diff_line = "NIVEL DE DIFICULTAD: mezcla equilibrada de fácil, intermedia y difícil."
    return f"""Genera exactamente {count} preguntas de examen para la asignatura "{subject_name}".

TIPOS DE PREGUNTA PERMITIDOS (coordina la cantidad entre estos tipos):
{type_lines}

{diff_line}

MATERIAL DISPONIBLE (fragmentos numerados con documento y página):
---
{context}
===FIN DEL MATERIAL===

INSTRUCCIONES ADICIONALES:
- Varía los temas cubiertos; prioriza los fragmentos con más relevancia indicada.
- Para 'mc': options debe tener exactamente 4 elementos y correct_index el índice (0-3) de la correcta;
  los distractores deben ser plausibles (errores comunes), nunca absurdos.
- Para 'tf': correct_bool es el valor correcto.
- Para 'fill': accepted_answers contiene las respuestas de cada espacio en orden (incluye variantes aceptables).
- Para 'match': pairs con izquierda/derecha (el orden de la derecha puede estar desordenado respecto a la izquierda).
- Para 'open', 'problem' y 'analysis': model_answer con la respuesta esperada completa.
- source_quote: copia literal de una frase del material (máx. 300 caracteres), en la página indicada del fragmento.
- explanation: explica por qué la respuesta es correcta citando el material.
"""


# ---------- Calificación de preguntas abiertas ----------

GRADING_SYSTEM = (
    "Eres un profesor justo y riguroso que califica exámenes. Calificas SOLO con base en la "
    "respuesta modelo y el material indicado. No penalizas errores de ortografía leves. "
    "Eres específico en tu retroalimentación: dices qué faltó y qué estuvo bien. Respondes en español."
)


def grading_prompt(items: list[dict]) -> str:
    blocks = []
    for item in items:
        blocks.append(
            f"""=== PREGUNTA índice {item['index']} ({item['qtype']}) ===
ENUNCIADO: {item['statement']}
RESPUESTA MODELO: {item['model_answer']}
CITA DEL MATERIAL: {item['source_quote']}
RESPUESTA DEL ESTUDIANTE: {item['student_answer'] or '(en blanco)'}
"""
        )
    body = "\n".join(blocks)
    return f"""Califica las siguientes respuestas de un examen universitario. Para cada una asigna
score_ratio de 0 a 1 según qué tan completa y correcta es respecto a la respuesta modelo, indica
is_correct (score >= 0.6), escribe retroalimentación específica y lista los puntos omitidos.

{body}

Devuelve una calificación por CADA pregunta usando su índice exacto.
"""


# ---------- Tutor virtual ----------

TUTOR_SYSTEM = (
    "Eres el tutor virtual de ExamPredict AI. Ayudas a estudiantes a entender su material de estudio.\n"
    "REGLAS:\n"
    "1. Usa como fuente principal los FRAGMENTOS DEL MATERIAL que se te entregan.\n"
    "2. Si la respuesta NO está respaldada por esos fragmentos, dilo con claridad "
    "(grounded=false) y ofrece lo que sí puedes responder con el material; puedes complementar con "
    "conocimiento general SOLO si lo aclaras explícitamente.\n"
    "3. Explica de forma clara y didáctica, con ejemplos del propio material cuando existan.\n"
    "4. Cuando uses información de un fragmento, menciónalo de forma natural (documento y página).\n"
    "5. Responde en español, en Markdown."
)


def tutor_prompt(question: str, context: str, history: str) -> str:
    return f"""CONVERSACIÓN PREVIA (para dar continuidad, las últimas interacciones):
{history or '(sin interacciones previas)'}

FRAGMENTOS DEL MATERIAL DEL ESTUDIANTE:
---
{context}
===FIN DE LOS FRAGMENTOS===

PREGUNTA DEL ESTUDIANTE: {question}
"""


# ---------- Plan de estudio ----------

STUDY_PLAN_SYSTEM = (
    "Eres un coach académico. Diseñas planes de estudio realistas y concretos basados en los "
    "errores y fortalezas observados en una evaluación. No prometes resultados ni inventas datos. "
    "Respondes en español."
)


def study_plan_prompt(subject_name: str, score: float | None, topic_rows: str, wrong_questions: str) -> str:
    score_line = f"Calificación obtenida: {score:.0f}/100." if score is not None else ""
    return f"""Diseña un plan de estudio personalizado para la asignatura "{subject_name}".
{score_line}

DESEMPEÑO POR TEMA (aciertos/total):
{topic_rows}

PREGUNTAS FALLADAS (enunciado + tema + explicación):
{wrong_questions}

TAREA: crea un plan con:
- blocks: prioridades por tema (alta/media/baja) con acciones concretas y minutos estimados
  (más tiempo a los temas con más fallos y mayor relevancia).
- session_plan: entre 3 y 5 sesiones de estudio con actividades específicas.
- general_tips: consejos personalizados según los errores detectados.
"""


# ---------- OCR ----------

OCR_SYSTEM = (
    "Eres un motor de OCR académico. Transcribes imágenes de apuntes, diapositivas o páginas "
    "escaneadas con exactitud, preservando títulos, listas, fórmulas y estructura. "
    "No agregas comentarios ni explicaciones: solo la transcripción."
)


def ocr_prompt(hint: str = "") -> str:
    extra = f" (contexto: {hint})" if hint else ""
    return (
        f"Transcribe TODO el texto visible en esta imagen{extra}. "
        "Usa Markdown para conservar estructura (títulos, listas, tablas). Si hay fórmulas, "
        "escríbelas en notación legible. Si la imagen no contiene texto legible, responde exactamente: "
        "[SIN_TEXTO_LEGIBLE]"
    )
