# ZIP Flow Foundation Architecture

## Architectural choice

ZIP Flow begins as a modular monolith with strict domain boundaries. This avoids premature distributed-system complexity while keeping Menu, Orders, Inventory, Kitchen, Payments, Procurement, Customers, Workforce, Reporting, and Integrations separable later.

## Foundation boundaries

### Organization
- Tenant / restaurant group
- Location / branch
- Currency and time-zone context

### Identity and access
- User
- Role
- Permission
- UserRole
- RolePermission
- JWT authentication
- Server-side dynamic permission policies

### Audit
- Append-only audit log foundation
- Tenant, location, user, entity, action, summary, metadata

### Platform
- Health endpoint
- Version endpoint
- Swagger/OpenAPI
- CORS
- SQL Server persistence
- Development bootstrap administrator

## Dependency direction

```text
React Web Client
      |
      v
ZipFlow.Api
      |
      +-- Auth
      +-- Organization
      +-- Security
      +-- Audit foundation
      |
      v
EF Core / SQL Server
```

Business modules are not allowed to bypass tenant boundaries. Every future transactional aggregate will carry `TenantId`; location-scoped aggregates will also carry `LocationId`.

## Security model

JWTs contain identity and context claims, not the full permission list:

- `sub`
- `email`
- `name`
- `tenant_id`
- `default_location_id`
- role claims

Permissions are evaluated against the database using dynamic policies such as:

```text
permission:organization.locations.view
permission:pos.orders.create
permission:inventory.stock.adjust
```

This prevents very large tokens and allows permission changes to take effect without encoding hundreds of permission claims.

## Front-end principles

- Minimal navigation
- Strong information hierarchy
- Touch-friendly spacing
- Responsive back-office shell
- Product modules remain hidden/placeholder until implemented
- Authentication context is centralized
- API access goes through one client helper

## Foundation acceptance criteria

1. SQL Server starts locally.
2. API starts in Development.
3. Development bootstrap creates tenant, location, permissions, admin role, and admin user.
4. `GET /health` returns healthy.
5. `GET /api/system/version` returns version metadata.
6. Login returns a JWT.
7. `GET /api/me` works with JWT and fails without one.
8. Permission-protected location endpoint works for admin.
9. React login works.
10. Refresh restores the authenticated session.
11. Dashboard renders tenant and location context.
12. Frontend production build passes.
