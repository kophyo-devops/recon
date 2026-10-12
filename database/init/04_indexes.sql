-- Performance indexes for common read / reconciliation / export paths.
-- Safe to re-run (IF NOT EXISTS).

-- periods: list by calendar order
CREATE INDEX IF NOT EXISTS idx_periods_year_month
    ON periods (year DESC, month DESC);

-- upload_batches: filter by period/side, recent uploads
CREATE INDEX IF NOT EXISTS idx_upload_batches_period
    ON upload_batches (period_id);

CREATE INDEX IF NOT EXISTS idx_upload_batches_period_side
    ON upload_batches (period_id, side);

CREATE INDEX IF NOT EXISTS idx_upload_batches_uploaded_at
    ON upload_batches (uploaded_at DESC);

-- ceir_applications: reconcile by period + application_id, batch loads, status filters
CREATE INDEX IF NOT EXISTS idx_ceir_batch
    ON ceir_applications (batch_id);

CREATE INDEX IF NOT EXISTS idx_ceir_period_app
    ON ceir_applications (period_id, application_id);

CREATE INDEX IF NOT EXISTS idx_ceir_status
    ON ceir_applications (status);

CREATE INDEX IF NOT EXISTS idx_ceir_confirmed_at
    ON ceir_applications (confirmed_at);

CREATE INDEX IF NOT EXISTS idx_ceir_created_at
    ON ceir_applications (created_at DESC);

-- payment_hub_transactions: join/match, txn lookup, payment date ranges
CREATE INDEX IF NOT EXISTS idx_hub_batch
    ON payment_hub_transactions (batch_id);

CREATE INDEX IF NOT EXISTS idx_hub_period_app
    ON payment_hub_transactions (period_id, application_id);

CREATE INDEX IF NOT EXISTS idx_hub_txn_id
    ON payment_hub_transactions (txn_id);

CREATE INDEX IF NOT EXISTS idx_hub_payment_dt
    ON payment_hub_transactions (payment_dt);

CREATE INDEX IF NOT EXISTS idx_hub_api_status
    ON payment_hub_transactions (api_status);

CREATE INDEX IF NOT EXISTS idx_hub_created_at
    ON payment_hub_transactions (created_at DESC);

-- reconciliation_runs: latest run, filter by period label / period_id
CREATE INDEX IF NOT EXISTS idx_recon_period_label_created
    ON reconciliation_runs (period_label, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recon_period_id_created
    ON reconciliation_runs (period_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recon_created_at
    ON reconciliation_runs (created_at DESC);

-- mismatch_rows: load by run, filter category, search application
CREATE INDEX IF NOT EXISTS idx_mismatch_run_category
    ON mismatch_rows (run_id, category);

CREATE INDEX IF NOT EXISTS idx_mismatch_application_id
    ON mismatch_rows (application_id);

-- summary_metrics: ordered metrics per run
CREATE INDEX IF NOT EXISTS idx_summary_run_sort
    ON summary_metrics (run_id, sort_order);
