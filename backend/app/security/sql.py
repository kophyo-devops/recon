"""
SQL safety conventions for this codebase.

Rules:
1. Prefer SQLAlchemy ORM / Core expression language (select, where, bindparams).
2. Never build SQL with f-strings, +, %, or .format() using user input.
3. If raw SQL is required, use text("... :name ...") with bound params only.
4. Identifiers (table/column names) must be hardcoded constants — never from request data.
"""

from sqlalchemy import TextClause, text


def safe_text(sql: str) -> TextClause:
    """
    Wrap a constant SQL string. Raises if the string looks dynamically formatted
    with interpolation markers that suggest unsafe construction.
    """
    if any(token in sql for token in ("{", "}", "%s", "%(")):
        raise ValueError(
            "Refusing SQL that looks dynamically interpolated. "
            "Use bound parameters (:name) instead."
        )
    return text(sql)
