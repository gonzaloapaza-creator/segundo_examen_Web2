# StockGuard - Resultados reales de las verificaciones ejecutadas

Entorno de verificacion: Windows 10/11, Docker Desktop (Docker Engine 29.8.2, Compose v5.5.1), Node.js 24.21 / npm 11.19 (solo para las pruebas ejecutadas fuera de Docker; el flujo principal no lo requiere), Git 2.51, Java 21 (solo para exportar PlantUML).
Fecha: 2026-10-11 / 2026-10-12 (UTC). Todo lo listado fue ejecutado realmente; lo no ejecutado se marca al final.

## 1. Compilacion y pruebas automatizadas

| Verificacion | Comando | Resultado |
| --- | --- | --- |
| Type-check | `npm run typecheck` (en `backend/`) | sin errores |
| Auditoria de dependencias de produccion | `npm audit --omit=dev` | `found 0 vulnerabilities` |
| Pruebas unitarias + integracion (host, PostgreSQL 16 en Docker) | `npx jest --runInBand` | `Test Suites: 5 passed, Tests: 35 passed` (28.5 s) |
| Pruebas dentro de Docker (sin Node en el host) | `docker compose -f docker-compose.test.yml run --rm --build backend-test` | `Test Suites: 5 passed, Tests: 35 passed` (40.7 s); migracion `InitialSchema1760000000000` aplicada en la BD efimera |

Casos de integracion cubiertos (archivo `backend/test/*.e2e-spec.ts`):

- Catalogo: CRUD de categorias y productos; unicidad insensible a mayusculas (409 y `23505` directo en la BD); campos desconocidos y vacios (400); eliminacion de categoria bloqueada con productos activos e inactivos; paginacion/validacion de parametros; stock 0 inicial; SKU normalizado; precio como cadena; `stock`/`isActive` rechazados en POST/PATCH; SKU duplicado; busqueda/filtros/orden; baja logica (409 con stock, 204, inactivo consultable, PATCH 409, movimiento 409, historial conservado).
- Movimientos: entrada/salida con stocks del servidor; salida rechazada por stock insuficiente sin alterar el stock; validaciones de cantidad/tipo/motivo/cabecera; **transaccion revertida** cuando falla la insercion del movimiento (stock intacto, clave no reservada, reintento posterior exitoso); filtros por producto/tipo/fechas y rango invalido.
- Concurrencia: **dos salidas simultaneas por la ultima unidad -> `[201, 409]`, stock final 0, un unico OUT**; 12 salidas concurrentes con stock 5 -> exactamente 5 exitosas y 7 `INSUFFICIENT_STOCK`; baja logica vs. entrada concurrente -> uno de los dos resultados validos, estado final coherente.
- Idempotencia: reintento secuencial (mismo cuerpo, `Idempotent-Replayed: true`, un solo movimiento); misma clave con contenido distinto u operacion distinta -> 409; **6 reintentos simultaneos con la misma clave -> 6 x 201 con el mismo id, un solo `Idempotent-Replayed: false`, stock decrementado una sola vez**.
- Reversiones: valida (IN 4 vinculado, stock restaurado, original intacto, `reversedByMovementId`); reintento idempotente de la reversion; segunda reversion 409; revertir una compensacion 409; sin motivo 400; sin clave 400; movimiento inexistente 404; reversion de entrada que dejaria stock negativo 409; dos reversiones simultaneas -> `[201, 409]`.
- Reportes/salud/seed: low-stock solo activos con `stock <= minimo`; summary consistente; live/ready 200; `X-Request-ID` propagado y presente en errores; seed idempotente (segunda ejecucion: 0 creados, 9 reproducidos; stock modificado por el usuario no se sobrescribe).

## 2. Stack completo con Docker Compose

