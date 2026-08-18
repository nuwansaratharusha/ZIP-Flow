# ZIP Flow Premium UI Foundation

ZIP Flow uses the uploaded Lightspeed restaurant POS videos as interaction inspiration, not as a literal visual clone. The goal is an original premium restaurant operating system that remains fast under service pressure.

## Core principles

1. **Operational calm** - dark POS/KDS surfaces reduce glare and distraction; back office remains lighter and denser.
2. **One obvious next action** - primary actions such as Send, Pay, Complete, Receive, and Post must be visually dominant.
3. **Touch first** - operational controls target 48px minimum and transaction actions are larger.
4. **Functional color** - blue indicates selection/primary actions, green success/readiness, amber attention, red destructive exceptions.
5. **Persistent context** - location, operator, service mode, order/table and connectivity remain visible.
6. **Progressive complexity** - advanced configuration is available without crowding service screens.
7. **Consistency** - components and tokens are reused across POS, KDS, inventory, purchasing, reporting and admin.

## UI tokens

The base tokens live in `frontend/src/styles/app.css` and should be moved into a dedicated shared design-system package as the frontend expands.

Key surfaces:

- POS background: `#0f1216`
- Primary dark shell: `#0b0d10`
- Elevated POS surface: `#171b21`
- Primary accent: `#4f7cff`
- Success: `#2fb773`
- Warning: `#f0a83a`
- Critical: `#d94e4e`

## Current UI implementation

- Premium login experience
- Back-office navigation shell
- Live-style dashboard foundation
- Interactive POS concept shell
- Service-mode switcher
- Product category navigation and search
- Product tiles
- Current-order panel
- Quantity controls
- Order totals
- Payment method sheet
- Responsive layouts

The POS is a UI foundation only. Product/menu data is currently mocked in `PosPage.tsx`; Step 2 replaces this with the Menu & Catalog API and Step 3 replaces local order state with the transaction engine.
