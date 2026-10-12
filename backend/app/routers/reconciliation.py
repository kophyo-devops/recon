from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.reconciliation import Period, ReconciliationRun, UploadBatch
from app.schemas.reconciliation import ReconciliationResultOut, run_to_result
from app.security.auth import get_current_user
from app.security.validation import PeriodQuery, RunIdPath
from app.services.periods import parse_period_input, period_key, period_label
from app.services.reconcile import latest_run_for_label, run_reconciliation

router = APIRouter(
    prefix="/api",
    tags=["reconciliation"],
    dependencies=[Depends(get_current_user)],
)


class PeriodOptionOut(BaseModel):
    id: str
    value: str = Field(description="YYYY-MM")
    label: str
    year: int
    month: int


class RunRequest(BaseModel):
    period: str = Field(description="Start period YYYY-MM or April 2026")
    periodEnd: str | None = Field(
        default=None,
        description="Optional end period YYYY-MM or April 2026 (inclusive)",
    )


@router.get("/periods", response_model=list[PeriodOptionOut])
def list_periods(db: Session = Depends(get_db)) -> list[PeriodOptionOut]:
    # Only periods that still have uploaded files — empty inventory stays empty.
    rows = list(
        db.scalars(
            select(Period)
            .where(
                exists(
                    select(UploadBatch.id).where(UploadBatch.period_id == Period.id)
                )
            )
            .order_by(Period.year.desc(), Period.month.desc())
        )
    )
    return [
        PeriodOptionOut(
            id=str(row.id),
            value=period_key(row.year, row.month),
            label=row.label,
            year=row.year,
            month=row.month,
        )
        for row in rows
    ]


@router.get("/reconciliation/latest", response_model=ReconciliationResultOut)
def latest_reconciliation(
    period: PeriodQuery = None,
    db: Session = Depends(get_db),
) -> ReconciliationResultOut:
    stmt = (
        select(ReconciliationRun)
        .options(
            selectinload(ReconciliationRun.mismatches),
            selectinload(ReconciliationRun.summary),
        )
        .order_by(ReconciliationRun.created_at.desc())
    )
    if period is not None:
        try:
            year, month = parse_period_input(period)
            label = period_label(year, month)
            period_row = db.scalars(
                select(Period).where(Period.year == year, Period.month == month)
            ).first()
        except ValueError:
            label = period
            period_row = None

        # Exact single-month label, or runs anchored on this period
        # (range analyses store period_id = end month).
        filters = [ReconciliationRun.period_label == label]
        if period_row is not None:
            filters.append(ReconciliationRun.period_id == period_row.id)
        stmt = stmt.where(or_(*filters))

    run = db.scalars(stmt).first()
    if not run:
        raise HTTPException(status_code=404, detail="No reconciliation run found")
    return run_to_result(run)


@router.post("/reconciliation/run", response_model=ReconciliationResultOut)
def create_reconciliation_run(
    body: RunRequest,
    db: Session = Depends(get_db),
) -> ReconciliationResultOut:
    try:
        year, month = parse_period_input(body.period)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    end_year = end_month = None
    if body.periodEnd:
        try:
            end_year, end_month = parse_period_input(body.periodEnd)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        run = run_reconciliation(
            db,
            year,
            month,
            end_year=end_year,
            end_month=end_month,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # Ensure relationships loaded for response mapping.
    loaded = latest_run_for_label(db, run.period_label)
    if not loaded:
        raise HTTPException(status_code=404, detail="No reconciliation run found")
    return run_to_result(loaded)


@router.get("/reconciliation/{run_id}", response_model=ReconciliationResultOut)
def get_reconciliation(
    run_id: RunIdPath,
    db: Session = Depends(get_db),
) -> ReconciliationResultOut:
    stmt = (
        select(ReconciliationRun)
        .where(ReconciliationRun.id == run_id)
        .options(
            selectinload(ReconciliationRun.mismatches),
            selectinload(ReconciliationRun.summary),
        )
    )
    run = db.scalars(stmt).first()
    if not run:
        raise HTTPException(status_code=404, detail="Reconciliation run not found")
    return run_to_result(run)