| Verificacion | Resultado |
| --- | --- |
| `cp .env.example .env && docker compose up --build -d` | imagenes `stockguard/gateway:0.1.0`, `stockguard/backend:0.1.0`, `postgres:16.15-alpine`; orden db -> backend -> gateway respetado por `depends_on` |
| `docker compose ps` | `stockguard-db Up (healthy) 5432/tcp`, `stockguard-backend Up (healthy) 3000/tcp`, `stockguard-gateway Up (healthy) 0.0.0.0:8080->80/tcp` -> **solo el Gateway publica puerto** |
| Log del backend en el primer arranque | `Migraciones aplicadas: InitialSchema1760000000000`; `Seed completado: {"categoriesCreated":5,"productsCreated":11,"movementsCreated":9,"movementsReplayed":0}` |
| `GET /health` (Gateway) | 200 `{"status":"ok","component":"gateway","requestId":"..."}` |
| `GET /api/v1/health/ready` | 200 `{"status":"ok","checks":{"database":"up"}}` |
| `GET /api/v1/health/ready` con `docker compose stop db` | **503** `{"code":"SERVICE_UNAVAILABLE","details":{"database":"down"}}`; tras `docker compose start db` -> 200 |
| `GET /docs` | 200 `text/html` (Swagger UI); `GET /docs/openapi.json` -> 200 `{"openapi":"3.0.0",...}` |
| `GET /` | 200 pagina estatica (en esta verificacion temprana la ruta estaba reservada para un futuro frontend; esa fase se descarto despues y la pagina ahora es de bienvenida con enlaces, ver `docs/03-endpoints.md` y `docs/04-decisiones-tecnicas.md`) |
| `GET /api/v1/reports/summary` tras el seed | `{"activeProducts":11,"totalUnits":122,"lowStockProducts":5,"categories":5}` |

## 3. Gateway

| Verificacion | Resultado |
| --- | --- |
| Preflight `OPTIONS` con `Origin: http://localhost:5173` | 204; `Access-Control-Allow-Origin: http://localhost:5173`; `Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`; `Allow-Headers: Content-Type, Accept, Idempotency-Key, X-Requested-With`; `Expose-Headers: X-Request-ID, Idempotent-Replayed`; `Vary: Origin` |
| Preflight con `Origin: http://evil.example` | 204 **sin** `Access-Control-Allow-Origin` (el navegador bloquea) |
| `Origin: http://localhostX5173` (prueba de escape de puntos) | sin `Access-Control-Allow-Origin` |
| GET exitoso y error 404 con origen permitido | ambos incluyen `Access-Control-Allow-Origin` y una unica cabecera `X-Request-ID` (sin duplicados backend/gateway) |
| Cliente envia `X-Request-ID: spoofed-id-12345` | la respuesta devuelve un id distinto generado por Nginx |
| Rate limiting (`RATE_LIMIT_RPS=10`, `BURST=20`): 60 peticiones por una conexion keep-alive | aprox. 30 x 200 y 30 x 429; cuerpo 429: `{"statusCode":429,"code":"RATE_LIMITED","message":"Demasiadas peticiones; intente nuevamente en unos segundos","timestamp":"...","path":"/api/v1/categories","requestId":"..."}`; log del Gateway con `"status":429` y `request_id` |
| 60 peticiones a `/api/v1/health/live` | 60 x 200 (salud excluida del limite) |
| Trazabilidad | `requestId=ea7bce326a20b604c34ef3df7993573a` presente en: cabecera de respuesta, log JSON del Gateway (`"request_id":"ea7b..."`, `"status":404`, `"upstream_status":"404"`) y log JSON del backend (`"requestId":"ea7b..."`) |
| Nota | Lanzar 60 procesos `curl` separados en Windows no alcanza 10 req/s (el limite no se dispara); por eso los scripts usan una sola conexion (curl con multiples URLs / `HttpClient`) |

## 4. Smoke tests del sistema completo

| Script | Resultado |
| --- | --- |
| `bash scripts/smoke-test.sh` (Git Bash) | `29 OK, 0 FAIL` |
| `powershell -File scripts/smoke-test.ps1` (PowerShell 5.1) | `29 OK, 0 FAIL` |
| Newman (`npx newman@6 run postman/StockGuard.postman_collection.json -e postman/StockGuard.postman_environment.json`) | `requests 109, assertions 151, failed 0` (incluye rafaga de 60 peticiones con 429 observados) |

## 5. Persistencia

| Paso | Resultado |
| --- | --- |
| Antes: `GET /api/v1/categories?limit=100` | `totalItems=10`, 5 categorias `SMOKE-*` creadas por los smoke tests |
| `docker compose down` (sin `-v`) | contenedores y red eliminados; `docker volume ls` -> `stockguard-pgdata` conservado |
| `docker compose up -d` | tres servicios `healthy`; log: `Esquema al dia (sin migraciones pendientes)`; `Seed completado: {"categoriesCreated":0,"productsCreated":0,"movementsCreated":0,"movementsReplayed":9}` |
| Despues: `GET /api/v1/categories?limit=100` | `totalItems=10`, 5 `SMOKE-*` -> **datos conservados, sin duplicados** |
| Estado de la BD de demostracion al cierre | `typeorm_migrations`: `InitialSchema1760000000000`; 11 categorias; 38 movimientos (17 OUT) acumulados por seed, pruebas manuales, smoke tests y Newman |

