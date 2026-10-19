"""Prueba de humo del backend: flujo completo con archivos reales.

Uso: .\\backend\\venv\\Scripts\\python.exe test_data\\smoke_test.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8000"
HERE = Path(__file__).parent
EMAIL = "demo@exampredict.local"
PASSWORD = "demo12345"


def main() -> int:
    client = httpx.Client(base_url=BASE, timeout=60)

    # 1. Login (o registro si no existe)
    r = client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        r = client.post(
            "/api/auth/register",
            json={"name": "Estudiante Demo", "email": EMAIL, "password": PASSWORD},
        )
    assert r.status_code in (200, 201), f"Login/registro falló: {r.status_code} {r.text}"
    print(f"[OK] Sesión iniciada como {r.json()['email']}")

    # 2. Asignatura
    subjects = client.get("/api/subjects").json()
    if subjects:
        subject = subjects[0]
    else:
        r = client.post("/api/subjects", json={"name": "Bases de Datos", "description": "Materia de prueba"})
        subject = r.json()
    sid = subject["id"]
    print(f"[OK] Asignatura: {subject['name']} ({sid})")

    # 3. Subir archivos
    files_to_upload = []
    txt = HERE / "bases_datos.txt"
    pdf = HERE / "normalizacion.pdf"
    for path in (txt, pdf):
        if path.exists():
            ext = path.suffix.lstrip(".")
            mime = "application/pdf" if ext == "pdf" else "text/plain"
            files_to_upload.append(("files", (path.name, path.read_bytes(), mime)))
    if not files_to_upload:
        print("[!] No hay archivos de prueba en test_data/")
        return 1
    r = client.post(f"/api/subjects/{sid}/documents", files=files_to_upload, data={"kind": "material"})
    assert r.status_code == 201, f"Subida falló: {r.status_code} {r.text}"
    result = r.json()
    print(f"[OK] Subidos: {[d['original_name'] for d in result['uploaded']]} | Rechazados: {result['rejected']}")

    # 4. Esperar procesamiento
    docs = []
    for _ in range(40):
        time.sleep(3)
        docs = client.get(f"/api/subjects/{sid}/documents").json()
        pending = [d for d in docs if d["status"] in {"uploaded", "processing"}]
        for d in docs:
            print(f"    - {d['original_name']}: {d['status']} {d['progress']}% — {d['stage']}")
        if not pending:
            break
    for d in docs:
        if d["error"]:
            print(f"[i] {d['original_name']} error: {d['error'][:150]}")

    # 5. Estado IA
    ai = client.get("/api/ai/status").json()
    print(f"[i] IA configurada: {ai['configured']} | proveedor: {ai['provider']} | detalle: {ai['detail']}")

    # 6. Temas si hay
    topics = client.get(f"/api/subjects/{sid}/topics").json()
    print(f"[i] Temas detectados: {len(topics)}")
    for t in topics[:5]:
        print(f"    - {t['name']}: {t['importance']}/100")

    # 7. Dashboard
    dash = client.get("/api/dashboard").json()
    print(f"[OK] Dashboard: {dash['totals']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
