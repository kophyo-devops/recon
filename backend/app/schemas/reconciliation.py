from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    status: str
    database: str


class PeriodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str
    year: int
    month: int
    created_at: datetime


class SummaryMetricOut(BaseModel):
    label: str
    ird: str | int
    ceir: str | int
    note: str | None = None


class MismatchOut(BaseModel):
    id: str
    applicationId: str
    category: Literal[
        "unconfirmed", "fraud", "duplicate", "overpay", "month_boundary"
    ]
    amountMmk: float | None
    irdStatus: str
    ceirStatus: str
    detail: str


class ReconciliationResultOut(BaseModel):
    id: UUID
    periodLabel: str
    matchedCount: int
    mismatchCount: int
    irdPaid: int
    ceirPaid: int
    adjustedIrdSum: float
    adjustedCeirSum: float
    sumsEqual: bool
    summary: list[SummaryMetricOut] = Field(default_factory=list)
    mismatches: list[MismatchOut] = Field(default_factory=list)
    createdAt: datetime


def _as_number_or_str(value: str | None) -> str | int:
    if value is None:
        return ""
    if value.replace(",", "").replace(".", "", 1).isdigit():
        cleaned = value.replace(",", "")
        if "." in cleaned:
            return value
        return int(cleaned)
    return value


def run_to_result(run) -> ReconciliationResultOut:
    summary = [
        SummaryMetricOut(
            label=m.label,
            ird=_as_number_or_str(m.ird_value),
            ceir=_as_number_or_str(m.ceir_value),
            note=m.note,
        )
        for m in sorted(run.summary, key=lambda x: x.sort_order)
    ]
    mismatches = [
        MismatchOut(
            id=str(row.id),
            applicationId=row.application_id,
            category=row.category,
            amountMmk=float(row.amount_mmk) if row.amount_mmk is not None else None,
            irdStatus=row.ird_status or "",
            ceirStatus=row.ceir_status or "",
            detail=row.detail or "",
        )
        for row in run.mismatches
    ]
    return ReconciliationResultOut(
        id=run.id,
        periodLabel=run.period_label,
        matchedCount=run.matched_count,
        mismatchCount=run.mismatch_count,
        irdPaid=run.ird_paid,
        ceirPaid=run.ceir_paid,
        adjustedIrdSum=float(run.adjusted_ird_sum or Decimal("0")),
        adjustedCeirSum=float(run.adjusted_ceir_sum or Decimal("0")),
        sumsEqual=run.sums_equal,
        summary=summary,
        mismatches=mismatches,
        createdAt=run.created_at,
    )
