# POS — Architecture and System Design

**Scope:** The POS screen. Counter service, payment first.
**Status:** Target design. Not yet implemented.

---

## 1. Purpose

The POS screen creates paid orders. A cashier builds an order, takes payment, and the order
becomes visible to the kitchen. There is no separate action to send an order — payment is what
sends it.

## 2. Flow

```
  ┌─────────────┐
  │  Add items  │  tap products, adjust quantity, add notes
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │ Destination │  eat-in: type marker number
  │             │  takeaway: nothing (collection number is generated)
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │   Charge    │  card: tap and done
  │             │  cash: enter tendered, show change
  └──────┬──────┘
         │
  ┌──────▼──────────────────────────────┐
  │ POST /api/orders                     │
  │   Status        = "Sent"             │
  │   PaymentState  = "Paid"             │
  │   OrderNumber   ← atomic counter     │
  │   stock consumed via recipes         │
  └──────┬──────────────────────────────┘
         │
  ┌──────▼──────┐         ┌──────────────────┐
  │  Confirm    │         │ Kitchen display  │  filter includes "Sent",
  │  + receipt  │         │ shows the order  │  so a paid order appears
  └──────┬──────┘         └──────────────────┘
         │
  ┌──────▼──────┐
  │    Reset    │  ready for next customer
  └─────────────┘
```

## 3. Data model

`Order` fields the POS writes:

| Field | Type | Value from POS |
|---|---|---|
| `OrderNumber` | int | Assigned by atomic counter, per tenant |
| `ServiceMode` | string | `Dine in`, `Takeaway`, `Delivery` |
| `Status` | string | `Sent` — food state only |
| `PaymentState` | string | `Paid` |
| `DestinationLabel` | string? | Marker number, or generated collection number |
| `PaymentMethod` | string | `Cash` or `Card` |
| `AmountTendered` | decimal | Cash: entered. Card: equals `Total` |
| `ChangeDue` | decimal | `AmountTendered - Total`, cash only |
| `Subtotal` | decimal | Computed server-side from line prices |
| `ServiceCharge` | decimal | `Subtotal × tenant.ServiceChargeRate` |
| `Tax` | decimal | `(Subtotal + ServiceCharge) × tenant.VatRate` |
| `Total` | decimal | `Subtotal + ServiceCharge + Tax` |
| `CurrencyCode` / `CurrencySymbol` / `ExchangeRate` | | Active currency for the sale |

`OrderLine` per item: `MenuItemId`, `Name`, `Price`, `Quantity`, `LineTotal`, `Notes`.
Name and price are snapshots taken at order time.

**`Status` and `PaymentState` are independent.** `Status` tracks food, `PaymentState` tracks
money. Neither is derived from the other.

| | Values |
|---|---|
| `Status` | `Sent` → `Preparing` → `Ready` |
| `PaymentState` | `Unpaid`, `Paid`, `Refunded` |

## 4. API

**`POST /api/orders`** — the only order-creation endpoint.

```jsonc
// request
{
  "serviceMode": "Dine in",
  "destinationLabel": "12",
  "paymentMethod": "Cash",
  "amountTendered": 20.00,
  "currencyCode": "GBP",
  "lines": [
    { "menuItemId": "…", "quantity": 2, "notes": "no onion" }
  ]
}

// response
{
  "data": {
    "id": "…",
    "orderNumber": 1048,
    "destinationLabel": "12",
    "total": 12.40,
    "changeDue": 7.60,
    "currencySymbol": "£"
  }
}
```

Server computes all money. The client's totals are display only and are never trusted.

Rejects: empty order, unknown menu item, unsupported currency, tendered below total.

**Loaded on mount:** `GET /api/menu/catalog`, `GET /api/settings/currencies`,
`GET /api/settings/tax`. A failed settings call falls back to defaults rather than blocking the
screen; the server always computes the real charge.

## 5. Screen

```
┌────────────────────────────────┬──────────────────────┐
│  Eat in │ Takeaway │ Delivery  │  Order               │
│  ──────────────────────────    │  Marker 12           │
│  [search]                      │──────────────────────│
│  All │ Mains │ Sides │ Drinks  │  2× Burger    £11.00 │
│  ──────────────────────────    │     no onion         │
│  ┌────┐ ┌────┐ ┌────┐          │  1× Cola       £2.40 │
│  │    │ │    │ │    │  product │                      │
│  └────┘ └────┘ └────┘  grid    │──────────────────────│
│  ┌────┐ ┌────┐ ┌────┐          │  Subtotal     £13.40 │
│  │    │ │    │ │    │          │  Service       £0.00 │
│  └────┘ └────┘ └────┘          │  VAT           £1.34 │
│                                │  Total        £14.74 │
│                                │  ┌────────────────┐  │
│                                │  │ Charge  £14.74 │  │
│                                │  └────────────────┘  │
└────────────────────────────────┴──────────────────────┘
```

Left: service mode, search, category tabs, product grid.
Right: destination, order lines, totals, one Charge button.

**State**

| State | Holds |
|---|---|
| `order` | Line items with quantity and notes |
| `serviceMode` | Eat in / Takeaway / Delivery |
| `destinationLabel` | Marker number, eat-in only |
| `activeCurrency` | Selected currency and rate |
| `paymentOpen` | Payment sheet visible |
| `tendered` | Cash entry |
| `lastOrder` | Order number and change, shown after payment |

Totals are computed from `order` on each render, not stored.

## 6. Payment

The sheet branches on method.

**Card** — one tap. No tendered field. Amount is always the total, so there is no change.

**Cash** — keypad and quick-tender:

```
  Amount due  £14.74          ┌───┬───┬───┐
                              │ 1 │ 2 │ 3 │
  Tendered    £20.00          ├───┼───┼───┤
  ─────────────────           │ 4 │ 5 │ 6 │
  Change       £5.26          ├───┼───┼───┤
                              │ 7 │ 8 │ 9 │
  [Exact] [£20] [£50]         ├───┼───┼───┤
                              │ 0 │ 00│ ⌫ │
                              └───┴───┴───┘
```

Quick-tender offers the exact amount and the next round notes above the total. Change is
displayed large — staff read it while counting the drawer.

Charge is blocked while tendered is below the total.

## 7. Destination

| Service mode | Destination | Set by |
|---|---|---|
| Eat in | Marker number | Cashier types it |
| Takeaway | Collection number | Generated at creation |
| Delivery | Collection number | Generated at creation |

Markers are a flat pool of numbers on physical stands, not specific tables. The customer takes one
to any free seat. No floor plan is involved, and the POS does not reference `RestaurantTable`.

## 8. Rules

- Payment is the only way to create an order. No path reaches the kitchen without it.
- The server computes every money value. Client totals are display only.
- Line name and price are snapshotted, so later menu edits do not alter past orders.
- Order numbers come from a per-tenant atomic counter — two terminals cannot collide.
- Stock is consumed from recipes at order creation.
- An order cannot be edited after payment. Extra items are a new order.
- Cash tendered below the total is rejected client-side and server-side.

## 9. Not in this scope

Splitting orders per station · kitchen display changes · per-item food status · dine-in tabs ·
split payments · refunds and voids from POS · reporting
