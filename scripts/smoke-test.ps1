<#
.SYNOPSIS
  Smoke test de StockGuard a traves del Gateway (Windows PowerShell 5.1 / PowerShell 7).
.DESCRIPTION
  Crea datos de prueba con prefijo SMOKE-<timestamp> (no toca los datos de demostracion),
  verifica salud, CRUD, movimientos, idempotencia, concurrencia, reversion, reportes,
  CORS y rate limiting. Al final elimina los datos creados (salida + baja del producto + categoria).
.EXAMPLE
  .\scripts\smoke-test.ps1
  .\scripts\smoke-test.ps1 -BaseUrl http://localhost:8080
#>
param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$Origin = "http://localhost:5173"
)

$ErrorActionPreference = "Stop"
$script:failures = 0
$script:passed = 0

function Check($name, $condition, $detail = "") {
  if ($condition) { $script:passed++; Write-Host "[OK]   $name" -ForegroundColor Green }
  else { $script:failures++; Write-Host "[FAIL] $name $detail" -ForegroundColor Red }
}

function Invoke-Api {
  param([string]$Method, [string]$Path, $Body = $null, [hashtable]$Headers = @{})
  $uri = "$BaseUrl$Path"
  $params = @{ Method = $Method; Uri = $uri; Headers = $Headers; UseBasicParsing = $true }
  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Compress -Depth 5)
  }
  try {
    $res = Invoke-WebRequest @params
    $isJson = ([string]$res.Headers["Content-Type"]) -like "application/json*"
    $content = if ($res.Content -and $isJson) { $res.Content | ConvertFrom-Json } else { $res.Content }
    return [pscustomobject]@{ Status = [int]$res.StatusCode; Body = $content; Headers = $res.Headers }
  } catch {
    $resp = $_.Exception.Response
    if ($null -eq $resp) { throw }
    $status = [int]$resp.StatusCode
    # PowerShell 5.1 ya consumio el stream; el cuerpo del error esta en ErrorDetails. PowerShell 7 tambien lo expone ahi.
    $raw = $_.ErrorDetails.Message
    if (-not $raw) {
      try { $raw = (New-Object System.IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } catch { $raw = "" }
    }
    $content = if ($raw) { try { $raw | ConvertFrom-Json } catch { $raw } } else { $null }
    $headers = @{}
    foreach ($k in $resp.Headers.AllKeys) { $headers[$k] = $resp.Headers[$k] }
    return [pscustomobject]@{ Status = $status; Body = $content; Headers = $headers }
  }
}

$stamp = Get-Date -Format "yyyyMMddHHmmss"
$prefix = "SMOKE-$stamp"
Write-Host "== StockGuard smoke test contra $BaseUrl (prefijo $prefix) ==" -ForegroundColor Cyan

# 1. Salud
$gw = Invoke-Api GET "/health"
Check "Gateway /health responde 200" ($gw.Status -eq 200)
$ready = Invoke-Api GET "/api/v1/health/ready"
Check "Backend /api/v1/health/ready responde 200 con database=up" ($ready.Status -eq 200 -and $ready.Body.checks.database -eq "up")
Check "X-Request-ID presente en la respuesta" ([string]$ready.Headers["X-Request-ID"] -ne "")

# 2. Swagger / OpenAPI
$docs = Invoke-Api GET "/docs"
Check "Swagger UI /docs responde 200" ($docs.Status -eq 200)
$openapi = Invoke-Api GET "/docs/openapi.json"
Check "OpenAPI JSON disponible" ($openapi.Status -eq 200 -and $openapi.Body.openapi -like "3.*")

# 3. CRUD categoria + producto
$cat = Invoke-Api POST "/api/v1/categories" @{ name = "$prefix categoria"; description = "smoke" }
Check "POST /categories -> 201" ($cat.Status -eq 201) "status=$($cat.Status)"
$dup = Invoke-Api POST "/api/v1/categories" @{ name = "$prefix CATEGORIA" }
Check "Categoria duplicada (insensible a mayusculas) -> 409 CATEGORY_NAME_TAKEN" ($dup.Status -eq 409 -and $dup.Body.code -eq "CATEGORY_NAME_TAKEN")

