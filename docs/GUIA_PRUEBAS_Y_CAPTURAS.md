# StockGuard - Guia de pruebas manuales y capturas

Guia paso a paso para que el estudiante ejecute las pruebas manuales desde **Windows PowerShell**, **Swagger UI** y **Postman**, y tome las capturas para el informe PDF.

> Todos los resultados indicados en esta guia son **ESPERADOS** (derivados del codigo y de las verificaciones tecnicas automatizadas). Se confirman unicamente cuando el estudiante ejecuta cada paso. Ninguna captura ha sido tomada todavia.

## 0. Preparacion general

### 0.1 Requisitos

- Docker Desktop en ejecucion.
- Repositorio clonado (`git clone -b main https://github.com/gonzaloapaza-creator/segundo_examen_Web2.git stockguard`) o la copia de trabajo habitual actualizada (`git pull`).
- `.env` existente (si es una instalacion nueva: `Copy-Item .env.example .env`). **No** sobrescribir un `.env` existente.
- Stack levantado: `docker compose up --build -d` y los tres servicios en `(healthy)`.
- Carpeta para las capturas (no versionada): `mkdir docs\evidencias`.

### 0.2 Convenciones de esta guia

- `B` = `http://localhost:8080/api/v1`. En PowerShell: `$B = "http://localhost:8080/api/v1"`.
- Usar siempre `curl.exe` (no `curl`). Los cuerpos JSON se escriben en un archivo `body.json` con `Set-Content -Encoding ASCII` y se envian con `-d "@body.json"` (forma verificada en Windows PowerShell 5.1). Dentro de una cadena PowerShell entre comillas dobles, las comillas del JSON se duplican (`""`).
- `-i` muestra las cabeceras de respuesta (necesarias para ver `X-Request-ID`, `Idempotent-Replayed`, `Access-Control-Allow-Origin`).
- **IDs a guardar** durante la secuencia: `$C` (categoria Gaming), `$P` (producto MOU-GM-01), `$MOUT` (movimiento OUT de E07), `$MREV` (reversion de E12), `$C2` (categoria temporal de E15).
- **Al repetir toda la secuencia** (otro dia, otra persona, o tras un `docker compose down -v`): usar **nombre de categoria, SKU y claves de idempotencia nuevos**, no solo cambiar el sufijo de las claves. Con los mismos valores se obtienen conflictos esperables pero distintos a los de esta guia: `409 CATEGORY_NAME_TAKEN` (nombre repetido), `409 PRODUCT_SKU_TAKEN` (SKU repetido, el campo es unico y normalizado a MAYUSCULAS) e `409 IDEMPOTENCY_KEY_REUSED` (clave repetida con un `productId` distinto, porque el cuerpo ya no coincide con el original). Sugerencia: agregar un sufijo con fecha a los tres, por ejemplo categoria `Gaming-20261020`, SKU `MOU-GM-02` y claves `e06-in-0002`, `e07-out-0002`, etc.
- **Claves de idempotencia** usadas en esta guia: `e06-in-0001`, `e07-out-0001`, `e09-out-0001`, `e12-rev-0001`, `e12-rev-0002`, `e14-out-0001`. Son globales y permanentes en la BD: no se pueden reutilizar con un cuerpo distinto.
- Que capturar en Swagger: la operacion desplegada con **metodo + ruta**, los parametros/cuerpo enviados, el **codigo de estado** (`Code`) y el **cuerpo y cabeceras de respuesta** (`Response headers`). En Postman: metodo, URL, pestana **Body** de la respuesta, **Status** (arriba a la derecha) y, cuando aplique, pestana **Headers**. En PowerShell: el comando y la salida completa.
- Nombres sugeridos de archivo: `docs/evidencias/E01-servicios-saludables.png`, etc. (indicados en cada prueba).

### 0.3 Capturas esenciales para el PDF (minimo recomendado)

E01, E02, E04, E06+E07 (una captura cada uno o agrupadas), E09, E10, E11, E12, E14, E16, E17, E18, E19. Las demas (E03, E05, E08, E13, E15, E20, E21) son complementarias; incluirlas si queda espacio o agruparlas en una sola figura.

---

## 1. Infraestructura y documentacion

