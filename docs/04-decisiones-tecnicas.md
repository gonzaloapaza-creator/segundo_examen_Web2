# StockGuard - Decisiones tecnicas

## Versiones elegidas (fijadas en `package-lock.json` e imagenes con etiqueta explicita)

| Componente | Version | Motivo |
| --- | --- | --- |
| Node.js (imagen) | `node:22.21.1-alpine` | LTS activa; imagen pequena |
| NestJS | 11.2.7 | Linea 11 estable y mantenida (release del mismo dia que la 12.x); API ampliamente documentada |
| TypeScript | 5.9.3 | Ultima 5.x estable compatible con NestJS 11 |
| TypeORM | 0.3.31 | Linea 0.3 estable, soporte de `pessimistic_write`, migraciones y transacciones |
| pg | 8.23.1 | Driver oficial |
| class-validator / class-transformer | 0.14.2 / 0.5.1 | Validacion declarativa de DTO |
| @nestjs/swagger | 11.4.7 | OpenAPI 3 + Swagger UI |
| Jest / ts-jest / supertest | 30.5.2 / 29.4.14 / 7.3.1 | Pruebas unitarias e integracion HTTP |
| PostgreSQL (imagen) | `postgres:16.15-alpine` | Version estable; `gen_random_uuid()` nativo (pgcrypto) |
| Nginx (imagen) | `nginx:1.28.2-alpine` | Rama estable; soporte de plantillas `envsubst` y `NGINX_ENVSUBST_FILTER` |
| Docker Compose | formato actual (`name`, `depends_on.condition`) | Healthchecks y orden de arranque |

Se descarto NestJS 12 / TypeORM 1.x / TypeScript 7 (publicados hace pocas semanas) para reducir riesgo en un entregable academico.
`npm audit --omit=dev` reporta 0 vulnerabilidades (se fijo `js-yaml@5.4.2` mediante `overrides`). El CLI de Nest no se usa: la compilacion es `tsc` directo (menos dependencias de desarrollo).

## Arquitectura

- **Tres contenedores**: `gateway` (Nginx), `backend` (NestJS), `db` (PostgreSQL), en una red bridge. Solo el Gateway publica un puerto (8080 por defecto).
- **Gateway como unico punto de entrada**: implementa CORS, logging estructurado, rate limiting y trazabilidad. El backend no emite cabeceras CORS (evita duplicados) y confia en el `X-Request-ID` del proxy inmediato (`trust proxy = 1`).
- **Separacion en capas dentro de NestJS**: `Controller` (HTTP + Swagger) -> `Service` (reglas de negocio) -> `Repository` (acceso a datos con TypeORM) -> `Entity`. DTO con `class-validator` para entrada y clases `*ResponseDto` con `static from()` para salida.
- **Modulos**: `categories`, `products`, `movements` (con submodulo `idempotency`), `reports`, `health`, `database` (data source, migraciones, seed), `config`, `common` (errores, filtro, pipe, middlewares, paginacion).

## Consistencia y concurrencia

- Cada movimiento ejecuta en **una unica transaccion**: reserva de idempotencia -> `SELECT ... FOR UPDATE` del producto -> validacion -> `UPDATE stock` -> `INSERT movimiento` -> actualizacion del registro de idempotencia.
- Se eligio **bloqueo pesimista de fila** (`pessimistic_write`) en lugar de bloqueo optimista por version porque:
  - la contencion es por producto (granularidad natural de la fila);
  - el flujo "leer stock -> decidir -> escribir" necesita que la lectura ya este serializada (con optimista habria reintentos y el conflicto se detectaria tarde);
  - PostgreSQL serializa las transacciones en espera y el resultado es determinista: la segunda ve el stock ya actualizado y falla con `INSUFFICIENT_STOCK`.
- La baja logica usa el **mismo bloqueo de fila**, por lo que no puede intercalarse entre la comprobacion de stock y la desactivacion ni con un movimiento concurrente.
- Las reversiones bloquean ademas el movimiento original (`FOR UPDATE`) y un indice unico parcial impide dos compensaciones del mismo movimiento aun bajo carrera. Orden de bloqueo consistente (movimiento -> producto) para evitar interbloqueos.
- Restricciones en la BD como ultima linea de defensa: `CHECK stock >= 0`, `CHECK quantity > 0`, `CHECK` de coherencia `previous/resulting`, `UNIQUE` (SKU, nombre de categoria en minusculas, clave de idempotencia, reversion unica) y `FK ON DELETE RESTRICT`.