$prod = Invoke-Api POST "/api/v1/products" @{ sku = "$prefix-SKU"; name = "$prefix producto"; referencePrice = "19.90"; minimumStock = 2; categoryId = $cat.Body.id }
Check "POST /products -> 201 con stock 0 y precio como cadena" ($prod.Status -eq 201 -and $prod.Body.stock -eq 0 -and $prod.Body.referencePrice -eq "19.90")
$bad = Invoke-Api POST "/api/v1/products" @{ sku = "x"; name = ""; referencePrice = "-1"; categoryId = "no-uuid"; stock = 5 }
Check "Producto invalido -> 400 VALIDATION_ERROR con details" ($bad.Status -eq 400 -and $bad.Body.code -eq "VALIDATION_ERROR" -and $bad.Body.details.Count -ge 4)
$catDel = Invoke-Api DELETE "/api/v1/categories/$($cat.Body.id)"
Check "DELETE categoria con productos -> 409 CATEGORY_HAS_PRODUCTS" ($catDel.Status -eq 409 -and $catDel.Body.code -eq "CATEGORY_HAS_PRODUCTS")

# 4. Movimientos + idempotencia
$pid_ = $prod.Body.id
$keyIn = "$prefix-in-0001"
$in1 = Invoke-Api POST "/api/v1/movements" @{ productId = $pid_; type = "IN"; quantity = 5; reason = "Compra inicial smoke" } @{ "Idempotency-Key" = $keyIn }
Check "Entrada IN 5 -> 201, resultingStock=5" ($in1.Status -eq 201 -and $in1.Body.resultingStock -eq 5)
$in1b = Invoke-Api POST "/api/v1/movements" @{ productId = $pid_; type = "IN"; quantity = 5; reason = "Compra inicial smoke" } @{ "Idempotency-Key" = $keyIn }
Check "Reintento misma clave -> 201, Idempotent-Replayed=true, mismo id" ($in1b.Status -eq 201 -and [string]$in1b.Headers["Idempotent-Replayed"] -eq "true" -and $in1b.Body.id -eq $in1.Body.id)
$in1c = Invoke-Api POST "/api/v1/movements" @{ productId = $pid_; type = "IN"; quantity = 6; reason = "Compra inicial smoke" } @{ "Idempotency-Key" = $keyIn }
Check "Misma clave con contenido distinto -> 409 IDEMPOTENCY_KEY_REUSED" ($in1c.Status -eq 409 -and $in1c.Body.code -eq "IDEMPOTENCY_KEY_REUSED")
$noKey = Invoke-Api POST "/api/v1/movements" @{ productId = $pid_; type = "IN"; quantity = 1; reason = "Sin clave" }
Check "Sin Idempotency-Key -> 400 IDEMPOTENCY_KEY_REQUIRED" ($noKey.Status -eq 400 -and $noKey.Body.code -eq "IDEMPOTENCY_KEY_REQUIRED")

$out1 = Invoke-Api POST "/api/v1/movements" @{ productId = $pid_; type = "OUT"; quantity = 4; reason = "Venta smoke" } @{ "Idempotency-Key" = "$prefix-out-0001" }
Check "Salida OUT 4 -> 201, resultingStock=1" ($out1.Status -eq 201 -and $out1.Body.resultingStock -eq 1)
$over = Invoke-Api POST "/api/v1/movements" @{ productId = $pid_; type = "OUT"; quantity = 9; reason = "Venta imposible" } @{ "Idempotency-Key" = "$prefix-out-0002" }
Check "Salida mayor al stock -> 409 INSUFFICIENT_STOCK" ($over.Status -eq 409 -and $over.Body.code -eq "INSUFFICIENT_STOCK")

