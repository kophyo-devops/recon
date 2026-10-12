from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.reconciliation import HealthResponse
from app.security.sql import safe_text

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)) -> HealthResponse:
    try:
        # Constant SQL only (no user input). Prefer ORM scalar when possible.
        db.execute(safe_text("SELECT 1"))
        db_status = "connected"
    except Exception:
        # Never leak DB/driver error details to clients.
        db_status = "unavailable"
    return HealthResponse(status="ok", database=db_status)
