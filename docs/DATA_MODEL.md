# ZIP Flow Data Model

This document is the source of truth for the target database schema: every table grouped by
database schema, its columns, types and indexes, what changed or was added for the fine
dining MVP, what was dropped and why, and how bill totals are computed. It reflects the
schema as it exists in `backend/ZipFlow.Api/Domain/Entities.cs` and
`backend/ZipFlow.Api/Data/AppDbContext.cs` on `main` today, plus the changes this MVP makes on
top of it. See [RESTAURANT_FLOW.md](./RESTAURANT_FLOW.md) for what the flow this schema
supports looks like, and [ARCHITECTURE.md](./ARCHITECTURE.md) for the services that read and
write it.

The database uses five schemas plus an audit schema: `organization`, `iam`, `menu`, `pos`,
`inventory` (dropped entirely by this MVP, see below), and `audit`.

## `organization` schema

### `organization.Tenant`

| Column | Type | Note |
|---|---|---|
| `Id` | uuid PK | |
| `Code` | varchar(40) | unique |
| `Name` | varchar(160) | |
| `CurrencyCode` | varchar(3) | |
| `CurrencySymbol` | varchar(8) | |
| `IsActive` | bool | |
| `ReceiptBusinessName` | varchar(160) null | |
| `ReceiptFooterMessage` | varchar(200) | |
| `ReceiptShowTaxId` | bool | |
| `ReceiptTaxId` | varchar(60) null | |
| `VatRate` | decimal(9,6) | |
| `ServiceChargeRate` | decimal(9,6) | |
| `CreatedAt` / `UpdatedAt` | timestamptz | |

Indexes: unique `(Code)`.

Dropped column: `ReceiptShowCollectionCode` (bool) — it flagged whether a takeaway collection
code printed on the receipt; takeaway is not part of this MVP.

### `organization.Location`

| Column | Type | Note |
|---|---|---|
| `Id` | uuid PK | |
| `TenantId` | uuid FK → `organization.Tenant` | restrict |
| `Code` | varchar(40) | |
| `Name` | varchar(160) | |
| `TimeZoneId` | varchar(80) | |
| `IsActive` | bool | |

Indexes: unique `(TenantId, Code)`. Unchanged.

## `iam` schema

Unchanged by this MVP. Kept for completeness:

| Table | Key columns | Indexes |
|---|---|---|
| `iam.User` | `Id` PK, `TenantId` FK, `DefaultLocationId` FK null, `Email` varchar(320), `DisplayName` varchar(160), `PasswordHash` varchar(1000), `IsActive` bool | unique `(TenantId, Email)` |
| `iam.RefreshToken` | `Id` PK, `UserId` FK cascade, `TokenHash` varchar(200), `ExpiresAt`, `RevokedAt` null, `ReplacedByTokenHash` varchar(200) null | unique `(TokenHash)`, `(UserId, ExpiresAt)` |
| `iam.Role` | `Id` PK, `TenantId` FK, `Code` varchar(80), `Name` varchar(160), `IsSystemRole` bool, `IsActive` bool | unique `(TenantId, Code)` |
| `iam.Permission` | `Id` PK, `Code` varchar(160), `Module` varchar(80), `DisplayName` varchar(160) | unique `(Code)` |
| `iam.UserRole` | composite PK `(UserId, RoleId)`, `AssignedAt` | — |
| `iam.RolePermission` | composite PK `(RoleId, PermissionId)`, `GrantedAt` | — |

The permission *rows* seeded for inventory, recipe, kitchen and currency modules are trimmed
by `FoundationSeeder` as those modules are removed, but the table shapes themselves do not
change.

## `menu` schema

### `menu.Category`

| Column | Type | Note |
|---|---|---|
| `Id` | uuid PK | |
| `TenantId` | uuid FK → `organization.Tenant` | restrict |
| `Name` | varchar(160) | |
| `SortOrder` | int | |
| `IsActive` | bool | |

Indexes: unique `(TenantId, Name)`.

Dropped column: `Station` (varchar(40) null) — it tagged a category with a kitchen station
(grill, pass, bar) for the kitchen display, which this MVP does not have.

### `menu.MenuItem`

