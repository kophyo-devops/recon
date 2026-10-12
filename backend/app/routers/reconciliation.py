from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.reconciliation import MismatchRow, Period, ReconciliationRun, UploadBatch
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


class DashboardCategoryOut(BaseModel):
    count: int = 0
    amount: float = 0


class DashboardMonthOut(BaseModel):
    period: str
    ceirFiles: int = 0
    payplusFiles: int = 0
    ceirRows: int = 0
    payplusRows: int = 0
    matchedCount: int | None = None
    mismatchCount: int | None = None
    irdPaid: int | None = None
    ceirPaid: int | None = None
    adjustedIrdSum: float | None = None
    adjustedCeirSum: float | None = None
    sumsEqual: bool | None = None
    categories: dict[str, DashboardCategoryOut] = Field(default_factory=dict)


def _month_index(year: int, month: int) -> int:
    return year * 12 + month


@router.get("/dashboard/series", response_model=list[DashboardMonthOut])
def dashboard_series(
    from_period: str = Query(alias="from", min_length=7, max_length=7),
    to_period: str = Query(alias="to", min_length=7, max_length=7),
    db: Session = Depends(get_db),
) -> list[DashboardMonthOut]:
    """One query-shaped payload for the dashboard chart and summary cards.

    Replaces a per-month pair of summary + full reconciliation fetches.
    Category totals are aggregated in SQL; mismatch rows are not returned.
    """
    try:
        from_year, from_month = parse_period_input(from_period)
        to_year, to_month = parse_period_input(to_period)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    start = _month_index(from_year, from_month)
    end = _month_index(to_year, to_month)
    if start > end:
        start, end = end, start
    if end - start > 48:
        raise HTTPException(status_code=422, detail="Range cannot exceed 48 months")

    periods = list(
        db.scalars(
            select(Period).where(
                Period.year * 12 + Period.month >= start,
                Period.year * 12 + Period.month <= end,
            )
        )
    )
    periods.sort(key=lambda row: (row.year, row.month))
    if not periods:
        return []

    period_ids = [row.id for row in periods]
    inventory: dict[object, dict[str, tuple[int, int]]] = {}
    for period_id, side, batches, rows in db.execute(
        select(
            UploadBatch.period_id,
            UploadBatch.side,
            func.count(),
            func.coalesce(func.sum(UploadBatch.row_count), 0),
        )
        .where(UploadBatch.period_id.in_(period_ids))
        .group_by(UploadBatch.period_id, UploadBatch.side)
    ):
        inventory.setdefault(period_id, {})[side] = (int(batches or 0), int(rows or 0))

    labels = [row.label for row in periods]
    runs = list(
        db.scalars(
            select(ReconciliationRun)
            .where(
                or_(
                    ReconciliationRun.period_id.in_(period_ids),
                    ReconciliationRun.period_label.in_(labels),
                )
            )
            .order_by(ReconciliationRun.created_at.desc())
        )
    )
    latest_by_period: dict[object, ReconciliationRun] = {}
    for run in runs:
        for period in periods:
            if period.id in latest_by_period:
                continue
            if run.period_id == period.id or run.period_label == period.label:
                latest_by_period[period.id] = run

    run_ids = [run.id for run in latest_by_period.values()]
    category_totals: dict[object, dict[str, DashboardCategoryOut]] = {}
    if run_ids:
        for run_id, category, count, amount in db.execute(
            select(
                MismatchRow.run_id,
                MismatchRow.category,
                func.count(),
                func.coalesce(func.sum(MismatchRow.amount_mmk), 0),
            )
            .where(MismatchRow.run_id.in_(run_ids))
            .group_by(MismatchRow.run_id, MismatchRow.category)
        ):
            category_totals.setdefault(run_id, {})[category] = DashboardCategoryOut(
                count=int(count or 0),
                amount=float(amount or 0),
            )

    months: list[DashboardMonthOut] = []
    for period in periods:
        sides = inventory.get(period.id, {})
        ceir_files, ceir_rows = sides.get("ceir", (0, 0))
        payplus_files, payplus_rows = sides.get("payplus", (0, 0))
        run = latest_by_period.get(period.id)
        months.append(
            DashboardMonthOut(
                period=period_key(period.year, period.month),
                ceirFiles=ceir_files,
                payplusFiles=payplus_files,
                ceirRows=ceir_rows,
                payplusRows=payplus_rows,
                matchedCount=run.matched_count if run else None,
                mismatchCount=run.mismatch_count if run else None,
                irdPaid=run.ird_paid if run else None,
                ceirPaid=run.ceir_paid if run else None,
                adjustedIrdSum=float(run.adjusted_ird_sum) if run else None,
                adjustedCeirSum=float(run.adjusted_ceir_sum) if run else None,
                sumsEqual=run.sums_equal if run else None,
                categories=category_totals.get(run.id, {}) if run else {},
            )
        )
    return months


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
