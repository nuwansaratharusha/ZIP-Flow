# ZIP Flow - Restaurant Platform Foundation

ZIP Flow is a premium restaurant operating platform foundation designed for touch-first POS, kitchen, inventory, purchasing, customer, reporting, and multi-location workflows.

This source package contains **Foundation Step 1 + Premium UI Foundation Step 1.5**.

## Included

### Backend foundation

- ASP.NET Core 8 API
- SQL Server
- Multi-tenant organization model
- Location model
- Users, roles and permissions
- JWT authentication
- Database-backed permission policies
- Audit-log foundation entity
- Health and version endpoints
- Swagger/OpenAPI
- Development bootstrap

### Frontend foundation

- React 18 + TypeScript + Vite
- ZIP Flow premium brand shell
- Protected routes
- Premium login experience
- Back-office dashboard
- Dark restaurant POS workspace
- Dine-in / takeaway / delivery mode switcher
- Category navigation and product search
- Interactive product grid
- Local order-line quantity controls
- Order subtotal/tax/total calculations
- Payment-method drawer foundation
- Responsive layout

> The POS currently uses mock menu data so the interaction foundation can be developed before the real Menu & Catalog and Order APIs. Step 2 replaces the mock catalog; Step 3 replaces local order state with the server/offline transaction engine.

## Folder structure

```text
zip-flow-foundation/
  backend/
    ZipFlow.Api/
  frontend/
  database/
  docs/
  scripts/
  docker-compose.yml
  ZipFlow.sln
```

## 1. Start SQL Server

Copy `.env.example` to `.env`, change the password if desired, then:

```bash
docker compose up -d
```

## 2. Run the backend

Requirements: .NET 8 SDK.

```bash
cd backend/ZipFlow.Api
dotnet restore
dotnet build
dotnet run
```

Development URLs:

- API: `http://localhost:5080`
- Swagger: `http://localhost:5080/swagger`
- Health: `http://localhost:5080/health`
- Version: `http://localhost:5080/api/system/version`

Development credentials:

```text
Email: admin@zipflow.local
Password: ChangeMe123!
```

Change these before any non-local use.

## 3. Run the frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

After login, open **POS** from the left navigation to see the premium touch-first POS foundation.

## 4. Verify

Backend smoke test:

```powershell
.\scripts\test-foundation.ps1
```

Frontend production build:

```bash
cd frontend
npm run build
```

## Documentation

- `docs/FOUNDATION_ARCHITECTURE.md`
- `docs/STEP_01_ACCEPTANCE_CHECKLIST.md`
- `docs/UI_FOUNDATION.md`
- `docs/STEP_01_5_UI_ACCEPTANCE_CHECKLIST.md`

## Next build step

**Step 2 - Menu & Catalog Foundation**

- Categories
- Products
- Variants
- Modifier groups
- Modifiers
- Taxes
- Price lists
- Location availability
- Sales-channel availability
- Menu management UI
- Permissions and audit logging
- Replace mock POS products with API-backed catalog data