### E01 - Tres servicios saludables y un solo puerto publicado

- **Objetivo:** demostrar Compose con Gateway, backend y PostgreSQL, healthchecks y que solo el Gateway publica un puerto.
- **Preparacion:** stack levantado.
- **Comando (PowerShell):**
  ```powershell
  docker compose ps
  docker volume ls | Select-String stockguard
  docker images stockguard/*
  ```
- **Resultado esperado:** `stockguard-db Up (healthy) 5432/tcp`, `stockguard-backend Up (healthy) 3000/tcp`, `stockguard-gateway Up (healthy) 0.0.0.0:8080->80/tcp`; volumen `stockguard-pgdata`; imagenes `stockguard/gateway 1.0.0` y `stockguard/backend 1.0.0`.
- **Captura:** la tabla completa de `docker compose ps` (columnas NAME, STATUS, PORTS) y las dos salidas siguientes.
- **Archivo:** `E01-servicios-saludables.png`.
- **Rubrica:** Docker (Compose, healthchecks, volumen, solo el Gateway publica puerto); Gateway (unico punto de entrada).

### E02 - Swagger a traves del Gateway y salud

- **Objetivo:** documentacion interactiva servida por el puerto 8080 y endpoints de salud.
- **Accion:** abrir en el navegador `http://localhost:8080/docs`. En PowerShell:
  ```powershell
  curl.exe -i http://localhost:8080/health
  curl.exe -i http://localhost:8080/api/v1/health/ready
  ```
- **Resultado esperado:** Swagger UI "StockGuard API 1.0.0" con los grupos Categorias, Productos, Movimientos, Reportes, Salud. `/health` -> 200 `{"status":"ok","component":"gateway","requestId":"..."}` con cabecera `X-Request-ID`. `/api/v1/health/ready` -> 200 `{"status":"ok","checks":{"database":"up"},...}`.
- **Captura:** navegador con la URL `localhost:8080/docs` visible y los grupos; terminal con las dos respuestas (se ve `X-Request-ID`).
- **Archivos:** `E02a-swagger-gateway.png`, `E02b-salud.png`.
- **Rubrica:** Gateway (proxy inverso funcional, X-Request-ID); microservicio (endpoints REST, conexion a PostgreSQL).

---

## 2. CRUD de categorias y productos

### E03 - Crear una categoria

- **Objetivo:** `POST /categories` -> 201.
- **Accion (Swagger):** Categorias -> `POST /api/v1/categories` -> Try it out -> cuerpo:
  ```json
  { "name": "Gaming", "description": "Perifericos gamer" }
  ```
  **Alternativa PowerShell:**
  ```powershell
  $B = "http://localhost:8080/api/v1"
  '{"name":"Gaming","description":"Perifericos gamer"}' | Set-Content -Encoding ASCII body.json
  curl.exe -i -X POST "$B/categories" -H "Content-Type: application/json" -d "@body.json"
  ```
- **Resultado esperado:** `201 Created`; cuerpo con `id` (uuid), `name: "Gaming"`, `description`, `createdAt`, `updatedAt`. **Guardar el `id`:** `$C = "<id>"`.
- **Captura:** peticion, codigo 201 y cuerpo con el `id`.
- **Archivo:** `E03-crear-categoria.png`.
- **Rubrica:** CRUD de categorias; DTO.

### E04 - Crear un producto (nace con stock 0) y validacion de errores

- **Objetivo:** `POST /products` -> 201 con `stock: 0`; mostrar que `stock` en el body y datos invalidos se rechazan (400).
- **Accion 1 (Swagger o PowerShell):**
  ```json
  { "sku": "mou-gm-01", "name": "Mouse gamer", "description": "RGB, 16000 DPI", "referencePrice": "129.90", "minimumStock": 3, "categoryId": "<C>" }
  ```
  ```powershell
  "{""sku"":""mou-gm-01"",""name"":""Mouse gamer"",""description"":""RGB, 16000 DPI"",""referencePrice"":""129.90"",""minimumStock"":3,""categoryId"":""$C""}" | Set-Content -Encoding ASCII body.json
  curl.exe -i -X POST "$B/products" -H "Content-Type: application/json" -d "@body.json"
  ```
