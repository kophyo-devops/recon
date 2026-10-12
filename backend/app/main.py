from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.routers import auth, health, reconciliation, uploads
from app.security.headers import SecurityHeadersMiddleware
from app.security.rate_limit import RateLimitMiddleware

settings = get_settings()

app = FastAPI(
    title="CEIR Reconciliation API",
    description="Python backend for CEIR / Payment Hub reconciliation",
    version="0.1.0",
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.trusted_host_list,
)
app.add_middleware(
    RateLimitMiddleware,
    requests=settings.rate_limit_requests,
    window_seconds=settings.rate_limit_window_seconds,
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "Authorization"],
    expose_headers=["Retry-After"],
    max_age=600,
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(reconciliation.router)
app.include_router(uploads.router)


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(
    _request: Request, _exc: SQLAlchemyError
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "A database error occurred."},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
    )


@app.exception_handler(RuntimeError)
async def runtime_safety_handler(_request: Request, exc: RuntimeError) -> JSONResponse:
    message = str(exc)
    if "Blocked potentially stacked SQL" in message:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": "Invalid request."},
        )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error."},
    )


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "CEIR Reconciliation API", "docs": "/docs"}
