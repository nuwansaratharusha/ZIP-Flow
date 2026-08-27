# ZIP Flow Restaurant Flow

This document is the source of truth for the restaurant service loop: what an owner sets up
once, what a waiter does at each screen during service, and what the back office can look up
afterwards. It describes the fine dining MVP with payment out of scope — see
[ARCHITECTURE.md](./ARCHITECTURE.md) for how it is built and [DATA_MODEL.md](./DATA_MODEL.md)
for the schema behind it.

## Setup, done once by the owner

1. **Settings** — business name, receipt footer, VAT rate, service charge rate, currency code
   and symbol.
2. **Tables** — name, section, capacity.
3. **Menu** — categories, then items with a SKU and a price.

Nothing here is per-shift; it is configured before service starts and revisited only when the
business itself changes (a new menu item, a new VAT rate).

## Service, per table

4. The waiter signs in and lands on the floor plan (**Tables**). Every table shows its current
   status: `available` or `occupied`. (`reserved` also exists in the schema but has no flow
   behind it in this MVP.)
5. The waiter taps an **available** table. A dialog asks for the customer name (required) and
   phone number (optional). Confirming opens an order with status `Open` and flips the table to
   `occupied`.
6. The waiter taps an **occupied** table. This jumps straight into that table's already-open
   order — there is no second dialog, because the customer was already captured at step 5.
7. On the order screen (**POS**) the waiter builds a round: tap a menu item to add it, adjust
   quantity, add a per-line note ("no salt", "extra spicy").
8. **Send round.** The lines in progress are saved as round *N* of the order. A slip prints
   immediately — that round's items, quantities, notes, prices, the round total, and the
   running total for the whole table. The waiter carries the slip to the kitchen. The order
   screen then clears, ready to build the next round.
9. Steps 7–8 repeat for as many rounds as the meal needs. Round numbers increase (1, 2, 3, …)
   within the order; nothing about a round can be edited once it has been sent.
10. **Close & print bill.** The waiter closes the table when the meal is over. The full bill
    prints — every round the table ordered, the subtotal, service charge, VAT, and grand total.
    The order becomes `Closed` and the table returns to `available`, ready for the next guest.

## Back office

11. **Orders** is a searchable history of every order, open or closed. Opening one shows its
    table, customer, and every round with its lines. From a closed order the back office can
    **reprint the bill** — useful when a customer wants a second copy or the original slip was
    lost. Reprinting does not change any figures: it reruns the same bill layout against the
    order's stored totals.

## Why two printing moments

The kitchen has no screen. Paper is the only way it learns that an order exists. If the
system only printed one document at the end of the meal, the kitchen would have nothing to
work from until the table had already finished eating — food would never get cooked during
service. Printing a slip on every round send is what tells the kitchen "make this now."

The end-of-meal bill exists for a different reason: it is the customer-facing summary of
everything the table consumed, with the money math (subtotal, service charge, VAT, total) that
a kitchen slip has no need for.

Because both documents describe the same thing — lines from this order — they share one
underlying layout and differ only in **scope**:

| Document | Printed when | Scope |
|---|---|---|
| Round slip | Every "Send round" | The lines in that one round, plus the running total so far |
| Bill | "Close & print bill" (or a later reprint) | Every round the order has, plus subtotal, service charge, VAT, and total |

This is the standard restaurant pattern of a kitchen order ticket (KOT) plus a bill; ZIP Flow
just renders both from the same template instead of maintaining two designs.

## Why there is only one printer

There is one printer, physically at the POS/pass station. A browser cannot silently pick which
printer a print job goes to — `window.print()` always sends to the operating system's default
printer on that machine. Splitting kitchen tickets to a printer in the kitchen and bills to a
printer at the counter would need a local agent that speaks the printer's own protocol
(ESC/POS) directly, bypassing the browser's print dialog entirely. That is real hardware
integration work and is explicitly out of scope for this MVP. With one printer at the pass,
there is nothing to route: every job queues at the same place, and a human carries the paper
where it needs to go.

## Screens a waiter touches

| Screen | Route | What happens here |
|---|---|---|
| Tables (floor plan) | `/tables` | See every table's status; tap available to open with a customer, tap occupied to resume its order |
| POS | `/pos/:orderId` | Build the current round from the menu grid, send it, or close the order and print the bill |
| Orders (history) | `/orders` | Search past orders, view one, reprint its bill |
| Print — round | `/print/orders/:orderId/round/:roundNumber` | The one-round slip, opened automatically by the browser print flow after Send round |
| Print — bill | `/print/orders/:orderId/bill` | The full bill, opened automatically after Close, or manually from Orders history |

## Out of scope for this document

Payment (cash, card, tendered amount, change) is not part of this flow. The order closes and
the bill prints with no payment step; payment is planned as a later addition on top of this
loop. Also out of scope: splitting or merging bills, moving a table, voiding an item that has
already gone to the kitchen, reprinting a single round's slip after the fact, and per-waiter
reporting.
