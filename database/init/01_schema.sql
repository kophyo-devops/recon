-- CEIR / Payment Hub reconciliation schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS periods (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label       VARCHAR(64) NOT NULL UNIQUE,
    year        INT NOT NULL,
    month       INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_periods_year_month
    ON periods (year DESC, month DESC);

CREATE TABLE IF NOT EXISTS upload_batches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id   UUID REFERENCES periods(id) ON DELETE SET NULL,
    side        VARCHAR(16) NOT NULL CHECK (side IN ('ceir', 'payplus')),
    file_name   VARCHAR(512) NOT NULL,
    file_size   BIGINT,
    row_count   INT DEFAULT 0,
    uploaded_by VARCHAR(64),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_batches_period
    ON upload_batches (period_id);
CREATE INDEX IF NOT EXISTS idx_upload_batches_period_side
    ON upload_batches (period_id, side);
CREATE INDEX IF NOT EXISTS idx_upload_batches_uploaded_at
    ON upload_batches (uploaded_at DESC);

CREATE TABLE IF NOT EXISTS ceir_applications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID REFERENCES upload_batches(id) ON DELETE CASCADE,
    period_id       UUID REFERENCES periods(id) ON DELETE SET NULL,
    application_id  VARCHAR(128) NOT NULL,
    request_id      VARCHAR(128),
    status          VARCHAR(128),
    tax_amount_mmk  NUMERIC(18, 2),
    confirmed_at    TIMESTAMPTZ,
    source_type     VARCHAR(128),
    raw_payload     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ceir_app_id ON ceir_applications (application_id);
CREATE INDEX IF NOT EXISTS idx_ceir_request_id ON ceir_applications (request_id);
CREATE INDEX IF NOT EXISTS idx_ceir_period ON ceir_applications (period_id);
CREATE INDEX IF NOT EXISTS idx_ceir_batch ON ceir_applications (batch_id);
CREATE INDEX IF NOT EXISTS idx_ceir_period_app ON ceir_applications (period_id, application_id);
CREATE INDEX IF NOT EXISTS idx_ceir_status ON ceir_applications (status);
CREATE INDEX IF NOT EXISTS idx_ceir_confirmed_at ON ceir_applications (confirmed_at);
CREATE INDEX IF NOT EXISTS idx_ceir_created_at ON ceir_applications (created_at DESC);

CREATE TABLE IF NOT EXISTS payment_hub_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID REFERENCES upload_batches(id) ON DELETE CASCADE,
    period_id       UUID REFERENCES periods(id) ON DELETE SET NULL,
    application_id  VARCHAR(128),
    txn_id          VARCHAR(128),
    payment_dt      TIMESTAMPTZ,
    tax_amount_mmk  NUMERIC(18, 2),
    api_status      VARCHAR(256),
    raw_payload     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_app_id ON payment_hub_transactions (application_id);
CREATE INDEX IF NOT EXISTS idx_hub_period ON payment_hub_transactions (period_id);
CREATE INDEX IF NOT EXISTS idx_hub_batch ON payment_hub_transactions (batch_id);
CREATE INDEX IF NOT EXISTS idx_hub_period_app ON payment_hub_transactions (period_id, application_id);
CREATE INDEX IF NOT EXISTS idx_hub_txn_id ON payment_hub_transactions (txn_id);
CREATE INDEX IF NOT EXISTS idx_hub_payment_dt ON payment_hub_transactions (payment_dt);
CREATE INDEX IF NOT EXISTS idx_hub_api_status ON payment_hub_transactions (api_status);
CREATE INDEX IF NOT EXISTS idx_hub_created_at ON payment_hub_transactions (created_at DESC);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id           UUID REFERENCES periods(id) ON DELETE SET NULL,
    period_label        VARCHAR(64) NOT NULL,
    matched_count       INT NOT NULL DEFAULT 0,
    mismatch_count      INT NOT NULL DEFAULT 0,
    ird_paid            INT NOT NULL DEFAULT 0,
    ceir_paid           INT NOT NULL DEFAULT 0,
    adjusted_ird_sum    NUMERIC(18, 2) NOT NULL DEFAULT 0,
    adjusted_ceir_sum   NUMERIC(18, 2) NOT NULL DEFAULT 0,
    sums_equal          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recon_period_label_created
    ON reconciliation_runs (period_label, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recon_period_id_created
    ON reconciliation_runs (period_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recon_created_at
    ON reconciliation_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS mismatch_rows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
    application_id  VARCHAR(128) NOT NULL,
    category        VARCHAR(32) NOT NULL CHECK (
        category IN ('unconfirmed', 'fraud', 'duplicate', 'overpay', 'month_boundary')
    ),
    amount_mmk      NUMERIC(18, 2),
    ird_status      VARCHAR(256),
    ceir_status     VARCHAR(256),
    detail          TEXT
);

CREATE INDEX IF NOT EXISTS idx_mismatch_run ON mismatch_rows (run_id);
CREATE INDEX IF NOT EXISTS idx_mismatch_category ON mismatch_rows (category);
CREATE INDEX IF NOT EXISTS idx_mismatch_run_category ON mismatch_rows (run_id, category);
CREATE INDEX IF NOT EXISTS idx_mismatch_application_id ON mismatch_rows (application_id);

CREATE TABLE IF NOT EXISTS summary_metrics (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id      UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
    label       VARCHAR(256) NOT NULL,
    ird_value   VARCHAR(128),
    ceir_value  VARCHAR(128),
    note        TEXT,
    sort_order  INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_summary_run_sort
    ON summary_metrics (run_id, sort_order);
