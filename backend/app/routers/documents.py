"""Carga, listado, descarga y gestión de documentos de estudio."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user, get_owned_subject
from ..models import Document, Subject, User
from ..schemas import DocumentOut, UploadResult
from ..services.extraction import SUPPORTED_EXTENSIONS
from ..services.processing import process_document, recompute_importance

router = APIRouter(tags=["Documentos"])

VALID_KINDS = {"material", "exam", "notes"}


def _doc_out(doc: Document) -> dict:
    return {
        "id": doc.id,
        "subject_id": doc.subject_id,
        "original_name": doc.original_name,
        "filetype": doc.filetype,
        "kind": doc.kind,
        "size_bytes": doc.size_bytes,
        "status": doc.status,
        "stage": doc.stage,
        "progress": doc.progress,
        "error": doc.error,
        "page_count": doc.page_count,
        "word_count": doc.word_count,
        "ocr_used": doc.ocr_used,
        "rag_mode": doc.rag_mode,
        "ai_summary": doc.ai_summary,
        "created_at": doc.created_at,
        "processed_at": doc.processed_at,
    }


@router.post("/api/subjects/{subject_id}/documents", response_model=UploadResult, status_code=201)
async def upload_documents(
    subject_id: str,
    background: BackgroundTasks,
    files: list[UploadFile] = File(...),
    kind: str = Form("material"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    subject = get_owned_subject(subject_id, db, user)
    if kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail="Tipo de documento inválido.")

    existing_count = db.query(Document).filter(Document.subject_id == subject.id).count()
    max_mb = settings.max_upload_mb
    uploaded: list[Document] = []
    rejected: list[dict[str, str]] = []

    for upload in files:
        name = Path(upload.filename or "archivo").name
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext not in SUPPORTED_EXTENSIONS:
            rejected.append(
                {
                    "name": name,
                    "reason": f"Formato no soportado (.{ext}). Usa PDF, DOCX, PPTX, TXT, JPG o PNG.",
                }
            )
            continue
        if existing_count + len(uploaded) >= settings.max_docs_per_subject:
            rejected.append(
                {
                    "name": name,
                    "reason": f"Límite de {settings.max_docs_per_subject} documentos por asignatura alcanzado.",
                }
            )
            continue
        data = await upload.read()
        if not data:
            rejected.append({"name": name, "reason": "El archivo está vacío."})
            continue
        if len(data) > max_mb * 1024 * 1024:
            rejected.append({"name": name, "reason": f"El archivo supera el límite de {max_mb} MB."})
            continue

        doc = Document(
            subject_id=subject.id,
            user_id=user.id,
            original_name=name[:255],
            stored_path="",
            filetype=ext,
            kind=kind,
            size_bytes=len(data),
            status="uploaded",
            stage="En cola de procesamiento",
            progress=0,
        )
        db.add(doc)
        db.flush()  # obtener doc.id

        folder = settings.storage_path / "users" / user.id / subject.id
        folder.mkdir(parents=True, exist_ok=True)
        file_path = folder / f"{doc.id}.{ext}"
        file_path.write_bytes(data)
        doc.stored_path = str(file_path)
        db.commit()
        db.refresh(doc)
        uploaded.append(doc)
        background.add_task(process_document, doc.id)

    return {"uploaded": [_doc_out(d) for d in uploaded], "rejected": rejected}


@router.get("/api/subjects/{subject_id}/documents", response_model=list[DocumentOut])
def list_documents(
    subject_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    subject = get_owned_subject(subject_id, db, user)
    docs = (
        db.query(Document)
        .filter(Document.subject_id == subject.id)
        .order_by(Document.created_at.desc())
        .all()
    )
    return [_doc_out(d) for d in docs]


def _get_owned_document(doc_id: str, db: Session, user: User) -> Document:
    doc = db.get(Document, doc_id)
    if doc is None or doc.user_id != user.id:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")
    return doc


@router.get("/api/documents/{doc_id}/file")
def download_document(
    doc_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    doc = _get_owned_document(doc_id, db, user)
    path = Path(doc.stored_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="El archivo ya no está en el servidor.")
    return FileResponse(path, filename=doc.original_name)


@router.delete("/api/documents/{doc_id}", status_code=204)
def delete_document(
    doc_id: str,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    doc = _get_owned_document(doc_id, db, user)
    subject_id = doc.subject_id
    path = Path(doc.stored_path)
    if path.exists():
        path.unlink(missing_ok=True)
    db.delete(doc)
    db.commit()

    def _after_delete(subject_id: str) -> None:
        from ..database import SessionLocal

        job_db = SessionLocal()
        try:
            subject = job_db.get(Subject, subject_id)
            if subject is None:
                return
            remaining = job_db.query(Document).filter(Document.subject_id == subject.id).count()
            if remaining == 0:
                subject.analysis_status = "pending"
                subject.summary = None
                job_db.commit()
                return
            recompute_importance(job_db, subject)
        finally:
            job_db.close()

    background.add_task(_after_delete, subject_id)


@router.post("/api/documents/{doc_id}/reprocess", status_code=202)
def reprocess_document(
    doc_id: str,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    doc = _get_owned_document(doc_id, db, user)
    if doc.status == "processing":
        raise HTTPException(status_code=409, detail="El documento ya se está procesando.")
    doc.status = "uploaded"
    doc.progress = 0
    doc.stage = "En cola de reprocesamiento"
    doc.error = None
    db.commit()
    background.add_task(process_document, doc.id)
    return {"detail": "Reprocesamiento iniciado."}
