# Order → Fulfilment → Payment Flow Redesign

**Date:** 2026-08-26
**Status:** Design approved, not yet implemented
**Related issues:** #32 (tenant-managed stations), #31 (role-based dashboard access, out of scope)

---

## 1. Problem

`Order.Status` is a single string field carrying three unrelated concerns at once: whether the
order can still be edited, whether it has been paid, and how far along the food is. Everything
below follows from that conflation.

**The reported bug.** `KitchenService.GetTicketsAsync` returns only orders whose `Status` is in
`["Sent", "Preparing", "Ready"]`. The POS has two independent order-creation paths — "Send to
kitchen" creates with status `Sent`, "Pay" creates with status `Completed`. An order created via
"Pay" is therefore never visible to the kitchen. If a cashier takes payment first, the kitchen
never learns the order exists.

This is not a filter bug to be patched. It is the predictable result of having two creation paths
where one produces a state the kitchen query excludes.

**Mixed orders cannot be tracked.** Status belongs to the whole order, and `OrderLine` has no
status field. On an order containing a burger and a cocktail, the bar cannot mark the cocktail
ready while the kitchen is still cooking — advancing status advances the entire ticket.

**Stations are not real.** `Category.Station` is free text, populated from a hardcoded frontend
list (`STATIONS` in `frontend/src/features/menu/types.ts`). `KitchenPage` uses it to filter one
shared ticket list into tabs. There is no station entity, no per-station fulfilment, and no way to
pin a terminal to a single station.

**Two further bugs found during investigation, not previously reported:**

- `KitchenService.GetTicketsAsync` filters by `TenantId` only, never `LocationId`. A tenant with
  two locations shows both kitchens' tickets on one screen with no way to distinguish them.
- Station is resolved live at display time through `Line → MenuItem → Category.Station`
  (`KitchenService.cs:35`). Retagging a category's station retroactively changes which station
  past orders appear to have been sent to. A settings edit rewrites history.

**Not a problem.** Inventory is already wired end to end: `StockItem`, `Recipe`, `RecipeIngredient`
and `StockAdjustment` exist, and `OrderService.ConsumeIngredientsAsync` (line 158) deducts stock
per recipe on order creation, with reversal on cancellation guarded against double-crediting. No
inventory work is in scope.

---

## 2. Research basis

Two research tracks informed this design. Findings that changed decisions are cited inline below.

**Commercial POS data models** (Square Orders API, Toast, Oracle Simphony, Clover developer
documentation). Every platform examined separates payment state from preparation state; none uses a
single combined status. Toast places `fulfillmentStatus` on the line item and derives order
readiness from it. Toast stores `businessDate` on the order, computed from a configurable
`closeoutHour` defaulting to 4:00 AM.

**Restaurant floor operations** (hospitality training material, chef forums, vendor operational
documentation). Confidence is high on vocabulary, X/Z reporting, business-day mechanics and KDS
routing. It is explicitly lower on frontline behaviour claims — specifically what staff skip during
a rush — because practitioner forums were not reachable. Those claims are treated as hypotheses
below and are marked where they influence a decision.

---

## 3. Scope

### In scope

Pay-first ordering with an optional destination. One flow covers two venue shapes:

