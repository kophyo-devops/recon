from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = (
        "postgresql+psycopg://ceir_app:ceir_app_secret@localhost:5432/ceir_db"
    )
    cors_origins: str = "http://localhost:3000"
    trusted_hosts: str = "localhost,127.0.0.1"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    enable_docs: bool = True
    rate_limit_requests: int = Field(default=120, ge=1)
    rate_limit_window_seconds: int = Field(default=60, ge=1)
    db_statement_timeout_ms: int = Field(default=10_000, ge=1000)
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_max_overflow: int = Field(default=5, ge=0, le=50)

    # Auth / cookies
    jwt_secret: str = Field(
        default="change-me-use-a-long-random-secret-in-production",
        min_length=32,
    )
    jwt_algorithm: str = "HS256"
    auth_username: str = "admin"
    auth_password: str = "admin123"
    auth_password_hash: str = ""  # optional bcrypt hash; overrides auth_password
    access_token_minutes: int = Field(default=15, ge=1)
    refresh_token_days: int = Field(default=7, ge=1)
    cookie_secure: bool = True
    cookie_samesite: str = "lax"  # lax | strict | none
    # Original upload files (Excel/CSV) for download
    upload_storage_dir: str = "data/uploads"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def trusted_host_list(self) -> list[str]:
        hosts = [h.strip() for h in self.trusted_hosts.split(",") if h.strip()]
        return hosts or ["localhost", "127.0.0.1"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