- **Resultado esperado 1:** `201`; `sku: "MOU-GM-01"` (normalizado a mayusculas), `stock: 0`, `isLowStock: true`, `referencePrice: "129.90"` (cadena), `isActive: true`. **Guardar:** `$P = "<id>"`.
- **Accion 2 (error de validacion):**
  ```json
  { "sku": "x", "name": "", "referencePrice": "-1", "categoryId": "no-uuid", "stock": 5 }
  ```
  ```powershell
  '{"sku":"x","name":"","referencePrice":"-1","categoryId":"no-uuid","stock":5}' | Set-Content -Encoding ASCII body.json
  curl.exe -i -X POST "$B/products" -H "Content-Type: application/json" -d "@body.json"
  ```
- **Resultado esperado 2:** `400` con `code: "VALIDATION_ERROR"`, `details[]` por campo (incluye `property stock should not exist`, longitud de `sku`, `name` vacio, `referencePrice`, `categoryId must be a UUID`) y `requestId`.
- **Captura:** una con el 201 (se ve `stock: 0` y `MOU-GM-01`) y otra con el 400 y `details[]`.
- **Archivos:** `E04a-crear-producto.png`, `E04b-validacion-400.png`.
- **Rubrica:** CRUD de productos; DTO y validaciones; reglas de negocio (stock no editable).

### E05 - Consultar y actualizar registros

- **Objetivo:** `GET` por id, listado con filtros y `PATCH` de categoria y producto.
- **Acciones:**
  ```powershell
  curl.exe -s "$B/categories/$C"
  curl.exe -s "$B/products/$P"
  curl.exe -s "$B/products?search=mouse&categoryId=$C&status=active&sortBy=name&order=asc&limit=10"
  '{"description":"Perifericos y accesorios gamer"}' | Set-Content -Encoding ASCII body.json
  curl.exe -i -X PATCH "$B/categories/$C" -H "Content-Type: application/json" -d "@body.json"
  '{"minimumStock":5,"referencePrice":"119.90"}' | Set-Content -Encoding ASCII body.json
  curl.exe -i -X PATCH "$B/products/$P" -H "Content-Type: application/json" -d "@body.json"
  ```
- **Resultado esperado:** 200 en todos; el listado devuelve `{ data: [...], meta: { page, limit, totalItems, ... } }` con el producto; los PATCH devuelven el registro actualizado (`minimumStock: 5`, `referencePrice: "119.90"`, `updatedAt` posterior).
- **Captura:** el listado paginado (`meta`) y el PATCH del producto con 200.
- **Archivo:** `E05-consultar-actualizar.png`.
- **Rubrica:** CRUD completo (lectura y actualizacion), paginacion y filtros.

---

## 3. Movimientos de inventario

### E06 - Registrar una entrada (IN)

- **Objetivo:** movimiento transaccional con stocks calculados en el servidor.
- **Accion (Swagger):** Movimientos -> `POST /api/v1/movements` -> parametro de cabecera `Idempotency-Key` = `e06-in-0001` -> cuerpo:
  ```json
  { "productId": "<P>", "type": "IN", "quantity": 10, "reason": "Compra a proveedor - factura 0012" }
  ```
  **PowerShell:**
  ```powershell
  "{""productId"":""$P"",""type"":""IN"",""quantity"":10,""reason"":""Compra a proveedor - factura 0012""}" | Set-Content -Encoding ASCII body.json
  curl.exe -i -X POST "$B/movements" -H "Content-Type: application/json" -H "Idempotency-Key: e06-in-0001" -d "@body.json"
  ```
- **Resultado esperado:** `201`; cabecera `Idempotent-Replayed: false`; cuerpo con `type: "IN"`, `quantity: 10`, `previousStock: 0`, `resultingStock: 10`, `idempotencyKey: "e06-in-0001"`, `reversesMovementId: null`.
- **Captura:** cabeceras de respuesta (`Idempotent-Replayed: false`, `X-Request-ID`) y cuerpo.
- **Archivo:** `E06-entrada-IN.png`.
- **Rubrica:** reglas de negocio (movimientos transaccionales), idempotencia.

### E07 - Registrar una salida (OUT)