- **Walk-up counter** — customer pays, gets a collection code, waits, collects.
- **UK hybrid** — customer pays at the counter, takes a numbered table marker, sits down, food is
  run to the table. (The Nando's model.)

These differ only in whether the order carries a table reference or a collection code. Research
flagged forcing a binary counter/table choice as a segment-losing mistake in UK casual dining, and
the tenant default currency is GBP.

### Out of scope, deferred deliberately

| Deferred | Reason |
|---|---|
| Dine-in tabs (long-lived unpaid orders) | The genuinely hard part: bill splitting, table transfers, merged parties, abandoned tabs at close. The model below accommodates it without migration. |
| Split bills / multiple bills per order | Requires a Bill entity between Order and Line. Not needed for pay-first. |
| Multi-tender payments | `Order.PaymentMethod` is a single string. Every platform examined models payments as a collection. Known dead end, accepted for MVP. |
| Z report as a VAT record | In the UK, Z reports are VAT records subject to HMRC six-year retention, which makes them immutable, sequentially numbered artefacts. This is a compliance obligation, not a feature. Deferred consciously; the X report below does not satisfy it. |
| Seat-level tracking | Rare in UK casual dining; belongs with dine-in. |
| Coursing / hold-and-fire | Absent in counter service by definition. |
| "Collected" handoff state | See §6.4. |
| Station CRUD UI (issue #32) | The entity ships now; the Settings screen does not. |
| Optimistic concurrency / idempotency keys | Flagged by research as "have from day one." Accepted risk for a single-terminal MVP; revisit before multi-terminal. |
| Offline mode | Significant work; not MVP. |
| Discounts and comps | No discount concept exists on `Order` today. Noting so this is a decision, not an oversight. |

---

## 4. Terminology

The product defaults to GBP. American POS vocabulary is a documented source of user friction, and
"entrée" means *starter* in the UK and *main* in the US. All user-facing strings use UK terms.

| Use | Not |
|---|---|
| Bill | Check |
| Starter / Main | Appetizer / Entrée |
| Cash up | Cash out |
| Docket (kitchen-side) | Ticket, chit, dupe |
| Off / Unavailable | 86 |
| Fire | Send to kitchen |

"Send to kitchen" is removed rather than renamed — see §6.1.

---

## 5. Domain model

Three independent axes replace the single `Order.Status`.

| Axis | Lives on | Values | Question it answers |
|---|---|---|---|
| Lifecycle | `Order.LifecycleState` | `Open`, `Closed`, `Voided` | Can this still be edited? Does it count in takings? |
| Payment | `Order.PaymentState` | `Unpaid`, `Paid`, `Refunded` | Money |
| Fulfilment | `OrderLine.FulfillmentState` | `Queued`, `Preparing`, `Ready`, `Cancelled` | Food |

Order-level fulfilment is **derived, never stored**: all lines `Ready` → ready; any line
`Preparing` → preparing; otherwise queued. Storing it is what produced the original drift.

In pay-first, `LifecycleState` is always `Closed` on creation. It exists because dine-in needs
`Open`, and adding it later would mean a migration plus rewriting every consumer.

### New entity: `Station`

```
Station : EntityBase
    TenantId    Guid
    Name        string
    SortOrder   int
    IsActive    bool = true
    IsArchived  bool
```

Seeded per tenant with generic, non-cuisine-specific defaults: Grill, Fryer, Sauté, Cold Pantry,
Pastry, Bar, Expo. Replaces the hardcoded frontend `STATIONS` const, which is deleted.

### Changed entities

**`Category`** — `Station` (string) becomes `DefaultStationId` (`Guid?`, FK → `Station`).

**`MenuItem`** — gains `StationId` (`Guid?`, FK → `Station`). Null means inherit the category
default. Research found routing resolved hierarchically in every platform (Toast: menu → group →
item → modifier, most specific wins). Category-only routing cannot express a smoothie in the Drinks
category going to the kitchen rather than the bar.

**`Order`**
```
- Status              string          REMOVED
+ LifecycleState      string          Open | Closed | Voided
+ PaymentState        string          Unpaid | Paid | Refunded
+ BusinessDate        DateOnly        stamped at creation, never recomputed
+ TableId             Guid?           FK → RestaurantTable
+ TableLabel          string?         snapshot of the label at order time
+ CollectionCode      string?
+ VoidedAt            DateTimeOffset?
+ VoidReason          string?
+ VoidBusinessDate    DateOnly?
```

`TableId` and `CollectionCode` are both nullable and mutually exclusive in practice. Toast models
destination as nullable per-behaviour detail rather than one polymorphic object; that is the
approach taken here. `TableLabel` is snapshotted so renaming a table does not rewrite history.

`VoidBusinessDate` is separate from `BusinessDate` because a void may fall on a different business
day than the sale. Toast carries the same pair.

**`OrderLine`**
```
+ FulfillmentState    string          Queued | Preparing | Ready | Cancelled
+ StationId           Guid?           snapshot, resolved at fire time
+ StationName         string?         snapshot label
```

Station is resolved once when the order fires and stored. Configuration changes must not alter the
routing history of orders already cooked.

**`RestaurantTable`**
```
+ LocationId          Guid?           FK → Location
- Status              string          REMOVED
```

Table labels stay `string` — real venues use "A4", "T12", "Bar 3". Table numbers are per-location;
without `LocationId`, a two-site tenant has two indistinguishable "Table 5"s. `Status` is removed
as stored state and occupancy derived from open orders — a stored status with no writer is
guaranteed to drift once one is added.

**`Tenant`**
```
+ CloseoutHour        int = 4         business-day boundary, local time
```

### Migration and backfill

One EF Core migration. Existing orders map as:

| Old `Status` | `LifecycleState` | `PaymentState` | Line `FulfillmentState` |
|---|---|---|---|
| `Sent` | `Open` | `Unpaid` | `Queued` |
| `Preparing` | `Open` | `Unpaid` | `Preparing` |
| `Ready` | `Open` | `Unpaid` | `Ready` |
| `Completed` | `Closed` | `Paid` | `Ready` |
| `Cancelled` | `Voided` | `Unpaid` | `Cancelled` |
| `Open` | — | — | never created; no rows expected |

`BusinessDate` backfills from `CreatedAt` using the location timezone and the default 4:00 cutoff.
This is approximate for historical rows, which is acceptable: there are no production tenants.

Existing `Category.Station` free-text values are matched case-insensitively against seeded station
names; unmatched values create additional stations for that tenant so no routing information is
lost.

---

## 6. Flow

### 6.1 POS — one button

The POS presents a single terminal action: **Charge**. "Send to kitchen" is deleted, not renamed.

In strict pay-first there is no moment when a cashier fires an unpaid order, so a second button can
only ever produce the state the kitchen query misses. Removing it eliminates the bug class rather
than the instance. The *capability* to fire an unpaid order remains expressible in the model
(`LifecycleState = Open`, `PaymentState = Unpaid`) for dine-in later; only the button goes.

Sequence:

1. Cashier builds the cart.
2. Cashier selects a destination: a table (hybrid venues) or nothing, in which case a collection
   code is generated automatically.
3. Cashier presses **Charge**, records tender.
4. In one transaction: the order is created, `BusinessDate` is stamped, `PaymentState` is set to
   `Paid` and `LifecycleState` to `Closed`, lines are created as `Queued` with their station
   snapshotted, and stock is consumed.

If payment recording fails, nothing is persisted. States are set explicitly rather than skipped so
that dine-in can later separate the transitions without restructuring the code path.

`ServiceMode` (Dine in / Takeaway / Delivery) is retained and recorded, but does not branch the
button flow in this scope.

### 6.2 Business date

Stamped once at creation from `Location.TimeZoneId` and `Tenant.CloseoutHour`. Never recomputed.

An order placed at 01:00 belongs to the previous business day. Recomputing at query time from a UTC
timestamp plus current configuration is unsound: a cutoff change, a venue relocation, or a DST
transition silently rewrites historical reports. The rule is **an order belongs to the business day
active when it was created**, and that rule must be stated in the reporting UI in plain words.

### 6.3 Kitchen display

`GET /kitchen/tickets?locationId={id}&stationId={id}`

- Returns **lines**, grouped for display by order. `stationId` is optional; omitted returns all
  stations for the location.
- Filters on `OrderLine.StationId` — the snapshot, not the live category join.
- `locationId` is required, fixing the cross-location leak.
- Includes lines whose order is `LifecycleState = Closed` and `PaymentState = Paid`. This is the
  normal case in pay-first and is precisely what the current status filter excludes.

Line transitions are independent: `Queued → Preparing → Ready`. Any station advances its own lines
without reference to any other station.

The MVP ships the existing shared screen with station tabs, now driven by the station-scoped
endpoint. A terminal pinned to a single station becomes a URL parameter and a stored preference —
an afternoon's work, deliberately deferred. The expensive half, the per-line query shape, is done
now.

### 6.4 Completion — no gate, no handoff step

Fulfilment ends at `Ready`. Nothing closes the order on fulfilment, because the order was closed
financially at payment.

Two decisions here, both contrary to the obvious design:

**No "all lines ready" gate.** Research was explicit that whole-ticket completion must be a derived,
non-blocking convenience and never a gate: drinks are meant to go out ahead of food, and a system
that withholds food because the bar has not bumped a soft drink gets worked around within one
shift. An earlier draft of this design auto-closed the order when all lines were served; that was
wrong, and removing it makes the model simpler.

**No "Collected" state.** Toast's line states stop at `READY`. Floor research found that in a rush
nobody returns to a screen to confirm handoff, so the field records a comfortable fiction. If
collection data is needed later it should be derived from something staff must already do — opening
a locker, scanning a courier code — not from an added tap. Should this be revisited, it ships as an
optional per-venue terminal state defaulting to off, and never as a prerequisite for reporting or
closing the day.

*Confidence note:* the claim that staff skip collection taps is medium confidence, drawn from
vendor complaint patterns rather than direct frontline testimony. It is cheap to reverse — adding
an optional state later requires no migration of existing data.

### 6.5 Void and refund are different operations

| | When | `LifecycleState` | `PaymentState` | Stock | Lines |
|---|---|---|---|---|---|
| **Void** | Before any line leaves `Queued` | → `Voided` | → `Refunded` | **Reversed** | → `Cancelled` |
| **Refund** | After any line has been prepared | unchanged (`Closed`) | → `Refunded` | **Not reversed** | unchanged |

The distinction is real: voiding before cooking means the ingredients were never used, so stock
returns; refunding after cooking means they were, so it does not. Current code reverses stock on
cancellation without this distinction and must be split. Both record a reason and a timestamp.

Both set `PaymentState = Refunded`, since in pay-first the money has always been taken by the time
either operation is possible. The axes stay independent: `LifecycleState` records whether the order
happened at all, `PaymentState` records where the money ended up. A voided order is excluded from
sales; a refunded one appears as a sale with an offsetting refund.

---

## 7. Reporting — X report

`GET /reports/x?businessDate={date}&locationId={id}`

Read-only, runnable any number of times, changes nothing. Grouped by `BusinessDate` and
`LocationId`.

Contents:

- Order count, void count, average spend per transaction
- Gross sales, service charge, VAT, total collected
- Refunds, subtracted
- Payment method breakdown (single tender per order for now)
- Sales mix by item and category
- **Exceptions:** orders where `PaymentState = Paid` and at least one line is neither `Ready` nor
  `Cancelled` — paid but not made. Also orders still in `LifecycleState = Open`, which in this
  scope can only be backfilled historical rows, and becomes the "abandoned tab" check once dine-in
  lands.

That last exception list is the payoff from splitting the axes. Today a paid-but-never-cooked order
is invisible — the original bug — and would reconcile clean. With payment and fulfilment
independent, the report surfaces it.

This is an X report, not a Z report. It does not close a period, does not reset counters, is not
sequentially numbered, and does not satisfy HMRC VAT record-keeping. See §3.

---

## 8. Frontend changes

- `PosPage.tsx` — remove "Send to kitchen"; single **Charge** action; destination selector (table
  or auto-generated collection code).
- `KitchenPage.tsx` — consume the station-scoped endpoint; render and advance lines rather than
  whole orders; station tabs driven by the `Station` API.
- `features/menu/types.ts` — delete the `STATIONS` const; fetch stations from the API.
- `features/menu` — station override on the menu item editor, defaulting to the category's station.
- `features/orders` — replace the `ORDER_STATUSES` const with the two order axes; show derived
  fulfilment separately.
- `features/tables` — tables scoped by location; occupancy derived, not stored.
- UK terminology throughout (§4).
- `DashboardPage.tsx` — "Today's sales +8.4%" is currently hardcoded. Wire to the X report or
  remove; shipping a fake metric is worse than shipping none.

---

## 9. Risks and things to verify

- **British Summer Time.** The clock-change nights produce 23-hour and 25-hour business days. Store
  UTC, compute the business day against a real tz database, and test both boundary nights
  explicitly. A venue open at 02:00 on the last Sunday in October lives through 01:00–02:00 twice.
- **Adding to an existing order.** In counter service "add a coffee to order 47" is a *second
  order* visually associated with the first, not a reopened bill. Systems that model it as reopening
  get it wrong. Not implemented in this scope; recorded so it is not implemented wrongly later.
- **Merged tables.** A party occupying several tables is a routine daily event in dine-in, not an
  edge case. Out of scope here, but `TableId` being a single nullable FK will need revisiting.
- **Single-tender payments.** Accepted for MVP; a known dead end (§3).
- **Research confidence.** Frontline behaviour claims — what gets skipped in a rush, whether
  collection taps get recorded — are the weakest sourced findings. Worth confirming with two or
  three real venues before building anything that depends on them.

---

## 10. Suggested issue breakdown

Sequenced so each is independently shippable:

1. **Station entity + seeded defaults + hierarchical resolution** — `Station` table,
   `Category.DefaultStationId`, `MenuItem.StationId`, migration of existing free-text values,
   station API. Closes the modelling half of #32.
2. **Split `Order.Status` into three axes** — new fields, migration and backfill, `BusinessDate`
   plus `Tenant.CloseoutHour`, per-line `FulfillmentState`, station snapshot on `OrderLine`.
3. **Single-button pay-first POS** — remove "Send to kitchen", destination selector, collection
   code generation.
4. **Station-scoped kitchen display** — line-level endpoint with required `locationId`, per-line
   transitions, tabs from the station API. Fixes the reported bug and the cross-location leak.
5. **Void and refund split** — distinct operations, correct stock behaviour, reason and timestamp.
6. **X report** — endpoint, screen, and replacing the hardcoded dashboard metric.
7. **UK terminology pass** — user-facing strings.
