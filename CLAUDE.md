# ZIP Flow

Restaurant POS/back-office platform. Multi-tenant.

- **Backend:** `backend/ZipFlow.Api` — ASP.NET Core 8 (C#), EF Core, Postgres (schema `pos`/`iam`/`organization`).
- **Frontend:** `frontend/src` — React + TypeScript + Vite.
- **Docs:** `docs/` — architecture, POS flow, acceptance checklists. `docs/POS_FLOW.md` is the source of truth for POS screen behavior; keep it in sync with the code.

## Running locally

Full instructions: [`docs/LOCAL_DEV_SETUP.md`](docs/LOCAL_DEV_SETUP.md).

Quick start:

```bash
docker compose up -d                      # Postgres on localhost:5432
cd backend/ZipFlow.Api && dotnet run      # API on localhost:5080, auto-migrates on startup
cd frontend && npm install && npm run dev # UI on localhost:5173
```

Dev login (seeded by `BootstrapAdmin` in `appsettings.Development.json`):
`admin@zipflow.local` / `ChangeMe123!`.

The root `README.md` predates the Postgres migration and still references
SQL Server — `docs/LOCAL_DEV_SETUP.md` is current, `README.md` is not.