- **Accion:** `Idempotency-Key: e07-out-0001`, cuerpo:
  ```json
  { "productId": "<P>", "type": "OUT", "quantity": 4, "reason": "Venta mostrador - ticket 1045" }
  ```
  ```powershell
  "{""productId"":""$P"",""type"":""OUT"",""quantity"":4,""reason"":""Venta mostrador - ticket 1045""}" | Set-Content -Encoding ASCII body.json
  curl.exe -i -X POST "$B/movements" -H "Content-Type: application/json" -H "Idempotency-Key: e07-out-0001" -d "@body.json"
  ```
- **Resultado esperado:** `201`; `previousStock: 10`, `resultingStock: 6`, `Idempotent-Replayed: false`. **Guardar el `id` del movimiento:** `$MOUT = "<id>"`. **No borrar `body.json`** hasta terminar E10 (se reutiliza tal cual).
- **Captura:** cuerpo con `previousStock`/`resultingStock`.
- **Archivo:** `E07-salida-OUT.png`.
- **Rubrica:** reglas de negocio.

### E08 - Consultar stock e historial

- **Acciones:**
  ```powershell
  curl.exe -s "$B/products/$P"
  curl.exe -s "$B/movements?productId=$P&order=desc&limit=20"
  curl.exe -s "$B/movements/$MOUT"
  ```
- **Resultado esperado:** producto con `stock: 6`; listado con 2 movimientos (OUT 4 primero, luego IN 10) y `meta.totalItems: 2`; detalle del OUT con `reversedByMovementId: null`.
- **Captura:** las tres salidas (una captura).
- **Archivo:** `E08-stock-historial.png`.
- **Rubrica:** endpoints REST, persistencia.

### E09 - Rechazar una salida con stock insuficiente

- **Accion:** `Idempotency-Key: e09-out-0001`, cuerpo:
  ```json
  { "productId": "<P>", "type": "OUT", "quantity": 50, "reason": "Venta imposible" }
  ```
  ```powershell
  "{""productId"":""$P"",""type"":""OUT"",""quantity"":50,""reason"":""Venta imposible""}" | Set-Content -Encoding ASCII body-e09.json
  curl.exe -i -X POST "$B/movements" -H "Content-Type: application/json" -H "Idempotency-Key: e09-out-0001" -d "@body-e09.json"
  curl.exe -s "$B/products/$P"
  ```
- **Resultado esperado:** `409` `code: "INSUFFICIENT_STOCK"`, `message: "Stock insuficiente: disponible 6, solicitado 50"`, `details: { available: 6, requested: 50 }`; el producto sigue con `stock: 6`.
- **Captura:** el 409 completo y el stock sin cambios.
- **Archivo:** `E09-stock-insuficiente.png`.
- **Rubrica:** reglas de negocio (restriccion de stock), manejo de errores.

### E10 - Reintentar con la misma clave sin duplicar

- **Objetivo:** idempotencia: repetir E07 exactamente igual.
- **Accion:** misma cabecera `Idempotency-Key: e07-out-0001` y **el mismo cuerpo de E07** (`OUT`, 4, mismo motivo). En PowerShell basta repetir el `curl.exe` de E07 si `body.json` no se modifico (E09 uso `body-e09.json`); si se modifico, volver a generarlo con el contenido de E07.
  ```powershell
  "{""productId"":""$P"",""type"":""OUT"",""quantity"":4,""reason"":""Venta mostrador - ticket 1045""}" | Set-Content -Encoding ASCII body.json
  curl.exe -i -X POST "$B/movements" -H "Content-Type: application/json" -H "Idempotency-Key: e07-out-0001" -d "@body.json"
  curl.exe -s "$B/products/$P"
  curl.exe -s "$B/movements?productId=$P&type=OUT"
  ```
- **Resultado esperado:** `201` con cabecera **`Idempotent-Replayed: true`**, el **mismo `id`** que `$MOUT` y el mismo cuerpo (`previousStock: 10`, `resultingStock: 6`); el stock sigue en 6; el listado de OUT sigue teniendo **1** movimiento.
- **Captura:** cabecera `Idempotent-Replayed: true` + `id` igual al de E07 + stock 6 (idealmente E07 y E10 lado a lado).
- **Archivo:** `E10-reintento-idempotente.png`.
- **Rubrica:** idempotencia (extra), reglas de negocio.

