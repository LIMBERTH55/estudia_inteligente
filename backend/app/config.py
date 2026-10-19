"""Configuración central del backend (variables de entorno)."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # carpeta backend/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Base de datos
    database_url: str = "postgresql+psycopg://exampredict_app:changeme@127.0.0.1:5432/exampredict"

    # Seguridad
    jwt_secret: str = "dev-secret-cambiar"
    jwt_expire_days: int = 7

    # IA
    ai_provider: str = "gemini"  # gemini | openai_compat | none
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_embedding_model: str = "gemini-embedding-001"
    openai_compat_api_key: str = ""
    openai_compat_base_url: str = "https://api.openai.com/v1"
    openai_compat_model: str = "gpt-4o-mini"
    openai_compat_embedding_model: str = "text-embedding-3-small"

    # Almacenamiento
    storage_dir: str = "storage"

    # Límites
    max_upload_mb: int = 50
    max_docs_per_subject: int = 60

    frontend_origin: str = "http://localhost:3000"

    @property
    def storage_path(self) -> Path:
        p = BASE_DIR / self.storage_dir
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()
