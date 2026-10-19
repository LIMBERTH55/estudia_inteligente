"""Prueba de humo del backend de ExamPredict AI: flujo completo de punta a punta.

Cubre: sesión → materia → subida de documentos → análisis con IA → generación de
preguntas → intento de examen → respuesta → entrega → calificación → plan de
estudio → tutor → estadísticas → panel.

Requiere el backend encendido en http://127.0.0.1:8000. Si la IA no está
configurada (GEMINI_API_KEY), verifica igualmente todo lo que no depende de IA
y se detiene con un mensaje claro.

Uso: .\\backend\\venv\\Scripts\\python.exe test_data\\smoke_test.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import httpx

# La consola de Windows puede no soportar todos los caracteres (cp1252/cp437).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

BASE = "http://127.0.0.1:8000"
HERE = Path(__file__).parent
EMAIL = "demo@exampredict.local"
PASSWORD = "demo12345"


def answer_for(qtype: str) -> dict | None:
    """Respuesta de prueba según el tipo de pregunta (None = no se responde)."""
    if qtype == "mc":
        return {"index": 0}
    if qtype == "tf":
        return {"value": True}
    if qtype == "fill":
        return {"values": ["prueba"]}
    if qtype in {"open", "problem", "analysis"}:
        return {
            "text": "Respuesta de prueba: la normalización organiza los datos en tablas "
            "para eliminar redundancia y evitar anomalías de actualización."
        }
    return None


def main() -> int:  # noqa: C901 - script lineal de verificación
    client = httpx.Client(base_url=BASE, timeout=300)

    # 1. Sesión ---------------------------------------------------------------
    r = client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        r = client.post(
            "/api/auth/register",
            json={"name": "Estudiante Demo", "email": EMAIL, "password": PASSWORD},
        )
    assert r.status_code in (200, 201), f"Login/registro falló: {r.status_code} {r.text}"
    print(f"[OK] Sesión iniciada como {r.json()['email']}")

    # 2. Asignatura -----------------------------------------------------------
    subjects = client.get("/api/subjects").json()
    if subjects:
        subject = subjects[0]
    else:
        r = client.post("/api/subjects", json={"name": "Bases de Datos", "description": "Materia de prueba"})
        subject = r.json()
    sid = subject["id"]
    print(f"[OK] Asignatura: {subject['name']} ({sid})")

    # 3. Subir archivos -------------------------------------------------------
    files_to_upload = []
    for name, mime in (("bases_datos.txt", "text/plain"), ("normalizacion.pdf", "application/pdf")):
        path = HERE / name
        if path.exists():
            files_to_upload.append(("files", (path.name, path.read_bytes(), mime)))
    if not files_to_upload:
        print("[!] No hay archivos de prueba en test_data/")
        return 1
    r = client.post(f"/api/subjects/{sid}/documents", files=files_to_upload, data={"kind": "material"})
    assert r.status_code == 201, f"Subida falló: {r.status_code} {r.text}"
    result = r.json()
    print(f"[OK] Subidos: {[d['original_name'] for d in result['uploaded']]} | Rechazados: {result['rejected']}")

    # 4. Estado de la IA ------------------------------------------------------
    ai = client.get("/api/ai/status").json()
    print(f"[i] IA configurada: {ai['configured']} | proveedor: {ai['provider']} | modelo: {ai.get('model')}")
    if not ai["configured"]:
        print(f"[!] {ai.get('detail') or 'IA sin configurar.'}")
        print("[!] Se verifica solo lo que no depende de IA (extracción de texto).")

    # 5. Reintentar documentos en error si la IA ya está lista ---------------
    if ai["configured"]:
        for d in client.get(f"/api/subjects/{sid}/documents").json():
            if d["status"] == "error":
                rr = client.post(f"/api/documents/{d['id']}/reprocess")
                print(f"[i] Reintentando análisis de {d['original_name']}: HTTP {rr.status_code}")

    # 6. Esperar el procesamiento --------------------------------------------
    docs = []
    for _ in range(80):
        time.sleep(3)
        docs = client.get(f"/api/subjects/{sid}/documents").json()
        pending = [d for d in docs if d["status"] in {"uploaded", "processing"}]
        for d in pending:
            print(f"    - {d['original_name']}: {d['status']} {d['progress']}% — {d['stage']}")
        if not pending:
            break
    for d in docs:
        if d["error"]:
            print(f"[i] {d['original_name']} error: {d['error'][:200]}")
    ready = [d for d in docs if d["status"] == "ready"]
    print(f"[OK] Documentos listos: {len(ready)}/{len(docs)}")

    # 7. Temas y relevancia ---------------------------------------------------
    topics = client.get(f"/api/subjects/{sid}/topics").json()
    print(f"[i] Temas detectados: {len(topics)}")
    for t in topics[:5]:
        reason = f" — {t['reasons'][0]}" if t.get("reasons") else ""
        print(f"    - {t['name']}: {t['importance']}/100{reason}")

    if not ai["configured"] or not ready:
        print("\n[~] Verificacion parcial completada. Configura GEMINI_API_KEY en backend/.env")
        print("    y vuelve a ejecutar este script para probar todo el flujo de IA.")
        dash = client.get("/api/dashboard").json()
        print(f"[OK] Dashboard: {dash['totals']}")
        return 0

    # 8. Generar preguntas ----------------------------------------------------
    print("[…] Generando 6 preguntas con IA (puede tardar un par de minutos)…")
    r = client.post(
        f"/api/subjects/{sid}/question-sets",
        json={"count": 6, "types": ["mc", "tf", "fill", "open"]},
    )
    assert r.status_code == 202, f"Creación del conjunto falló: {r.status_code} {r.text}"
    set_id = r.json()["id"]
    qset = {}
    for _ in range(120):
        time.sleep(3)
        qset = client.get(f"/api/question-sets/{set_id}").json()
        if qset["status"] in {"ready", "error"}:
            break
        print(f"    … estado: {qset['status']}")
    assert qset.get("status") == "ready", f"Generación falló: {qset.get('error')}"
    questions = qset["questions"]
    print(f"[OK] {len(questions)} preguntas generadas. Relevancia y motivos:")
    for q in questions:
        reason = f" — {q['relevance_reasons'][0]}" if q.get("relevance_reasons") else ""
        refs = q.get("source_refs") or []
        ref = refs[0].get("document") if refs and isinstance(refs[0], dict) else None
        print(f"    - [{q['qtype']}/{q['difficulty']}] rel {q['relevance']}/100{reason}")
        if ref:
            print(f"      fuente: {ref}")

    # 9. Intento de examen: responder y entregar ------------------------------
    r = client.post(
        "/api/exams",
        json={"set_id": set_id, "title": "Examen de prueba (smoke test)", "mode": "exam"},
    )
    assert r.status_code == 201, f"Creación del examen falló: {r.status_code} {r.text}"
    attempt_id = r.json()["id"]
    state = client.get(f"/api/exams/{attempt_id}").json()
    answered = 0
    for q in state["questions"]:
        shape = answer_for(q["qtype"])
        if shape is None:
            continue
        rr = client.patch(
            f"/api/exams/{attempt_id}/answers/{q['id']}",
            json={"answer": shape, "flagged": False},
        )
        assert rr.status_code == 200, f"Guardar respuesta falló: {rr.status_code} {rr.text}"
        answered += 1
    print(f"[OK] Examen iniciado y {answered}/{len(state['questions'])} preguntas respondidas")

    print("[…] Entregando y calificando (la corrección de desarrollo puede tardar)…")
    r = client.post(f"/api/exams/{attempt_id}/finish")
    assert r.status_code == 200, f"Entrega falló: {r.status_code} {r.text}"
    status = r.json()["status"]
    for _ in range(80):
        if status == "finished":
            break
        time.sleep(3)
        status = client.get(f"/api/exams/{attempt_id}").json()["attempt"]["status"]
        print(f"    … estado: {status}")
    assert status == "finished", f"El examen no llegó a 'finished': {status}"

    # 10. Resultados ----------------------------------------------------------
    results = client.get(f"/api/exams/{attempt_id}/results").json()
    core = results["attempt"]
    print(f"[OK] Nota: {core['score']}/100 | duración: {core.get('duration_sec')}s")
    print(f"    preguntas: {len(results['questions'])} | calificadas: {results['graded_count']}"
          f" | sin calificar: {results['ungraded_count']}")
    for t in sorted(results.get("by_topic") or [], key=lambda x: x.get("accuracy", 0))[:3]:
        print(f"    tema (materia): {t['topic']} — acierto {t['accuracy']}% ({t['correct']}/{t['answered']})")

    # 11. Plan de estudio -----------------------------------------------------
    r = client.post(f"/api/exams/{attempt_id}/study-plan")
    if r.status_code == 200:
        plan = r.json()
        content = plan.get("content") or {}
        print(f"[OK] Plan de estudio: {content.get('headline', '(sin titular)')}")
        for block in (content.get("blocks") or [])[:3]:
            print(f"    - {block.get('topic')} ({block.get('priority')}): {len(block.get('actions', []))} acciones")
    else:
        print(f"[i] Plan de estudio no disponible: {r.status_code} {r.text[:150]}")

    # 12. Tutor grounded ------------------------------------------------------
    s = client.post("/api/tutor/sessions", json={"subject_id": sid, "title": "Prueba de humo"}).json()
    r = client.post(
        f"/api/tutor/sessions/{s['id']}/messages",
        json={"content": "¿Qué es la normalización y para qué sirve? Responde en pocas líneas."},
    )
    assert r.status_code == 200, f"Tutor falló: {r.status_code} {r.text}"
    reply = r.json()
    grounded = reply.get("grounded")
    print(f"[OK] Tutor respondió (anclada en documentos: {grounded}, fuentes: {len(reply.get('sources') or [])})")
    print(f"    \"{(reply.get('content') or '')[:180]}…\"")

    # 13. Estadísticas y panel -------------------------------------------------
    stats = client.get(f"/api/subjects/{sid}/stats").json()
    print(f"[OK] Estadísticas: {stats.get('attempts_count')} exámenes | promedio: {stats.get('avg_score')} | "
          f"mejor: {stats.get('best_score')}")
    dash = client.get("/api/dashboard").json()
    print(f"[OK] Dashboard: {dash['totals']}")

    print("\n[OK] Flujo completo verificado de punta a punta.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
