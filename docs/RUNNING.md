# Running ZIP Flow Locally

Two independently-run pieces: `backend/ZipFlow.Api` (ASP.NET Core 8 + Postgres) and `frontend/`
(React + Vite). You can run the API either in Docker or bare with `dotnet run`; the frontend
always runs bare with `npm run dev`.

## Prerequisites

- Docker (for Postgres, and optionally the API container)
- .NET 8 SDK (if running the API bare)
- Node.js 18+ and npm (for the frontend)

## 1. Environment file

```bash
cp .env.example .env
```

The defaults work as-is for local dev. `CORS_ALLOWED_ORIGIN` must match whatever origin the
frontend is actually served from (default `http://localhost:5173`) or the browser blocks every
API call before it reaches the server.

## 2. Start Postgres + API with Docker Compose

```bash
docker compose up -d --build
```

This starts `zipflow-postgres` (port 5432) and `zipflow-api` (port 8080). Check it's up:

```bash
curl http://localhost:8080/health
```

Swagger is at `http://localhost:8080/swagger`.

### Alternative: run the API bare (faster iteration)

Only start Postgres via Compose, then run the API directly:

```bash
docker compose up -d postgres
cd backend/ZipFlow.Api
dotnet restore && dotnet run
```

The API listens on `http://localhost:5080` in this mode (not 8080 — that's the containerized
port). Point the frontend at whichever port you're actually using (see step 3).

## 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`. It talks to the API at `http://localhost:5080` by default
(`VITE_API_BASE_URL`, see `frontend/.env.example`). If you're running the API via Docker Compose
on port 8080 instead, set `VITE_API_BASE_URL=http://localhost:8080` before starting the dev
server (or add a `frontend/.env` from `frontend/.env.example` and edit it).

## 4. Log in

The API seeds two demo accounts on first run, but **only in Development with
`BootstrapAdmin:Enabled=true`** (the default in `appsettings.Development.json` — this seeding
does not happen in a production build):

| Role | Email | Password |
|---|---|---|
| Admin (full app) | `admin@zipflow.local` | `ChangeMe123!` |
| Waiter (`/waiter/tables` only) | `waiter@zipflow.local` | `ChangeMe123!` |

A fresh database has no tables or menu items yet. Log in as admin, go to **Tables → Manage** to
add tables, and **Menu** to add categories/items, before trying the POS flow.

## 5. Counter printer (optional)

Sending a round or closing a bill tries to print a ticket to a network ESC/POS thermal printer.
Configure its IP/port under **Settings → Counter printer** (admin only). If none is configured,
or it's unreachable, the order action still succeeds — you just get a "Printer offline" toast
instead of "Sent to counter". To test this locally without real hardware, point it at
`127.0.0.1:9100` and run `nc -l 9100` in a terminal to watch the raw bytes arrive.

## Troubleshooting

- **CORS errors in the browser console**: `Cors__AllowedOrigins__0` (or `CORS_ALLOWED_ORIGIN` in
  `.env` for the Compose path) doesn't match the exact origin (scheme + host + port) the frontend
  is served from.
- **"Address already in use"**: something else is already on 5080/8080/5173/5432. Either stop it
  or override the port (`dotnet run --urls http://localhost:PORT`, `vite --port PORT`,
  `docker compose` port mapping in `docker-compose.yml`).
- **Migrations**: EF Core migrations live in `backend/ZipFlow.Api/Migrations/` and apply
  automatically on API startup — no manual `dotnet ef database update` step needed for local dev.
