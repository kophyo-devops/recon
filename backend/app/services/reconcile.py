"""Build a reconciliation run from DB rows for a period."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.reconciliation import (
    CeirApplication,
    MismatchRow,
    PaymentHubTransaction,
    Period,
    ReconciliationRun,
    SummaryMetric,
    UploadBatch,
)
from app.services.periods import period_label

CEIR_APP_RE = re.compile(r"^MM-[A-Z0-9-]+$", re.IGNORECASE)
FRAUD_STATUS_RE = re.compile(
    r"fraud|blacklist|blocked|suspected|charge.?back",
    re.IGNORECASE,
)


def get_or_create_period(db: Session, year: int, month: int) -> Period:
    label = period_label(year, month)
    existing = db.scalars(select(Period).where(Period.label == label)).first()
    if existing:
        return existing
    period = Period(label=label, year=year, month=month)
    db.add(period)
    db.flush()
    return period


def latest_run_for_label(db: Session, label: str) -> ReconciliationRun | None:
    stmt = (
        select(ReconciliationRun)
        .where(ReconciliationRun.period_label == label)
        .options(
            selectinload(ReconciliationRun.mismatches),
            selectinload(ReconciliationRun.summary),
        )
        .order_by(ReconciliationRun.created_at.desc())
    )
    return db.scalars(stmt).first()


def replace_side_batches(
    db: Session, *, period_id, side: str
) -> None:
    """Remove prior uploads for the same period + side so re-upload replaces data."""
    old_batches = list(
        db.scalars(
            select(UploadBatch).where(
                UploadBatch.period_id == period_id,
                UploadBatch.side == side,
            )
        )
    )
    from app.services.upload_storage import delete_stored_upload

    for batch in old_batches:
        delete_stored_upload(batch.id)
        db.delete(batch)
    db.flush()


def clear_runs_for_label(db: Session, label: str) -> int:
    runs = list(
        db.scalars(
            select(ReconciliationRun).where(ReconciliationRun.period_label == label)
        )
    )
    for run in runs:
        db.delete(run)
    db.flush()
    return len(runs)


def _latest_batch_ids(db: Session, period_id, side: str) -> list:
    batches = list(
        db.scalars(
            select(UploadBatch)
            .where(UploadBatch.period_id == period_id, UploadBatch.side == side)
            .order_by(UploadBatch.uploaded_at.desc())
        )
    )
    return [b.id for b in batches]


def _hub_keys(row: PaymentHubTransaction) -> set[str]:
    keys: set[str] = set()
    if row.application_id:
        keys.add(row.application_id.strip())
    if row.txn_id:
        keys.add(row.txn_id.strip())
    return {k for k in keys if k}


def _ceir_keys(row: CeirApplication) -> set[str]:
    keys: set[str] = set()
    if row.application_id:
        keys.add(row.application_id.strip())
    if row.request_id:
        keys.add(row.request_id.strip())
    return {k for k in keys if k}


def _is_fraud_status(*texts: str | None) -> bool:
    for text in texts:
        if text and FRAUD_STATUS_RE.search(text):
            return True
    return False


def _month_index(year: int, month: int) -> int:
    return year * 12 + month


def _shift_year_month(year: int, month: int, delta: int) -> tuple[int, int]:
    total = year * 12 + (month - 1) + delta
    return total // 12, total % 12 + 1


def _normalize_range(
    start_year: int,
    start_month: int,
    end_year: int | None = None,
    end_month: int | None = None,
) -> tuple[int, int, int, int]:
    ey = end_year if end_year is not None else start_year
    em = end_month if end_month is not None else start_month
    if _month_index(start_year, start_month) <= _month_index(ey, em):
        return start_year, start_month, ey, em
    return ey, em, start_year, start_month


def _range_label(start_year: int, start_month: int, end_year: int, end_month: int) -> str:
    start = period_label(start_year, start_month)
    end = period_label(end_year, end_month)
    return start if (start_year, start_month) == (end_year, end_month) else f"{start} – {end}"


def _outside_range(
    dt: datetime | None,
    start_year: int,
    start_month: int,
    end_year: int,
    end_month: int,
) -> bool:
    if dt is None:
        return False
    value = _month_index(dt.year, dt.month)
    return value < _month_index(start_year, start_month) or value > _month_index(
        end_year, end_month
    )


def _period_ids_in_range(
    db: Session, start_year: int, start_month: int, end_year: int, end_month: int
) -> list:
    ids: list = []
    y, m = start_year, start_month
    while _month_index(y, m) <= _month_index(end_year, end_month):
        row = db.scalars(
            select(Period).where(Period.year == y, Period.month == m)
        ).first()
        if row:
            ids.append(row.id)
        y, m = _shift_year_month(y, m, 1)
        if len(ids) > 48:
            break
    return ids


def _classify_matched(
    *,
    ceir: CeirApplication,
    hub: PaymentHubTransaction,
    match_key: str,
    hub_raw_counts: dict[str, int],
    start_year: int,
    start_month: int,
    end_year: int,
    end_month: int,
    range_label: str,
) -> MismatchRow | None:
    if _is_fraud_status(ceir.status, hub.api_status, ceir.source_type):
        return MismatchRow(
            application_id=ceir.application_id,
            category="fraud",
            amount_mmk=None,
            ird_status=hub.api_status or "HUB present",
            ceir_status=ceir.status or "CEIR present",
            detail="Fraud / blocked status on CEIR or Payment Hub for a matched RequestID.",
        )

    if hub_raw_counts.get(match_key, 0) > 1:
        return MismatchRow(
            application_id=ceir.application_id,
            category="duplicate",
            amount_mmk=None,
            ird_status=f"{hub_raw_counts[match_key]} HUB rows",
            ceir_status="1 CEIR row",
            detail="Same RequestID maps to multiple Payment Hub transactions before dedupe.",
        )

    # Amount first so overpay is not hidden behind month-boundary.
    ceir_amt = ceir.tax_amount_mmk or Decimal("0")
    hub_amt = hub.tax_amount_mmk or Decimal("0")
    if ceir_amt != hub_amt:
        diff = hub_amt - ceir_amt
        return MismatchRow(
            application_id=ceir.application_id,
            category="overpay" if diff > 0 else "unconfirmed",
            amount_mmk=abs(diff),
            ird_status=f"{hub_amt} MMK",
            ceir_status=f"{ceir_amt} MMK",
            detail=(
                "HUB tax is higher than CEIR."
                if diff > 0
                else "CEIR tax is higher than HUB."
            )
            + " Joined on CEIR RequestID ↔ HUB request_id.",
        )

    if _outside_range(
        hub.payment_dt, start_year, start_month, end_year, end_month
    ) or _outside_range(
        ceir.confirmed_at, start_year, start_month, end_year, end_month
    ):
        hub_dt = hub.payment_dt.isoformat() if hub.payment_dt else "—"
        ceir_dt = ceir.confirmed_at.isoformat() if ceir.confirmed_at else "—"
        return MismatchRow(
            application_id=ceir.application_id,
            category="month_boundary",
            amount_mmk=ceir.tax_amount_mmk or hub.tax_amount_mmk,
            ird_status=f"payment_dt {hub_dt}",
            ceir_status=f"confirmed_at {ceir_dt}",
            detail=f"Date falls outside selected range {range_label}.",
        )

    return None


def run_reconciliation(
    db: Session,
    year: int,
    month: int,
    end_year: int | None = None,
    end_month: int | None = None,
) -> ReconciliationRun:
    """
    Reconcile using an explicit start–end period range chosen by the user.
    Does not auto-expand outside that range.
    """
    start_year, start_month, end_year, end_month = _normalize_range(
        year, month, end_year, end_month
    )
    label = _range_label(start_year, start_month, end_year, end_month)
    anchor = get_or_create_period(db, end_year, end_month)
    period_ids = _period_ids_in_range(
        db, start_year, start_month, end_year, end_month
    )
    if not period_ids:
        existing = latest_run_for_label(db, label)
        if existing:
            return existing
        raise ValueError(f"No stored inventory for range {label}")

    ceir_rows_raw = [
        r
        for r in db.scalars(
            select(CeirApplication).where(CeirApplication.period_id.in_(period_ids))
        )
        if r.application_id and CEIR_APP_RE.match(r.application_id)
    ]
    hub_rows_raw = list(
        db.scalars(
            select(PaymentHubTransaction).where(
                PaymentHubTransaction.period_id.in_(period_ids)
            )
        )
    )

    if not ceir_rows_raw and not hub_rows_raw:
        existing = latest_run_for_label(db, label)
        if existing:
            return existing
        raise ValueError(f"No data found for range {label}")

    hub_raw_counts: dict[str, int] = defaultdict(int)
    for row in hub_rows_raw:
        for key in _hub_keys(row):
            hub_raw_counts[key] += 1

    ceir_unique: dict[str, CeirApplication] = {}
    for row in ceir_rows_raw:
        prev = ceir_unique.get(row.application_id)
        if prev is None or (row.request_id and not prev.request_id):
            ceir_unique[row.application_id] = row
    ceir_rows = list(ceir_unique.values())

    hub_unique: dict[str, PaymentHubTransaction] = {}
    for row in hub_rows_raw:
        key = row.application_id or row.txn_id or str(row.id)
        if key not in hub_unique:
            hub_unique[key] = row
    hub_rows = list(hub_unique.values())

    hub_by_key: dict[str, list[PaymentHubTransaction]] = defaultdict(list)
    for row in hub_rows:
        for key in _hub_keys(row):
            hub_by_key[key].append(row)

    matched_pairs: list[tuple[CeirApplication, PaymentHubTransaction, str]] = []
    unmatched_ceir: list[CeirApplication] = []
    matched_hub_ids: set[str] = set()

    for ceir in ceir_rows:
        partner: PaymentHubTransaction | None = None
        match_key = ""
        ordered_keys = []
        if ceir.request_id:
            ordered_keys.append(ceir.request_id.strip())
        if ceir.application_id:
            ordered_keys.append(ceir.application_id.strip())
        for key in ordered_keys:
            for hub in hub_by_key.get(key, []):
                if str(hub.id) in matched_hub_ids:
                    continue
                partner = hub
                match_key = key
                break
            if partner:
                break
        if partner:
            matched_hub_ids.add(str(partner.id))
            matched_pairs.append((ceir, partner, match_key))
        else:
            unmatched_ceir.append(ceir)

    unmatched_hub = [h for h in hub_rows if str(h.id) not in matched_hub_ids]
    mismatches: list[MismatchRow] = []

    for ceir in unmatched_ceir[:200]:
        if _is_fraud_status(ceir.status, ceir.source_type):
            category = "fraud"
            detail = "Fraud / blocked CEIR row with no matching Payment Hub transaction."
        elif _outside_range(
            ceir.confirmed_at, start_year, start_month, end_year, end_month
        ):
            category = "month_boundary"
            detail = f"CEIR confirmation date outside {label}."
        else:
            category = "unconfirmed"
            detail = "CEIR Application ID / RequestID not found in Payment Hub upload."
        mismatches.append(
            MismatchRow(
                application_id=ceir.application_id,
                category=category,
                amount_mmk=ceir.tax_amount_mmk,
                ird_status="Missing in Payment Hub",
                ceir_status=ceir.status or "Present",
                detail=detail,
            )
        )

    for hub in unmatched_hub[:200]:
        if _is_fraud_status(hub.api_status):
            category = "fraud"
            detail = "Fraud / blocked Payment Hub row with no matching CEIR application."
        elif _outside_range(
            hub.payment_dt, start_year, start_month, end_year, end_month
        ):
            category = "month_boundary"
            detail = f"HUB payment_dt outside {label}."
        else:
            category = "unconfirmed"
            detail = "Payment Hub request_id not found in CEIR upload."
        mismatches.append(
            MismatchRow(
                application_id=hub.application_id or hub.txn_id or "unknown",
                category=category,
                amount_mmk=hub.tax_amount_mmk,
                ird_status=hub.api_status or "Present",
                ceir_status="Missing in CEIR",
                detail=detail,
            )
        )

    for ceir, hub, match_key in matched_pairs:
        row = _classify_matched(
            ceir=ceir,
            hub=hub,
            match_key=match_key,
            hub_raw_counts=hub_raw_counts,
            start_year=start_year,
            start_month=start_month,
            end_year=end_year,
            end_month=end_month,
            range_label=label,
        )
        if row is not None:
            mismatches.append(row)

    ceir_sum = sum((r.tax_amount_mmk or Decimal("0")) for r in ceir_rows)
    hub_sum = sum((r.tax_amount_mmk or Decimal("0")) for r in hub_rows)
    matched_count = len(matched_pairs)
    mismatch_count = len(mismatches)
    sums_equal = ceir_sum == hub_sum

    category_counts: dict[str, int] = defaultdict(int)
    for item in mismatches:
        category_counts[item.category] += 1

    # Replace prior runs for this exact range label so Analysis stays honest.
    clear_runs_for_label(db, label)

    run = ReconciliationRun(
        period_id=anchor.id,
        period_label=label,
        matched_count=matched_count,
        mismatch_count=mismatch_count,
        ird_paid=len(hub_rows),
        ceir_paid=len(ceir_rows),
        adjusted_ird_sum=hub_sum,
        adjusted_ceir_sum=ceir_sum,
        sums_equal=sums_equal,
        mismatches=mismatches,
        summary=[
            SummaryMetric(
                label="Records in reports",
                ird_value=str(len(hub_rows_raw)),
                ceir_value=str(len(ceir_rows_raw)),
                note=f"Range {label} · raw uploaded rows before dedupe",
                sort_order=1,
            ),
            SummaryMetric(
                label="Unique / paid counts",
                ird_value=str(len(hub_rows)),
                ceir_value=str(len(ceir_rows)),
                sort_order=2,
            ),
            SummaryMetric(
                label="Matched pairs (RequestID)",
                ird_value=str(matched_count),
                ceir_value=str(matched_count),
                note="Join: CEIR RequestID ↔ HUB request_id",
                sort_order=3,
            ),
            SummaryMetric(
                label="Exception mix",
                ird_value=str(mismatch_count),
                ceir_value=str(mismatch_count),
                note=(
                    "unconfirmed={u}, fraud={f}, duplicate={d}, "
                    "overpay={o}, month_boundary={m}"
                ).format(
                    u=category_counts.get("unconfirmed", 0),
                    f=category_counts.get("fraud", 0),
                    d=category_counts.get("duplicate", 0),
                    o=category_counts.get("overpay", 0),
                    m=category_counts.get("month_boundary", 0),
                ),
                sort_order=4,
            ),
            SummaryMetric(
                label="Tax sum in records (MMK)",
                ird_value=str(hub_sum),
                ceir_value=str(ceir_sum),
                sort_order=5,
            ),
            SummaryMetric(
                label="Adjusted paid sum (MMK)",
                ird_value=str(hub_sum),
                ceir_value=str(ceir_sum),
                note="Equal" if sums_equal else "Sums differ",
                sort_order=6,
            ),
        ],
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return latest_run_for_label(db, label) or run
