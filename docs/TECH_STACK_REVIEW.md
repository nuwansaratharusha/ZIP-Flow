# ZIP Flow — Tech Stack Review (2026-08-22)

Solo dev, small number of restaurants, must survive lost internet connection at the POS terminal.

## 1. Current stack summary

- Backend: ASP.NET Core 8, EF Core 8, SQL Server, JWT auth, custom DB-backed permission policies, multi-tenant org/location model. ~10 migrations already applied (orders, inventory, recipes/consumption, tables, tax, receipts, currency, payment tender).
- Frontend: React 18 + TypeScript + Vite, plain `fetch` wrapper (no react-query/SWR/axios), no state library, hand-written CSS (~1200 lines), deployed to Vercel.
- Infra: SQL Server via Docker Compose locally; backend env example points at Cloud Run; frontend env example points at Vercel.

## 2. Verdict on the stack

Keep ASP.NET Core as the API layer. It already contains correct, working business logic (idempotent reversal handling, dynamic permission policies, tax/currency/inventory services). Don't rewrite it into Supabase edge functions / RLS — that trades known, working C# for two less-familiar runtimes, throws away 10 migrations, and doesn't reduce the actual amount of logic you have to write.

**Database:** move off SQL Server to Postgres. No SQL-Server-specific code in the project (no stored procs, no `MERGE`), so the port is small (~1–2 days): swap to Npgsql, regenerate a single `InitialCreate` migration, fix a couple of `.ToLower() ==` string comparisons to use case-insensitive Postgres collation/`ILIKE`. Do this before there's production data.

**Where to host Postgres:** initially recommended Supabase. Revised after research — Supabase's real value (auth, storage, realtime, edge functions, RLS) isn't being used here, since the plan is to keep business logic in ASP.NET Core. Used as a plain Postgres host, Supabase is one option among several, not a clear winner:
- Supabase had a real production incident: 3h42m regional outage Feb 12 2026 (AWS VPC misconfiguration blocked all traffic in us-east-2, ~5% of customers affected). Not disqualifying, but worth knowing.
- Recommendation: host Postgres on **Railway**, the same platform as the API (see below) — one vendor, one bill, low-latency same-network DB access. Reserve Supabase only if its auth/storage features become genuinely wanted later.
- Neon is a legitimate alternative (great branching/serverless story) but has real cold starts on scale-to-zero, same tradeoff class as Cloud Run.

## 3. Hosting options for the API (researched pricing, 2026)

| Option | Cost/mo | Cold start | Ops burden |
|---|---|---|---|
| Cloud Run (scale-to-zero) | $0–5 | Yes (1–3s) | Lowest |
| Cloud Run (min-instances=1) | ~$65 in CPU-always-allocated mode, or a few $ in CPU-during-requests mode (verify before committing) | No | Lowest |
| Fly.io | $5–10 | No | Low |
| Railway | $6–12 | No | Lowest (best DX) |
| Hetzner VPS | €5.49–10.49 (~$6–11) | No | Medium (self-managed OS/patching) |

**Recommendation: Railway** for the API — cheapest no-cold-start option, deploys directly from the existing `backend/ZipFlow.Api/Dockerfile`, least ops overhead of the always-on options.

## 4. Revised full-stack cost estimate

- Railway (API + Postgres bundled): ~$15–25/mo
- Vercel Pro (frontend): $20/mo — **required**, not optional: Vercel's free Hobby tier is non-commercial only, and a POS serving paying restaurants doesn't qualify.
- **Total: ~$35–45/mo**

(Earlier estimate of Supabase Pro $25 + Railway API $10 + Vercel Pro $20 ≈ $55/mo — the Railway-only DB choice removes a vendor and ~$10–15/mo.)

## 5. Offline-resilience requirement (the actual hard part)

This matters more than the hosting choice. Three things in the current code actively work against it and need fixing regardless of backend/DB choice:

