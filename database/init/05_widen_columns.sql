-- Widen columns for real CEIR / Payment Hub export values.

ALTER TABLE payment_hub_transactions
    ALTER COLUMN application_id TYPE VARCHAR(128),
    ALTER COLUMN api_status TYPE VARCHAR(256);

ALTER TABLE ceir_applications
    ALTER COLUMN application_id TYPE VARCHAR(128),
    ALTER COLUMN status TYPE VARCHAR(128),
    ALTER COLUMN source_type TYPE VARCHAR(128);
