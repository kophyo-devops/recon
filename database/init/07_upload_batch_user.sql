-- Track who uploaded each inventory batch

ALTER TABLE upload_batches
    ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_upload_batches_uploaded_by
    ON upload_batches (uploaded_by);
