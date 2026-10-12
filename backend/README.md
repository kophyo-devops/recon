# CEIR Backend (Python / FastAPI)

## Prerequisites

- Python 3.11+
- Docker Desktop (for PostgreSQL)

## 1. Start database

```bash
cd database
docker compose up -d
```

PostgreSQL: `localhost:5432`  
User / password / DB: `ceir` / `ceir_secret` / `ceir_db`

## 2. Run API

```bash
cd backend
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | API + DB health |
| POST | `/api/auth/login` | Sets httpOnly Secure JWT cookies |
| POST | `/api/auth/logout` | Clears auth cookies |
| GET | `/api/auth/me` | Current user (cookie session) |
| POST | `/api/auth/refresh` | Rotate access/refresh cookies |
| GET | `/api/periods` | List periods (`value` = YYYY-MM) |
| POST | `/api/uploads` | Upload Excel/CSV → parse rows into DB |
| POST | `/api/reconciliation/run` | Run compare for a period |
| GET | `/api/reconciliation/latest` | Latest reconciliation (optional `?period=`) |
| GET | `/api/reconciliation/{run_id}` | Run by id |
| GET | `/docs` | Swagger UI |

Auth cookies: `ceir_access_token`, `ceir_refresh_token` — **HttpOnly + Secure + SameSite**. Tokens are never returned in JSON for storage.

## Config

Copy `.env.example` to `.env` if needed. Default DSN (least-privilege app role):

```
DATABASE_URL=postgresql+psycopg://ceir_app:ceir_app_secret@localhost:5432/ceir_db
```

## Security (built-in)

- SQLAlchemy ORM + bound parameters (no string-concatenated SQL)
- Strict query validation (`period` pattern / max length, UUID path params)
- Least-privilege DB role `ceir_app` (no CREATE/DROP)
- Statement timeout + stacked-SQL guard
- Security headers, trusted hosts, CORS allowlist, rate limiting
- DB errors never returned raw to clients
