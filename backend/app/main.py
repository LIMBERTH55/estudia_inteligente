"""ExamPredict AI — API principal (FastAPI)."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .ai import AIError, AINotConfiguredError
from .config import settings
from .database import Base, engine
from .routers import auth, documents, exams, meta, questions, subjects, tutor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Crea las tablas si no existen (MVP). Para producción usar migraciones (Alembic).
    Base.metadata.create_all(bind=engine)
    settings.storage_path.mkdir(parents=True, exist_ok=True)
    logging.getLogger(__name__).info("ExamPredict AI listo. Almacenamiento: %s", settings.storage_path)
    yield


app = FastAPI(
    title="ExamPredict AI API",
    description="Plataforma inteligente de preparación de exámenes: documentos -> preguntas -> simulaciones -> tutor.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AINotConfiguredError)
async def ai_not_configured_handler(_request: Request, exc: AINotConfiguredError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(AIError)
async def ai_error_handler(_request: Request, exc: AIError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": str(exc)})


app.include_router(auth.router)
app.include_router(subjects.router)
app.include_router(documents.router)
app.include_router(questions.router)
app.include_router(exams.router)
app.include_router(tutor.router)
app.include_router(meta.router)
