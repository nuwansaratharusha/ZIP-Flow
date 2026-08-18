# Database foundation

During Foundation Step 1, the Development environment uses EF Core `Database.EnsureCreatedAsync()` only when `BootstrapAdmin:Enabled=true`.

This is intentional for the first runnable baseline. In Step 2, before the Menu & Catalog module is added, replace `EnsureCreatedAsync()` with versioned EF Core migrations and create the initial migration from the current model.

Recommended commands from `backend/ZipFlow.Api`:

```bash
dotnet tool install --global dotnet-ef
dotnet ef migrations add InitialFoundation
dotnet ef database update
```

Do not use `EnsureCreated` in production.