## Idempotencia

- Tabla `idempotency_records` con la clave como **clave primaria**. El `INSERT` de la reserva se hace **al inicio** de la transaccion; si otra transaccion concurrente ya inserto la misma clave y no ha confirmado, PostgreSQL bloquea el segundo `INSERT` hasta el commit/rollback de la primera:
  - commit -> segundo `INSERT` falla con `23505` -> se devuelve la respuesta guardada (`Idempotent-Replayed: true`);
  - rollback -> segundo `INSERT` prospera y la operacion se ejecuta normalmente.
- La huella (`request_hash`) es SHA-256 del JSON canonicalizado (claves ordenadas) de la operacion y sus parametros ya normalizados por el DTO. Permite detectar reutilizaciones con contenido distinto (409).
- El cuerpo de la respuesta se guarda como `json` (no `jsonb`) para conservar el orden de claves y devolver un cuerpo identico.
- Las operaciones fallidas no reservan la clave (rollback) -> el cliente puede reintentar con la misma clave tras corregir.

## Precio decimal

`NUMERIC(12,2)` en la BD y **cadena** en JSON (`"49.90"`). El DTO acepta cadena (preferido) o numero (se convierte con `toFixed(2)` solo como comodidad) y valida el patron `^\d{1,10}(\.\d{1,2})?$`. El backend no realiza aritmetica monetaria.

## Migraciones y seed

- `synchronize: false`. Esquema versionado en `src/database/migrations/*.ts` (SQL explicito con nombres de restricciones estables, usados por el codigo para traducir errores `23505`/`23503`).
- `main.ts` ejecuta `dataSource.runMigrations()` **antes** de `listen()`; cualquier fallo termina el proceso con codigo 1 (visible en `docker compose logs backend` y en el healthcheck).
- Seed idempotente (`SEED_ON_START=true` o `node dist/database/seed/run-seed.js`): busca por nombre/SKU y crea solo lo que falta; las existencias iniciales se registran como movimientos `IN` con clave `seed-initial-<SKU>`, por lo que repetirlo reproduce la respuesta original sin duplicar ni sobrescribir el stock modificado por el usuario.

## Errores

Filtro global unico (`HttpExceptionFilter`) que produce `{ statusCode, code, message, details?, timestamp, path, requestId }`. Los 5xx se registran con stack en el log del backend pero el cliente solo recibe `INTERNAL_ERROR` generico. Las excepciones de negocio usan `AppException` con codigos estables.

## Gateway Nginx

- Plantilla `templates/10-stockguard.conf.template` renderizada por `envsubst` (filtro `NGINX_ENVSUBST_FILTER` para no tocar variables nativas como `$request_id`).
- CORS: script de arranque genera un `map $http_origin $cors_origin` con los origenes de `CORS_ALLOWED_ORIGINS` (puntos escapados, comparacion exacta). Preflight `OPTIONS` respondido por Nginx con 204. Cabeceras con `always` para que aparezcan tambien en errores.
- Rate limiting: `limit_req_zone $binary_remote_addr` (IP real del socket, no `X-Forwarded-For`), `rate=${RATE_LIMIT_RPS}r/s`, `burst=${RATE_LIMIT_BURST} nodelay`, `limit_req_status 429` y cuerpo JSON propio. Las rutas de salud quedan fuera.
- Trazabilidad: `proxy_set_header X-Request-ID $request_id` **sobrescribe** cualquier valor del cliente; `proxy_hide_header X-Request-ID` evita duplicar la cabecera devuelta por el backend.
- Upstream resuelto con `resolver 127.0.0.11` y variable para tolerar reinicios del backend.
- `server_tokens off`, `client_max_body_size`, timeouts configurables.

## Docker

- Backend: build multi-etapa (`build` con dev deps y `tsc`; `deps` con `npm ci --omit=dev`; `runtime` minimo con usuario `node`, `dumb-init` para senales y `HEALTHCHECK` con `wget`).
- La etapa `build` se reutiliza como runner de pruebas (`docker-compose.test.yml`), sin necesidad de Node.js en el host.
- Compose: `depends_on` con `condition: service_healthy`, volumen nombrado `stockguard-pgdata`, sin bind mounts de codigo, configuracion por `.env` (sin credenciales en el repositorio).

## Alcance explicitamente fuera de la fase 1

Autenticacion/roles, frontend, pagos/facturacion, multiples almacenes, notificaciones, Redis, HTTPS/despliegue publico, reactivacion de productos, borrado fisico de productos.
