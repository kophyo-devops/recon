from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

# Statement timeout + idle transaction guards (PostgreSQL).
_connect_args = {
    "options": (
        f"-c statement_timeout={settings.db_statement_timeout_ms} "
        f"-c idle_in_transaction_session_timeout=15000"
    )
}

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_recycle=1800,
    echo=False,
    connect_args=_connect_args,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


@event.listens_for(Engine, "before_cursor_execute")
def _reject_multi_statement(_conn, _cursor, statement, _parameters, _context, _executemany):
    """
    Defense-in-depth: refuse statements that look like stacked queries.
    ORM/parameterized SQL should never need multiple statements in one call.
    """
    # Allow common single-statement SQL; block obvious stacking with semicolons
    # outside of string literals is hard — use a conservative check for
    # trailing stacked DML after a semicolon.
    stripped = " ".join(str(statement).split())
    if ";" in stripped.rstrip(";"):
        raise RuntimeError("Blocked potentially stacked SQL statement")


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
