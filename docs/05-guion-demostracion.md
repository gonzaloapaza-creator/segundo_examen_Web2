# StockGuard - Guion de demostracion (10-15 minutos)

Requisitos: Docker Desktop en ejecucion, repositorio clonado, `.env` creado a partir de `.env.example`.
Terminal recomendada en Windows: PowerShell (usar `curl.exe`, no el alias `curl`; los cuerpos JSON se envian desde archivo con `-d "@body.json"`, ver README seccion 11).
La secuencia detallada con resultados esperados y nombres de capturas esta en [`GUIA_PRUEBAS_Y_CAPTURAS.md`](GUIA_PRUEBAS_Y_CAPTURAS.md).

## 0. Arranque (2 min)

```powershell
Copy-Item .env.example .env   # solo la primera vez
docker compose up --build -d
docker compose ps             # esperar: db, backend y gateway en estado "healthy"
```

Mostrar: solo `stockguard-gateway` tiene `0.0.0.0:8080->80/tcp`; backend y db no publican puertos.

## 1. Salud, Gateway y documentacion (1 min)

```powershell
curl.exe -i http://localhost:8080/health
curl.exe -i http://localhost:8080/api/v1/health/ready
Start-Process http://localhost:8080/docs
```

Mostrar: cabecera `X-Request-ID`, `checks.database = up`, Swagger agrupado por modulo y descripcion de idempotencia/reversiones.

## 2. Catalogo (2 min)

En Swagger ("Try it out") o con cURL:

```powershell
$B = "http://localhost:8080/api/v1"
# Categoria duplicada (insensible a mayusculas y con espacios) -> 409 CATEGORY_NAME_TAKEN
'{"name":"  AUDIO "}' | Set-Content -Encoding ASCII body.json
curl.exe -i -X POST "$B/categories" -H "Content-Type: application/json" -d "@body.json"

# Producto con stock en el body -> 400 VALIDATION_ERROR (stock no editable)
$C = "<categoryId>"
"{""sku"":""demo-1"",""name"":""Demo"",""referencePrice"":""10.00"",""categoryId"":""$C"",""stock"":5}" | Set-Content -Encoding ASCII body.json
curl.exe -i -X POST "$B/products" -H "Content-Type: application/json" -d "@body.json"
```

Mostrar: `details[]` por campo, SKU normalizado a mayusculas, `referencePrice` como cadena, `stock: 0` al crear.

## 3. Movimientos e idempotencia (3 min)

Obtener un `productId` (por ejemplo `CAB-HDMI-2M`, stock 4, minimo 5):

```powershell
curl.exe -s "$B/products?search=CAB-HDMI"
$P = "<productId>"

# Salida de 2 con clave demo-key-0001 -> 201, Idempotent-Replayed: false
"{""productId"":""$P"",""type"":""OUT"",""quantity"":2,""reason"":""Venta mostrador""}" | Set-Content -Encoding ASCII body.json
curl.exe -i -X POST "$B/movements" -H "Content-Type: application/json" -H "Idempotency-Key: demo-key-0001" -d "@body.json"
# Reintento con LA MISMA clave y el mismo cuerpo -> 201, Idempotent-Replayed: true, mismo id, stock sin cambios
curl.exe -i -X POST "$B/movements" -H "Content-Type: application/json" -H "Idempotency-Key: demo-key-0001" -d "@body.json"
# Misma clave, cantidad distinta -> 409 IDEMPOTENCY_KEY_REUSED
"{""productId"":""$P"",""type"":""OUT"",""quantity"":3,""reason"":""Venta mostrador""}" | Set-Content -Encoding ASCII body.json
curl.exe -i -X POST "$B/movements" -H "Content-Type: application/json" -H "Idempotency-Key: demo-key-0001" -d "@body.json"
# Salida mayor al stock -> 409 INSUFFICIENT_STOCK
"{""productId"":""$P"",""type"":""OUT"",""quantity"":99,""reason"":""Venta mostrador""}" | Set-Content -Encoding ASCII body.json
curl.exe -i -X POST "$B/movements" -H "Content-Type: application/json" -H "Idempotency-Key: demo-key-0002" -d "@body.json"
```

## 4. Concurrencia (2 min)

Ejecutar el smoke test, que lanza dos salidas simultaneas por la ultima unidad de un producto de prueba:

```powershell
.\scripts\smoke-test.ps1
```

Mostrar la linea `[OK] Dos salidas simultaneas de la ultima unidad -> [201, 409]` y `Stock final = 0`.
Alternativa: pruebas de integracion con PostgreSQL real (`docker compose -f docker-compose.test.yml run --rm --build backend-test`), casos "dos salidas simultaneas para la ultima unidad" y "muchas salidas concurrentes".

## 5. Reversion (1 min)

```powershell
$M = "<id del movimiento OUT del paso 3>"
'{"reason":"Salida registrada por error"}' | Set-Content -Encoding ASCII body.json
curl.exe -i -X POST "$B/movements/$M/reversal" -H "Content-Type: application/json" -H "Idempotency-Key: demo-rev-0001" -d "@body.json"
# Segunda reversion -> 409 MOVEMENT_ALREADY_REVERSED
'{"reason":"Otra vez"}' | Set-Content -Encoding ASCII body.json
curl.exe -i -X POST "$B/movements/$M/reversal" -H "Content-Type: application/json" -H "Idempotency-Key: demo-rev-0002" -d "@body.json"
curl.exe -s "$B/movements/$M"     # reversedByMovementId
```

## 6. Reportes (30 s)

```powershell
curl.exe -s "$B/reports/low-stock"
curl.exe -s "$B/reports/summary"
```

## 7. Gateway: CORS, rate limiting, trazabilidad (2 min)

```powershell
# Preflight permitido -> 204 con Access-Control-Allow-Origin
curl.exe -i -X OPTIONS "$B/movements" -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type, idempotency-key"
# Origen no permitido -> sin Access-Control-Allow-Origin
curl.exe -i -X OPTIONS "$B/movements" -H "Origin: http://evil.example" -H "Access-Control-Request-Method: POST"
# Rate limiting: 60 peticiones por una conexion -> varias 429 (RATE_LIMIT_RPS=10, BURST=20)
$u = 1..60 | ForEach-Object { "-o"; "NUL"; "$B/categories?limit=1" }
curl.exe -s -w "%{http_code}`n" @u | Sort-Object | Group-Object | Select-Object Name, Count
# Trazabilidad: el mismo requestId en Gateway y backend
curl.exe -i "$B/products/00000000-0000-4000-8000-000000000000"
docker compose logs --no-log-prefix gateway | Select-String "<requestId>"
docker compose logs --no-log-prefix backend | Select-String "<requestId>"
```

## 8. Persistencia (1 min)

```powershell
docker compose down          # elimina contenedores y red, conserva el volumen
docker compose up -d
docker compose ps
curl.exe -s "$B/reports/summary"   # comparar activeProducts/totalUnits/lowStockProducts/categories con el valor previo (generatedAt cambia en cada peticion, no se compara); log del backend: "Esquema al dia" y seed con movementsReplayed
```

## 9. Cierre

- Mostrar `git log --oneline --graph --all` (ramas `develop`, `feature/*`, `fix/*` integradas con merge `--no-ff`; `main` aun sin el merge de `develop` ni la etiqueta `v1.0.0`, ver README seccion 17 para el estado real).
- Mostrar `docs/diagrams/export/*.png` (C4 nivel 1 y 2).
