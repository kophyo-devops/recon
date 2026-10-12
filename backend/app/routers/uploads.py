from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.reconciliation import (
    CeirApplication,
    PaymentHubTransaction,
    Period,
    UploadBatch,
)
from app.security.auth import CurrentUser, get_current_user
from app.services.file_parser import ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, parse_upload
from app.services.periods import parse_period_input, period_key, period_label
from app.services.reconcile import (
    clear_runs_for_label,
    get_or_create_period,
    replace_side_batches,
)
from app.services.upload_storage import (
    delete_stored_upload,
    find_stored_file,
    media_type_for_name,
    rebuild_xlsx_bytes,
    store_upload_bytes,
)

router = APIRouter(
    prefix="/api",
    tags=["uploads"],
    dependencies=[Depends(get_current_user)],
)


class UploadResultOut(BaseModel):
    batchId: str
    side: Literal["ceir", "payplus"]
    fileName: str
    fileSize: int
    rowCount: int
    periodLabel: str
    periodKey: str


class BatchSummaryOut(BaseModel):
    batchId: str
    side: Literal["ceir", "payplus"]
    fileName: str
    fileSize: int
    rowCount: int
    uploadedAt: str
    uploadedBy: str | None = None


class UploadBatchGridItemOut(BaseModel):
    batchId: str
    periodKey: str
    periodLabel: str
    side: Literal["ceir", "payplus"]
    fileName: str
    fileSize: int
    rowCount: int
    uploadedAt: str
    uploadedBy: str | None


class UploadBatchesPageOut(BaseModel):
    periodKey: str | None
    periodLabel: str | None
    total: int
    page: int
    pageSize: int
    items: list[UploadBatchGridItemOut]


class SideSummaryOut(BaseModel):
    batchCount: int
    rowCount: int
    batches: list[BatchSummaryOut]


class UploadPeriodSummaryOut(BaseModel):
    periodKey: str
    periodLabel: str
    year: int
    month: int
    sides: dict[str, SideSummaryOut]


class DeleteUploadsOut(BaseModel):
    periodKey: str
    periodLabel: str
    deletedBatches: int
    deletedCeirRows: int
    deletedHubRows: int
    clearedRuns: int
    sides: list[str]


class UploadRowOut(BaseModel):
    id: str
    batchId: str | None
    side: Literal["ceir", "payplus"]
    applicationId: str | None
    requestId: str | None
    txnId: str | None
    status: str | None
    taxAmountMmk: float | None
    sourceType: str | None
    paymentDt: str | None
    confirmedAt: str | None


class UploadRowsPageOut(BaseModel):
    periodKey: str
    periodLabel: str
    side: Literal["ceir", "payplus"]
    total: int
    page: int
    pageSize: int
    items: list[UploadRowOut]


def _parse_period(period: str) -> tuple[int, int, str, str]:
    try:
        year, month = parse_period_input(period)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    label = period_label(year, month)
    key = period_key(year, month)
    return year, month, label, key


def _resolve_period(db: Session, period: str) -> Period:
    _year, _month, label, _key = _parse_period(period)
    row = db.scalars(select(Period).where(Period.label == label)).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"No period found for {label}")
    return row


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid datetime: {value}",
        ) from exc
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _batch_out(batch: UploadBatch) -> BatchSummaryOut:
    return BatchSummaryOut(
        batchId=str(batch.id),
        side=batch.side,  # type: ignore[arg-type]
        fileName=batch.file_name,
        fileSize=batch.file_size or 0,
        rowCount=batch.row_count or 0,
        uploadedAt=batch.uploaded_at.isoformat() if batch.uploaded_at else "",
        uploadedBy=batch.uploaded_by,
    )


