# Step 1.5 - Premium UI Foundation Acceptance Checklist

Complete these checks before building Menu & Catalog.

- [x] Browser title and visible product name read **ZIP Flow**.
- [x] Login page renders correctly at desktop and tablet widths.
- [x] Successful login opens the back-office shell.
- [x] Sidebar active states are visually clear.
- [x] Location, connectivity, current time, and operator context remain visible.
- [x] Dashboard renders without horizontal overflow at 1024px width.
- [x] POS opens from the sidebar and dashboard action.
- [x] POS service mode can switch between Dine in, Takeaway, and Delivery.
- [x] Category tabs filter the mock catalog.
- [x] Product search filters visible products.
- [x] Tapping a product adds it to the current order.
- [x] Repeated taps increase line quantity.
- [x] Plus/minus controls update quantity and total.
- [x] Deleting a line removes it from the order.
- [x] Subtotal, tax, and total update immediately.
- [x] Pay opens the payment-method drawer.
- [x] Payment drawer closes from the close control and backdrop.
- [x] Important POS actions have large touch targets.
- [x] Functional color is restrained and status-driven.
- [x] `npm run build` completes with 0 TypeScript errors in a network-enabled dev environment.

The interactive POS data is intentionally mocked in Step 1.5. Do not add persistent order writes until the Menu & Catalog and Order transaction foundations are implemented.
