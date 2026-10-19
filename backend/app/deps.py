"""Dependencias compartidas de FastAPI (autenticación y control de acceso)."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .database import get_db
from .models import Subject, User
from .security import COOKIE_NAME, decode_access_token


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            token = header[7:]
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado. Inicia sesión para continuar.",
        )
    user_id = decode_access_token(token)
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida o expirada. Vuelve a iniciar sesión.",
        )
    return user


def get_owned_subject(subject_id: str, db: Session, user: User) -> Subject:
    subject = db.get(Subject, subject_id)
    if subject is None or subject.user_id != user.id:
        raise HTTPException(status_code=404, detail="Asignatura no encontrada.")
    return subject