Restricciones comprobadas en PostgreSQL (`\d inventory_movements`): `uq_movements_idempotency_key`, `uq_movements_single_reversal (WHERE reverses_movement_id IS NOT NULL)`, `chk_movements_quantity_positive`, `chk_movements_stock_consistency`, `chk_movements_stocks_non_negative`, `fk_movements_product ON DELETE RESTRICT`, `fk_movements_reverses ON DELETE RESTRICT`.

## 5b. Clon limpio

| Paso | Resultado |
| --- | --- |
| `git clone -b develop <repo local> /tmp/sg-clone` con la configuracion global de Windows `core.autocrlf=true` (primer intento) | el Gateway entraba en `Restarting (127)`: el checkout convirtio `15-cors-origins.sh` a CRLF y `sh` no encontro el interprete. **Corregido** con `.gitattributes` (`* text=auto eol=lf`, commit `fix: enforce LF line endings...`) |
| Nuevo clon tras la correccion + `cp .env.example .env` + `docker compose up --build -d` | `file 15-cors-origins.sh` -> `ASCII text executable` (LF); tres servicios `healthy`; `bash scripts/smoke-test.sh` -> `29 OK, 0 FAIL` |

## 6. Comandos/pruebas destructivos (identificados)

- `docker compose -f docker-compose.test.yml run ... backend-test` y `npm run test:integration`: **TRUNCAN** las tablas de la BD `stockguard_test` (nunca la de demostracion; el helper aborta si el nombre de la BD no contiene `test`).
- `docker compose down -v`: elimina el volumen `stockguard-pgdata` (perdida de datos de demostracion).
- Los smoke tests y la coleccion Postman **no** borran datos: crean categorias/productos con prefijo `SMOKE-*`/`Postman <runId>` y dejan el producto dado de baja (historial conservado).

## 7. Reverificacion del cierre tecnico (2026-10-17)

Repetida de forma independiente sobre la rama `feature/cierre-tecnico` (commit `eefb37f` + los cambios de documentacion de este cierre), en la misma maquina y sin afectar la instancia de demostracion ya en ejecucion:

| Verificacion | Comando | Resultado |
| --- | --- | --- |
| Type-check | `npm run typecheck` (en `backend/`) | sin errores |
| Pruebas unitarias + integracion en Docker | `docker compose -f docker-compose.test.yml run --rm --build backend-test` | `Test Suites: 5 passed, 5 total`; `Tests: 35 passed, 35 total` (BD efimera `stockguard_test`; se limpio despues con `docker compose -f docker-compose.test.yml down -v`, que **no** toca `stockguard-pgdata`) |
| Smoke test contra la instancia de demostracion en ejecucion | `.\scripts\smoke-test.ps1` | `29 OK, 0 FAIL`; se ejecuto contra el stack de demostracion ya levantado por el usuario (`docker ps` antes y despues: `stockguard-gateway/backend/db` sin cambios, `docker volume ls` sigue mostrando `stockguard-pgdata`); el script solo agrego la categoria/producto `SMOKE-<timestamp>` y dio de baja el producto al final, como esta documentado (no se ejecuto `docker compose down`/`up` en este paso, por lo que no se repitio la prueba de persistencia de la seccion 5 en esta fecha) |
| Estado real de Git Flow | `git fetch origin`; `git log --oneline main`; `git log --oneline main..develop`; `git tag` | `main` = solo el commit inicial (`3b522f8 chore: initialize repository structure`); **no** existe la etiqueta `v1.0.0` ni la rama `release/1.0.0`; `develop` tiene 20 commits que `main` no tiene; `feature/cierre-tecnico` esta un commit por delante de `develop` y publicada en `origin` |
| Pull Requests en GitHub | `list_pull_requests` (API) | Solo el PR `#1` (`feature/gateway` -> `main`, abierto, sin fusionar), creado automaticamente el 2026-10-12 al publicar esa rama; quedo desactualizado antes de `feature/docs`, los `fix/*` y `feature/cierre-tecnico`, por lo que **no** debe fusionarse tal cual |

Corrige a las afirmaciones anteriores de este documento y de `README.md`/`docs/BASE_PARA_INFORME.md`/`docs/06-matriz-rubrica.md` (version previa) que daban por hecho que `main` ya tenia la etiqueta `v1.0.0`: **no era asi** y se corrigio en toda la documentacion durante este cierre.

## 8. No ejecutado en este entorno (pendiente)

