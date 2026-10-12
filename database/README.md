# Database (PostgreSQL via Docker)

## Start

```bash
cd database
docker compose up -d
```

## Stop

```bash
docker compose down
```

## Reset (wipes data)

```bash
docker compose down -v
docker compose up -d
```

On first start, scripts in `init/` run automatically:

- `01_schema.sql` — tables
- `02_seed.sql` — sample April 2026 reconciliation

## Connection

Admin (Docker init / migrations):

| Setting  | Value        |
|----------|--------------|
| Host     | localhost    |
| Port     | 5432         |
| User     | ceir         |
| Password | ceir_secret  |
| Database | ceir_db      |

App role (used by FastAPI — least privilege, no DDL):

| Setting  | Value           |
|----------|-----------------|
| User     | ceir_app        |
| Password | ceir_app_secret |

DSN: `postgresql://ceir_app:ceir_app_secret@localhost:5432/ceir_db`

If the DB volume already existed before `03_security_roles.sql`, apply it once:

```bash
Get-Content init\03_security_roles.sql | docker exec -i ceir-postgres psql -U ceir -d ceir_db
```