@router.post("/uploads", response_model=UploadResultOut)
async def upload_report(
    user: CurrentUser,
    db: Session = Depends(get_db),
    side: Literal["ceir", "payplus"] = Form(...),
    period: str = Form(..., description="YYYY-MM or April 2026"),
    file: UploadFile = File(...),
) -> UploadResultOut:
    filename = file.filename or "upload.bin"
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .csv, .xlsx, or .xls files are allowed",
        )

    try:
        year, month = parse_period_input(period)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 25 MB limit")

    try:
        rows = parse_upload(filename, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unable to parse uploaded Excel/CSV. "
                "Re-save the file as .xlsx or export as CSV and try again."
            ),
        ) from exc

    if not rows:
        raise HTTPException(
            status_code=400,
            detail=(
                "No data rows found. Check that the file has an "
                "'Application ID' or 'request_id' column."
            ),
        )

    period_row = get_or_create_period(db, year, month)

    # PayPlus is usually one file — replace prior hub data for this period.
    # CEIR allows multiple files (Auction / Legal…) so we append + dedupe on compare.
    if side == "payplus":
        replace_side_batches(db, period_id=period_row.id, side=side)

    batch = UploadBatch(
        period_id=period_row.id,
        side=side,
        file_name=filename[:512],
        file_size=len(data),
        row_count=len(rows),
        uploaded_by=user.username[:64],
    )
    db.add(batch)
    db.flush()

    if side == "ceir":
        db.add_all(
            [
                CeirApplication(
                    batch_id=batch.id,
                    period_id=period_row.id,
                    application_id=row["application_id"],
                    request_id=row.get("request_id"),
                    status=row.get("status"),
                    tax_amount_mmk=row.get("tax_amount_mmk"),
                    confirmed_at=row.get("confirmed_at"),
                    source_type=row.get("source_type"),
                )
                for row in rows
            ]
        )
    else:
        db.add_all(
            [
                PaymentHubTransaction(
                    batch_id=batch.id,
                    period_id=period_row.id,
                    application_id=row.get("request_id") or row.get("application_id"),
                    txn_id=row.get("txn_id"),
                    payment_dt=row.get("payment_dt"),
                    tax_amount_mmk=row.get("tax_amount_mmk"),
                    api_status=row.get("status"),
                )
                for row in rows
            ]
        )

    db.commit()
    db.refresh(batch)

    # Keep original bytes so Inventory "Download" returns the same Excel/CSV.
    store_upload_bytes(batch.id, batch.file_name, data)

    return UploadResultOut(
        batchId=str(batch.id),
        side=side,
        fileName=batch.file_name,
        fileSize=batch.file_size or 0,
        rowCount=batch.row_count,
        periodLabel=period_row.label,
        periodKey=period_key(period_row.year, period_row.month),
    )


def _rebuild_batch_file(db: Session, batch: UploadBatch) -> tuple[bytes, str]:
    """Fallback when original bytes were not stored (legacy uploads)."""
    download_name = batch.file_name or "export.xlsx"
    if not download_name.lower().endswith((".xlsx", ".xls", ".csv")):
        download_name = f"{download_name}.xlsx"

    if batch.side == "ceir":
        rows = list(
            db.scalars(
                select(CeirApplication).where(CeirApplication.batch_id == batch.id)
            )
        )
        headers = [
            "Application ID",
            "Request ID",
            "Status",
            "Tax Amount MMK",
            "Confirmed At",
            "Source Type",
        ]
        data_rows = [
            [
                row.application_id,
                row.request_id,
                row.status,
                float(row.tax_amount_mmk) if row.tax_amount_mmk is not None else None,
                row.confirmed_at.isoformat() if row.confirmed_at else None,
                row.source_type,
            ]
            for row in rows
        ]
    else:
        rows = list(
            db.scalars(
                select(PaymentHubTransaction).where(
                    PaymentHubTransaction.batch_id == batch.id
                )
            )
        )
        headers = [
            "Application ID",
            "Txn ID",
            "Payment DT",
            "Tax Amount MMK",
            "API Status",
        ]
        data_rows = [
            [
                row.application_id,
                row.txn_id,
                row.payment_dt.isoformat() if row.payment_dt else None,
                float(row.tax_amount_mmk) if row.tax_amount_mmk is not None else None,
                row.api_status,
            ]
            for row in rows
        ]

    if download_name.lower().endswith(".csv"):
        import csv
        import io

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(headers)
        writer.writerows(data_rows)
        return buffer.getvalue().encode("utf-8-sig"), download_name

    if not download_name.lower().endswith(".xlsx"):
        download_name = Path(download_name).stem + ".xlsx"
    return rebuild_xlsx_bytes(download_name, headers, data_rows), download_name


