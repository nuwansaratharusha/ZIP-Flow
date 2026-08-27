# Waiter Dashboard Design

## Purpose

Waiters carry handheld iPads for table service. Today they log into the
full ZIP Flow app, which exposes Dashboard, Orders, Menu, and Settings —
irrelevant and distracting on a handheld device. This adds a Waiter-only
view showing just Tables and POS, and routes receipt/kitchen-round
printing to a physical printer at the counter instead of the device
screen, since an iPad can't drive a counter printer directly.

## Access Model

- Role-gated, same login as today (JWT auth, same `/login`).
- A new `Waiter` role is seeded server-side (mirrors the existing `Admin`
  seed block in `FoundationSeeder`) with permissions: `tables.read`,
  `orders.read`, `orders.write`, `pos.access`.
- No role-management UI is built. Assigning `Waiter` to a user account is
  done directly (DB/seed) for now — out of scope.
- If a logged-in session's `roles` are Waiter-only, the app auto-lands on
  `/waiter/tables` and redirects any attempt to visit `/`, `/orders`,
  `/menu`, or `/settings` back to `/waiter/tables`.
- Non-waiter roles are unaffected and may still open `/waiter/*` routes
  (e.g. a manager previewing the waiter view).

## Frontend

- New route group in `frontend/src/app/App.tsx`:
  - `/waiter` → redirect to `/waiter/tables`
  - `/waiter/tables` → renders existing `TablesPage`
  - `/waiter/pos/:orderId` → renders existing `PosPage`
  - All wrapped in a new `WaiterShell` component (parallels `AppShell`).
- `WaiterShell` nav rail shows only Tables and POS icons — no
  Dashboard/Orders/Menu/Settings entries, no dashboard hero/metrics
  strip. Reuses the same topbar (tenant name, clock, profile chip,
  logout) as `AppShell`.
- `TablesPage` and `PosPage` themselves are unchanged — same components,
  reused at the new routes.
- Print actions inside `PosPage` (send round to kitchen, print bill)
  currently navigate to `/print/orders/...`, which opens a browser print
  dialog on the viewing device. These are changed to POST to the new
  backend print endpoints (below) and show a toast — `"Sent to
  counter"` on success, `"Printer offline, tell the counter"` on
  failure. No local print dialog opens from these actions. The existing
  `/print/orders/:orderId/round/:roundNumber` and `.../bill` routes and
  `OrderPrintPage` component are untouched — they remain available for
  the main (non-waiter) app to reprint from a browser if needed.

## Backend

- New `PrinterSettings` (tenant/location-scoped): `ipAddress` (string),
  `port` (int, default `9100`). Stored and exposed alongside the
  existing `ReceiptSettings`/`TaxSettings` in the Settings feature
  (`SettingsService.cs`, `SettingsEndpoints.cs`), same pattern.
- New `EscPosPrintService`: builds raw ESC/POS byte sequences (printer
  init, text lines, paper cut) from order/round data, and sends them to
  the configured printer over `System.Net.Sockets.TcpClient` on
  `PrinterSettings.ipAddress:port`. No new NuGet dependency — ESC/POS for
  plain text + cut is simple enough to hand-roll.
- New endpoints:
  - `POST /orders/{orderId}/rounds/{roundNumber}/print`
  - `POST /orders/{orderId}/bill/print`
  Both fetch the same order/settings data `OrderPrintPage` already
  fetches via `getOrder`/`getReceiptSettings`, format it as an ESC/POS
  ticket, and send it via `EscPosPrintService`. Return `200 OK` on
  success.

## Error Handling

- Printer unreachable or the TCP connection times out → endpoint returns
  `502 Bad Gateway`. The frontend shows a toast:
  `"Printer offline, tell the counter"`.
- Printing is fire-and-forget relative to order state: a failed print
  does not block or roll back marking the round as sent or the bill as
  settled.
- No print queue, no retry. If this becomes a real operational problem
  (paper jams, printer offline for a stretch), that's a follow-up.

## Testing

- Manual: log in as a Waiter-role user, confirm the nav rail shows only
  Tables and POS, confirm navigating to `/`, `/orders`, `/menu`,
  `/settings` redirects back to `/waiter/tables`.
- Manual: point `PrinterSettings` at a raw TCP listener (e.g. `nc -l
  9100`) and verify the bytes received look like a sane ESC/POS ticket
  (init sequence, expected text lines, cut command).
- Unit test `EscPosPrintService`'s byte-building logic in isolation
  (given order/round data, assert on the produced byte sequence) —
  without opening a real socket.

## Out of Scope

- Role-management UI (creating/editing roles and permissions through the
  app).
- Multi-printer or multi-location printer routing.
- Offline print queueing/retry.
- Kitchen-ticket vs. customer-receipt template differentiation beyond
  what `OrderPrintPage`'s existing round/bill layouts already do.