| Column | Type | Note |
|---|---|---|
| `Id` | uuid PK | |
| `TenantId` | uuid FK → `organization.Tenant` | restrict |
| `CategoryId` | uuid FK → `menu.Category` | restrict |
| `Name` | varchar(160) | |
| `Sku` | varchar(64) | |
| `Price` | decimal(18,2) | |
| `IsAvailable` | bool | |
| `IsArchived` | bool | |

Indexes: unique `(TenantId, Sku)`. Unchanged.

## `pos` schema

### Changed — `pos.Order`

| Column | Type | Note |
|---|---|---|
| `Id` | uuid PK | client may supply, for idempotency |
| `TenantId` | uuid FK → `organization.Tenant` | restrict |
| `LocationId` | uuid FK → `organization.Location` null | restrict |
| `OrderNumber` | int | drawn from `pos.OrderNumberCounter`, unique with `TenantId` |
| `TableId` | uuid FK → `pos.RestaurantTable` | **new**, required |
| `CustomerName` | varchar(120) | **new**, required |
| `CustomerPhone` | varchar(40) null | **new** |
| `OpenedByUserId` | uuid FK → `iam.User` null | **new**, who opened the table |
| `GuestCount` | int null | **new**, covers |
| `Status` | varchar(20) | `Open`, `Closed`, `Cancelled` |
| `Subtotal` | decimal(18,2) | recomputed on every round send and on close |
| `ServiceCharge` | decimal(18,2) | recomputed on every round send and on close |
| `Tax` | decimal(18,2) | recomputed on every round send and on close |
| `Total` | decimal(18,2) | recomputed on every round send and on close |
| `CurrencyCode` | varchar(12) | copied from tenant at open |
| `CurrencySymbol` | varchar(8) | copied from tenant at open |
| `ClosedAt` | timestamptz null | **new** |
| `CreatedAt` / `UpdatedAt` | timestamptz | |

Indexes: `(TenantId, CreatedAt)`, unique `(TenantId, OrderNumber)`, and a **new partial unique
index on `(TableId) WHERE Status = 'Open'`**. This is a database-level guarantee, not an
application check: Postgres itself refuses a second row with the same `TableId` while an
existing row for that table still has `Status = 'Open'`. The application cannot get this wrong
under a race — two waiters tapping the same table at the same instant will have one insert
succeed and one fail with a unique-violation, which the API turns into a normal "table already
occupied" error rather than a silent double-open.

Dropped columns (present in `pos.Order` on `main` today, removed by this MVP):
`ServiceMode`, `PaymentMethod`, `ExchangeRate`, `BaseCurrencyCode`, `BaseCurrencySubtotal`,
`BaseCurrencyTotal`, `AmountTendered`, `ChangeDue`. These all belonged to the counter-service,
pay-first flow this MVP replaces.

### New — `pos.OrderRound`

| Column | Type | Note |
|---|---|---|
| `Id` | uuid PK | **client-supplied** — see below |
| `OrderId` | uuid FK → `pos.Order` | cascade |
| `RoundNumber` | int | 1, 2, 3… within the order |
| `SentAt` | timestamptz | |

Indexes: unique `(OrderId, RoundNumber)`.

