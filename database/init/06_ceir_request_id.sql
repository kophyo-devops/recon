ALTER TABLE ceir_applications
    ADD COLUMN IF NOT EXISTS request_id VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_ceir_request_id
    ON ceir_applications (request_id);
