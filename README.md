# StockGuard - API Gateway + microservicio de control de inventario

**Autor:** Gonzalo Gabriel Apaza Ticona
**Universidad:** Universidad Catolica Boliviana "San Pablo" - Tecnologias Web 2 (segundo parcial)
**Alcance final:** Gateway Nginx + microservicio NestJS/TypeScript + PostgreSQL, orquestados con Docker Compose. **No incluye frontend**: la demostracion se realiza con Swagger UI, Postman y cURL a traves del Gateway.

> Repositorio publico: <https://github.com/gonzaloapaza-creator/segundo_examen_Web2>
> Rama estable: `main` (version tecnica `v1.0.0`). Rama de integracion continua: `develop`. Ver la seccion 17 para el detalle de Git Flow y el commit exacto etiquetado.

## Indice

1. [Problema de negocio y alcance](#1-problema-de-negocio-y-alcance)
2. [Arquitectura](#2-arquitectura)
3. [Tecnologias y versiones](#3-tecnologias-y-versiones)
4. [Requisitos](#4-requisitos)
5. [Clonacion](#5-clonacion)
6. [Configuracion (.env)](#6-configuracion-env)
7. [Arranque desde cero](#7-arranque-desde-cero)
8. [Actualizar una instalacion existente](#8-actualizar-una-instalacion-existente)
9. [Swagger, OpenAPI y salud](#9-swagger-openapi-y-salud)
10. [Migraciones y seed](#10-migraciones-y-seed)
11. [Ejemplos cURL a traves del Gateway](#11-ejemplos-curl-a-traves-del-gateway)
12. [Postman](#12-postman)
13. [Pruebas](#13-pruebas)
14. [Logs y trazabilidad](#14-logs-y-trazabilidad)
15. [Persistencia, detencion y reinicio](#15-persistencia-detencion-y-reinicio)
16. [Solucion de problemas](#16-solucion-de-problemas)
17. [Flujo de ramas (Git Flow)](#17-flujo-de-ramas-git-flow)
18. [Limitaciones](#18-limitaciones)
19. [Documentacion adicional](#19-documentacion-adicional)

## 1. Problema de negocio y alcance

Una pequena tienda de accesorios tecnologicos necesita controlar su catalogo y existencias evitando: diferencias de inventario, salidas superiores al stock, falta de historial, dificultad para detectar reposiciones y movimientos duplicados por reintentos del cliente.

StockGuard resuelve esto con:

- **Categorias y productos** con CRUD completo; el stock **solo** cambia mediante movimientos.
- **Movimientos de inventario** (`IN`/`OUT`) como registros **inmutables y auditables** (sin PATCH/DELETE), con `previousStock`/`resultingStock` calculados en el servidor dentro de **una transaccion PostgreSQL con bloqueo de fila**. Las correcciones se hacen por **compensacion** (reversiones vinculadas al original).
- **Idempotencia** obligatoria (`Idempotency-Key`) persistida en PostgreSQL: reintentar no duplica; reutilizar la clave con otro contenido da 409.
- **Reportes** de stock bajo y resumen.
- **Gateway Nginx** como unico punto de entrada con CORS, logs JSON, rate limiting y trazabilidad (`X-Request-ID`).

Fuera de alcance: frontend, autenticacion/roles, pagos/facturacion, multiples almacenes, notificaciones, Redis, despliegue publico.

## 2. Arquitectura

```
Cliente (Swagger UI / Postman / cURL)
        |  HTTP :8080  (unico puerto publicado)
        v
+-----------------------+       HTTP :3000 (red interna)      +----------------------+     TCP :5432 (red interna)   +--------------------+
|  gateway (Nginx 1.28) | ---------------------------------->  | backend (NestJS 11)  | --------------------------->  | db (PostgreSQL 16) |
|  CORS, logs, 429,     |  X-Request-ID, X-Forwarded-*         | /api/v1, /docs       |  TypeORM, transacciones,      | volumen            |
|  X-Request-ID, /docs  |                                      | migraciones, seed    |  SELECT ... FOR UPDATE        | stockguard-pgdata  |
+-----------------------+                                      +----------------------+                               +--------------------+
                       red bridge: stockguard-net (docker compose)
```

Rutas publicas: `/api/v1/*` (API), `/docs` (Swagger UI), `/docs/openapi.json` y `/docs/openapi.yaml` (OpenAPI), `/health` (Nginx), `/api/v1/health/live|ready` (backend), `/` (pagina estatica de bienvenida con enlaces).

Diagramas C4 editables (PlantUML) y exportados: [`docs/diagrams/`](docs/diagrams/) (`c4-level1-context.*`, `c4-level2-containers.*`).

Estructura del repositorio:

```
backend/                 microservicio NestJS (src/, test/, Dockerfile)
gateway/                 Nginx (Dockerfile, nginx.conf, templates/, snippets/, html/)
docs/                    dominio, reglas, endpoints, decisiones, guion, rubrica, resultados, base para el informe, guia de pruebas, diagramas C4
postman/                 coleccion + entorno (y generador build-collection.js)
scripts/                 smoke-test.ps1 / smoke-test.sh
docker-compose.yml       gateway + backend + db (demostracion)
docker-compose.test.yml  PostgreSQL efimero + runner de pruebas de integracion (sin puertos publicados)
docker-compose.test.host.yml  override opcional que publica el PostgreSQL de pruebas en 127.0.0.1
.env.example             variables de entorno (copiar a .env)
```

## 3. Tecnologias y versiones

Versiones tomadas de `backend/package.json`, `backend/package-lock.json` y los Dockerfiles (sin etiquetas `latest`).

| Componente | Version |
| --- | --- |
| Node.js | 22 LTS (`node:22.21.1-alpine`) |
| NestJS | 11.2.7 (`@nestjs/common`, `core`, `platform-express`; `@nestjs/config` 4.0.4; `@nestjs/swagger` 11.4.7; `@nestjs/typeorm` 11.0.3) |
| TypeScript | 5.9.3 |
| TypeORM / pg | 0.3.31 / 8.23.1 |
| class-validator / class-transformer | 0.14.2 / 0.5.1 |
| Jest / ts-jest / supertest | 30.5.2 / 29.4.14 / 7.3.1 |
| PostgreSQL | 16.15 (`postgres:16.15-alpine`) |
| Nginx | 1.28.2 (`nginx:1.28.2-alpine`) |
| Docker / Compose | Docker Engine 29.8.2, Compose v5.5.1 (entorno donde se verifico; se requiere Compose v2 o superior) |

Justificacion detallada en [`docs/04-decisiones-tecnicas.md`](docs/04-decisiones-tecnicas.md).

## 4. Requisitos

- **Docker Desktop** (Windows/macOS) o Docker Engine + Compose v2 (Linux). Es lo unico necesario para la demostracion.
- Git.
- Opcional: Node.js >= 22 y npm (solo para desarrollar o ejecutar pruebas fuera de Docker), Postman, Java 21 (solo para regenerar los diagramas PlantUML).

No es necesario instalar PostgreSQL ni Node.js en el host.

## 5. Clonacion

```powershell
git clone -b main https://github.com/gonzaloapaza-creator/segundo_examen_Web2.git stockguard
cd stockguard
```

`main` contiene la version estable `v1.0.0`. Para ver el trabajo de integracion mas reciente (puede incluir cambios no publicados en `main` todavia): `git clone -b develop ...`.

## 6. Configuracion (.env)

Solo en la **instalacion inicial**, copiar el ejemplo y, si se desea, ajustar valores. **Nunca** versionar `.env`.

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```bash
# Linux / macOS / Git Bash
cp .env.example .env
```

| Variable | Por defecto | Descripcion |
| --- | --- | --- |
| `GATEWAY_PORT` | `8080` | Unico puerto publicado en el host |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173\|http://127.0.0.1:5173\|http://localhost:8080` | Origenes permitidos separados por `\|` (lista blanca exacta). `localhost:5173` es un origen de ejemplo para demostrar el preflight permitido |
| `RATE_LIMIT_RPS` / `RATE_LIMIT_BURST` | `10` / `20` | Limite por IP (peticiones/segundo y rafaga) |
| `CLIENT_MAX_BODY_SIZE` | `1m` | Tamano maximo del cuerpo |
| `PROXY_READ_TIMEOUT` / `PROXY_CONNECT_TIMEOUT` | `30` / `5` | Segundos |
| `BACKEND_PORT` | `3000` | Puerto interno del backend |
| `NODE_ENV` / `LOG_LEVEL` | `production` / `log` | |
| `SEED_ON_START` | `true` | Carga datos de demostracion (idempotente) |
| `PAGINATION_MAX_LIMIT` | `100` | Limite maximo por pagina |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `stockguard` / `stockguard` / `change_me_local_only` | Credenciales **solo para demostracion local**; cambiarlas en `.env` |

Opcional: `COMPOSE_PROJECT_NAME` (por defecto `stockguard`) define el prefijo de los contenedores (`stockguard-gateway`, `-backend`, `-db`) y del volumen (`stockguard-pgdata`). Permite levantar una segunda instancia aislada sin colisiones (ver seccion 13).

## 7. Arranque desde cero

```powershell
Copy-Item .env.example .env        # solo la primera vez
docker compose up --build -d
docker compose ps
```

Esperar hasta que los tres servicios muestren `(healthy)` (el backend tarda unos 20-30 s: aplica migraciones y seed antes de aceptar trafico):

```
NAME                 STATUS                   PORTS
stockguard-backend   Up ... (healthy)         3000/tcp
stockguard-db        Up ... (healthy)         5432/tcp
stockguard-gateway   Up ... (healthy)         0.0.0.0:8080->80/tcp
```

Solo `stockguard-gateway` publica un puerto. Luego abrir **http://localhost:8080/docs**.

## 8. Actualizar una instalacion existente

Si ya se tiene el proyecto en marcha, **no** sobrescribir el `.env` (conserva credenciales y datos del volumen):

```powershell
git pull
docker compose up --build -d      # reconstruye imagenes; conserva el volumen y los datos
docker compose ps
```

Si `.env.example` incorporo variables nuevas, agregarlas manualmente al `.env` (todas tienen valor por defecto en `docker-compose.yml`, asi que no es obligatorio).

## 9. Swagger, OpenAPI y salud

| URL | Descripcion |
| --- | --- |
| http://localhost:8080/docs | Swagger UI ("Try it out" envia las peticiones al mismo origen, es decir, al Gateway) |
| http://localhost:8080/docs/openapi.json | OpenAPI 3 en JSON |
| http://localhost:8080/docs/openapi.yaml | OpenAPI 3 en YAML |
| http://localhost:8080/health | Salud del Gateway (Nginx, sin pasar por el backend) |
| http://localhost:8080/api/v1/health/live | Liveness del backend |
| http://localhost:8080/api/v1/health/ready | Readiness del backend (`SELECT 1` en PostgreSQL; **503** si la BD no responde) |
| http://localhost:8080/api/v1/reports/summary | Resumen de inventario |
| http://localhost:8080/ | Pagina de bienvenida con enlaces |

Swagger esta agrupado por modulo (Categorias, Productos, Movimientos, Reportes, Salud) con DTO, ejemplos, respuestas de error, filtros/paginacion y la cabecera `Idempotency-Key` documentada.

```powershell
curl.exe -s http://localhost:8080/docs/openapi.json -o openapi.json
```

## 10. Migraciones y seed

- Las migraciones (`backend/src/database/migrations/`) se ejecutan **automaticamente al arrancar el backend**, antes de aceptar trafico. Si fallan, el contenedor termina con error (visible en `docker compose logs backend`) y no pasa a `healthy`.
- `synchronize` esta deshabilitado: el esquema solo cambia por migraciones versionadas.
- Seed de demostracion (5 categorias, 11 productos con stock normal, bajo y cero, 9 entradas iniciales): se ejecuta al arrancar si `SEED_ON_START=true`. Es **idempotente**: repetirlo no duplica datos ni modifica stock cambiado por el usuario (las entradas iniciales usan claves de idempotencia `seed-initial-<SKU>`; en arranques posteriores el log muestra `movementsReplayed: 9`).

```powershell
# Ejecutar el seed manualmente dentro de Docker
docker compose exec backend node dist/database/seed/run-seed.js

# Ver migraciones aplicadas
docker compose exec db psql -U stockguard -d stockguard -c "SELECT * FROM typeorm_migrations"

# Ver restricciones de la tabla de movimientos
docker compose exec db psql -U stockguard -d stockguard -c "\d inventory_movements"
```

Desarrollo fuera de Docker (opcional, requiere Node.js y un PostgreSQL accesible; ver `backend/.env.example`):

```powershell
cd backend
npm ci
Copy-Item .env.example .env   # ajustar POSTGRES_*
npm run start:dev             # ejecuta migraciones al arrancar
```

## 11. Ejemplos cURL a traves del Gateway

### Windows PowerShell

Usar `curl.exe` (el alias `curl` apunta a `Invoke-WebRequest`). **Importante:** en PowerShell los cuerpos JSON escritos en linea con `\"` **no** llegan bien a `curl.exe`; la forma fiable (verificada en Windows PowerShell 5.1) es escribir el JSON en un archivo con `Set-Content -Encoding ASCII` y enviarlo con `-d "@archivo"`. Dentro de una cadena PowerShell con comillas dobles, las comillas del JSON se escriben duplicadas (`""`).

```powershell
$B = "http://localhost:8080/api/v1"

# 1) Crear categoria
'{"name":"Gaming","description":"Perifericos gamer"}' | Set-Content -Encoding ASCII body.json
curl.exe -i -X POST "$B/categories" -H "Content-Type: application/json" -d "@body.json"
# Copiar el "id" de la respuesta:
$C = "<categoryId>"

# 2) Crear producto (nace con stock 0; "stock" NO se acepta en el body)
"{""sku"":""mou-gm-01"",""name"":""Mouse gamer"",""referencePrice"":""129.90"",""minimumStock"":3,""categoryId"":""$C""}" | Set-Content -Encoding ASCII body.json
curl.exe -i -X POST "$B/products" -H "Content-Type: application/json" -d "@body.json"
$P = "<productId>"

# 3) Listar productos activos con busqueda y paginacion
curl.exe -s "$B/products?search=mouse&page=1&limit=5&sortBy=name&order=asc"

# 4) Entrada de inventario (Idempotency-Key obligatoria)
"{""productId"":""$P"",""type"":""IN"",""quantity"":10,""reason"":""Compra a proveedor""}" | Set-Content -Encoding ASCII body.json
curl.exe -i -X POST "$B/movements" -H "Content-Type: application/json" -H "Idempotency-Key: compra-2026-0001" -d "@body.json"

# 5) Reintento con la MISMA clave y el mismo cuerpo -> 201, Idempotent-Replayed: true, mismo id, stock sin cambios
curl.exe -i -X POST "$B/movements" -H "Content-Type: application/json" -H "Idempotency-Key: compra-2026-0001" -d "@body.json"

# 6) Salida
"{""productId"":""$P"",""type"":""OUT"",""quantity"":4,""reason"":""Venta mostrador""}" | Set-Content -Encoding ASCII body.json
curl.exe -i -X POST "$B/movements" -H "Content-Type: application/json" -H "Idempotency-Key: venta-2026-0001" -d "@body.json"
$M = "<movementId de la salida>"

# 7) Reversion (compensacion) de la salida
'{"reason":"Venta anulada"}' | Set-Content -Encoding ASCII body.json
curl.exe -i -X POST "$B/movements/$M/reversal" -H "Content-Type: application/json" -H "Idempotency-Key: rev-2026-0001" -d "@body.json"

# 8) Historial del producto, reportes
curl.exe -s "$B/movements?productId=$P&order=desc"
curl.exe -s "$B/reports/low-stock"
curl.exe -s "$B/reports/summary"

# 9) Baja logica (solo con stock 0)
curl.exe -i -X DELETE "$B/products/$P"

# 10) CORS preflight (origen permitido)
curl.exe -i -X OPTIONS "$B/movements" -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type, idempotency-key"
```

### Linux / macOS / Git Bash

```bash
B=http://localhost:8080/api/v1
curl -i -X POST $B/categories -H 'Content-Type: application/json' -d '{"name":"Gaming","description":"Perifericos gamer"}'
curl -i -X POST $B/products -H 'Content-Type: application/json' \
  -d '{"sku":"mou-gm-01","name":"Mouse gamer","referencePrice":"129.90","minimumStock":3,"categoryId":"<categoryId>"}'
curl -i -X POST $B/movements -H 'Content-Type: application/json' -H 'Idempotency-Key: compra-2026-0001' \
  -d '{"productId":"<productId>","type":"IN","quantity":10,"reason":"Compra a proveedor"}'
curl -i -X POST $B/movements/<movementId>/reversal -H 'Content-Type: application/json' -H 'Idempotency-Key: rev-2026-0001' \
  -d '{"reason":"Venta anulada"}'
```

Tabla completa de endpoints y codigos de error: [`docs/03-endpoints.md`](docs/03-endpoints.md). Secuencia completa de pruebas manuales: [`docs/GUIA_PRUEBAS_Y_CAPTURAS.md`](docs/GUIA_PRUEBAS_Y_CAPTURAS.md).

## 12. Postman

1. Importar `postman/StockGuard.postman_collection.json` y `postman/StockGuard.postman_environment.json`.
2. Seleccionar el entorno **StockGuard - Local (Gateway)** (`baseUrl = http://localhost:8080`).
3. Ejecutar las carpetas en orden (00 a 07) manualmente o con el **Collection Runner**.

La coleccion captura automaticamente `categoryId`, `productId`, `movementInId`, `movementOutId` y `reversalId`. Las claves de idempotencia (`idemKeyIn`, `idemKeyOut`, `idemKeyReversal`) se generan **una sola vez por ejecucion** y las peticiones de reintento las **reutilizan deliberadamente** para demostrar el replay y el conflicto 409. La ultima peticion limpia `runId` para permitir una nueva ejecucion.

Ejecucion por linea de comandos (opcional, requiere Node.js):

```powershell
npx newman@6 run postman/StockGuard.postman_collection.json -e postman/StockGuard.postman_environment.json
```

La coleccion se genera desde `postman/build-collection.js` (`node postman/build-collection.js`).

## 13. Pruebas

### Pruebas automatizadas (unitarias + integracion con PostgreSQL real)

Dentro de Docker (recomendado; no requiere Node.js en el host ni puertos publicados). Usa un PostgreSQL **efimero y separado** (`stockguard_test`, credenciales propias, red interna):

```powershell
docker compose -f docker-compose.test.yml run --rm --build backend-test
docker compose -f docker-compose.test.yml down -v
```

El comando devuelve el codigo de salida de Jest (0 = todo pasa). Resultado esperado: `Test Suites: 5 passed, Tests: 35 passed`.

Desde el host (opcional, requiere Node.js >= 22). Publicar el PostgreSQL de pruebas en loopback con el override:

```powershell
docker compose -f docker-compose.test.yml -f docker-compose.test.host.yml up -d db-test
cd backend
npm ci
npm test                     # unitarias + integracion
npm run test:integration     # solo integracion
npm run test:unit            # solo unitarias
cd ..
docker compose -f docker-compose.test.yml -f docker-compose.test.host.yml down -v
```

Si `55432` esta reservado en Windows, elegir otro puerto antes de levantar `db-test`: `$env:TEST_DB_PORT = "56432"; $env:TEST_POSTGRES_PORT = "56432"`.

> **Advertencia (destructivo):** las pruebas de integracion **TRUNCAN** las tablas de la base de datos de pruebas. Protecciones: `test/setup-env.ts` ignora las variables `POSTGRES_*` del `.env` de demostracion y solo usa `TEST_POSTGRES_*` (por defecto el contenedor `db-test`); `test/test-app.ts` aborta si `NODE_ENV != test`, si el nombre de la BD no termina en `_test` o si la BD realmente conectada (`current_database()`) no coincide con la configurada. Nunca apuntarlas al volumen de demostracion.

Cobertura funcional: CRUD y restricciones de unicidad, validaciones, baja logica, bloqueo de eliminacion de categorias, entradas/salidas, stock insuficiente, transaccion revertida ante fallo, **dos salidas simultaneas por la ultima unidad**, reintentos idempotentes secuenciales y **simultaneos**, misma clave con contenido distinto, reversiones (valida, doble, de compensacion, stock insuficiente, concurrente), reportes, salud y seed idempotente.

### Smoke test del sistema completo (a traves del Gateway)

```powershell
.\scripts\smoke-test.ps1              # Windows PowerShell 5.1 / PowerShell 7
```

```bash
bash scripts/smoke-test.sh            # Git Bash / Linux / macOS
```

Verifica salud, Swagger, CRUD, validaciones, idempotencia, concurrencia (dos salidas simultaneas), reversion, reportes, CORS y rate limiting (29 comprobaciones; codigo de salida 1 si alguna falla). Crea datos con prefijo `SMOKE-<timestamp>` y da de baja el producto al final; **no** borra datos de demostracion.

### Segunda instancia aislada (por ejemplo, validar un clon limpio)

```powershell
$env:COMPOSE_PROJECT_NAME = "sgclone"; $env:GATEWAY_PORT = "18080"
docker compose up --build -d          # contenedores sgclone-*, volumen sgclone-pgdata, puerto 18080
docker compose down -v                # elimina SOLO la instancia sgclone
Remove-Item Env:COMPOSE_PROJECT_NAME, Env:GATEWAY_PORT
```

Resultados reales de todas las verificaciones: [`docs/08-resultados-verificacion.md`](docs/08-resultados-verificacion.md).

## 14. Logs y trazabilidad

```powershell
docker compose ps                                   # estado y healthchecks
docker compose logs -f gateway                      # logs JSON de Nginx (time, request_id, method, path, status, duration_ms, upstream_status)
docker compose logs -f backend                      # logs del backend (JSON por peticion con requestId)
docker compose logs --no-log-prefix gateway | Select-String "<requestId>"   # correlacionar por X-Request-ID
docker compose logs --no-log-prefix backend | Select-String "<requestId>"
```

Los logs **no** contienen cuerpos ni cabeceras sensibles; solo metodo, ruta (sin query string), estado, duracion y `requestId`. El Gateway genera `X-Request-ID` en cada peticion (reemplaza cualquier valor enviado por el cliente), lo devuelve al cliente y lo propaga al backend, que lo incluye en su log y en todos los errores JSON.

Rate limiting: la respuesta `429` es JSON (`code: RATE_LIMITED`). Para observarlo en Windows hay que enviar las peticiones por una sola conexion (lanzar 60 procesos `curl.exe` separados no alcanza 10 req/s):

```powershell
$u = 1..60 | ForEach-Object { "-o"; "NUL"; "http://localhost:8080/api/v1/categories?limit=1" }
curl.exe -s -w "%{http_code}`n" @u | Sort-Object | Group-Object | Select-Object Name, Count
```

## 15. Persistencia, detencion y reinicio

| Accion | Comando | Efecto sobre los datos |
| --- | --- | --- |
| Detener contenedores | `docker compose stop` | Datos conservados (volumen y contenedores) |
| Reanudar | `docker compose start` | - |
| Eliminar contenedores y red | `docker compose down` | **Datos conservados** en el volumen `stockguard-pgdata` |
| Recrear las imagenes | `docker compose up --build -d` | Datos conservados; migraciones ya aplicadas se omiten; seed reproduce sin duplicar |
| Eliminar tambien el volumen | `docker compose down -v` | **Se pierden todos los datos** (destructivo). El siguiente `up` migra y siembra de nuevo |

Verificacion realizada: tras `docker compose down` + `docker compose up -d`, `GET /api/v1/reports/summary` devolvio los mismos valores y el backend registro `Esquema al dia` y `movementsReplayed: 9` (ver `docs/08-resultados-verificacion.md`).

## 16. Solucion de problemas

| Sintoma | Causa probable | Solucion |
| --- | --- | --- |
| `Defina POSTGRES_PASSWORD en .env` al hacer `docker compose up` | Falta `.env` | `Copy-Item .env.example .env` |
| `port is already allocated` en 8080 | Otro proceso usa el puerto | Cambiar `GATEWAY_PORT` en `.env` y volver a `docker compose up -d` |
| `backend` no llega a `healthy` | Migracion fallida o BD no lista | `docker compose logs backend`; verificar credenciales; `docker compose down -v` solo si se acepta perder datos |
| Swagger no carga en `/docs` | Backend aun arrancando | Esperar a `healthy`; `docker compose ps` |
| 503 `SERVICE_UNAVAILABLE` en todas las rutas `/api/v1` | Backend caido o reiniciando | `docker compose ps`, `docker compose logs backend` |
| 503 solo en `/api/v1/health/ready` | PostgreSQL detenido | `docker compose start db` |
| 429 durante la demo | Rate limiting | Esperar unos segundos o subir `RATE_LIMIT_RPS`/`RATE_LIMIT_BURST` en `.env` y `docker compose up -d gateway` |
| El navegador bloquea peticiones desde otro origen | Origen no esta en `CORS_ALLOWED_ORIGINS` | Agregarlo (separado por `\|`) y `docker compose up -d gateway` |
| `curl` en PowerShell muestra errores raros o `400` con "Expected property name" | Alias de `Invoke-WebRequest` o comillas del JSON | Usar `curl.exe` y enviar el JSON desde archivo (`-d "@body.json"`), ver seccion 11 |
| Las pruebas de integracion fallan con `ECONNREFUSED` | No hay PostgreSQL de pruebas | Usar el runner en Docker o levantar `db-test` con el override `docker-compose.test.host.yml` |
| `ports are not available: ... 127.0.0.1:55432 ... forbidden by its access permissions` | Windows reservo ese puerto (ver `netsh interface ipv4 show excludedportrange protocol=tcp`) | No hace falta el puerto para el runner en Docker. Para pruebas desde el host usar otro: `$env:TEST_DB_PORT = "56432"; $env:TEST_POSTGRES_PORT = "56432"` |
| `Proteccion de BD de pruebas: ...` al ejecutar Jest | La conexion no apunta a una BD `_test` | Revisar `TEST_POSTGRES_*`; nunca apuntar a la BD de demostracion |
| `npm ci` falla por version de Node | Node < 22 | Instalar Node 22 LTS o usar solo Docker |
| Cambios en `.env` no se aplican | Contenedores ya creados | `docker compose up -d` (recrea los afectados) |

## 17. Flujo de ramas (Git Flow)

- `main`: versiones estables (`v1.0.0` = version tecnica del sistema, publicada).
- `develop`: integracion continua.
- `feature/*` y `fix/*`: una rama por bloque funcional o correccion, integradas en `develop` mediante merge `--no-ff` o Pull Request.
- `release/*`: preparacion de la version estable, fusionada en `main` (etiqueta) y de vuelta en `develop`.

| Rama | Contenido principal |
| --- | --- |
| `feature/backend-foundation` | Scaffold NestJS, configuracion, migraciones, CRUD, movimientos transaccionales con idempotencia y reversiones, seed, pruebas de integracion, Dockerfile multi-etapa |
| `feature/gateway` | Nginx (CORS, logs JSON, rate limiting, X-Request-ID), Docker Compose con healthchecks y runner de pruebas, smoke tests |
| `feature/docs` | Coleccion Postman, documentacion inicial |
| `fix/line-endings` | `.gitattributes` con LF (hallado al probar un clon limpio en Windows) |
| `fix/tsconfig-forward-compat` | `moduleResolution node16` y puerto de BD de pruebas configurable |
| `feature/cierre-tecnico` | Cierre final: alcance sin frontend, entorno de pruebas aislado, nombres de Compose parametrizables, `requestId` en errores de JSON malformado, README/docs/C4 definitivos, base para el informe y guia de pruebas (integrada en `develop` mediante PR `#2`) |
| `release/1.0.0` | Ajustes finales de release (version estable del README y la documentacion); fusionada en `main` y de vuelta en `develop` |

### Estado real verificado (ver `docs/08-resultados-verificacion.md` para el detalle completo)

- `main` contiene el merge de `release/1.0.0` (todo el codigo de `backend/`, `gateway/`, Docker Compose, documentacion, Postman y diagramas) y esta etiquetado `v1.0.0`.
- `develop` contiene el mismo contenido (la release se fusiono de vuelta) mas el historial completo de `feature/*`/`fix/*`.
- El PR `#1` (`feature/gateway` -> `main`), creado automaticamente por GitHub al publicar esa rama el 2026-10-12, quedo desactualizado antes de `feature/docs`, los `fix/*` y `feature/cierre-tecnico`; su contenido ya esta integrado en `main` por otra via (via `develop` y la release), por lo que se cerro sin fusionar.
- El PR `#2` (`feature/cierre-tecnico` -> `develop`) se fusiono con merge commit, conservando el historial.
- Verificar el estado exacto en cualquier momento con: `git fetch origin --tags`, `git log --oneline -1 origin/main`, `git log --oneline -1 origin/develop`, `git show v1.0.0 --no-patch --format=%H`.

Historial: `git log --oneline --graph --all`.

## 18. Limitaciones

- Sin autenticacion ni autorizacion: **solo para demostracion local**; no desplegar publicamente tal cual. CORS es una politica del navegador y **no** sustituye la autenticacion.
- Sin frontend propio: los clientes son Swagger UI, Postman y cURL (decision de alcance del examen).
- No hay reactivacion de productos dados de baja ni borrado fisico de productos.
- Un solo almacen; sin costos ni valorizacion de inventario (el precio es referencial y se maneja como cadena decimal).
- HTTP sin TLS.
- El rate limiting es por IP de socket; detras de otro proxy todos los clientes compartirian el limite.
- El registro de idempotencia no caduca (no hay limpieza periodica de `idempotency_records`).

## 19. Documentacion adicional

| Documento | Contenido |
| --- | --- |
| [`docs/BASE_PARA_INFORME.md`](docs/BASE_PARA_INFORME.md) | Base tecnica completa para redactar el informe (arquitectura, modelo de datos, implementacion, pruebas, rubrica) |
| [`docs/GUIA_PRUEBAS_Y_CAPTURAS.md`](docs/GUIA_PRUEBAS_Y_CAPTURAS.md) | Secuencia paso a paso de pruebas manuales y capturas (PowerShell, Swagger, Postman) |
| [`docs/01-dominio.md`](docs/01-dominio.md) | Problema, entidades, glosario |
| [`docs/02-reglas-de-negocio.md`](docs/02-reglas-de-negocio.md) | Reglas, codigos de error, idempotencia, concurrencia |
| [`docs/03-endpoints.md`](docs/03-endpoints.md) | Tabla de endpoints y cabeceras |
| [`docs/04-decisiones-tecnicas.md`](docs/04-decisiones-tecnicas.md) | Versiones y justificacion tecnica |
| [`docs/05-guion-demostracion.md`](docs/05-guion-demostracion.md) | Guion resumido para la defensa |
| [`docs/06-matriz-rubrica.md`](docs/06-matriz-rubrica.md) | Cumplimiento de la rubrica |
| [`docs/08-resultados-verificacion.md`](docs/08-resultados-verificacion.md) | Resultados reales de las verificaciones tecnicas |
| [`docs/diagrams/`](docs/diagrams/) | C4 nivel 1 y 2 (PlantUML + PNG/SVG) |