The client-supplied primary key is the double-send guard: if "Send round" is tapped twice, or
retried automatically after a dropped connection, both calls carry the same client-generated
`Id`. The second `INSERT` fails on the primary key itself, so the round is recorded exactly
once without the API needing any separate deduplication logic. This is the same idempotency
pattern used for opening an order (see [ARCHITECTURE.md](./ARCHITECTURE.md#idempotency)), but
here it is enforced structurally by the primary key rather than by an application-level check.

### Changed — `pos.OrderLine`

| Column | Type | Note |
|---|---|---|
| `Id` | uuid PK | |
| `OrderId` | uuid FK → `pos.Order` | cascade |
| `RoundId` | uuid FK → `pos.OrderRound` | **new**, cascade |
| `MenuItemId` | uuid FK → `menu.MenuItem` | restrict |
| `Name` | varchar(160) | snapshot at send time |
| `Price` | decimal(18,2) | snapshot at send time |
| `Quantity` | int | |
| `LineTotal` | decimal(18,2) | |
| `Notes` | varchar(300) null | |
| `CreatedAt` / `UpdatedAt` | timestamptz | |

`RoundId` is the only structural addition; every other column is unchanged. The `Name` and
`Price` columns are a deliberate snapshot, not a live join to `menu.MenuItem`: they are copied
onto the line at the moment the round is sent. If the menu item's price or name is edited
later, every previously printed slip and bill still shows exactly what the customer was
charged and served at the time — history does not get rewritten by a later menu edit.

### Unchanged — `pos.RestaurantTable`

| Column | Type | Note |
|---|---|---|
| `Id` | uuid PK | |
| `TenantId` | uuid FK → `organization.Tenant` | restrict |
| `Name` | varchar(80) | |
| `Section` | varchar(40) | |
| `Capacity` | int | |
| `Status` | varchar(20) | `available`, `occupied`, `reserved` |
| `IsArchived` | bool | |

Indexes: unique `(TenantId, Name)` filtered on `IsArchived = false`. The schema does not
change; the `TableDto` returned by `TableService` gains the current open order's id and
customer name, but that is a service-layer projection, not a column.

### Unchanged — `pos.OrderNumberCounter`

| Column | Type | Note |
|---|---|---|
| `TenantId` | uuid PK, FK → `organization.Tenant` | cascade |
| `NextValue` | int | drawn atomically per `OrderService.NextOrderNumberAsync` |

## `audit` schema

### `audit.AuditLog`

| Column | Type | Note |
|---|---|---|
| `Id` | uuid PK | |
| `TenantId` | uuid | |
| `LocationId` | uuid null | |
| `UserId` | uuid null | |
| `EntityType` | varchar(100) | |
| `EntityId` | varchar(100) | |
| `Action` | varchar(100) | |
| `Summary` | varchar(500) null | |
| `MetadataJson` | text null | |
| `CreatedAt` | timestamptz | |

Indexes: `(TenantId, CreatedAt)`, `(EntityType, EntityId)`. Unchanged.

## Dropped tables

| Table | Reason |
|---|---|
| `inventory.StockItem` | Stock tracking is not part of the fine dining MVP; no automatic stock consumption |
| `inventory.StockAdjustment` | Only existed to record adjustments against `StockItem` |
| `menu.Recipe` | Recipes fed automatic stock consumption per order line, which is removed |
| `menu.RecipeIngredient` | Only existed to hold a recipe's ingredient lines against `StockItem` |
| `organization.CurrencyRate` | Multi-currency exchange is removed; the order only ever uses the tenant's single currency |

Dropping the `inventory` schema's two tables removes the `inventory` schema from the database
entirely, since nothing else lives there.

## Dropped columns

| Table.Column | Reason |
|---|---|
| `pos.Order.ServiceMode` | Distinguished counter-service modes (dine-in/takeaway/delivery); this MVP has one mode, table service |
| `pos.Order.PaymentMethod` | Payment is out of scope for this MVP |
| `pos.Order.ExchangeRate` | No multi-currency conversion; one tenant currency per order |
| `pos.Order.BaseCurrencyCode` | Same — FX bookkeeping removed |
| `pos.Order.BaseCurrencySubtotal` | Same |
| `pos.Order.BaseCurrencyTotal` | Same |
| `pos.Order.AmountTendered` | Payment is out of scope |
| `pos.Order.ChangeDue` | Payment is out of scope |
| `menu.Category.Station` | Fed the kitchen display, which does not exist in this MVP |
| `organization.Tenant.ReceiptShowCollectionCode` | Takeaway collection codes are not part of this MVP |

## How totals are computed

Totals are computed server-side, never trusted from the client. `OrderService` recomputes
`Subtotal`, `ServiceCharge`, `Tax` and `Total` from every `pos.OrderLine` currently attached to
the order — not just the round being sent — at two points: every time a round is sent, and
again when the order is closed. The computation uses the tenant's own rates,
`tenant.ServiceChargeRate` and `tenant.VatRate`, and rounds each line with
`Math.Round(x, 2, MidpointRounding.AwayFromZero)`, matching the rounding already used
elsewhere in the codebase.

The frontend performs the same arithmetic locally so the waiter sees a live running total
while building a round, but this is a preview only. The number that prints on the slip and the
bill is always the value the server computed and stored on the order, fetched back from the
API — the frontend's copy is never what gets printed. There is no exchange-rate arithmetic
anywhere in this computation; `CurrencyCode`/`CurrencySymbol` are carried on the order purely
for display.

## Out of scope

Payment fields (tendered amount, change, payment method) are not part of this schema; if
payment is added in a later release it will need its own columns or table, not a reuse of the
dropped payment columns above.
