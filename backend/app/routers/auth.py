from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status

from app.config import Settings, get_settings
from app.security.auth import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    CurrentUser,
    LoginRequest,
    UserOut,
    clear_auth_cookies,
    create_token,
    decode_token,
    set_auth_cookies,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(
    body: LoginRequest,
    response: Response,
    settings: Settings = Depends(get_settings),
) -> UserOut:
    username = body.username.strip()
    password = body.password

    if username != settings.auth_username or not verify_password(password, settings):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    set_auth_cookies(response, username=username, settings=settings)
    return UserOut(username=username)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    settings: Settings = Depends(get_settings),
) -> None:
    clear_auth_cookies(response, settings)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return UserOut(username=user.username)


@router.post("/refresh", response_model=UserOut)
def refresh(
    response: Response,
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
    settings: Settings = Depends(get_settings),
) -> UserOut:
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    user = decode_token(refresh_token, expected_type="refresh", settings=settings)
    # Rotate both tokens.
    set_auth_cookies(response, username=user.username, settings=settings)
    return UserOut(username=user.username)