@router.get("/uploads/batches/{batch_id}/download")
def download_upload_batch(
    batch_id: UUID,
    db: Session = Depends(get_db),
) -> Response:
    batch = db.scalars(
        select(UploadBatch).where(UploadBatch.id == batch_id)
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Upload batch not found")

    stored = find_stored_file(batch.id, batch.file_name)
    if stored is not None:
        return FileResponse(
            path=stored,
            media_type=media_type_for_name(batch.file_name),
            filename=batch.file_name,
        )

    content, download_name = _rebuild_batch_file(db, batch)
    return Response(
        content=content,
        media_type=media_type_for_name(download_name),
        headers={
            "Content-Disposition": f'attachment; filename="{download_name}"',
        },
    )


@router.get("/uploads/batches", response_model=UploadBatchesPageOut)
def list_upload_batches(
    period: str | None = Query(None, description="YYYY-MM or April 2026"),
    uploadedFrom: str | None = Query(None, description="ISO datetime (inclusive)"),
    uploadedTo: str | None = Query(None, description="ISO datetime (inclusive)"),
    side: Literal["ceir", "payplus"] | None = Query(None),
    q: str | None = Query(None, max_length=128),
    sort: Literal["uploadedAt", "period"] = Query("uploadedAt"),
    sortDir: Literal["asc", "desc"] = Query("desc"),
    page: int = Query(1, ge=1),
    pageSize: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
) -> UploadBatchesPageOut:
    from_dt = _parse_iso_datetime(uploadedFrom)
    to_dt = _parse_iso_datetime(uploadedTo)

    page_period_key: str | None = None
    page_period_label: str | None = None

    base = select(UploadBatch)
    count_stmt = select(func.count()).select_from(UploadBatch)

    if period:
        _year, _month, label, key = _parse_period(period)
        page_period_key = key
        page_period_label = label
        period_row = db.scalars(select(Period).where(Period.label == label)).first()
        if not period_row:
            return UploadBatchesPageOut(
                periodKey=key,
                periodLabel=label,
                total=0,
                page=page,
                pageSize=pageSize,
                items=[],
            )
        base = base.where(UploadBatch.period_id == period_row.id)
        count_stmt = count_stmt.where(UploadBatch.period_id == period_row.id)

    if from_dt:
        base = base.where(UploadBatch.uploaded_at >= from_dt)
        count_stmt = count_stmt.where(UploadBatch.uploaded_at >= from_dt)
    if to_dt:
        base = base.where(UploadBatch.uploaded_at <= to_dt)
        count_stmt = count_stmt.where(UploadBatch.uploaded_at <= to_dt)

    if side:
        base = base.where(UploadBatch.side == side)
        count_stmt = count_stmt.where(UploadBatch.side == side)
    if q and q.strip():
        like = f"%{q.strip()}%"
        name_filter = UploadBatch.file_name.ilike(like)
        base = base.where(name_filter)
        count_stmt = count_stmt.where(name_filter)

    total = int(db.scalar(count_stmt) or 0)
    offset = (page - 1) * pageSize

    if sort == "period":
        ordered = (
            base.outerjoin(Period, UploadBatch.period_id == Period.id)
            .order_by(
                Period.year.asc() if sortDir == "asc" else Period.year.desc(),
                Period.month.asc() if sortDir == "asc" else Period.month.desc(),
                UploadBatch.uploaded_at.desc(),
            )
        )
    else:
        ordered = base.order_by(
            UploadBatch.uploaded_at.asc()
            if sortDir == "asc"
            else UploadBatch.uploaded_at.desc()
        )

    batches = list(
        db.scalars(ordered.offset(offset).limit(pageSize))
    )

    period_ids = {b.period_id for b in batches if b.period_id}
    period_map: dict = {}
    if period_ids:
        rows = list(db.scalars(select(Period).where(Period.id.in_(period_ids))))
        period_map = {row.id: row for row in rows}

    items: list[UploadBatchGridItemOut] = []
    for batch in batches:
        period_row = period_map.get(batch.period_id) if batch.period_id else None
        if period_row:
            batch_key = period_key(period_row.year, period_row.month)
            batch_label = period_row.label
        else:
            batch_key = "unknown"
            batch_label = "Unknown"
        items.append(
            UploadBatchGridItemOut(
                batchId=str(batch.id),
                periodKey=batch_key,
                periodLabel=batch_label,
                side=batch.side,  # type: ignore[arg-type]
                fileName=batch.file_name,
                fileSize=batch.file_size or 0,
                rowCount=batch.row_count or 0,
                uploadedAt=batch.uploaded_at.isoformat() if batch.uploaded_at else "",
                uploadedBy=batch.uploaded_by,
            )
        )

    return UploadBatchesPageOut(
        periodKey=page_period_key,
        periodLabel=page_period_label,
        total=total,
        page=page,
        pageSize=pageSize,
        items=items,
    )


@router.get("/uploads/summary", response_model=UploadPeriodSummaryOut)
def upload_summary(
    period: str = Query(..., description="YYYY-MM or April 2026"),
    db: Session = Depends(get_db),
) -> UploadPeriodSummaryOut:
    period_row = _resolve_period(db, period)
    batches = list(
        db.scalars(
            select(UploadBatch)
            .where(UploadBatch.period_id == period_row.id)
            .order_by(UploadBatch.uploaded_at.desc())
        )
    )

    sides: dict[str, SideSummaryOut] = {
        "ceir": SideSummaryOut(batchCount=0, rowCount=0, batches=[]),
        "payplus": SideSummaryOut(batchCount=0, rowCount=0, batches=[]),
    }
    for batch in batches:
        side_key = batch.side if batch.side in sides else None
        if not side_key:
            continue
        current = sides[side_key]
        current.batches.append(_batch_out(batch))
        current.batchCount += 1
        current.rowCount += batch.row_count or 0

    return UploadPeriodSummaryOut(
        periodKey=period_key(period_row.year, period_row.month),
        periodLabel=period_row.label,
        year=period_row.year,
        month=period_row.month,
        sides=sides,
    )


@router.get("/uploads/rows", response_model=UploadRowsPageOut)
def upload_rows(
    period: str = Query(..., description="YYYY-MM or April 2026"),
    side: Literal["ceir", "payplus"] = Query(...),
    page: int = Query(1, ge=1),
    pageSize: int = Query(50, ge=1, le=200),
    q: str | None = Query(None, max_length=128),
    db: Session = Depends(get_db),
) -> UploadRowsPageOut:
    period_row = _resolve_period(db, period)
    needle = (q or "").strip()
    offset = (page - 1) * pageSize

    if side == "ceir":
        base = select(CeirApplication).where(
            CeirApplication.period_id == period_row.id
        )
        count_stmt = select(func.count()).select_from(CeirApplication).where(
            CeirApplication.period_id == period_row.id
        )
        if needle:
            like = f"%{needle}%"
            filt = or_(
                CeirApplication.application_id.ilike(like),
                CeirApplication.request_id.ilike(like),
                CeirApplication.status.ilike(like),
            )
            base = base.where(filt)
            count_stmt = count_stmt.where(filt)
        total = int(db.scalar(count_stmt) or 0)
        rows = list(
            db.scalars(
                base.order_by(CeirApplication.created_at.desc())
                .offset(offset)
                .limit(pageSize)
            )
        )
        items = [
            UploadRowOut(
                id=str(row.id),
                batchId=str(row.batch_id) if row.batch_id else None,
                side="ceir",
                applicationId=row.application_id,
                requestId=row.request_id,
                txnId=None,
                status=row.status,
                taxAmountMmk=float(row.tax_amount_mmk)
                if row.tax_amount_mmk is not None
                else None,
                sourceType=row.source_type,
                paymentDt=None,
                confirmedAt=row.confirmed_at.isoformat() if row.confirmed_at else None,
            )
            for row in rows
        ]
    else:
        base = select(PaymentHubTransaction).where(
            PaymentHubTransaction.period_id == period_row.id
        )
        count_stmt = (
            select(func.count())
            .select_from(PaymentHubTransaction)
            .where(PaymentHubTransaction.period_id == period_row.id)
        )
        if needle:
            like = f"%{needle}%"
            filt = or_(
                PaymentHubTransaction.application_id.ilike(like),
                PaymentHubTransaction.txn_id.ilike(like),
                PaymentHubTransaction.api_status.ilike(like),
            )
            base = base.where(filt)
            count_stmt = count_stmt.where(filt)
        total = int(db.scalar(count_stmt) or 0)
        rows = list(
            db.scalars(
                base.order_by(PaymentHubTransaction.created_at.desc())
                .offset(offset)
                .limit(pageSize)
            )
        )
        items = [
            UploadRowOut(
                id=str(row.id),
                batchId=str(row.batch_id) if row.batch_id else None,
                side="payplus",
                applicationId=row.application_id,
                requestId=row.application_id,
                txnId=row.txn_id,
                status=row.api_status,
                taxAmountMmk=float(row.tax_amount_mmk)
                if row.tax_amount_mmk is not None
                else None,
                sourceType=None,
                paymentDt=row.payment_dt.isoformat() if row.payment_dt else None,
                confirmedAt=None,
            )
            for row in rows
        ]

    return UploadRowsPageOut(
        periodKey=period_key(period_row.year, period_row.month),
        periodLabel=period_row.label,
        side=side,
        total=total,
        page=page,
        pageSize=pageSize,
        items=items,
    )


@router.delete("/uploads", response_model=DeleteUploadsOut)
def delete_uploads(
    period: str = Query(..., description="YYYY-MM or April 2026"),
    side: Literal["ceir", "payplus"] | None = Query(None),
    clearRuns: bool = Query(
        True,
        description="Also delete reconciliation runs for this period",
    ),
    db: Session = Depends(get_db),
) -> DeleteUploadsOut:
    period_row = _resolve_period(db, period)
    stmt = select(UploadBatch).where(UploadBatch.period_id == period_row.id)
    if side:
        stmt = stmt.where(UploadBatch.side == side)
    batches = list(db.scalars(stmt))
    if not batches:
        raise HTTPException(
            status_code=404,
            detail="No uploaded batches found for this period"
            + (f" / {side}" if side else ""),
        )

    deleted_ceir = 0
    deleted_hub = 0
    sides_hit: set[str] = set()
    for batch in batches:
        sides_hit.add(batch.side)
        if batch.side == "ceir":
            deleted_ceir += batch.row_count or 0
        else:
            deleted_hub += batch.row_count or 0
        delete_stored_upload(batch.id)
        db.delete(batch)

    cleared = 0
    if clearRuns and (side is None or len(sides_hit) >= 1):
        # Clear runs when deleting any upload for the period so Analysis stays honest.
        cleared = clear_runs_for_label(db, period_row.label)

    db.commit()
    return DeleteUploadsOut(
        periodKey=period_key(period_row.year, period_row.month),
        periodLabel=period_row.label,
        deletedBatches=len(batches),
        deletedCeirRows=deleted_ceir,
        deletedHubRows=deleted_hub,
        clearedRuns=cleared,
        sides=sorted(sides_hit),
    )


@router.delete("/uploads/batches/{batch_id}", response_model=DeleteUploadsOut)
def delete_upload_batch(
    batch_id: UUID,
    clearRuns: bool = Query(True),
    db: Session = Depends(get_db),
) -> DeleteUploadsOut:
    batch = db.scalars(
        select(UploadBatch).where(UploadBatch.id == batch_id)
    ).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Upload batch not found")

    period_row = None
    if batch.period_id:
        period_row = db.scalars(
            select(Period).where(Period.id == batch.period_id)
        ).first()

    deleted_ceir = batch.row_count or 0 if batch.side == "ceir" else 0
    deleted_hub = batch.row_count or 0 if batch.side == "payplus" else 0
    side = batch.side
    delete_stored_upload(batch.id)
    db.delete(batch)

    cleared = 0
    label = period_row.label if period_row else ""
    key = (
        period_key(period_row.year, period_row.month)
        if period_row
        else "unknown"
    )
    if clearRuns and period_row:
        cleared = clear_runs_for_label(db, period_row.label)

    db.commit()
    return DeleteUploadsOut(
        periodKey=key,
        periodLabel=label or "Unknown",
        deletedBatches=1,
        deletedCeirRows=deleted_ceir,
        deletedHubRows=deleted_hub,
        clearedRuns=cleared,
        sides=[side],
    )