1. **Order numbers via `MAX(OrderNumber) + 1`** (`OrderService.cs` ~112-115) — races between concurrent terminals even online; unworkable offline. Needs a per-terminal prefix or server-assigned number at sync time. → Issue #1.
2. **No idempotency on order submission** (`OrderEndpoints.cs`, order `Id` generated server-side) — a retry after a dropped connection creates a duplicate order and double-decrements stock. Fix: client generates the order GUID, server upserts on it. → Issue #2.
3. **Stock quantity is a racy read-modify-write** (`OrderService.cs` ~207-221), no concurrency token — two concurrent orders can silently lose a decrement, a live bug today independent of offline work. Fix: derive quantity from the existing `StockAdjustment` ledger instead of a mutable field (deltas commute, absolute values don't — this also makes offline reconciliation straightforward). → Issue #3.

**Offline sync tooling comparison:**
- **PowerSync** — more production-proven (used in real mobile offline apps), SOC2/HIPAA compliant since Jan 2026, built-in conflict resolution, syncs Postgres↔SQLite directly. Free tier, then $49/mo Pro.
- **ElectricSQL** — free/open-source. Writes route back through your own API rather than syncing directly. This is the better architectural fit here, since the idempotency/tax/stock-ledger logic already needs to live in the API layer — no reason to pay $49/mo for a write path that would just be routed through the API anyway.

**Recommendation: ElectricSQL**, once issues #1–#3 above are fixed (they're prerequisites — a sync engine can't safely retry into code that isn't idempotent).

## 6. Other bugs found and filed as GitHub issues

| # | Title | Priority |
|---|---|---|
| [#1](https://github.com/nuwansaratharusha/ZIP-Flow/issues/1) | Order number generation races between concurrent terminals | High |
| [#2](https://github.com/nuwansaratharusha/ZIP-Flow/issues/2) | Order submission is not idempotent — retries create duplicate orders | High |
| [#3](https://github.com/nuwansaratharusha/ZIP-Flow/issues/3) | Stock quantity update is a racy read-modify-write with no concurrency guard | High |
| [#7](https://github.com/nuwansaratharusha/ZIP-Flow/issues/7) | JWT expires in 60 minutes with no refresh flow — cashiers lose session mid-shift | High |
| [#5](https://github.com/nuwansaratharusha/ZIP-Flow/issues/5) | Frontend and backend compute tax/rounding differently — totals will disagree | Medium |
| [#4](https://github.com/nuwansaratharusha/ZIP-Flow/issues/4) | Orders store post-currency-conversion totals — multi-currency reporting will be wrong | Medium |
| [#6](https://github.com/nuwansaratharusha/ZIP-Flow/issues/6) | AuditLog table is fully modeled but nothing ever writes to it | Low/Medium |

## 7. Frontend notes

- Don't add react-query — once offline-first lands, IndexedDB/local SQLite becomes the source of truth and components read local state, not a network cache. React-query would be thrown-away work.
- 1200 lines of hand-written CSS is fine at this scope — not a bottleneck, leave it.
- No service worker/manifest yet — the POS can't load at all offline today; needed for the PWA shell.

## 8. Priority-ordered recommendations

1. Refresh-token flow / long-lived device session (fixes Issue #7 — live bug today).
2. Client-generated order IDs + idempotent upsert endpoints (Issue #2) — unblocks everything offline.
3. Port SQL Server → Postgres, host on Railway alongside the API.
4. Make stock quantity ledger-derived or add a concurrency token (Issue #3).
5. Single shared tax/rounding calculator, used identically on client and server (Issue #5).
6. PWA shell + ElectricSQL-based offline outbox for the POS (this is the README's "Step 3"; items 1–4 above are its prerequisites).
7. Move DB migrations out of app startup into a deploy step; enable Postgres PITR/backups on Railway; add error tracking (e.g. Sentry).

## 9. Cheaper alternative found on further research

Question raised: "is $35-45/mo really the best we can do?" — no. Found two things that lower it further.

**Frontend: use Cloudflare Pages instead of Vercel.** Free tier allows commercial use, unlimited bandwidth, no seat pricing — unlike Vercel's Hobby tier, which is non-commercial only. Cuts the $20/mo Vercel Pro cost to $0 with no functional downside for a static/SPA React build. Pro tier ($20/mo/domain) only needed for higher build limits/analytics, not required to launch.

**Self-host everything on one VPS via Dokploy or Coolify** — both are free, open-source, self-hosted PaaS panels (git-push deploy, automatic SSL via Traefik) that run on a single $5-6/mo VPS (Hetzner CX or similar). Dokploy is the simpler option, recommended for a solo dev with 1-3 apps on a tight RAM budget; Coolify has more features/polish if the project grows. Either can host the API container, Postgres, and even the built frontend static files all on one box.

**Revised cost floor: ~$5-11/mo total** (one Hetzner VPS running Dokploy/Coolify with API + Postgres + frontend), vs. the earlier ~$35-45/mo multi-vendor estimate. Trade-off: back to self-managed ops (backups, OS patching, uptime) instead of managed platforms handling it — acceptable at "one dev, few restaurants" scale, revisit if it grows past what one person can comfortably babysit.

**Recommendation:** start with Dokploy on a single Hetzner VPS (API + Postgres + frontend) if minimizing cost matters most; fall back to the Railway + Cloudflare Pages split (~$15-25/mo) if preferring managed backups/updates over full self-ops. Either beats the original Supabase + Vercel Pro combo on cost.

## 10. Real-world validation: how existing POS systems solve offline

Researched Toast's actual offline architecture, since ZIP Flow needs the same guarantee. Confirms the local-first + sync-later approach already recommended, not a novel design:
- Toast auto-activates offline mode after ~40 seconds without internet.
- One "local hub device" on the restaurant's own LAN coordinates between terminals while offline — orders sent to the hub, distributed to other terminals from there.
- Card and cash payments still work offline; payment data is encrypted, stored locally, and submitted once connectivity returns.
- Loyalty programs, gift cards, and text-to-pay go dark offline — an acceptable, well-precedented tradeoff, not a gap unique to this project.

Takeaway: the planned architecture (client-generated idempotent order IDs, local outbox, sync-on-reconnect) matches how a production POS vendor actually solved this. Nothing to change here — just confirms the direction from Section 5.

## 11. Sources

- [Fly.io pricing 2026](https://www.runxbuild.com/blog/fly-io-pricing/)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Hetzner Cloud review 2026](https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/)
- [Supabase pricing 2026](https://uibakery.io/blog/supabase-pricing)
- [Railway pricing 2026](https://thesoftwarescout.com/railway-pricing-2026-plans-costs-is-it-worth-it/)
- [Supabase vs Neon vs Railway 2026](https://codelesssync.com/blog/supabase-vs-neon-vs-railway-postgresql-for-saas)
- [Supabase Feb 12 2026 incident report](https://supabase.com/blog/supabase-incident-on-february-12-2026)
- [PowerSync vs ElectricSQL](https://powersync.com/blog/electricsql-electric-next-vs-powersync)
- [Vercel pricing 2026](https://schematichq.com/blog/vercel-pricing)
- [Npgsql/EF Core maturity](https://github.com/npgsql/efcore.pg)
- [Cloudflare Pages pricing 2026](https://www.cloudflare.com/plans/developer-platform/)
- [Coolify vs Dokploy 2026](https://introserv.com/blog/dokploy-vs-coolify-complete-comparison-of-the-best-self-hosted-paas-platforms-for-vps-and-dedicated-servers-2026/)
- [Toast offline mode local sync](https://doc.toasttab.com/doc/platformguide/platformOfflineModeLocalSync.html)
