"""Strict input constraints used across API routes."""

from typing import Annotated
from uuid import UUID

from fastapi import Path, Query

# Period labels: letters, digits, spaces, hyphen, underscore, slash only.
PERIOD_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9 _\-/]{0,63}$"

PeriodQuery = Annotated[
    str | None,
    Query(
        max_length=64,
        pattern=PERIOD_PATTERN,
        description="Period label, e.g. April 2026",
    ),
]

RunIdPath = Annotated[
    UUID,
    Path(description="Reconciliation run UUID"),
]
