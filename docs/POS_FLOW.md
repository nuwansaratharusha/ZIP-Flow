# POS Screen — Order and Payment Flow

**Date:** 2026-08-26
**Status:** Design agreed, not implemented
**Scope:** The POS screen only (`frontend/src/features/pos/PosPage.tsx`). Station routing,
the kitchen display and reporting are separate steps.

---

## 1. The problem

The POS screen has two buttons: **Send to kitchen** and **Pay**. They look like two steps but
they are two alternative ways of creating an order, and nothing on the screen tells the cashier
which to use.

**The bug.** `OrderService` creates an order with `Status = "Sent"` from the Send button, and
`Status = "Completed"` from the Pay button. `KitchenService.GetTicketsAsync` only returns orders
whose status is `Sent`, `Preparing` or `Ready`. An order created by pressing Pay is therefore
never shown to the kitchen. Take payment first and the kitchen never learns the order exists.

**The cause.** `Status` is a single field being used for two unrelated things at once: whether
the order has been paid, and how far along the food is. Marking an order paid is done by moving
that same field to `Completed`, which removes it from the kitchen's view.

**Partial credit for the existing code.** `handlePay` (`PosPage.tsx:198`) already branches: if an
order was sent first, it completes that order; otherwise it creates a new completed one. So
Send-then-Pay works correctly today. Only the Pay-without-Send path loses the ticket.

## 2. Why two buttons is also wrong for the cashier

Setting the bug aside, this is not how counter service works.

- **Counter service** has one action: take payment. The order reaching the kitchen is an automatic
  consequence, never a separate decision.
- **Table service** has two actions, but they are an hour apart and happen on different screens.
  The waiter builds the order and sends it; payment is initiated much later from a table or
  open-orders view, not from the order-building screen.

Putting both on one screen presents them as siblings when they are alternatives. The cashier has
to remember a rule during a rush, and getting it wrong silently loses the ticket.

## 3. The flow we are building

Counter service, payment first:

1. Cashier adds items to the order
2. Cashier sets the destination — a table marker number, or nothing for takeaway
3. Cashier presses **Charge**, takes payment
4. Order goes to the kitchen automatically
5. Screen shows the order number, then resets for the next customer

One button. Because payment is the only path, every order reaches the kitchen.

## 4. Cash payment

Most of this already works. `PosPage.tsx` has an amount-tendered input, calculates change
(`changeDue`, line 136), blocks underpayment (`tenderTooLow`, line 137), and pre-fills the exact
amount. `AmountTendered` and `ChangeDue` are stored on the order.

What is missing is usability on a tablet.

**Card** — no tendered amount. Card is always the exact total, so there is no change to give. The
field is currently shown for card payments and should not be: a cashier can type £50 tendered on
a £12 card sale and the screen will tell them to hand over £38.

**Cash** — replace the number input with an on-screen keypad:

```
  Amount due  £12.40          ┌───┬───┬───┐
                              │ 1 │ 2 │ 3 │
  Tendered    £20.00          ├───┼───┼───┤
  ─────────────────           │ 4 │ 5 │ 6 │
  Change      £7.60           ├───┼───┼───┤
                              │ 7 │ 8 │ 9 │
  [Exact] [£20] [£50]         ├───┼───┼───┤
                              │ 0 │ 00│ ⌫ │
                              └───┴───┴───┘
```

The quick-tender row matters more than the keypad. Most cash sales are either the exact amount or
a round note, so **Exact** plus the next sensible notes above the total covers most transactions
in a single tap. The keypad handles odd amounts.

Change due stays large and high-contrast — staff read it while counting money, often at arm's
length.

## 5. Table markers

Customers take a numbered marker to any free seat and food is run out to them. The cashier types
that number at checkout.

This does not need a floor plan. Markers are a flat pool of numbers, not specific tables, and the
customer has not chosen a seat when they pay.

The existing table picker on the POS screen — sections, capacity, occupancy dots, add/edit/remove
— is not used by this flow and comes off the screen. The `RestaurantTable` entity and the Tables
feature stay in place for dine-in later.

## 6. What is currently cosmetic

Parts of the POS screen look finished but are not connected to anything. Listed so they are not
mistaken for working features:

| Item | State |
|---|---|
| `Order #1048`, `Alex Morgan` (line 459) | Hardcoded strings. The real order number is never shown. |
| `selectedTable` | Never sent to the backend. `Order` has no table column. |
| `guestCount` (defaults to 3) | Never sent anywhere. Dead state. |
| Table status: available / occupied / reserved | Rendered with dots, badges and a legend, but nothing ever writes the field. |
| Split payment button | Present and permanently disabled. |

## 7. Changes

### Backend

- Add `Order.PaymentState` — `Unpaid`, `Paid`, `Refunded`. Migration backfills existing
  `Completed` orders to `Paid`.
- `Status` becomes food-only. The Charge path sets `Status = "Sent"` and `PaymentState = "Paid"`.
- **`KitchenService` needs no change.** Its existing filter already includes `Sent`, so a paid
  order now appears. One new field fixes the bug.
- Add `Order.DestinationLabel` (nullable string) — the marker number for eat-in, or a generated
  collection number for takeaway. `ServiceMode` distinguishes which.
- Remove the create-unpaid-order path from the API surface.

### Frontend (`PosPage.tsx`)

- Delete the Send to kitchen button, `handleSendToKitchen`, `sending`, and the `locked` freeze
- Single **Charge** button
- Payment sheet split by method: card takes no tendered amount, cash gets the keypad and
  quick-tender row
- Marker number input, shown for eat-in only, replacing the table picker modal
- Delete `guestCount` and the hardcoded order number and staff name
- After payment, show the real order number and destination, then reset

## 8. Out of scope

| Deferred | Why |
|---|---|
| Splitting orders per station | Needs a station entity first. Next step. |
| Kitchen display changes | Unaffected — its filter already works once payment is a separate field. |
| Per-item food status | Bar and kitchen tracking their own items independently. Later step. |
| Dine-in tabs | Long-running unpaid orders, adding items over time, paying at the end. |
| Split payments | Multiple payment methods on one order. Button already exists, disabled. |
| Reporting | Separate step. |

## 9. Open points

- **Removing the unpaid path** takes away the only way to send an order without payment. Correct
  for counter service; dine-in will add it back deliberately. Confirm no venue currently relies on
  Send-then-Pay before removing it.
- **VAT and service mode.** In the UK, eat-in and hot takeaway are taxed differently from cold
  takeaway. The system has one VAT rate per tenant, so service mode arguably ought to affect tax.
  Not addressed here.
- **Adding to an existing order.** At a counter this is a second order linked to the first, not a
  reopened one. Not implemented; recorded so it is not built the wrong way later.
- **A single payment method per order.** `PaymentMethod` is one string. Part-cash-part-card is
  common and will need a payments table eventually.
