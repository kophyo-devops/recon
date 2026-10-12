"""Period label helpers shared across upload / reconciliation."""

from __future__ import annotations

import re

MONTH_NAMES = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)

MONTH_LOOKUP = {name.lower(): i + 1 for i, name in enumerate(MONTH_NAMES)}
MONTH_LOOKUP.update(
    {
        "jan": 1,
        "feb": 2,
        "mar": 3,
        "apr": 4,
        "jun": 6,
        "jul": 7,
        "aug": 8,
        "sep": 9,
        "sept": 9,
        "oct": 10,
        "nov": 11,
        "dec": 12,
    }
)


def period_label(year: int, month: int) -> str:
    return f"{MONTH_NAMES[month - 1]} {year}"


def period_key(year: int, month: int) -> str:
    return f"{year}-{month:02d}"


def parse_period_input(value: str) -> tuple[int, int]:
    """
    Accept 'YYYY-MM' or 'April 2026' style labels.
    """
    text = value.strip()
    key_match = re.fullmatch(r"(20\d{2})-(\d{1,2})", text)
    if key_match:
        year = int(key_match.group(1))
        month = int(key_match.group(2))
        if 1 <= month <= 12:
            return year, month
        raise ValueError("Month must be between 1 and 12")

    label_match = re.fullmatch(
        r"([A-Za-z]+)[,\s_-]+(20\d{2})",
        text,
    )
    if label_match:
        month = MONTH_LOOKUP.get(label_match.group(1).lower())
        year = int(label_match.group(2))
        if month:
            return year, month

    raise ValueError("Period must look like YYYY-MM or 'April 2026'")