### E11 - Reutilizar la clave con otro contenido -> conflicto

- **Accion:** `Idempotency-Key: e07-out-0001` pero `quantity: 5`:
  ```powershell
  "{""productId"":""$P"",""type"":""OUT"",""quantity"":5,""reason"":""Venta mostrador - ticket 1045""}" | Set-Content -Encoding ASCII body-e11.json
  curl.exe -i -X POST "$B/movements" -H "Content-Type: application/json" -H "Idempotency-Key: e07-out-0001" -d "@body-e11.json"
  ```
- **Resultado esperado:** `409` `code: "IDEMPOTENCY_KEY_REUSED"`, `message: "La clave de idempotencia ya fue utilizada con una operacion o contenido diferente"`, `details: { operation: "CREATE_MOVEMENT", firstSeenAt: "..." }`. Stock sin cambios (6).
- **Captura:** el 409 completo.
- **Archivo:** `E11-clave-reutilizada-409.png`.
- **Rubrica:** idempotencia, manejo de errores.

### E12 - Revertir un movimiento valido (y rechazar la segunda reversion)

- **Accion 1:** `POST /api/v1/movements/{id}/reversal` con `id = $MOUT`, `Idempotency-Key: e12-rev-0001`, cuerpo:
  ```json
  { "reason": "Venta anulada por el cliente" }
  ```
  ```powershell
  '{"reason":"Venta anulada por el cliente"}' | Set-Content -Encoding ASCII body.json
  curl.exe -i -X POST "$B/movements/$MOUT/reversal" -H "Content-Type: application/json" -H "Idempotency-Key: e12-rev-0001" -d "@body.json"
  ```
- **Resultado esperado 1:** `201`; movimiento `type: "IN"`, `quantity: 4`, `previousStock: 6`, `resultingStock: 10`, `reversesMovementId: <MOUT>`. **Guardar:** `$MREV = "<id>"`.
- **Accion 2 (complementaria):** repetir con `Idempotency-Key: e12-rev-0002` y motivo `"Otra vez"`; luego `curl.exe -s "$B/movements/$MOUT"`.
- **Resultado esperado 2:** `409` `code: "MOVEMENT_ALREADY_REVERSED"` con `details.reversedByMovementId = $MREV`; el detalle del original muestra `reversedByMovementId: <MREV>` y sus datos **intactos**.
- **Captura:** el 201 con `reversesMovementId`; opcionalmente el 409 y el detalle.
- **Archivos:** `E12a-reversion-201.png`, `E12b-doble-reversion-409.png`.
- **Rubrica:** reversiones por compensacion (movimientos inmutables), reglas de negocio.

### E13 - Consultar reportes

- **Acciones:**
  ```powershell
  curl.exe -s "$B/reports/low-stock?limit=50"
  curl.exe -s "$B/reports/summary"
  ```
- **Resultado esperado:** `low-stock` lista solo productos activos con `stock <= minimumStock` (por ejemplo los del seed `ADP-USBC-HDMI` y `AUD-SPK-MINI` con stock 0, `CAB-HDMI-2M`, `PWB-10000`, `STO-MSD-128`); el producto `MOU-GM-01` **no** aparece (stock 10 > minimo 5). `summary` devuelve `activeProducts`, `totalUnits`, `lowStockProducts`, `categories`, `generatedAt`.
- **Captura:** ambas respuestas.
- **Archivo:** `E13-reportes.png`.
- **Rubrica:** reglas de negocio / reportes.

### E14 - Dar de baja un producto con stock cero (baja logica)

- **Accion 1 (rechazo con stock):** `curl.exe -i -X DELETE "$B/products/$P"`.
- **Resultado esperado 1:** `409` `code: "PRODUCT_HAS_STOCK"`, `details: { stock: 10 }`.
- **Accion 2 (vaciar stock):** `Idempotency-Key: e14-out-0001`, `OUT` 10:
  ```powershell
  "{""productId"":""$P"",""type"":""OUT"",""quantity"":10,""reason"":""Liquidacion para baja""}" | Set-Content -Encoding ASCII body.json
  curl.exe -i -X POST "$B/movements" -H "Content-Type: application/json" -H "Idempotency-Key: e14-out-0001" -d "@body.json"
  ```
  -> `201`, `resultingStock: 0`.
