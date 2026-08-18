# Step 1 Acceptance Checklist

Complete these checks before starting Step 2.

- [ ] SQL Server is running on the configured connection string.
- [ ] `dotnet restore` completes successfully.
- [ ] `dotnet build` completes with 0 errors.
- [ ] API starts in Development.
- [ ] Development bootstrap creates the demo tenant, main location, permissions, administrator role, and administrator user.
- [ ] `GET /health` succeeds.
- [ ] `GET /api/system/version` succeeds without authentication.
- [ ] Bad credentials fail login.
- [ ] Development admin credentials return a JWT.
- [ ] `GET /api/me` returns 401 without a JWT.
- [ ] `GET /api/me` succeeds with the admin JWT.
- [ ] `GET /api/organization/locations` succeeds for the admin role.
- [ ] Frontend `npm install` succeeds.
- [ ] Frontend `npm run build` succeeds with 0 TypeScript errors.
- [ ] Unauthenticated browser navigation redirects to `/login`.
- [ ] Login opens the back-office shell.
- [ ] Browser refresh restores the session.
- [ ] Sign out clears the local token and returns to login.
- [ ] Tenant name and default location display correctly.
- [ ] No POS, inventory, kitchen, payment, or menu business tables have been added prematurely.

You can run `scripts/test-foundation.ps1` after the API is started to automate the API checks.
