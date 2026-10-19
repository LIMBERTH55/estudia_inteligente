"""Genera archivos de prueba reales para validar el pipeline de ExamPredict AI."""
from pathlib import Path

import pymupdf

out = Path(__file__).parent
out.mkdir(exist_ok=True)

# PDF de prueba con contenido académico real
doc = pymupdf.open()
page = doc.new_page()
text = (
    "Normalizacion en bases de datos\n\n"
    "La normalizacion organiza las tablas para reducir la redundancia y evitar anomalias. "
    "La primera forma normal (1FN) exige valores atomicos en cada campo. "
    "La segunda forma normal (2FN) elimina las dependencias parciales de la clave primaria. "
    "La tercera forma normal (3FN) elimina las dependencias transitivas. "
    "Beneficios de normalizar: menos redundancia, mayor integridad de datos y consultas mas claras. "
    "Desventajas: mas tablas y mayor necesidad de JOINs en las consultas."
)
page.insert_textbox(pymupdf.Rect(50, 50, 550, 750), text, fontsize=12)
doc.save(str(out / "normalizacion.pdf"))
doc.close()
print("PDF creado:", out / "normalizacion.pdf")
