# Running ZIP Flow locally

**Scope:** how to get Postgres, the backend API, and the frontend running on your
machine for development. Supersedes the SQL Server instructions in the root
`README.md`, which predate the move to Postgres and are out of date.

## Stack

| Piece | Tech | Path |
|---|---|---|
| Database | PostgreSQL 16 | `docker-compose.yml` (service `postgres`) |
| Backend API | ASP.NET Core 8 (C#), EF Core, schema `pos`/`iam`/`organization` | `backend/ZipFlow.Api` |
| Frontend | React + TypeScript + Vite | `frontend` |

## Prerequisites

- Docker (for Postgres, and optionally for building the API image)
- .NET 8 SDK — only needed if running the API with `dotnet run` instead of Docker
- Node.js 18+ and npm

## 1. Start Postgres

From the repo root:

```bash
cp .env.example .env   # optional — defaults already match appsettings.Development.json
docker compose up -d
```

This starts `zipflow-postgres` on `localhost:5432` with database `ZipFlow`,
user `zipflow`. Data persists in the `zipflow_pg_data` volume across restarts.

## 2. Run the backend

The API applies EF Core migrations automatically on startup
(`db.Database.MigrateAsync()` in `Program.cs`) — no separate `dotnet ef
database update` step is needed.

### Option A — `dotnet run` (requires the .NET 8 SDK)

```bash
cd backend/ZipFlow.Api
dotnet restore
dotnet run
```

`launchSettings.json` sets `ASPNETCORE_ENVIRONMENT=Development`, which
`appsettings.Development.json` uses to point at the local Postgres above and
to enable `BootstrapAdmin` — on first run this seeds a demo tenant, location,
roles/permissions, and an admin user (see credentials below).

### Option B — Docker, no SDK required

```bash
cd backend/ZipFlow.Api
docker build -t zipflow-api .
docker run -d --name zipflow-api \
  --add-host=host.docker.internal:host-gateway \
  -e ASPNETCORE_ENVIRONMENT=Development \
  -e ConnectionStrings__DefaultConnection="Host=host.docker.internal;Port=5432;Database=ZipFlow;Username=zipflow;Password=ChangeThisLocalPassword!1" \
  -p 5080:8080 \
  zipflow-api
```

(`Password` must match `POSTGRES_PASSWORD` if you changed it in `.env`.)

### Dev URLs

- API: `http://localhost:5080`
- Swagger: `http://localhost:5080/swagger`
- Health: `http://localhost:5080/health`

### Dev credentials (seeded by `BootstrapAdmin`)

```text
Email: admin@zipflow.local
Password: ChangeMe123!
```

Change these (`appsettings.Development.json` → `BootstrapAdmin`) before any
non-local use, and never enable `BootstrapAdmin` outside Development.

## 3. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. No `.env` is required for local dev — `VITE_API_BASE_URL`
defaults to `http://localhost:5080` (`src/lib/api.ts`), and the backend's default
CORS config (`appsettings.json` → `Cors:AllowedOrigins`) already allows
`http://localhost:5173`. If you run Vite on a different port, add both:

```bash
# frontend/.env
VITE_API_BASE_URL=http://localhost:5080
```

```json
// backend/ZipFlow.Api/appsettings.Development.json
"Cors": { "AllowedOrigins": ["http://localhost:<your-port>"] }
```

## 4. Verify

```bash
cd frontend
npm run build   # tsc -b && vite build
```

There's no `dotnet` test suite wired up yet; the closest smoke test is
`scripts/test-foundation.ps1` (PowerShell, checks health/version endpoints —
predates most of the current API surface, treat it as a starting point rather
than a full regression check).

## Troubleshooting

- **"port is already allocated" / "container name already in use"** — you
  likely already have `zipflow-postgres` running from a previous session
  (`docker ps -a --filter name=zipflow-postgres`). Reuse it rather than
  removing it if it has data you want to keep.
- **CORS errors in the browser console** — the frontend's origin (host:port)
  isn't in the backend's `Cors:AllowedOrigins`. See step 3.
- **401s immediately after login** — check `Jwt:SigningKey` is set (it is in
  `appsettings.Development.json`); a missing key in a custom config will fail
  token issuance.
