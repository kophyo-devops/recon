-- Least-privilege application role (no DDL / no superuser).
-- Used by the FastAPI backend for day-to-day queries.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ceir_app') THEN
        CREATE ROLE ceir_app LOGIN PASSWORD 'ceir_app_secret';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE ceir_db TO ceir_app;
GRANT USAGE ON SCHEMA public TO ceir_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ceir_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ceir_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ceir_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO ceir_app;

-- App role must not create/drop objects.
REVOKE CREATE ON SCHEMA public FROM ceir_app;
