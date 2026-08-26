# ZIP Flow Deployment

This document is the source of truth for running ZIP Flow: Docker Compose locally, the
environment variables the API needs, applying EF Core migrations, publishing the frontend to
Cloudflare Pages, and keeping CORS in sync between the two. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for the topology this setup implements, and
[DATA_MODEL.md](./DATA_MODEL.md) for the schema the migrations apply.

## Running locally with Docker Compose

`docker-compose.yml` today defines one service, `postgres`. The target setup adds a second
service, `api`, built from the existing `backend/ZipFlow.Api/Dockerfile`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: zipflow-postgres
    environment:
      POSTGRES_USER: "${POSTGRES_USER:-zipflow}"
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:-ChangeThisLocalPassword!1}"
      POSTGRES_DB: "${POSTGRES_DB:-ZipFlow}"
    ports:
      - "5432:5432"
    volumes:
      - zipflow_pg_data:/var/lib/postgresql/data
    restart: unless-stopped

  api:
    build:
      context: backend/ZipFlow.Api
      dockerfile: Dockerfile
    container_name: zipflow-api
    depends_on:
      - postgres
    environment:
      ConnectionStrings__DefaultConnection: "Host=postgres;Port=5432;Database=${POSTGRES_DB:-ZipFlow};Username=${POSTGRES_USER:-zipflow};Password=${POSTGRES_PASSWORD:-ChangeThisLocalPassword!1}"
      Jwt__Issuer: "ZipFlow"
      Jwt__Audience: "ZipFlow.Clients"
      Jwt__SigningKey: "${JWT_SIGNING_KEY}"
      Jwt__AccessTokenMinutes: "15"
      Jwt__RefreshTokenDays: "30"
      Cors__AllowedOrigins__0: "${CORS_ALLOWED_ORIGIN}"
    ports:
      - "8080:8080"
    restart: unless-stopped

volumes:
  zipflow_pg_data:
```

`backend/ZipFlow.Api/Dockerfile` already exists on `main`: it is a two-stage build (`dotnet
publish` on the SDK image, then `dotnet ZipFlow.Api.dll` on the ASP.NET runtime image), sets
`ASPNETCORE_HTTP_PORTS=8080`, and exposes port 8080 — the port mapping above matches that.

```bash
docker compose up --build
```

brings up Postgres and the API together. `GET http://localhost:8080/health` should return
healthy once both containers are up.

## Environment variables

The API reads configuration from `appsettings.json` by default; every key there can be
overridden by an environment variable using the ASP.NET Core double-underscore convention
(`Section__Key` maps to the nested JSON key `Section:Key`). The keys that exist in
`backend/ZipFlow.Api/appsettings.json` today are:

| Config key | Env var override | Purpose |
|---|---|---|
| `ConnectionStrings:DefaultConnection` | `ConnectionStrings__DefaultConnection` | Npgsql connection string. In Compose this must point at the `postgres` service by its service name as host, not `localhost` — containers do not share a network namespace |
| `Jwt:Issuer` | `Jwt__Issuer` | JWT issuer claim |
| `Jwt:Audience` | `Jwt__Audience` | JWT audience claim |
| `Jwt:SigningKey` | `Jwt__SigningKey` | Symmetric signing key, at least 32 characters. Must be overridden in any real deployment — the checked-in default is a placeholder |
| `Jwt:AccessTokenMinutes` | `Jwt__AccessTokenMinutes` | Access token lifetime |
| `Jwt:RefreshTokenDays` | `Jwt__RefreshTokenDays` | Refresh token lifetime |
| `Cors:AllowedOrigins` (array) | `Cors__AllowedOrigins__0`, `Cors__AllowedOrigins__1`, … | Origins allowed to call the API. Index-suffixed env vars build up the array; the Cloudflare Pages domain goes here |
| `BootstrapAdmin:Enabled` | `BootstrapAdmin__Enabled` | Whether the development bootstrap admin is created on startup — should be `false` outside local development |

Also needed for Postgres itself (read by the `postgres` service, not the API):
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.

`Program.cs` reads `Cors:AllowedOrigins` as a string array and falls back to
`http://localhost:5173` if the section is absent, so the array must be set explicitly in any
environment where the frontend is not the local Vite dev server.

## Running EF Core migrations

Migrations live in `backend/ZipFlow.Api/Migrations`. Apply them against a target connection
string with:

```bash
cd backend/ZipFlow.Api
dotnet ef database update --connection "Host=localhost;Port=5432;Database=ZipFlow;Username=zipflow;Password=ChangeThisLocalPassword!1"
```

or, without an explicit `--connection`, against whatever `ConnectionStrings__DefaultConnection`
resolves to in the current environment. Migrations should apply cleanly to an empty volume —
this is part of the verification for the schema change described in
[DATA_MODEL.md](./DATA_MODEL.md).

## Cloudflare Pages setup for the frontend

The frontend is a Vite + React SPA (`frontend/`), currently configured with `npm run build`
running `tsc -b && vite build` (see `frontend/package.json`). Cloudflare Pages project
settings:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `frontend` |
| Environment variable | `VITE_API_BASE_URL` — the deployed API's base URL |

`frontend/src/lib/api.ts` reads `import.meta.env.VITE_API_BASE_URL`, falling back to
`http://localhost:5080` if unset — so this variable must be set in the Pages project for the
built SPA to reach the deployed API rather than a local one.

### SPA routing

Cloudflare Pages serves static files by default, so a hard refresh or a direct link to a route
like `/orders` would otherwise 404 — there is no `dist/orders/index.html` on disk, only client-
side routing produces that page. Add `frontend/public/_redirects` containing:

```
/* /index.html 200
```

Vite copies everything under `public/` into `dist/` unchanged, so this file ships as
`dist/_redirects` and Cloudflare Pages picks it up automatically; every path falls through to
`index.html` with a 200, and `react-router-dom` takes over from there.

## Keeping CORS in sync

Whenever the Cloudflare Pages domain changes (a new project, a new custom domain, or a preview
deployment URL), the backend's `Cors__AllowedOrigins__0` (and further indices for additional
origins) must be updated to match and the API restarted, or the SPA's calls will be rejected by
the browser before they reach the API at all. There is no wildcard fallback — the origin must
match exactly what `Program.cs` configures via `AddCors`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Browser console shows a CORS error; network tab shows the request blocked before a response | The calling origin is not in `Cors:AllowedOrigins` on the API | Add the exact origin (scheme + host, no trailing slash) to `Cors__AllowedOrigins__0`/`__1`/… and restart the API |
| A deep link (e.g. reloading `/orders`) returns a Cloudflare 404 page | `frontend/public/_redirects` is missing from the build, or not being copied into `dist/` | Confirm the file exists at `frontend/public/_redirects` with `/* /index.html 200`, and that the Pages build output directory is set to `dist` |
| API fails to start, or every request errors with a database connection failure | `ConnectionStrings__DefaultConnection` points at the wrong host (e.g. `localhost` instead of `postgres` inside Compose), or Postgres is not yet ready when the API starts | Set the connection string's `Host` to the Compose service name (`postgres`); add `depends_on` in Compose, and confirm `docker compose ps` shows the `postgres` container healthy before hitting the API |

## Out of scope

Payment processing, receipt printer configuration (this is a client-side `window.print()` flow
handled entirely in the browser, not a deployment concern), and a second, agent-driven printer
integration are not covered here — see [RESTAURANT_FLOW.md](./RESTAURANT_FLOW.md#why-there-is-only-one-printer).