- **Accion 3 (baja):** `curl.exe -i -X DELETE "$B/products/$P"` -> **`204 No Content`**.
- **Accion 4 (verificacion):** `curl.exe -s "$B/products/$P"` -> `200` con `isActive: false`; `curl.exe -s "$B/products?search=MOU-GM"` -> `data: []` (no aparece entre los activos); `curl.exe -s "$B/products?status=inactive&search=MOU-GM"` -> aparece.
- **Resultado esperado:** la secuencia 409 -> 201 -> 204 -> `isActive: false`; el historial de movimientos del producto se conserva (`GET /movements?productId=$P` sigue devolviendo 4 movimientos).
- **Captura:** el 204 y el GET con `isActive: false` (opcional: el 409 inicial).
- **Archivo:** `E14-baja-logica.png`.
- **Rubrica:** CRUD (DELETE), reglas de negocio (baja logica solo con stock 0).

### E15 - Eliminar una categoria independiente sin productos

- **Accion 1:** crear categoria temporal `{"name":"Temporal E15"}` -> `201`; guardar `$C2`.
- **Accion 2:** `curl.exe -i -X DELETE "$B/categories/$C2"` -> **`204`**; `curl.exe -i "$B/categories/$C2"` -> `404 CATEGORY_NOT_FOUND`.
- **Accion 3 (complementaria):** `curl.exe -i -X DELETE "$B/categories/$C"` (Gaming, con el producto dado de baja) -> `409 CATEGORY_HAS_PRODUCTS` (la baja logica conserva la relacion).
- **Captura:** el 204 de la temporal y el 404 posterior; opcionalmente el 409 de Gaming.
- **Archivo:** `E15-eliminar-categoria.png`.
- **Rubrica:** CRUD de categorias (DELETE), reglas de negocio.

---

## 4. Gateway: caracteristicas transversales

### E16 - CORS

- **Acciones:**
  ```powershell
  # Origen permitido
  curl.exe -i -X OPTIONS "$B/movements" -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type, idempotency-key"
  # Origen NO permitido
  curl.exe -i -X OPTIONS "$B/movements" -H "Origin: http://evil.example" -H "Access-Control-Request-Method: POST"
  # Respuesta normal (y de error) con Origin permitido
  curl.exe -i "$B/products/00000000-0000-4000-8000-000000000000" -H "Origin: http://localhost:5173"
  ```
- **Resultado esperado:** (1) `204` con `Access-Control-Allow-Origin: http://localhost:5173`, `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Accept, Idempotency-Key, X-Requested-With`, `Access-Control-Expose-Headers: X-Request-ID, Idempotent-Replayed`, `Vary: Origin`. (2) `204` **sin** `Access-Control-Allow-Origin`. (3) `404` del backend que **si** incluye `Access-Control-Allow-Origin` y `X-Request-ID`.
- **Captura:** las cabeceras de (1) y (2) en una misma captura (se ve la diferencia).
- **Archivo:** `E16-cors.png`.
- **Rubrica:** Gateway (caracteristica transversal: CORS).

### E17 - Logs con el mismo requestId en Gateway y backend

- **Acciones:**
  ```powershell
  curl.exe -i "$B/products/00000000-0000-4000-8000-000000000000"
  # Copiar el valor de X-Request-ID de la respuesta y reemplazarlo abajo
  $R = "<requestId>"
  docker compose logs --no-log-prefix gateway | Select-String $R
  docker compose logs --no-log-prefix backend | Select-String $R
  ```
- **Resultado esperado:** la respuesta 404 trae `X-Request-ID` y el mismo valor en `requestId` del cuerpo; una linea JSON del Gateway con `"request_id":"<R>"`, `"status":404`, `"upstream_status":"404"`; una linea del backend `WARN [HTTP] {... "status":404, "requestId":"<R>"}`. Los logs no muestran cuerpos, contrasenas ni cabeceras.
- **Captura:** la cabecera `X-Request-ID` de la respuesta y las dos lineas de log con el mismo identificador (una sola captura).
- **Archivo:** `E17-logs-requestid.png`.
- **Rubrica:** Gateway (logs estructurados y trazabilidad X-Request-ID).

