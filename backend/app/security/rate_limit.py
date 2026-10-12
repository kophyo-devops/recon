"""Simple in-memory IP rate limiter (best-effort; use gateway limits in prod)."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        *,
        requests: int = 120,
        window_seconds: int = 60,
    ) -> None:
        super().__init__(app)
        self.requests = requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _client_key(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client and request.client.host:
            return request.client.host
        return "unknown"

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.url.path in {"/health", "/"}:
            return await call_next(request)

        key = self._client_key(request)
        now = time.monotonic()
        window_start = now - self.window_seconds
        bucket = self._hits[key]

        while bucket and bucket[0] < window_start:
            bucket.popleft()

        if len(bucket) >= self.requests:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again later."},
                headers={"Retry-After": str(self.window_seconds)},
            )

        bucket.append(now)
        return await call_next(request)