| Pendiente | Tipo | Motivo | Como completarlo |
| --- | --- | --- | --- |
| Fusionar el PR `#2` (`feature/cierre-tecnico` -> `develop`) | Tecnico (no es tarea del estudiante) | El PR ya fue creado (<https://github.com/gonzaloapaza-creator/segundo_examen_Web2/pull/2>, `mergeable_state: clean`, sin checks ni revisiones obligatorias detectadas); falta completarlo en este mismo cierre | Ver seccion 10 para el resultado de la integracion |
| Crear `release/1.0.0` desde `develop` y Pull Request hacia `main` | Tecnico (no es tarea del estudiante) | Depende de que se fusione el punto anterior | Ver seccion 10 |
| Captura de evidencias e informe PDF | Estudiante | Corresponde al estudiante, con `docs/GUIA_PRUEBAS_Y_CAPTURAS.md` | Seguir la guia y tomar las capturas indicadas |
| Ejecucion en un equipo distinto desde un clon limpio | Estudiante/opcional | Solo se verifico en este equipo (ver seccion 5b para el clon limpio ya realizado) | Seguir README > Arranque desde cero |
| Prueba en PowerShell 7 | Estudiante/opcional | Solo se ejecuto el smoke test en Windows PowerShell 5.1 (el script contempla ambos) | `pwsh .\scripts\smoke-test.ps1` |

## 9. Reverificacion de la version candidata a integrar (2026-10-18)

Commit evaluado: `c7248b9` (rama `feature/cierre-tecnico`, identico al `head` del PR `#2`). Entorno: misma maquina Windows, Docker Desktop (Engine 29.8.2, Compose v5.5.1), PowerShell 5.1. Se preservaron los codigos de salida reales de cada comando (sin `grep`/`tail` que los oculten).

| Verificacion | Comando | Resultado |
| --- | --- | --- |
| Type-check | `npm run typecheck` (en `backend/`) | exit `0`, sin errores |
| Build | `npm run build` (en `backend/`) | exit `0` |
| Pruebas unitarias + integracion en Docker | `docker compose -f docker-compose.test.yml run --rm --build backend-test` | exit `0`; `Test Suites: 5 passed, 5 total`; `Tests: 35 passed, 35 total` (35.3 s); limpiado despues con `docker compose -f docker-compose.test.yml down -v` (solo el proyecto `stockguard-test`) |
| Smoke test contra la demostracion en ejecucion | `.\scripts\smoke-test.ps1` | exit `0`; `29 OK, 0 FAIL`; `docker ps`/`docker volume ls` confirmaron `stockguard-gateway/backend/db` y `stockguard-pgdata` sin cambios antes y despues |
| Swagger y servicios de la demostracion | `curl.exe http://localhost:8080/docs` y `/docs/openapi.json` -> 200; `docker compose ps` | los tres servicios `(healthy)`, solo `stockguard-gateway` con puerto publicado |
| **Clon limpio aislado desde `origin/feature/cierre-tecnico`** (proyecto Compose, puerto y volumen propios, sin tocar la demostracion) | `git clone -b feature/cierre-tecnico <remoto> $env:TEMP\sg-clone-verify`; `Copy-Item .env.example .env`; `$env:COMPOSE_PROJECT_NAME="sgclone"; $env:GATEWAY_PORT="18080"; docker compose up --build -d` | Contenedores `sgclone-db/backend/gateway` y volumen `sgclone-pgdata` (sin colisionar con `stockguard-*`); los tres alcanzaron `(healthy)`; log: `Migraciones aplicadas: InitialSchema1760000000000`, `Seed completado: {"categoriesCreated":5,"productsCreated":11,"movementsCreated":9,"movementsReplayed":0}` |
| Swagger y operacion de negocio end-to-end en el clon aislado | `curl.exe http://localhost:18080/docs` -> 200; `POST /categories` -> 201; `POST /products` -> 201 (`stock:0`, SKU normalizado `CC-TEST-01`); `POST /movements` con `Idempotency-Key: cc-verify-0001` -> 201 (`previousStock:0`, `resultingStock:7`, `Idempotent-Replayed:false`) | Flujo completo (categoria -> producto -> movimiento IN) correcto a traves del Gateway en un clon recien descargado |
| Limpieza del clon | `docker compose down -v` (solo el proyecto `sgclone`) + borrado de la carpeta temporal | `stockguard-*`/`stockguard-pgdata` sin cambios (verificado con `docker ps`) |

Conclusion: la version candidata (`c7248b9`) arranca, migra, siembra y responde correctamente desde un clon limpio, de forma aislada de la instancia de demostracion del usuario.