### E18 - Rate limiting

- **Accion** (60 peticiones por una sola conexion):
  ```powershell
  $u = 1..60 | ForEach-Object { "-o"; "NUL"; "$B/categories?limit=1" }
  curl.exe -s -w "%{http_code}`n" @u | Sort-Object | Group-Object | Select-Object Name, Count
  # Una respuesta 429 completa (ejecutar inmediatamente despues; si sale 200, repetir el bloque anterior y este):
  curl.exe -i "$B/categories?limit=1"
  ```
- **Resultado esperado:** tabla con `200` y `429` (por ejemplo ~22 x 200 y ~38 x 429 con `RATE_LIMIT_RPS=10`, `BURST=20`; la proporcion varia). La respuesta 429 es JSON: `{"statusCode":429,"code":"RATE_LIMITED","message":"Demasiadas peticiones; intente nuevamente en unos segundos",...,"requestId":"..."}`.
- **Captura:** la tabla de conteo y el cuerpo JSON del 429.
- **Archivo:** `E18-rate-limiting.png`.
- **Rubrica:** Gateway (caracteristica transversal: rate limiting).
- **Nota:** esperar unos segundos antes de continuar con otras pruebas para no recibir 429.

---

## 5. Persistencia

### E19 - Persistencia sin eliminar el volumen

- **Acciones:**
  ```powershell
  curl.exe -s "$B/reports/summary" | ConvertFrom-Json | Select-Object activeProducts, totalUnits, lowStockProducts, categories    # anotar estos 4 valores (generatedAt cambia en cada peticion, no se compara)
  docker compose down                          # SIN -v: conserva el volumen
  docker volume ls | Select-String stockguard  # stockguard-pgdata sigue presente
  docker compose up -d
  docker compose ps                            # esperar (healthy)
  curl.exe -s "$B/reports/summary" | ConvertFrom-Json | Select-Object activeProducts, totalUnits, lowStockProducts, categories    # comparar con los valores anotados antes
  curl.exe -s "$B/products/$P"                # el producto dado de baja sigue existiendo (isActive: false)
  docker compose logs --no-log-prefix backend | Select-String "Esquema al dia|Seed de demostracion"
  ```
- **Resultado esperado:** `activeProducts`, `totalUnits`, `lowStockProducts` y `categories` son identicos antes y despues (**`generatedAt` es una marca de tiempo que cambia en cada peticion y no forma parte de la comparacion**); el volumen `stockguard-pgdata` nunca desaparece; el backend registra `Esquema al dia (sin migraciones pendientes)` y `Seed de demostracion: {"categoriesCreated":0,"productsCreated":0,"movementsCreated":0,"movementsReplayed":9}` (seed idempotente: no duplica).
- **Captura:** `docker volume ls` tras el `down`, los dos `summary` (con los 4 valores de inventario visibles) y la linea del seed con `movementsReplayed: 9`.
- **Archivo:** `E19-persistencia.png`.
- **Rubrica:** Docker (volumen persistente), persistencia en PostgreSQL, migraciones y seed idempotente.
- **Nunca** ejecutar `docker compose down -v` sobre este proyecto (borra los datos).

---

## 6. Pruebas complementarias

### E20 - Pruebas automatizadas en Docker (opcional pero recomendable)

```powershell
docker compose -f docker-compose.test.yml run --rm --build backend-test
docker compose -f docker-compose.test.yml down -v     # solo elimina el entorno de pruebas (proyecto stockguard-test)
```

- **Resultado esperado:** `Test Suites: 5 passed`, `Tests: 35 passed` (incluye "dos salidas simultaneas para la ultima unidad", "reintentos simultaneos con la misma clave", "revierte la transaccion completa si falla el registro del movimiento").
- **Captura:** las ultimas lineas con el resumen de Jest. **Archivo:** `E20-jest-docker.png`.
- **Rubrica:** microservicio (reglas de negocio, concurrencia, idempotencia).

### E21 - Smoke test completo y Postman

- **Smoke test:** `.\scripts\smoke-test.ps1` -> `29 OK, 0 FAIL`, con la linea `Dos salidas simultaneas de la ultima unidad -> [201, 409]`. **Archivo:** `E21a-smoke-test.png`.
- **Postman:**
  1. Postman -> **Import** -> seleccionar `postman/StockGuard.postman_collection.json` y `postman/StockGuard.postman_environment.json`.
  2. En el selector de entornos (arriba a la derecha) elegir **StockGuard - Local (Gateway)**.
  3. Abrir la coleccion **StockGuard API** -> **Run** (Collection Runner) -> mantener el orden de carpetas 00 a 07 -> **Run StockGuard API**.
  4. Resultado esperado: 109 peticiones, 151 aserciones, 0 fallidas (`Passed 151`). La carpeta 06 incluye una rafaga de 60 peticiones; si la prueba de rate limiting fallara por velocidad del equipo, volver a ejecutar solo esa carpeta.
  5. Para capturas individuales, abrir una peticion (por ejemplo "03 Movimientos e idempotencia -> Reintento IN con LA MISMA clave (replay)") y enviarla: se ven metodo, URL, Status `201 Created`, pestana Headers con `Idempotent-Replayed: true` y los Test Results en verde.
  - **Archivos:** `E21b-postman-runner.png`, `E21c-postman-replay.png`.
- **Rubrica:** README/pruebas (cURL o Postman), Gateway, microservicio.

### E22 - Git Flow (para el informe)

```powershell
git fetch --all --tags
git log --oneline --graph --all --decorate | Select-Object -First 40
git tag
```

- **Resultado esperado:** ramas `main`, `develop`, `feature/*`, `fix/*`, `release/1.0.0` con los merges de integracion `--no-ff` y la etiqueta `v1.0.0` sobre `main`. Verificar siempre en el momento con `git log --oneline main` y `git tag` (no asumir el resultado sin ejecutarlo): ver README seccion 17 para el detalle y los enlaces a los Pull Requests.
- **Captura:** el grafo. **Archivo:** `E22-git-flow.png`. Tambien una captura del repositorio en GitHub (pagina principal y pestana de Pull Requests).
- **Rubrica:** Git Flow y repositorio publico.

---

## 7. Procedimientos de apoyo

### 7.1 Consultar logs sin exponer secretos

- `docker compose logs --no-log-prefix gateway --tail 50` y `docker compose logs --no-log-prefix backend --tail 50` solo muestran metodo, ruta, estado, duracion y `requestId`; no incluyen cuerpos ni credenciales.
- **No** capturar `docker compose config` ni el archivo `.env` (contienen la contrasena de PostgreSQL). Si se necesita mostrar variables, capturar `.env.example`.
- Para mostrar la BD: `docker compose exec db psql -U stockguard -d stockguard -c "\d inventory_movements"` (muestra solo el esquema).

### 7.2 Restablecer un servicio detenido durante una prueba

| Situacion | Comando |
| --- | --- |
| Se detuvo la BD para probar el 503 (`docker compose stop db`) | `docker compose start db` y esperar a `(healthy)`; el backend vuelve a `ready` solo |
| Un contenedor quedo `Exited`/`Restarting` | `docker compose up -d` (recrea solo los afectados); revisar `docker compose logs <servicio>` |
| Se hizo `docker compose down` | `docker compose up -d` (datos conservados) |
| Demasiados 429 | esperar 5-10 s |
| Se quiere empezar la secuencia de nuevo | usar nombre de categoria, SKU y claves de idempotencia **nuevos** (ver seccion 0.2); los datos anteriores se conservan como historial |

### 7.3 Si aparece un error inesperado

Antes de continuar, guardar y enviar:

1. El comando exacto ejecutado (o la peticion de Swagger/Postman: metodo, URL, cabeceras, cuerpo).
2. La respuesta completa (codigo, cabeceras, cuerpo JSON) incluido el `requestId`.
3. `docker compose ps`.
4. Las lineas de `docker compose logs --no-log-prefix gateway | Select-String "<requestId>"` y `docker compose logs --no-log-prefix backend | Select-String "<requestId>"`.
5. Si el problema es de arranque: `docker compose logs backend --tail 100`.
6. Version de PowerShell (`$PSVersionTable.PSVersion`) y de Docker (`docker --version`).

No ejecutar `docker compose down -v` como intento de solucion sin confirmar antes.