# 5. Concurrencia: dos salidas simultaneas por la ultima unidad
$jobs = @("a", "b") | ForEach-Object {
  $k = "$prefix-race-$_"
  Start-Job -ScriptBlock {
    param($u, $p, $k)
    try {
      $r = Invoke-WebRequest -Method POST -Uri "$u/api/v1/movements" -ContentType "application/json" -UseBasicParsing `
        -Headers @{ "Idempotency-Key" = $k } -Body (@{ productId = $p; type = "OUT"; quantity = 1; reason = "Carrera smoke" } | ConvertTo-Json -Compress)
      [int]$r.StatusCode
    } catch { [int]$_.Exception.Response.StatusCode }
  } -ArgumentList $BaseUrl, $pid_, $k
}
$statuses = ($jobs | Wait-Job | Receive-Job) | Sort-Object
$jobs | Remove-Job
Check "Dos salidas simultaneas de la ultima unidad -> [201, 409]" (($statuses -join ",") -eq "201,409") "obtenido=$($statuses -join ',')"
$after = Invoke-Api GET "/api/v1/products/$pid_"
Check "Stock final = 0 tras la carrera" ($after.Body.stock -eq 0)

# 6. Reversion
$rev = Invoke-Api POST "/api/v1/movements/$($out1.Body.id)/reversal" @{ reason = "Venta anulada smoke" } @{ "Idempotency-Key" = "$prefix-rev-0001" }
Check "Reversion de la salida -> 201 IN 4 vinculado al original" ($rev.Status -eq 201 -and $rev.Body.type -eq "IN" -and $rev.Body.reversesMovementId -eq $out1.Body.id)
$rev2 = Invoke-Api POST "/api/v1/movements/$($out1.Body.id)/reversal" @{ reason = "Otra vez" } @{ "Idempotency-Key" = "$prefix-rev-0002" }
Check "Segunda reversion -> 409 MOVEMENT_ALREADY_REVERSED" ($rev2.Status -eq 409 -and $rev2.Body.code -eq "MOVEMENT_ALREADY_REVERSED")
$detail = Invoke-Api GET "/api/v1/movements/$($out1.Body.id)"
Check "Detalle del original expone reversedByMovementId" ($detail.Body.reversedByMovementId -eq $rev.Body.id)

# 7. Reportes
$low = Invoke-Api GET "/api/v1/reports/low-stock?limit=100"
Check "Reporte low-stock responde 200 con metadatos" ($low.Status -eq 200 -and $null -ne $low.Body.meta.totalItems)
$sum = Invoke-Api GET "/api/v1/reports/summary"
Check "Reporte summary responde 200" ($sum.Status -eq 200 -and $sum.Body.activeProducts -ge 1)

# 8. CORS
$pre = Invoke-Api OPTIONS "/api/v1/movements" $null @{ Origin = $Origin; "Access-Control-Request-Method" = "POST"; "Access-Control-Request-Headers" = "content-type, idempotency-key" }
Check "Preflight origen permitido -> 204 con Allow-Origin" ($pre.Status -eq 204 -and [string]$pre.Headers["Access-Control-Allow-Origin"] -eq $Origin)
$preBad = Invoke-Api OPTIONS "/api/v1/movements" $null @{ Origin = "http://evil.example"; "Access-Control-Request-Method" = "POST" }
Check "Preflight origen NO permitido -> sin Allow-Origin" ([string]$preBad.Headers["Access-Control-Allow-Origin"] -eq "")
$errCors = Invoke-Api GET "/api/v1/products/00000000-0000-4000-8000-000000000000" $null @{ Origin = $Origin }
Check "Error 404 conserva cabeceras CORS y requestId" ($errCors.Status -eq 404 -and [string]$errCors.Headers["Access-Control-Allow-Origin"] -eq $Origin -and $errCors.Body.requestId)

# 9. Rate limiting (una sola conexion keep-alive para superar RPS+burst)
Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$codes = @()
1..60 | ForEach-Object { $codes += [int]$client.GetAsync("$BaseUrl/api/v1/categories?limit=1").Result.StatusCode }
$client.Dispose()
$count429 = ($codes | Where-Object { $_ -eq 429 }).Count
Check "Rate limiting: al menos una respuesta 429 en 60 peticiones rapidas" ($count429 -ge 1) "429s=$count429"
Start-Sleep -Seconds 3

# 10. Limpieza: dejar stock 0, baja logica, categoria no eliminable (historial conservado)
$current = Invoke-Api GET "/api/v1/products/$pid_"
if ($current.Body.stock -gt 0) {
  Invoke-Api POST "/api/v1/movements" @{ productId = $pid_; type = "OUT"; quantity = $current.Body.stock; reason = "Limpieza smoke" } @{ "Idempotency-Key" = "$prefix-cleanup" } | Out-Null
}
$del = Invoke-Api DELETE "/api/v1/products/$pid_"
Check "Baja logica del producto de prueba -> 204" ($del.Status -eq 204)
$inactive = Invoke-Api GET "/api/v1/products/$pid_"
Check "Producto inactivo sigue consultable por id con isActive=false" ($inactive.Status -eq 200 -and $inactive.Body.isActive -eq $false)

Write-Host ""
Write-Host "== Resultado: $script:passed OK, $script:failures FAIL ==" -ForegroundColor $(if ($script:failures -eq 0) { "Green" } else { "Red" })
Write-Host "Nota: la categoria '$prefix categoria' y el producto dado de baja se conservan como historial (baja logica)."
if ($script:failures -gt 0) { exit 1 }
