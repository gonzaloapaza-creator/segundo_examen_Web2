# StockGuard - API de control de inventario

**Autor:** Gonzalo Gabriel Apaza Ticona
**Universidad:** Universidad Catolica Boliviana "San Pablo" - Tecnologias Web 2 (segundo parcial)
**Fase:** 1 de 2 (backend + Gateway + base de datos). El frontend React/Vite y el informe PDF corresponden a la fase 2.

> Repositorio publico: <https://github.com/gonzaloapaza-creator/segundo_examen_Web2> (rama de integracion: `develop`).

## Indice

1. [Problema de negocio y alcance](#1-problema-de-negocio-y-alcance)
2. [Arquitectura](#2-arquitectura)
3. [Tecnologias y versiones](#3-tecnologias-y-versiones)
4. [Requisitos](#4-requisitos)
5. [Clonacion](#5-clonacion)
6. [Configuracion (.env)](#6-configuracion-env)
7. [Arranque desde cero](#7-arranque-desde-cero)
8. [Swagger y OpenAPI](#8-swagger-y-openapi)
9. [Migraciones y seed](#9-migraciones-y-seed)
10. [Ejemplos cURL a traves del Gateway](#10-ejemplos-curl-a-traves-del-gateway)
11. [Postman](#11-postman)
12. [Pruebas](#12-pruebas)
13. [Logs y salud](#13-logs-y-salud)
14. [Persistencia, detencion y reinicio](#14-persistencia-detencion-y-reinicio)
15. [Solucion de problemas](#15-solucion-de-problemas)
16. [Flujo de ramas (Git Flow)](#16-flujo-de-ramas-git-flow)
17. [Limitaciones de la fase 1](#17-limitaciones-de-la-fase-1)
18. [Documentacion adicional](#18-documentacion-adicional)

## 1. Problema de negocio y alcance

Una pequena tienda de accesorios tecnologicos necesita controlar su catalogo y existencias evitando: diferencias de inventario, salidas superiores al stock, falta de historial, dificultad para detectar reposiciones y movimientos duplicados por reintentos del cliente.

StockGuard resuelve esto con:

- **Categorias y productos** con CRUD; el stock **solo** cambia mediante movimientos.
- **Movimientos de inventario** (`IN`/`OUT`) inmutables y auditables, con `previousStock`/`resultingStock` calculados en el servidor dentro de **una transaccion PostgreSQL con bloqueo de fila**.
- **Reversiones** (movimientos compensatorios) vinculadas al original.
- **Idempotencia** obligatoria (`Idempotency-Key`) persistida en PostgreSQL.
- **Reportes** de stock bajo y resumen.
- **Gateway Nginx** como unico punto de entrada con CORS, logs JSON, rate limiting y trazabilidad (`X-Request-ID`).

Fuera de alcance en esta fase: frontend, autenticacion/roles, pagos/facturacion, multiples almacenes, notificaciones, Redis, despliegue publico.

## 2. Arquitectura

```
Cliente (Postman / cURL / Swagger UI / futuro frontend)
        |  HTTP :8080  (unico puerto publicado)
        v
+-----------------------+       HTTP :3000 (red interna)      +----------------------+     TCP :5432 (red interna)   +--------------------+
|  gateway (Nginx 1.28) | ---------------------------------->  | backend (NestJS 11)  | --------------------------->  | db (PostgreSQL 16) |
|  CORS, logs, 429,     |  X-Request-ID, X-Forwarded-*         | /api/v1, /docs       |  TypeORM, transacciones,      | volumen            |
|  X-Request-ID, /docs  |                                      | migraciones, seed    |  SELECT ... FOR UPDATE        | stockguard-pgdata  |
+-----------------------+                                      +----------------------+                               +--------------------+
                       red bridge: stockguard-net (docker compose)
```

Rutas publicas: `/api/v1/*` (API), `/docs` (Swagger UI), `/docs/openapi.json` y `/docs/openapi.yaml` (OpenAPI), `/health` (Nginx), `/api/v1/health/live|ready` (backend), `/` (placeholder estatico reservado para el frontend de la fase 2).

Diagramas C4 editables (PlantUML) y exportados: [`docs/diagrams/`](docs/diagrams/).

Estructura del repositorio:

```
backend/            microservicio NestJS (src/, test/, Dockerfile)
gateway/            Nginx (Dockerfile, nginx.conf, templates/, snippets/, html/)
docs/               dominio, reglas, endpoints, decisiones, guion, rubrica, evidencias, resultados, diagramas C4
postman/            coleccion + entorno (y generador build-collection.js)
scripts/            smoke-test.ps1 / smoke-test.sh
docker-compose.yml  gateway + backend + db (demostracion)
docker-compose.test.yml  PostgreSQL efimero + runner de pruebas de integracion
.env.example        variables de entorno (copiar a .env)
```

## 3. Tecnologias y versiones

| Componente | Version |
| --- | --- |
| Node.js | 22 LTS (`node:22.21.1-alpine`) |
| NestJS | 11.2.7 (`@nestjs/common`, `core`, `platform-express`, `config` 4.0.4, `swagger` 11.4.7, `typeorm` 11.0.3) |
| TypeScript | 5.9.3 |
| TypeORM / pg | 0.3.31 / 8.23.1 |
| class-validator / class-transformer | 0.14.2 / 0.5.1 |
| Jest / ts-jest / supertest | 30.5.2 / 29.4.14 / 7.3.1 |
| PostgreSQL | 16.15 (`postgres:16.15-alpine`) |
| Nginx | 1.28.2 (`nginx:1.28.2-alpine`) |
| Docker Compose | v2+ (verificado con Docker Desktop, Engine 29.x, Compose v5.5) |

Dependencias fijadas en `backend/package-lock.json` (instalacion con `npm ci`). Sin imagenes `latest`. Justificacion detallada en [`docs/04-decisiones-tecnicas.md`](docs/04-decisiones-tecnicas.md).

## 4. Requisitos

- **Docker Desktop** (Windows/macOS) o Docker Engine + Compose v2 (Linux). Es lo unico necesario para la demostracion.
- Git.
- Opcional: Node.js >= 22 y npm (solo para desarrollar o ejecutar pruebas fuera de Docker), Postman, Java 21 (solo para regenerar los diagramas PlantUML).

No es necesario instalar PostgreSQL ni Node.js en el host.

## 5. Clonacion

```powershell
git clone -b develop https://github.com/gonzaloapaza-creator/segundo_examen_Web2.git stockguard
cd stockguard
```

(`-b develop` apunta a la rama de integracion con el trabajo de la fase 1; `main` quedara en la release de la fase 2.)

## 6. Configuracion (.env)

Copiar el ejemplo y, si se desea, ajustar valores. **Nunca** versionar `.env`.

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
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173\|http://127.0.0.1:5173\|http://localhost:8080` | Origenes permitidos separados por `\|` (lista blanca exacta) |
| `RATE_LIMIT_RPS` / `RATE_LIMIT_BURST` | `10` / `20` | Limite por IP (peticiones/segundo y rafaga) |
| `CLIENT_MAX_BODY_SIZE` | `1m` | Tamano maximo del cuerpo |
| `PROXY_READ_TIMEOUT` / `PROXY_CONNECT_TIMEOUT` | `30` / `5` | Segundos |
| `BACKEND_PORT` | `3000` | Puerto interno del backend |
| `NODE_ENV` / `LOG_LEVEL` | `production` / `log` | |
| `SEED_ON_START` | `true` | Carga datos de demostracion (idempotente) |
| `PAGINATION_MAX_LIMIT` | `100` | Limite maximo por pagina |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `stockguard` / `stockguard` / `change_me_local_only` | Credenciales **solo para demostracion local**; cambiarlas en `.env` |

## 7. Arranque desde cero

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
```

Esperar hasta que los tres servicios muestren `(healthy)`:

```
NAME                 STATUS                   PORTS
stockguard-backend   Up ... (healthy)         3000/tcp
stockguard-db        Up ... (healthy)         5432/tcp
stockguard-gateway   Up ... (healthy)         0.0.0.0:8080->80/tcp
```

Luego abrir **http://localhost:8080/docs**.

URLs locales:

| URL | Descripcion |
| --- | --- |
| http://localhost:8080/docs | Swagger UI |
| http://localhost:8080/docs/openapi.json | OpenAPI JSON |
| http://localhost:8080/health | Salud del Gateway |
| http://localhost:8080/api/v1/health/ready | Salud del backend (verifica PostgreSQL) |
| http://localhost:8080/api/v1/reports/summary | Resumen de inventario |
| http://localhost:8080/ | Pagina de bienvenida (futuro frontend) |

## 8. Swagger y OpenAPI

- Swagger UI: `GET /docs` (las peticiones "Try it out" se envian al mismo origen, es decir, al Gateway).
- OpenAPI 3: `GET /docs/openapi.json` y `GET /docs/openapi.yaml`.
- Agrupado por modulo (Categorias, Productos, Movimientos, Reportes, Salud), con DTO, ejemplos, respuestas de error, filtros/paginacion y la cabecera `Idempotency-Key` documentada.

Descargar la especificacion:

```powershell
curl.exe -s http://localhost:8080/docs/openapi.json -o openapi.json
```

## 9. Migraciones y seed

- Las migraciones (`backend/src/database/migrations/`) se ejecutan **automaticamente al arrancar el backend**, antes de aceptar trafico. Si fallan, el contenedor termina con error (visible en `docker compose logs backend`) y no pasa a `healthy`.
- `synchronize` esta deshabilitado.
- Seed de demostracion (5 categorias, 11 productos con stock normal, bajo y cero, 9 entradas iniciales): se ejecuta al arrancar si `SEED_ON_START=true`. Es **idempotente**: repetirlo no duplica datos ni modifica stock cambiado por el usuario (las entradas iniciales usan claves de idempotencia `seed-initial-<SKU>`).

Ejecutar el seed manualmente dentro de Docker:

```powershell
docker compose exec backend node dist/database/seed/run-seed.js
```

Ver migraciones aplicadas:

```powershell
docker compose exec db psql -U stockguard -d stockguard -c "SELECT * FROM typeorm_migrations"
```

Desarrollo fuera de Docker (opcional, requiere Node.js y un PostgreSQL accesible; ver `backend/.env.example`):

```powershell
cd backend
npm ci
Copy-Item .env.example .env   # ajustar POSTGRES_*
npm run migration:run         # o simplemente npm run start:dev (ejecuta migraciones al arrancar)
npm run start:dev
```

## 10. Ejemplos cURL a traves del Gateway

En **Windows PowerShell** usar `curl.exe` (el alias `curl` apunta a `Invoke-WebRequest`). En Linux/macOS/Git Bash usar `curl` y comillas simples.

```powershell
# Crear categoria
curl.exe -i -X POST http://localhost:8080/api/v1/categories -H "Content-Type: application/json" -d "{\"name\":\"Gaming\",\"description\":\"Perifericos gamer\"}"

# Listar productos activos con busqueda y paginacion
curl.exe -s "http://localhost:8080/api/v1/products?search=usb&page=1&limit=5&sortBy=name&order=asc"

# Crear producto (nace con stock 0; stock NO se acepta en el body)
curl.exe -i -X POST http://localhost:8080/api/v1/products -H "Content-Type: application/json" -d "{\"sku\":\"mou-gm-01\",\"name\":\"Mouse gamer\",\"referencePrice\":\"129.90\",\"minimumStock\":3,\"categoryId\":\"<categoryId>\"}"

# Entrada de inventario (Idempotency-Key obligatoria)
curl.exe -i -X POST http://localhost:8080/api/v1/movements -H "Content-Type: application/json" -H "Idempotency-Key: compra-2026-0001" -d "{\"productId\":\"<productId>\",\"type\":\"IN\",\"quantity\":10,\"reason\":\"Compra a proveedor\"}"

# Reintento con la MISMA clave -> misma respuesta, Idempotent-Replayed: true, stock sin cambios
curl.exe -i -X POST http://localhost:8080/api/v1/movements -H "Content-Type: application/json" -H "Idempotency-Key: compra-2026-0001" -d "{\"productId\":\"<productId>\",\"type\":\"IN\",\"quantity\":10,\"reason\":\"Compra a proveedor\"}"

# Salida
curl.exe -i -X POST http://localhost:8080/api/v1/movements -H "Content-Type: application/json" -H "Idempotency-Key: venta-2026-0001" -d "{\"productId\":\"<productId>\",\"type\":\"OUT\",\"quantity\":4,\"reason\":\"Venta mostrador\"}"

# Reversion de un movimiento
curl.exe -i -X POST http://localhost:8080/api/v1/movements/<movementId>/reversal -H "Content-Type: application/json" -H "Idempotency-Key: rev-2026-0001" -d "{\"reason\":\"Venta anulada\"}"

# Movimientos de un producto en un rango de fechas
curl.exe -s "http://localhost:8080/api/v1/movements?productId=<productId>&type=OUT&from=2026-10-01T00:00:00Z&to=2026-10-31T23:59:59Z"

# Reportes
curl.exe -s http://localhost:8080/api/v1/reports/low-stock
curl.exe -s http://localhost:8080/api/v1/reports/summary

# Baja logica (solo con stock 0)
curl.exe -i -X DELETE http://localhost:8080/api/v1/products/<productId>

# CORS preflight
curl.exe -i -X OPTIONS http://localhost:8080/api/v1/movements -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type, idempotency-key"
```

Equivalente bash del movimiento:

```bash
curl -i -X POST http://localhost:8080/api/v1/movements -H 'Content-Type: application/json' -H 'Idempotency-Key: compra-2026-0001' \
  -d '{"productId":"<productId>","type":"IN","quantity":10,"reason":"Compra a proveedor"}'
```

Tabla completa de endpoints y codigos de error: [`docs/03-endpoints.md`](docs/03-endpoints.md).

## 11. Postman

1. Importar `postman/StockGuard.postman_collection.json` y `postman/StockGuard.postman_environment.json`.
2. Seleccionar el entorno **StockGuard - Local (Gateway)** (`baseUrl = http://localhost:8080`).
3. Ejecutar las carpetas en orden (00 a 07) manualmente o con el **Collection Runner**.

La coleccion captura automaticamente `categoryId`, `productId`, `movementInId`, `movementOutId` y `reversalId`. Las claves de idempotencia (`idemKeyIn`, `idemKeyOut`, `idemKeyReversal`) se generan **una sola vez por ejecucion** y las peticiones de reintento las **reutilizan deliberadamente** para demostrar el replay y el conflicto 409. La ultima peticion limpia `runId` para permitir una nueva ejecucion.

Ejecucion por linea de comandos (opcional):

```powershell
npx newman@6 run postman/StockGuard.postman_collection.json -e postman/StockGuard.postman_environment.json
```

La coleccion se genera desde `postman/build-collection.js` (`node postman/build-collection.js`).

## 12. Pruebas

### Pruebas automatizadas (unitarias + integracion con PostgreSQL real)

Dentro de Docker (recomendado; no requiere Node.js en el host). Usa una base de datos **efimera y separada** (`stockguard_test`):

```powershell
docker compose -f docker-compose.test.yml run --rm --build backend-test
docker compose -f docker-compose.test.yml down -v
```

Desde el host (requiere Node.js >= 22). El PostgreSQL de pruebas de `docker-compose.test.yml` queda publicado en `127.0.0.1:55432` (configurable con `TEST_DB_PORT`; en ese caso exportar tambien `TEST_POSTGRES_PORT` con el mismo valor):

```powershell
docker compose -f docker-compose.test.yml up -d db-test
cd backend
npm ci
$env:TEST_POSTGRES_PASSWORD = "test_only_password"
npm test                     # unitarias + integracion
npm run test:integration     # solo integracion
npm run test:unit            # solo unitarias
```

> **Advertencia (destructivo):** las pruebas de integracion **TRUNCAN** las tablas de la base de datos de pruebas (`TEST_POSTGRES_DB`, por defecto `stockguard_test`). El helper de pruebas aborta si el nombre de la BD no contiene `test`. Nunca apuntarlas al volumen de demostracion.

Cobertura funcional de las pruebas: CRUD y restricciones de unicidad, validaciones, baja logica, bloqueo de eliminacion de categorias, entradas/salidas, stock insuficiente, transaccion revertida ante fallo, **dos salidas simultaneas por la ultima unidad**, reintentos idempotentes secuenciales y **simultaneos**, misma clave con contenido distinto, reversiones (valida, doble, de compensacion, stock insuficiente, concurrente), reportes, salud y seed idempotente.

### Smoke test del sistema completo (a traves del Gateway)

```powershell
.\scripts\smoke-test.ps1              # Windows PowerShell 5.1 / PowerShell 7
```

```bash
bash scripts/smoke-test.sh            # Git Bash / Linux / macOS
```

Verifica salud, Swagger, CRUD, validaciones, idempotencia, concurrencia (dos salidas simultaneas), reversion, reportes, CORS y rate limiting (29 comprobaciones). Crea datos con prefijo `SMOKE-<timestamp>` y da de baja el producto al final; **no** borra datos de demostracion.

Resultados reales obtenidos: [`docs/08-resultados-verificacion.md`](docs/08-resultados-verificacion.md).

## 13. Logs y salud

```powershell
docker compose ps                                   # estado y healthchecks
docker compose logs -f gateway                      # logs JSON de Nginx (time, request_id, method, path, status, duration_ms, upstream_status)
docker compose logs -f backend                      # logs del backend (JSON por peticion con requestId)
docker compose logs --no-log-prefix gateway | Select-String "<requestId>"   # correlacionar por X-Request-ID
```

Salud:

- `GET /health` -> Nginx.
- `GET /api/v1/health/live` -> proceso del backend.
- `GET /api/v1/health/ready` -> `SELECT 1` en PostgreSQL; responde **503** si la BD no esta disponible (probar con `docker compose stop db`).

Rate limiting: la respuesta `429` es JSON (`code: RATE_LIMITED`). Para observarlo en Windows hay que enviar las peticiones por una sola conexion (lanzar 60 procesos `curl.exe` separados no alcanza 10 req/s):

```powershell
$u = 1..60 | ForEach-Object { "-o"; "NUL"; "http://localhost:8080/api/v1/categories?limit=1" }
curl.exe -s -w "%{http_code}`n" @u | Sort-Object | Group-Object | Select-Object Name, Count
```

## 14. Persistencia, detencion y reinicio

| Accion | Comando | Efecto sobre los datos |
| --- | --- | --- |
| Detener contenedores | `docker compose stop` | Datos conservados (volumen y contenedores) |
| Reanudar | `docker compose start` | - |
| Eliminar contenedores y red | `docker compose down` | **Datos conservados** en el volumen `stockguard-pgdata` |
| Recrear desde cero las imagenes | `docker compose up --build -d` | Datos conservados; migraciones ya aplicadas se omiten; seed reproduce sin duplicar |
| Eliminar tambien el volumen | `docker compose down -v` | **Se pierden todos los datos** (destructivo). El siguiente `up` migra y siembra de nuevo |

Verificacion de persistencia realizada: tras `docker compose down` + `docker compose up -d`, las categorias y movimientos creados durante las pruebas seguian presentes y el seed reporto `movementsReplayed: 9` (ver `docs/08-resultados-verificacion.md`).

## 15. Solucion de problemas

| Sintoma | Causa probable | Solucion |
| --- | --- | --- |
| `Defina POSTGRES_PASSWORD en .env` al hacer `docker compose up` | Falta `.env` | `Copy-Item .env.example .env` |
| `port is already allocated` en 8080 | Otro proceso usa el puerto | Cambiar `GATEWAY_PORT` en `.env` y volver a `docker compose up -d` |
| `backend` no llega a `healthy` | Migracion fallida o BD no lista | `docker compose logs backend`; verificar credenciales; `docker compose down -v` solo si se acepta perder datos |
| Swagger no carga en `/docs` | Backend aun arrancando | Esperar a `healthy`; `docker compose ps` |
| 503 `SERVICE_UNAVAILABLE` en todas las rutas `/api/v1` | Backend caido o reiniciando (`resolver` de Nginx) | `docker compose ps`, `docker compose logs backend` |
| 429 durante la demo | Rate limiting | Esperar unos segundos o subir `RATE_LIMIT_RPS`/`RATE_LIMIT_BURST` en `.env` y `docker compose up -d gateway` |
| El navegador bloquea peticiones desde otro origen | Origen no esta en `CORS_ALLOWED_ORIGINS` | Agregarlo (separado por `\|`) y recrear el gateway |
| `curl` en PowerShell muestra errores raros | Alias de `Invoke-WebRequest` | Usar `curl.exe` |
| Las pruebas de integracion fallan con `ECONNREFUSED` | No hay PostgreSQL de pruebas | `docker compose -f docker-compose.test.yml up -d db-test` o usar el runner en Docker |
| `ports are not available: ... 127.0.0.1:55432 ... forbidden by its access permissions` al levantar `db-test` | Windows reservo ese puerto (ver `netsh interface ipv4 show excludedportrange protocol=tcp`) | Usar otro puerto: `$env:TEST_DB_PORT = "56432"` (PowerShell) o `TEST_DB_PORT=56432` (bash) antes del comando; si se ejecutan las pruebas desde el host, fijar tambien `TEST_POSTGRES_PORT` al mismo valor |
| `npm ci` falla por version de Node | Node < 22 | Instalar Node 22 LTS o usar solo Docker |
| Cambios en `.env` no se aplican | Contenedores ya creados | `docker compose up -d` (recrea los afectados) |

## 16. Flujo de ramas (Git Flow)

- `main`: versiones estables (sin release todavia; la fase 2 cerrara la 1.0).
- `develop`: integracion continua de las funcionalidades.
- `feature/*`: una rama por bloque funcional, integradas en `develop` con merge `--no-ff`.

Ramas y commits creados en esta fase:

| Rama | Commits principales |
| --- | --- |
| `feature/backend-foundation` | `feat: scaffold NestJS backend with config, TypeORM migrations and error handling`, `feat: add category and product CRUD`, `feat: add transactional inventory movements with idempotency and reversals`, `feat: add idempotent demo seed`, `test: verify inventory concurrency, idempotency and catalog rules against PostgreSQL`, `build: add multi-stage backend Dockerfile` |
| `feature/gateway` | `feat: configure gateway controls (CORS, structured logs, rate limiting, request id)`, `build: add container orchestration with healthchecks and test runner`, `test: add end-to-end smoke tests through the gateway` |
| `feature/docs` | `docs: add Postman collection and environment with idempotency flows`, `docs: document API and local setup` |
| `fix/line-endings` | `fix: enforce LF line endings for container scripts and configs` (hallado al probar un clon limpio en Windows) |

| `fix/tsconfig-forward-compat` | `fix: use node16 module resolution and configurable test db port` |

Repositorio remoto publico: <https://github.com/gonzaloapaza-creator/segundo_examen_Web2>. Todas las ramas anteriores estan publicadas (`origin`); el historial de integracion queda en los merges `--no-ff` hacia `develop`, visibles con `git log --graph --oneline develop`.

## 17. Limitaciones de la fase 1

- Sin autenticacion ni autorizacion: **solo para demostracion local**; no desplegar publicamente tal cual. CORS es una politica del navegador y **no** sustituye la autenticacion.
- Sin frontend (ruta `/` reservada; el build de React/Vite se servira como estaticos desde Nginx en la fase 2).
- No hay reactivacion de productos dados de baja ni borrado fisico.
- Un solo almacen; sin costos ni valorizacion de inventario (el precio es referencial).
- HTTP sin TLS.
- Sin release `1.0` ni informe PDF (fase 2).

### Preparacion para la fase 2 (frontend)

- Nginx ya sirve `/` desde `/usr/share/nginx/html` con `try_files ... /index.html` (enrutado SPA). Bastara copiar el build de Vite a esa ruta en el `Dockerfile` del gateway (o un servicio `frontend` de build).
- `CORS_ALLOWED_ORIGINS` incluye `http://localhost:5173` para el servidor de desarrollo de Vite; en produccion local el frontend se servira desde el mismo origen (8080), sin CORS.
- Cabeceras expuestas al navegador: `X-Request-ID`, `Idempotent-Replayed`. Cabecera permitida: `Idempotency-Key`.
- OpenAPI en `/docs/openapi.json` permite generar el cliente TypeScript del frontend.
- Respuestas paginadas uniformes `{ data, meta }` y errores uniformes `{ statusCode, code, message, details, requestId }`.

## 18. Documentacion adicional

| Documento | Contenido |
| --- | --- |
| [`docs/01-dominio.md`](docs/01-dominio.md) | Problema, entidades, glosario |
| [`docs/02-reglas-de-negocio.md`](docs/02-reglas-de-negocio.md) | Reglas, codigos de error, idempotencia, concurrencia |
| [`docs/03-endpoints.md`](docs/03-endpoints.md) | Tabla de endpoints y cabeceras |
| [`docs/04-decisiones-tecnicas.md`](docs/04-decisiones-tecnicas.md) | Versiones y justificacion tecnica |
| [`docs/05-guion-demostracion.md`](docs/05-guion-demostracion.md) | Guion paso a paso para la defensa |
| [`docs/06-matriz-rubrica.md`](docs/06-matriz-rubrica.md) | Cumplimiento de la rubrica |
| [`docs/07-evidencias-para-el-informe.md`](docs/07-evidencias-para-el-informe.md) | Capturas a tomar para el PDF |
| [`docs/08-resultados-verificacion.md`](docs/08-resultados-verificacion.md) | Resultados reales de las verificaciones |
| [`docs/diagrams/`](docs/diagrams/) | C4 nivel 1 y 2 (PlantUML + PNG/SVG) |
