param(
    [string]$ApiBaseUrl = "http://localhost:5080",
    [string]$Email = "admin@zipflow.local",
    [string]$Password = "ChangeMe123!"
)

$ErrorActionPreference = "Stop"

Write-Host "[1/5] Health"
Invoke-RestMethod "$ApiBaseUrl/health" | Out-Null
Write-Host "PASS"

Write-Host "[2/5] Version"
$version = Invoke-RestMethod "$ApiBaseUrl/api/system/version"
if (-not $version.success) { throw "Version endpoint failed." }
Write-Host "PASS - $($version.data.version)"

Write-Host "[3/5] Login"
$body = @{ email = $Email; password = $Password } | ConvertTo-Json
$login = Invoke-RestMethod "$ApiBaseUrl/api/auth/login" -Method Post -ContentType "application/json" -Body $body
$token = $login.data.accessToken
if ([string]::IsNullOrWhiteSpace($token)) { throw "Login did not return an access token." }
Write-Host "PASS - $($login.data.user.email)"

$headers = @{ Authorization = "Bearer $token" }

Write-Host "[4/5] Current session"
$me = Invoke-RestMethod "$ApiBaseUrl/api/me" -Headers $headers
if (-not $me.success) { throw "Current session endpoint failed." }
Write-Host "PASS - tenant $($me.data.tenant.code)"

Write-Host "[5/5] Permission-protected locations"
$locations = Invoke-RestMethod "$ApiBaseUrl/api/organization/locations" -Headers $headers
if (-not $locations.success) { throw "Locations endpoint failed." }
Write-Host "PASS - $($locations.data.Count) location(s)"

Write-Host "Foundation verification complete." -ForegroundColor Green
