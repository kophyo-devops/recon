import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Period(Base):
    __tablename__ = "periods"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    label: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class UploadBatch(Base):
    __tablename__ = "upload_batches"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    period_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("periods.id", ondelete="SET NULL")
    )
    side: Mapped[str] = mapped_column(String(16), nullable=False)
    file_name: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size: Mapped[int | None] = mapped_column(Integer)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by: Mapped[str | None] = mapped_column(String(64))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CeirApplication(Base):
    __tablename__ = "ceir_applications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("upload_batches.id", ondelete="CASCADE")
    )
    period_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("periods.id", ondelete="SET NULL")
    )
    application_id: Mapped[str] = mapped_column(String(128), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[str | None] = mapped_column(String(128))
    tax_amount_mmk: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_type: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PaymentHubTransaction(Base):
    __tablename__ = "payment_hub_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("upload_batches.id", ondelete="CASCADE")
    )
    period_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("periods.id", ondelete="SET NULL")
    )
    application_id: Mapped[str | None] = mapped_column(String(128))
    txn_id: Mapped[str | None] = mapped_column(String(128))
    payment_dt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tax_amount_mmk: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    api_status: Mapped[str | None] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ReconciliationRun(Base):
    __tablename__ = "reconciliation_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    period_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("periods.id", ondelete="SET NULL")
    )
    period_label: Mapped[str] = mapped_column(String(64), nullable=False)
    matched_count: Mapped[int] = mapped_column(Integer, default=0)
    mismatch_count: Mapped[int] = mapped_column(Integer, default=0)
    ird_paid: Mapped[int] = mapped_column(Integer, default=0)
    ceir_paid: Mapped[int] = mapped_column(Integer, default=0)
    adjusted_ird_sum: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    adjusted_ceir_sum: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    sums_equal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    mismatches: Mapped[list["MismatchRow"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )
    summary: Mapped[list["SummaryMetric"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


class MismatchRow(Base):
    __tablename__ = "mismatch_rows"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reconciliation_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    application_id: Mapped[str] = mapped_column(String(128), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    amount_mmk: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    ird_status: Mapped[str | None] = mapped_column(String(256))
    ceir_status: Mapped[str | None] = mapped_column(String(256))
    detail: Mapped[str | None] = mapped_column(Text)

    run: Mapped["ReconciliationRun"] = relationship(back_populates="mismatches")


class SummaryMetric(Base):
    __tablename__ = "summary_metrics"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reconciliation_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(256), nullable=False)
    ird_value: Mapped[str | None] = mapped_column(String(128))
    ceir_value: Mapped[str | None] = mapped_column(String(128))
    note: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    run: Mapped["ReconciliationRun"] = relationship(back_populates="summary")
