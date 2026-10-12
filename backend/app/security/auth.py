"""JWT session auth with httpOnly Secure cookies (no localStorage)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

import bcrypt
import jwt
from fastapi import Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.config import Settings, get_settings

ACCESS_COOKIE = "ceir_access_token"
REFRESH_COOKIE = "ceir_refresh_token"


class TokenUser(BaseModel):
    username: str
    token_type: Literal["access", "refresh"] = "access"


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    username: str


def _utcnow() -> datetime:
    return datetime.now(UTC)


def verify_password(plain: str, settings: Settings) -> bool:
    if settings.auth_password_hash:
        try:
            return bcrypt.checkpw(
                plain.encode("utf-8"),
                settings.auth_password_hash.encode("utf-8"),
            )
        except ValueError:
            return False
    import secrets

    return secrets.compare_digest(plain, settings.auth_password)


def create_token(
    *,
    username: str,
    token_type: Literal["access", "refresh"],
    settings: Settings,
) -> str:
    now = _utcnow()
    if token_type == "access":
        expire = now + timedelta(minutes=settings.access_token_minutes)
    else:
        expire = now + timedelta(days=settings.refresh_token_days)

    payload: dict[str, Any] = {
        "sub": username,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, *, expected_type: Literal["access", "refresh"], settings: Settings) -> TokenUser:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        ) from exc

    username = payload.get("sub")
    token_type = payload.get("type")
    if not username or token_type != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )
    return TokenUser(username=str(username), token_type=expected_type)


def _cookie_common(settings: Settings) -> dict[str, Any]:
    same_site = settings.cookie_samesite.lower()
    if same_site not in {"lax", "strict", "none"}:
        same_site = "lax"
    return {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": same_site,
        "path": "/",
    }


def set_auth_cookies(response: Response, *, username: str, settings: Settings) -> None:
    access = create_token(username=username, token_type="access", settings=settings)
    refresh = create_token(username=username, token_type="refresh", settings=settings)
    common = _cookie_common(settings)

    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access,
        max_age=settings.access_token_minutes * 60,
        **common,
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh,
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        **common,
    )


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    common = _cookie_common(settings)
    response.delete_cookie(key=ACCESS_COOKIE, **common)
    response.delete_cookie(key=REFRESH_COOKIE, **common)


def get_current_user(
    access_token: Annotated[str | None, Cookie(alias=ACCESS_COOKIE)] = None,
    settings: Settings = Depends(get_settings),
) -> TokenUser:
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return decode_token(access_token, expected_type="access", settings=settings)


CurrentUser = Annotated[TokenUser, Depends(get_current_user)]
