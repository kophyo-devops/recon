# CEIR Reconciliation

Frontend (Next.js), backend (FastAPI), and PostgreSQL — runnable with Docker.

## Quick start (Linux deploy server)

One script installs Docker (if needed), builds images (Python + Next.js packages), and runs frontend + backend + database:

```bash
chmod +x start-all.sh
./start-all.sh
```

Stop / reset:

```bash
./start-all.sh stop
./start-all.sh reset
```

## Quick start (Docker manual)

```bash
docker compose up -d --build
```

| Service  | URL |
|----------|-----|
| Frontend | http://localhost:3000 |
| Backend  | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| Postgres | localhost:5432 |

Default login: `admin` / `admin123`

Stop:

```bash
docker compose down
```

Reset DB (wipes volume):

```bash
docker compose down -v
docker compose up -d --build
```

## Local machine resources

`docker-compose.yml` uses modest CPU/memory limits suited to a developer PC.
For production, raise `deploy.resources` (and secrets) as you like.

Optional: copy `.env.example` → `.env` to override ports, passwords, JWT, etc.

## Without full Docker stack

- DB only: `cd database && docker compose up -d`
- Hybrid (DB Docker + local Python/Node): `.\start-project.ps1`

## Repo layout

```
frontend/   Next.js UI
backend/    FastAPI API
database/   Postgres init SQL (+ standalone compose)
```
