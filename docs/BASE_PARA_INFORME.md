# StockGuard - Base tecnica para la redaccion del informe

Documento autocontenido con la informacion tecnica del proyecto, pensado para que a partir de el (mas las capturas del estudiante) se redacte el informe PDF de 5 a 8 paginas. Todo lo descrito aqui corresponde al codigo publicado en el repositorio; cuando se cita un resultado de prueba se indica si fue **obtenido realmente** o si es un **ejemplo ilustrativo**.

---

## 1. Identificacion y alcance

| Dato | Valor |
| --- | --- |
| Proyecto | **StockGuard** - API Gateway + microservicio de control de inventario |
| Estudiante | Gonzalo Gabriel Apaza Ticona |
| Universidad | Universidad Catolica Boliviana "San Pablo" |
| Materia | Tecnologias Web 2 (segundo parcial) |
| Repositorio | <https://github.com/gonzaloapaza-creator/segundo_examen_Web2> (rama estable `main`, etiqueta `v1.0.0`; ver seccion 11.1 para el detalle de la integracion) |
| Tipo de entrega | Examen de API Gateway y microservicio backend (NestJS + TypeScript obligatorio) |

Datos no proporcionados y por tanto no incluidos aqui: nombre del docente, paralelo, fecha de defensa.

### 1.1 Problema de negocio

Una pequena tienda de accesorios tecnologicos (cables, cargadores, audio, almacenamiento, fundas y soportes) lleva el inventario en hojas de calculo. Consecuencias observadas:

| Problema | Consecuencia | Respuesta de StockGuard |
| --- | --- | --- |
| Diferencias entre stock real y registrado | Decisiones de compra equivocadas | El stock **solo** cambia mediante movimientos registrados en la misma transaccion que lo modifica |
| Salidas superiores al stock disponible | Se "venden" unidades inexistentes | Rechazo `409 INSUFFICIENT_STOCK`; `CHECK stock >= 0` en la BD como ultima defensa |
| Sin historial de entradas y salidas | Imposible auditar | Movimientos **inmutables** con `previousStock`/`resultingStock`, motivo y fecha; correcciones por compensacion |
| Dificultad para detectar reposiciones | Quiebres de stock | Reporte `low-stock` (`stock <= minimumStock`) y resumen |
| Movimientos duplicados por reintentos (red, doble clic) | Stock inflado o desinflado | Idempotencia obligatoria con `Idempotency-Key` persistida en PostgreSQL |

### 1.2 Objetivos

**Objetivo general:** construir un sistema de control de inventario expuesto como API REST detras de un API Gateway, con persistencia en PostgreSQL y despliegue reproducible con Docker Compose, que garantice la consistencia del stock ante errores de uso, reintentos y accesos concurrentes.

**Objetivos especificos:**

1. Implementar un microservicio NestJS/TypeScript con CRUD de categorias y productos, aplicando DTO, patron Repository e inyeccion de dependencias.
2. Registrar entradas y salidas de inventario como movimientos transaccionales, auditables e idempotentes, con reversiones por compensacion.
3. Exponer un unico punto de entrada HTTP mediante un Gateway Nginx con CORS, logs estructurados, rate limiting y trazabilidad por `X-Request-ID`.
4. Orquestar Gateway, backend y base de datos con Docker Compose (red bridge, `depends_on`, healthchecks, volumen persistente, un solo puerto publicado).
5. Documentar la API (Swagger/OpenAPI, Postman, README) y la arquitectura (C4 niveles 1 y 2), con un historial Git Flow real.

### 1.3 Usuarios previstos

- **Operador de tienda**: mantiene el catalogo, registra entradas (compras) y salidas (ventas, mermas), corrige errores con reversiones y consulta stock y reportes.
- **Evaluador / desarrollador**: explora y prueba la API mediante Swagger UI, Postman o cURL.

No existe interfaz grafica propia: los clientes HTTP de prueba son los usuarios directos de la API.

### 1.4 Funcionalidades

| Area | Funcionalidad |
| --- | --- |
| Categorias | Crear, listar (paginado, busqueda, orden), obtener, actualizar parcialmente, eliminar (solo sin productos asociados) |
| Productos | Crear (nace con stock 0), listar (busqueda por nombre/SKU, filtro por categoria y estado, orden), obtener (incluye inactivos), actualizar parcialmente (sin `stock`/`isActive`), baja logica (solo con stock 0) |
| Movimientos | Registrar entrada (`IN`) o salida (`OUT`) con `Idempotency-Key`; listar con filtros (producto, tipo, rango de fechas); obtener detalle; revertir (compensacion) |
| Reportes | Stock bajo (activos con `stock <= minimumStock`) y resumen (productos activos, unidades, bajo stock, categorias) |
| Salud | Liveness y readiness (comprueba PostgreSQL) del backend; salud propia del Gateway |
| Documentacion | Swagger UI y OpenAPI JSON/YAML servidos por el Gateway |

### 1.5 Exclusiones y limitaciones

- Sin frontend propio (decision de alcance del examen; la demostracion usa Swagger, Postman y cURL).
- Sin autenticacion ni autorizacion: solo demostracion local. CORS no sustituye la autenticacion.
- Sin pagos, facturacion, multiples almacenes, notificaciones ni cache (Redis).
- Sin reactivacion de productos dados de baja ni borrado fisico de productos.
- HTTP sin TLS; sin despliegue publico.
- Rate limiting por IP de socket (detras de otro proxy todos los clientes compartirian el limite).
- Los registros de idempotencia no caducan.

---

## 2. Arquitectura

### 2.1 Componentes y responsabilidades

| Contenedor | Tecnologia | Responsabilidad |
| --- | --- | --- |
| `gateway` | Nginx 1.28.2 (Alpine) | Unico punto de entrada HTTP (puerto `8080` del host -> `80`). Proxy inverso hacia el backend. Caracteristicas transversales: CORS por lista blanca, logs JSON, rate limiting por IP con respuesta 429 en JSON, generacion y propagacion de `X-Request-ID`, limites de tamano de cuerpo y tiempos de espera, respuestas JSON propias para 413/429/502/503/504. Sirve una pagina estatica de bienvenida en `/`. |
| `backend` | NestJS 11.2.7 / TypeScript 5.9.3 / Node.js 22 | Microservicio REST en `/api/v1`: catalogo, movimientos transaccionales, idempotencia, reversiones, reportes, salud. Ejecuta migraciones TypeORM y seed idempotente al arrancar. Expone Swagger UI y OpenAPI en `/docs`. Sin puerto publicado (solo `expose 3000` en la red interna). |
| `db` | PostgreSQL 16.15 (Alpine) | Persistencia: tablas `categories`, `products`, `inventory_movements`, `idempotency_records`, `typeorm_migrations`. Restricciones CHECK/UNIQUE/FK. Datos en el volumen nombrado `stockguard-pgdata`. Sin puerto publicado. |

### 2.2 Recorrido de una solicitud

1. El cliente (Swagger UI, Postman o cURL) envia `POST http://localhost:8080/api/v1/movements` con `Idempotency-Key`.
2. Nginx recibe la peticion en el puerto 80 del contenedor (8080 del host). Genera `$request_id` (32 hex), aplica `limit_req` (10 r/s, rafaga 20 por IP); si excede responde 429 JSON sin tocar el backend.
3. Nginx reenvia a `http://backend:3000/api/v1/movements` (resuelto por el DNS interno de Docker `127.0.0.11`) con cabeceras `X-Request-ID`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `Host`.
4. En NestJS: `RequestIdMiddleware` adopta el `X-Request-ID`; `RequestLoggerMiddleware` mide la duracion; `ValidationPipe` valida el DTO; el decorador `@IdempotencyKey()` valida la cabecera; `MovementsService.create` abre **una transaccion**: inserta la reserva de idempotencia, bloquea la fila del producto (`SELECT ... FOR UPDATE`), calcula el stock resultante, actualiza `products.stock`, inserta `inventory_movements`, guarda la respuesta en `idempotency_records` y confirma.
5. El backend responde 201 con el movimiento y `Idempotent-Replayed: false`; el log JSON del backend incluye el mismo `requestId`.
6. Nginx oculta la cabecera `X-Request-ID` del backend (para que el cliente reciba una sola), agrega `Access-Control-Allow-Origin` si el `Origin` esta en la lista blanca, registra la linea JSON de acceso con `request_id`, `status`, `upstream_status` y `duration_ms`, y devuelve la respuesta al cliente.

### 2.3 Protocolos, puertos y red

| Tramo | Protocolo / puerto | Visible desde el host |
| --- | --- | --- |
| Cliente -> Gateway | HTTP `8080` (configurable `GATEWAY_PORT`) | Si (unico puerto publicado) |
| Gateway -> backend | HTTP `3000` en la red bridge `stockguard-net` | No |
| Backend -> PostgreSQL | TCP `5432` en la red bridge `stockguard-net` (driver `pg`) | No |

Red: `stockguard_stockguard-net` (driver `bridge`, creada por Compose). Los servicios se resuelven por nombre (`backend`, `db`).

### 2.4 Funcion de Swagger y Postman

- **Swagger UI** (`/docs`) es generada por `@nestjs/swagger` a partir de los decoradores de controladores y DTO; "Try it out" envia las peticiones al mismo origen, es decir, atraviesan el Gateway. `/docs/openapi.json` y `/docs/openapi.yaml` exponen la especificacion OpenAPI 3.
- **Postman**: `postman/StockGuard.postman_collection.json` (generada desde `postman/build-collection.js`) y el entorno `StockGuard - Local (Gateway)` (`baseUrl=http://localhost:8080`). Ocho carpetas (00 a 07) con 109 peticiones y 151 aserciones que encadenan IDs y claves de idempotencia; ejecutable tambien con Newman.

---

## 3. Tecnologias

Versiones obtenidas de `backend/package.json`, `backend/package-lock.json`, `backend/Dockerfile`, `gateway/Dockerfile` y `docker-compose.yml`.

| Tecnologia | Version | Uso |
| --- | --- | --- |
| Node.js | 22 LTS (`node:22.21.1-alpine`) | Runtime del backend y del runner de pruebas |
| NestJS (`@nestjs/common`, `core`, `platform-express`) | 11.2.7 | Framework del microservicio (modulos, DI, pipes, filtros, middlewares) |
| `@nestjs/config` | 4.0.4 | Carga y validacion de variables de entorno |
| `@nestjs/swagger` | 11.4.7 | Swagger UI y OpenAPI 3 |
| `@nestjs/typeorm` / TypeORM | 11.0.3 / 0.3.31 | ORM, migraciones, transacciones, bloqueo pesimista |
| `pg` | 8.23.1 | Driver PostgreSQL |
| TypeScript | 5.9.3 | Lenguaje (modo `strict`), compilacion con `tsc` |
| class-validator / class-transformer | 0.14.2 / 0.5.1 | Validacion y normalizacion de DTO |
| dotenv | 16.6.1 | Carga de `.env` en desarrollo y pruebas |
| Jest / ts-jest / supertest | 30.5.2 / 29.4.14 / 7.3.1 | Pruebas unitarias e integracion HTTP contra PostgreSQL real |
| PostgreSQL | 16.15 (`postgres:16.15-alpine`) | Base de datos |
| Nginx | 1.28.2 (`nginx:1.28.2-alpine`) | API Gateway / proxy inverso |
| Docker Engine / Docker Compose | 29.8.2 / v5.5.1 (entorno de verificacion) | Construccion y orquestacion |
| PlantUML + C4-PlantUML | 1.2025.4 | Diagramas C4 (fuente `.puml`, exportados a PNG/SVG) |
| Newman | 6.x | Ejecucion de la coleccion Postman por linea de comandos |

Todas las dependencias estan fijadas en `package-lock.json` (instalacion con `npm ci`); no se usan imagenes `latest`.

---

## 4. Modelo de datos

Esquema creado por la migracion `backend/src/database/migrations/1760000000000-InitialSchema.ts` (SQL explicito; `synchronize` deshabilitado). UUID generados por `gen_random_uuid()` (extension `pgcrypto`). Todas las fechas son `timestamptz`.

### 4.1 `categories`

| Columna | Tipo | Restricciones |
| --- | --- | --- |
| `id` | uuid | PK `pk_categories`, default `gen_random_uuid()` |
| `name` | varchar(80) | NOT NULL; `CHECK length(btrim(name)) > 0`; indice unico `uq_categories_name_lower` sobre `lower(name)` (unicidad sin distinguir mayusculas) |
| `description` | varchar(500) | NULL |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default `now()` |

### 4.2 `products`

| Columna | Tipo | Restricciones |
| --- | --- | --- |
| `id` | uuid | PK `pk_products` |
| `sku` | varchar(40) | NOT NULL; indice unico `uq_products_sku`; `CHECK` no vacio; normalizado a mayusculas por el DTO |
| `name` | varchar(120) | NOT NULL |
| `description` | varchar(1000) | NULL |
| `reference_price` | numeric(12,2) | NOT NULL; `CHECK >= 0` |
| `stock` | integer | NOT NULL, default 0; `CHECK >= 0` |
| `minimum_stock` | integer | NOT NULL, default 0; `CHECK >= 0` |
| `category_id` | uuid | NOT NULL; FK `fk_products_category` -> `categories(id)` `ON DELETE RESTRICT`; indice `idx_products_category` |
| `is_active` | boolean | NOT NULL, default true (baja logica) |
| `created_at`, `updated_at` | timestamptz | |

Indice adicional `idx_products_active_name (is_active, name)` para los listados por defecto.

**Representacion del precio:** `NUMERIC(12,2)` en la BD y **cadena** en JSON (`"49.90"`), mediante un `transformer` de TypeORM (`decimalTransformer` en `product.entity.ts`). El DTO acepta cadena (preferido) o numero (convertido con `toFixed(2)`) y valida el patron `^\d{1,10}(\.\d{1,2})?$`. El backend no hace aritmetica monetaria, evitando errores de coma flotante.

**Baja logica:** `DELETE /products/{id}` pone `is_active=false` (nunca borra la fila); el producto deja de aparecer en listados por defecto (`status=active`), sigue consultable por id, no admite `PATCH` ni movimientos (409 `PRODUCT_INACTIVE`) y conserva su historial. Solo se permite con `stock = 0` (409 `PRODUCT_HAS_STOCK` en caso contrario).

### 4.3 `inventory_movements`

| Columna | Tipo | Restricciones |
| --- | --- | --- |
| `id` | uuid | PK `pk_inventory_movements` |
| `product_id` | uuid | NOT NULL; FK `fk_movements_product` -> `products(id)` `ON DELETE RESTRICT` |
| `type` | enum `movement_type` (`IN`, `OUT`) | NOT NULL |
| `quantity` | integer | NOT NULL; `CHECK quantity > 0` |
| `reason` | varchar(255) | NOT NULL; `CHECK` no vacio |
| `previous_stock`, `resulting_stock` | integer | NOT NULL; `CHECK >= 0`; `CHECK chk_movements_stock_consistency`: `IN -> resulting = previous + quantity`, `OUT -> resulting = previous - quantity` |
| `idempotency_key` | varchar(128) | NOT NULL; indice unico `uq_movements_idempotency_key` |
| `reverses_movement_id` | uuid | NULL; FK `fk_movements_reverses` -> `inventory_movements(id)` (autorreferencia); indice unico **parcial** `uq_movements_single_reversal WHERE reverses_movement_id IS NOT NULL` (un movimiento solo puede ser revertido una vez) |
| `created_at` | timestamptz | |

Indices: `idx_movements_product_created (product_id, created_at)`, `idx_movements_created (created_at)`.

Los movimientos son **inmutables**: no existen endpoints `PATCH`/`DELETE` y el codigo nunca ejecuta `UPDATE` sobre esta tabla. Una correccion es siempre un nuevo movimiento compensatorio.

### 4.4 `idempotency_records` (tabla auxiliar)

| Columna | Tipo | Restricciones |
| --- | --- | --- |
| `key` | varchar(128) | **PK** `pk_idempotency_records` (la clave `Idempotency-Key`) |
| `operation` | varchar(40) | `CREATE_MOVEMENT` o `REVERSE_MOVEMENT` |
| `request_hash` | char(64) | SHA-256 de la peticion canonicalizada |
| `response_status` | smallint | Estado HTTP de la primera ejecucion (201) |
| `response_body` | json | Cuerpo devuelto en la primera ejecucion (tipo `json`, no `jsonb`, para conservar el orden de claves) |
| `created_at` | timestamptz | |

### 4.5 `typeorm_migrations`

Tabla de control de TypeORM; contiene `InitialSchema1760000000000` tras el primer arranque.

### 4.6 Relaciones

```
categories 1 ---- * products 1 ---- * inventory_movements
                                            |  0..1
                                            +------ reverses_movement_id -> inventory_movements (autorreferencia, unica)
idempotency_records (independiente; key = Idempotency-Key)
```

### 4.7 Migraciones y seed

- `main.ts` ejecuta `dataSource.runMigrations({ transaction: 'each' })` **antes** de `app.listen()`; si falla, el proceso termina con codigo 1 y el contenedor no llega a `healthy`.
- Seed (`database/seed/seed.service.ts`, datos en `seed-data.ts`): 5 categorias, 11 productos (stock normal, bajo y cero) y 9 entradas iniciales. Idempotente: busca por nombre/SKU y crea solo lo que falta; las entradas usan la clave `seed-initial-<SKU>`, por lo que al repetirse se **reproducen** (`movementsReplayed: 9`) sin duplicar ni sobrescribir stock modificado por el usuario. Se ejecuta al arrancar si `SEED_ON_START=true` o manualmente con `node dist/database/seed/run-seed.js`.

---

## 5. Implementacion NestJS

### 5.1 Modulos (`backend/src`)

| Modulo | Archivo | Contenido |
| --- | --- | --- |
| `AppModule` | `app.module.ts` | Importa el resto; registra `ValidationPipe` global (`APP_PIPE`), `HttpExceptionFilter` global (`APP_FILTER`) y los middlewares `RequestIdMiddleware` + `RequestLoggerMiddleware` para todas las rutas |
| `AppConfigModule` | `config/config.module.ts`, `env.validation.ts`, `configuration.ts` | Valida las variables de entorno con class-validator y expone el token `APP_CONFIG` tipado |
| `DatabaseModule` | `database/database.module.ts`, `data-source.ts` | `TypeOrmModule.forRootAsync` con `autoLoadEntities`, reintentos de conexion, `synchronize: false` |
| `CategoriesModule` | `categories/` | Controller, Service, Repository, entidad, DTO |
| `ProductsModule` | `products/` | Idem; importa `CategoriesModule` |
| `MovementsModule` | `movements/` | Controller, Service, Repository, `IdempotencyService`, decorador `@IdempotencyKey`, entidades `Movement` e `IdempotencyRecord` |
| `ReportsModule` | `reports/` | Controller que consume `ProductsRepository` y `CategoriesRepository` |
| `HealthModule` | `health/` | Liveness/readiness |
| `SeedModule` | `database/seed/` | `SeedService` (usa `MovementsService` para las entradas iniciales) |

### 5.2 Controladores

`categories.controller.ts`, `products.controller.ts`, `movements.controller.ts`, `reports.controller.ts`, `health.controller.ts`. Solo manejan HTTP y Swagger: `@Controller`, `@Get/@Post/@Patch/@Delete`, `ParseUUIDPipe` en parametros, `@HttpCode(204)` en eliminaciones, decoradores de documentacion (`@ApiTags`, `@ApiOperation`, `@ApiCreatedResponse`, helpers en `common/swagger/api-docs.decorators.ts`). `MovementsController` fija el estado y la cabecera `Idempotent-Replayed` mediante `@Res({ passthrough: true })`.

### 5.3 Servicios (reglas de negocio)

- `CategoriesService`: unicidad de nombre sin distinguir mayusculas (comprobacion previa + traduccion del error `23505`), eliminacion solo sin productos (cuenta en transaccion + FK `RESTRICT`).
- `ProductsService`: categoria existente, SKU unico, `stock` siempre 0 al crear, producto inactivo no editable, baja logica con bloqueo de fila y `stock = 0`.
- `MovementsService`: operaciones transaccionales (seccion 6).
- `IdempotencyService`: protocolo de reserva/replay (seccion 6.4).
- `SeedService`: carga idempotente.

### 5.4 DTO y validaciones

Archivos representativos: `categories/dto/create-category.dto.ts`, `products/dto/create-product.dto.ts`, `movements/dto/create-movement.dto.ts`, `movements/dto/list-movements.dto.ts`, `common/dto/pagination.dto.ts`.

- Decoradores de class-validator (`@IsString`, `@MinLength`, `@MaxLength`, `@IsUUID`, `@IsInt`, `@Min`, `@Max`, `@IsEnum`, `@IsISO8601`, `@Matches`) y de class-transformer (`@Transform` para recortar espacios, colapsar espacios internos, convertir SKU a mayusculas, `type` a mayusculas, cadena vacia a `undefined`).
- `UpdateCategoryDto` y `UpdateProductDto` derivan con `PartialType` (todos los campos opcionales). `stock` e `isActive` **no** existen en los DTO, por lo que son rechazados.
- `ValidationPipe` global (`common/pipes/validation.pipe.ts`): `whitelist`, `forbidNonWhitelisted`, `forbidUnknownValues`, `transform`; `exceptionFactory` devuelve `400 VALIDATION_ERROR` con `details: [{ field, constraints[] }]`.
- DTO de respuesta (`*-response.dto.ts`) con `static from(entity)` para desacoplar la entidad de la salida (por ejemplo, agrega `isLowStock`).
- Validador personalizado `DateRangeConstraint` (`to` no anterior a `from`).

### 5.5 Repositorios

`categories.repository.ts`, `products.repository.ts`, `movements.repository.ts`: clases `@Injectable()` que envuelven `Repository<T>` de TypeORM (`@InjectRepository`). Encapsulan consultas (`QueryBuilder` para busqueda/paginacion/orden determinista con desempate por `id`, `ILIKE` con escape de `% _ \`), operaciones con `EntityManager` transaccional (`findByIdForUpdate` con `lock: { mode: 'pessimistic_write' }`, `updateStock`, `deactivate`, `insert`) y agregados (`findLowStock`, `summary`). Los servicios nunca construyen SQL.

### 5.6 Inyeccion de dependencias

Todos los servicios y repositorios son providers declarados en su modulo e inyectados por constructor. Ejemplo (`movements.service.ts`):

```ts
constructor(
  private readonly movements: MovementsRepository,
  private readonly products: ProductsRepository,
  private readonly idempotency: IdempotencyService,
  @Inject(APP_CONFIG) private readonly config: AppConfig,
) {}
```

`ProductsModule` exporta `ProductsService`/`ProductsRepository` para `MovementsModule` y `ReportsModule`; `MovementsModule` exporta `MovementsService` para `SeedModule`. La configuracion se inyecta por el token `APP_CONFIG` (modulo global).

### 5.7 Manejo de errores

- `common/errors/app.exception.ts`: `AppException extends HttpException` con un `code` de negocio estable (`ErrorCode`) y `details` opcional; atajos `notFound`, `conflict`, `badRequest`.
- `common/errors/pg-error.util.ts`: detecta errores de PostgreSQL por codigo SQLSTATE y nombre de restriccion (`23505` unicidad, `23503` FK) para traducirlos a 409 con el `code` correspondiente.
- `common/filters/http-exception.filter.ts` (`@Catch()` global): formato unico `{ statusCode, code, message, details?, timestamp, path, requestId }`. Los 5xx se registran con stack en el log pero el cliente solo recibe `INTERNAL_ERROR`. El `requestId` se toma de la peticion (o de la cabecera `X-Request-ID` cuando el error ocurre antes del middleware, como un JSON malformado).

### 5.8 Middlewares y trazabilidad en el backend

- `RequestIdMiddleware`: adopta el `X-Request-ID` enviado por el Gateway (o genera un UUID si el backend recibe trafico directo, como en las pruebas) y lo devuelve en la respuesta.
- `RequestLoggerMiddleware`: una linea JSON por peticion `{ time, method, path, status, durationMs, requestId }` (sin cuerpos ni cabeceras).

---

## 6. Reglas de negocio y extras

### 6.1 Entradas y salidas

`POST /api/v1/movements` con `{ productId, type: "IN" | "OUT", quantity, reason }` y cabecera `Idempotency-Key`.
`MovementsService.applyMovement` calcula en el servidor:

```
previousStock  = stock actual del producto (leido con FOR UPDATE)
resultingStock = IN  -> previousStock + quantity
                 OUT -> previousStock - quantity
```

Si `resultingStock < 0` -> `409 INSUFFICIENT_STOCK` con `details: { available, requested }`. Si supera 1 000 000 -> `409 CONFLICT`. Si pasa, se ejecuta `UPDATE products SET stock = resultingStock` e `INSERT INTO inventory_movements` en la misma transaccion. El `CHECK stock >= 0` y el `CHECK` de coherencia en la BD refuerzan la regla.

Ejemplo fiel al codigo (valores ilustrativos): producto con stock 10, `OUT 4` -> movimiento `{ previousStock: 10, quantity: 4, resultingStock: 6 }` y el producto queda en 6.

### 6.2 Transacciones y bloqueos

Orden dentro de **una** transaccion (`EntityManager.transaction`):

1. `INSERT idempotency_records(key, operation, request_hash, status 0)` - reserva de la clave.
2. `SELECT ... FROM products WHERE id = $1 FOR UPDATE` - bloqueo pesimista de la fila del producto (`ProductsRepository.findByIdForUpdate`). Verifica que exista y este activo.
3. Calculo y validacion del stock.
4. `UPDATE products SET stock = ...`.
5. `INSERT inventory_movements (...)`.
6. `UPDATE idempotency_records SET response_status = 201, response_body = ...`.
7. `COMMIT`. Cualquier excepcion provoca `ROLLBACK` completo (ni stock, ni movimiento, ni reserva de clave).

Se eligio bloqueo pesimista por fila (no optimista por version) porque la contencion es por producto, la decision depende de la lectura y PostgreSQL serializa de forma determinista a las transacciones en espera. La baja logica (`ProductsService.remove`) usa el mismo bloqueo, por lo que no puede intercalarse con un movimiento concurrente.

### 6.3 Solicitudes simultaneas

Dos `OUT 1` simultaneas sobre un producto con stock 1: ambas transacciones intentan `FOR UPDATE`; la segunda espera; la primera confirma con `resultingStock 0`; la segunda lee stock 0 y falla con `409 INSUFFICIENT_STOCK`. Resultado verificado en pruebas: `[201, 409]`, stock final 0, un solo movimiento `OUT`. Con 12 salidas concurrentes y stock 5: exactamente 5 exitosas y 7 rechazadas.

### 6.4 Idempotencia

- Cabecera `Idempotency-Key` **obligatoria** en `POST /movements` y `POST /movements/{id}/reversal`; formato `[A-Za-z0-9._-]{8,128}` (400 `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_INVALID`).
- Huella: `fingerprint(operation, payload)` = SHA-256 del JSON canonicalizado (claves ordenadas recursivamente, `undefined` omitidos) de `{ operation, productId, type, quantity, reason }` (o `{ operation, movementId, reason }` en reversiones), con los valores ya normalizados por el DTO.
- Alcance **global**: una clave identifica una unica operacion en todo el sistema (PK de `idempotency_records` + indice unico en `inventory_movements.idempotency_key`).
- Primera ejecucion: `201` + `Idempotent-Replayed: false`.
- Reintento con la misma clave y misma huella: el `INSERT` de reserva falla con `23505`; `IdempotencyService.replay` lee el registro y devuelve **el mismo estado y cuerpo** con `Idempotent-Replayed: true`; el stock no cambia.
- Misma clave con huella distinta: `409 IDEMPOTENCY_KEY_REUSED` con `details: { operation, firstSeenAt }`.
- Peticiones fallidas (4xx) hacen `ROLLBACK` y **no** reservan la clave: el cliente puede reintentar con la misma clave tras corregir.

### 6.5 Reintentos simultaneos y conflictos de claves

Si dos peticiones con la misma clave llegan a la vez, la segunda `INSERT` en `idempotency_records` queda bloqueada por PostgreSQL hasta que la primera confirme o revierta: si confirma, la segunda recibe `23505` y reproduce la respuesta; si revierte, la segunda prospera y ejecuta la operacion. Verificado: 6 reintentos simultaneos -> 6 x 201 con el mismo `id`, un solo `Idempotent-Replayed: false`, stock decrementado una vez. Si por una carrera extrema el registro aun no fuese visible, se responde 409 con el mensaje "esta siendo procesada; reintente".

### 6.6 Reversiones (compensaciones)

`POST /api/v1/movements/{id}/reversal` con `{ reason }` y `Idempotency-Key`:

1. Bloquea el movimiento original (`FOR UPDATE`) -> 404 `MOVEMENT_NOT_FOUND` si no existe.
2. Si el original ya es una compensacion (`reversesMovementId != null`) -> 409 `MOVEMENT_IS_REVERSAL`.
3. Si ya tiene reversion -> 409 `MOVEMENT_ALREADY_REVERSED` (ademas, el indice unico parcial lo garantiza bajo concurrencia).
4. Bloquea el producto (debe estar activo -> 409 `PRODUCT_INACTIVE`).
5. Aplica el movimiento **contrario por la cantidad total** (`IN` <-> `OUT`) con `reversesMovementId = original.id`; si dejaria stock negativo -> 409 `INSUFFICIENT_STOCK`.
6. El original queda intacto; su detalle (`GET /movements/{id}`) expone `reversedByMovementId`.

Orden de bloqueo consistente (movimiento -> producto) para evitar interbloqueos. Verificado: dos reversiones simultaneas -> `[201, 409]`.

### 6.7 Reportes

- `GET /reports/low-stock`: productos **activos** con `stock <= minimum_stock`, ordenados por deficit (`stock - minimum_stock`) ascendente, luego nombre e id; paginado.
- `GET /reports/summary`: `activeProducts`, `totalUnits` (suma de stock de activos), `lowStockProducts`, `categories` (todas), `generatedAt`. Calculado con una sola consulta agregada (`COUNT`, `SUM`, `COUNT ... FILTER`).

---

## 7. Gateway Nginx

Archivos: `gateway/Dockerfile`, `gateway/nginx.conf`, `gateway/templates/10-stockguard.conf.template` (renderizada por `envsubst` al arrancar), `gateway/snippets/proxy.conf`, `gateway/snippets/cors.conf`, `gateway/docker-entrypoint.d/15-cors-origins.sh`, `gateway/html/index.html`.

### 7.1 Enrutamiento

| `location` | Destino | Notas |
| --- | --- | --- |
| `= /health` | Respuesta propia de Nginx `{"status":"ok","component":"gateway","requestId":...}` | Sin rate limit |
| `/api/v1/health/` | `proxy_pass http://backend:3000` | Sin rate limit (para healthchecks y monitoreo) |
| `/api/v1/` | `proxy_pass http://backend:3000` | Con `limit_req` y CORS |
| `/docs` | `proxy_pass http://backend:3000` | Swagger UI, `/docs/openapi.json`, `/docs/openapi.yaml`; con `limit_req` |
| `/` | Archivos estaticos (`/usr/share/nginx/html`) | Pagina de bienvenida |

El upstream se define como variable (`set $backend_upstream http://${BACKEND_HOST}:${BACKEND_PORT}`) con `resolver 127.0.0.11 valid=10s`, de modo que Nginx tolera reinicios del backend con cambio de IP. Si el backend no responde, `error_page 502 503 504` devuelve `503 {"code":"SERVICE_UNAVAILABLE",...}` en JSON.

### 7.2 CORS

- El script `15-cors-origins.sh` genera al arrancar `map $http_origin $cors_origin { default ""; "~^(origen1|origen2)$" $http_origin; }` a partir de `CORS_ALLOWED_ORIGINS` (puntos escapados: comparacion literal, nunca se refleja un origen arbitrario).
- `cors.conf`: para `OPTIONS` responde **204** con `Access-Control-Allow-Origin` (solo si esta en la lista), `Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`, `Allow-Headers: Content-Type, Accept, Idempotency-Key, X-Requested-With`, `Expose-Headers: X-Request-ID, Idempotent-Replayed`, `Max-Age: 600`, `Vary: Origin`. Para el resto de metodos agrega `Allow-Origin`, `Expose-Headers` y `Vary` con `always` (tambien en errores 4xx/5xx).
- El backend **no** emite cabeceras CORS (evita duplicados).

### 7.3 Logs

`nginx.conf` define `log_format json_combined escape=json` con `time`, `request_id`, `remote_addr`, `method`, `path` (sin query string), `status`, `duration_ms`, `upstream_status`, `upstream_time`, `bytes_sent`, `user_agent`. Nunca se registran cuerpos ni cabeceras sensibles. `server_tokens off`.

Ejemplo real obtenido en las verificaciones:

```json
{"time":"2026-10-12T23:57:49+00:00","request_id":"62630ab234863cafc50b7d0b24cb5977","remote_addr":"172.19.0.1","method":"GET","path":"/api/v1/products/00000000-0000-4000-8000-000000000000","status":404,"duration_ms":"0.014","upstream_status":"404","upstream_time":"0.015","bytes_sent":640,"user_agent":"curl/8.16.0"}
```

y la linea correspondiente del backend con el **mismo** identificador:

```
WARN [HTTP] {"time":"2026-10-12T23:57:49.972Z","method":"GET","path":"/api/v1/products/00000000-0000-4000-8000-000000000000","status":404,"durationMs":8.07,"requestId":"62630ab234863cafc50b7d0b24cb5977"}
```

### 7.4 Rate limiting

`limit_req_zone $binary_remote_addr zone=api_per_ip:10m rate=${RATE_LIMIT_RPS}r/s;` (10 r/s por defecto) y `limit_req zone=api_per_ip burst=${RATE_LIMIT_BURST} nodelay;` (rafaga 20) en `/api/v1/` y `/docs`. Se usa la IP real del socket (no `X-Forwarded-For`, que el cliente podria falsificar). `limit_req_status 429` y `error_page 429` devuelven:

```json
{"statusCode":429,"code":"RATE_LIMITED","message":"Demasiadas peticiones; intente nuevamente en unos segundos","timestamp":"...","path":"/api/v1/categories","requestId":"..."}
```

Resultado real: 60 peticiones GET por una sola conexion keep-alive -> 22 x 200 y 38 x 429 (la proporcion exacta varia con la velocidad del cliente).

### 7.5 X-Request-ID

- `add_header X-Request-ID $request_id always` en todas las respuestas (incluidas las generadas por Nginx).
- `proxy_set_header X-Request-ID $request_id` **sobrescribe** cualquier valor del cliente (verificado: un `X-Request-ID: spoofed-...` enviado por el cliente es reemplazado).
- `proxy_hide_header X-Request-ID` oculta la copia que devuelve el backend para que el cliente reciba una sola cabecera.
- El backend lo incluye en su log y en todos los cuerpos de error.

### 7.6 Otros

`client_max_body_size ${CLIENT_MAX_BODY_SIZE}` (1m) con `413 PAYLOAD_TOO_LARGE` en JSON; `proxy_connect_timeout 5s`, `proxy_read_timeout 30s`; `X-Content-Type-Options: nosniff`; `proxy_hide_header X-Powered-By`; `gzip` para JSON.

---

## 8. Docker

### 8.1 Dockerfiles

**`backend/Dockerfile`** (multi-etapa, `node:22.21.1-alpine`):

| Etapa | Contenido |
| --- | --- |
| `build` | `npm ci` completo, copia `src/` y `test/`, `npm run build` (`tsc`). Se reutiliza como **runner de pruebas** en `docker-compose.test.yml` |
| `deps` | `npm ci --omit=dev` (solo dependencias de produccion) |
| `runtime` | Copia `node_modules` de `deps` y `dist` de `build`; `dumb-init` como PID 1 (reenvio de senales para apagado limpio); usuario sin privilegios `node`; `EXPOSE 3000`; `HEALTHCHECK wget http://127.0.0.1:3000/api/v1/health/ready`; `CMD node dist/main.js` |

**`gateway/Dockerfile`** (`nginx:1.28.2-alpine`): copia `nginx.conf`, `templates/` (renderizadas por el entrypoint oficial con `envsubst`, filtrando con `NGINX_ENVSUBST_FILTER` para no tocar variables nativas como `$request_id`), `snippets/`, el script de CORS y la pagina estatica; elimina `default.conf`; `HEALTHCHECK wget http://127.0.0.1/health`.

### 8.2 `docker-compose.yml` (entorno principal)

| Servicio | Imagen | Puertos | depends_on | Healthcheck | Volumenes |
| --- | --- | --- | --- | --- | --- |
| `gateway` | `stockguard/gateway:1.0.0` (build `./gateway`) | `${GATEWAY_PORT:-8080}:80` (**unico publicado**) | `backend: service_healthy` | `wget /health` cada 10 s | - |
| `backend` | `stockguard/backend:1.0.0` (build `./backend`, target `runtime`) | solo `expose 3000` | `db: service_healthy` | `wget /api/v1/health/ready` cada 10 s, `start_period 20s` | - |
| `db` | `postgres:16.15-alpine` | ninguno | - | `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB` cada 5 s | `stockguard-pgdata:/var/lib/postgresql/data` |

- Red: `stockguard-net` (`driver: bridge`).
- Variables: leidas de `.env` (plantilla `.env.example`); `POSTGRES_USER/PASSWORD/DB` son obligatorias (`${VAR:?mensaje}`), el resto tiene valor por defecto. El backend recibe `POSTGRES_HOST=db`.
- Orden de arranque: `db` -> (healthy) -> `backend` (migraciones + seed, luego healthy) -> `gateway`.
- `restart: unless-stopped` en los tres servicios.
- Nombres de contenedores (`stockguard-gateway`, `-backend`, `-db`) y del volumen (`stockguard-pgdata`) derivan de `COMPOSE_PROJECT_NAME` (por defecto `stockguard`), lo que permite levantar una segunda instancia aislada (`COMPOSE_PROJECT_NAME=sgclone GATEWAY_PORT=18080`).
- Persistencia: `docker compose down` conserva el volumen; solo `down -v` lo elimina.

### 8.3 Entorno de pruebas (`docker-compose.test.yml`)

Proyecto `stockguard-test`, independiente del principal: `db-test` (PostgreSQL 16 en `tmpfs`, BD `stockguard_test`, credenciales propias) y `backend-test` (imagen `stockguard/backend-test:1.0.0`, target `build`, ejecuta `jest --runInBand`). El runner se conecta por la red `stockguard-test-net`; **no se publica ningun puerto**. El override opcional `docker-compose.test.host.yml` publica `127.0.0.1:55432` solo para ejecutar Jest desde el host. El codigo de salida de `docker compose run` es el de Jest.

Protecciones frente a la BD de demostracion: `test/setup-env.ts` solo usa `TEST_POSTGRES_*` (ignora `POSTGRES_*` del `.env`); `test/test-app.ts` exige `NODE_ENV=test`, nombre terminado en `_test`, coincidencia con `TEST_POSTGRES_DB` y verifica `current_database()` antes de migrar y truncar.

---

## 9. Endpoints

Base: `http://localhost:8080`. Prefijo de la API: `/api/v1`. Respuestas paginadas: `{ data: [...], meta: { page, limit, totalItems, totalPages, hasNextPage, hasPreviousPage } }`. Errores: `{ statusCode, code, message, details?, timestamp, path, requestId }`.

| Metodo | Ruta | Funcion | Parametros / cabeceras relevantes | Codigos |
| --- | --- | --- | --- | --- |
| GET | `/health` | Salud del Gateway | - | 200 |
| GET | `/` | Pagina de bienvenida | - | 200 |
| GET | `/docs` | Swagger UI | - | 200 |
| GET | `/docs/openapi.json` / `.yaml` | OpenAPI 3 | - | 200 |
| GET | `/api/v1/health/live` | Liveness del backend | - | 200 |
| GET | `/api/v1/health/ready` | Readiness (`SELECT 1`) | - | 200, 503 `SERVICE_UNAVAILABLE` |
| POST | `/api/v1/categories` | Crear categoria | body `{ name, description? }` | 201, 400 `VALIDATION_ERROR`, 409 `CATEGORY_NAME_TAKEN` |
| GET | `/api/v1/categories` | Listar | `page, limit, order (asc/desc), sortBy (name/createdAt), search` | 200, 400 |
| GET | `/api/v1/categories/{id}` | Obtener | uuid | 200, 400, 404 `CATEGORY_NOT_FOUND` |
| PATCH | `/api/v1/categories/{id}` | Actualizar parcial | `{ name?, description? }` | 200, 400, 404, 409 `CATEGORY_NAME_TAKEN` |
| DELETE | `/api/v1/categories/{id}` | Eliminar (fisico, solo sin productos) | - | 204, 404, 409 `CATEGORY_HAS_PRODUCTS` |
| POST | `/api/v1/products` | Crear producto (stock 0) | `{ sku, name, description?, referencePrice, minimumStock?, categoryId }` | 201, 400, 404 `CATEGORY_NOT_FOUND`, 409 `PRODUCT_SKU_TAKEN` |
| GET | `/api/v1/products` | Listar | `page, limit, order, sortBy (name/sku/stock/createdAt), search, categoryId, status (active*/inactive/all)` | 200, 400 |
| GET | `/api/v1/products/{id}` | Obtener (incluye inactivos) | uuid | 200, 400, 404 `PRODUCT_NOT_FOUND` |
| PATCH | `/api/v1/products/{id}` | Actualizar parcial (sin `stock`/`isActive`) | campos opcionales | 200, 400, 404, 409 `PRODUCT_SKU_TAKEN` / `PRODUCT_INACTIVE` |
| DELETE | `/api/v1/products/{id}` | Baja logica | - | 204, 404, 409 `PRODUCT_HAS_STOCK` / `PRODUCT_INACTIVE` |
| POST | `/api/v1/movements` | Entrada o salida | **`Idempotency-Key`**; `{ productId, type, quantity, reason }`; respuesta con `Idempotent-Replayed` | 201, 400 `VALIDATION_ERROR`/`IDEMPOTENCY_KEY_REQUIRED`/`IDEMPOTENCY_KEY_INVALID`, 404 `PRODUCT_NOT_FOUND`, 409 `INSUFFICIENT_STOCK`/`PRODUCT_INACTIVE`/`IDEMPOTENCY_KEY_REUSED` |
| GET | `/api/v1/movements` | Listar | `page, limit, order (desc*), productId, type, from, to` | 200, 400 |
| GET | `/api/v1/movements/{id}` | Detalle (con `reversedByMovementId`) | uuid | 200, 400, 404 `MOVEMENT_NOT_FOUND` |
| POST | `/api/v1/movements/{id}/reversal` | Revertir (compensacion) | **`Idempotency-Key`**; `{ reason }` | 201, 400, 404 `MOVEMENT_NOT_FOUND`, 409 `MOVEMENT_ALREADY_REVERSED`/`MOVEMENT_IS_REVERSAL`/`INSUFFICIENT_STOCK`/`PRODUCT_INACTIVE`/`IDEMPOTENCY_KEY_REUSED` |
| GET | `/api/v1/reports/low-stock` | Stock bajo | `page, limit` | 200 |
| GET | `/api/v1/reports/summary` | Resumen | - | 200 |

Errores generados por el Gateway: 429 `RATE_LIMITED`, 413 `PAYLOAD_TOO_LARGE`, 503 `SERVICE_UNAVAILABLE` (mismo formato JSON).

### 9.1 Ejemplos JSON (ilustrativos, validos contra los DTO)

Crear categoria (`POST /api/v1/categories`):

```json
{ "name": "Gaming", "description": "Perifericos gamer" }
```

Actualizar categoria (`PATCH /api/v1/categories/{id}`):

```json
{ "description": "Perifericos y accesorios gamer" }
```

Crear producto (`POST /api/v1/products`):

```json
{ "sku": "mou-gm-01", "name": "Mouse gamer", "description": "RGB, 16000 DPI", "referencePrice": "129.90", "minimumStock": 3, "categoryId": "<categoryId>" }
```

Respuesta (ilustrativa): `sku` normalizado a `"MOU-GM-01"`, `stock: 0`, `isLowStock: true`, `isActive: true`, `referencePrice: "129.90"`.

Actualizar producto (`PATCH /api/v1/products/{id}`):

```json
{ "minimumStock": 5, "referencePrice": "119.90" }
```

Entrada (`POST /api/v1/movements`, cabecera `Idempotency-Key: compra-2026-0001`):

```json
{ "productId": "<productId>", "type": "IN", "quantity": 10, "reason": "Compra a proveedor - factura 0012" }
```

Salida (`Idempotency-Key: venta-2026-0001`):

```json
{ "productId": "<productId>", "type": "OUT", "quantity": 4, "reason": "Venta mostrador - ticket 1045" }
```

Reversion (`POST /api/v1/movements/{movementId}/reversal`, `Idempotency-Key: rev-2026-0001`):

```json
{ "reason": "Venta anulada por el cliente" }
```

Respuesta de movimiento (forma real del DTO, valores ilustrativos):

```json
{
  "id": "6f1c...", "productId": "7c9e...", "type": "OUT", "quantity": 4, "reason": "Venta mostrador - ticket 1045",
  "previousStock": 10, "resultingStock": 6, "idempotencyKey": "venta-2026-0001", "reversesMovementId": null,
  "createdAt": "2026-10-12T23:40:00.000Z"
}
```

Errores (formas reales obtenidas en las verificaciones; identificadores abreviados):

```json
{ "statusCode": 409, "code": "INSUFFICIENT_STOCK", "message": "Stock insuficiente: disponible 1, solicitado 3", "details": { "available": 1, "requested": 3 }, "timestamp": "...", "path": "/api/v1/movements", "requestId": "..." }
```

```json
{ "statusCode": 400, "code": "VALIDATION_ERROR", "message": "Datos de entrada invalidos", "details": [ { "field": "name", "constraints": [ "name must be longer than or equal to 2 characters", "name should not be empty" ] } ], "timestamp": "...", "path": "/api/v1/categories", "requestId": "..." }
```

```json
{ "statusCode": 404, "code": "PRODUCT_NOT_FOUND", "message": "Producto 00000000-0000-4000-8000-000000000000 no encontrado", "timestamp": "...", "path": "/api/v1/movements", "requestId": "8a9b4ff4e1d5fdff096265e7d10ef09a" }
```

```json
{ "statusCode": 503, "code": "SERVICE_UNAVAILABLE", "message": "La base de datos no esta disponible", "details": { "database": "down" }, "timestamp": "...", "path": "/api/v1/health/ready", "requestId": "..." }
```

---

## 10. Pruebas ejecutadas por Devin (verificacion tecnica)

Entorno: Windows 10/11, Docker Desktop (Engine 29.8.2, Compose v5.5.1), Windows PowerShell 5.1, Git Bash, Node.js 24.21 (solo para Newman/compilacion local), Java 21 (PlantUML). Fecha: **2026-10-12** (hora local America/La_Paz; marcas UTC en los logs). Codigo evaluado: commit `eefb37f` de `feature/cierre-tecnico`. A esa fecha `main` **no** contenia este codigo (ver seccion 10.1b y 11.1 para el estado real de las ramas, reverificado el 2026-10-17). Todo lo listado fue ejecutado realmente.

| # | Comando | Resultado | Que verifica | Limitaciones |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` y `npm run build` (en `backend/`) | Sin errores (exit 0) | Compilacion TypeScript estricta | - |
| 2 | `docker compose -f docker-compose.test.yml run --rm --build backend-test` | `Test Suites: 5 passed`, `Tests: 35 passed` (28 s), `TEST_EXIT=0`; migracion `InitialSchema1760000000000` aplicada en la BD efimera | 6 pruebas unitarias + 29 de integracion contra PostgreSQL real por la red interna, sin puerto publicado; guardas de BD de pruebas | El primer intento con la version anterior del compose fallo en este equipo por el puerto 55432 reservado por Windows, lo que motivo la correccion |
| 3 | `docker compose up --build -d` + `docker compose ps` | Imagenes `stockguard/gateway:1.0.0` y `stockguard/backend:1.0.0` construidas; `stockguard-db`, `stockguard-backend`, `stockguard-gateway` en `(healthy)`; solo el gateway con `0.0.0.0:8080->80/tcp`; log del backend `Esquema al dia (sin migraciones pendientes)` y `Seed ... movementsReplayed: 9` | Construccion, orden de arranque, healthchecks, migraciones y seed idempotente sobre un volumen existente | El primer arranque desde cero (migracion aplicada, seed con `categoriesCreated: 5, productsCreated: 11, movementsCreated: 9`) se verifico en la prueba de clon limpio (seccion 10.1) |
| 4 | `powershell -File scripts/smoke-test.ps1` | `29 OK, 0 FAIL`, exit 0 | Salud, Swagger, CRUD, validaciones, idempotencia (replay y 409), stock insuficiente, dos salidas simultaneas `[201, 409]`, reversion y doble reversion, reportes, CORS permitido/no permitido, 429, baja logica | Windows PowerShell 5.1 (no se probo PowerShell 7) |
| 5 | `bash scripts/smoke-test.sh` | `29 OK, 0 FAIL`, exit 0 | Lo mismo desde Git Bash + curl | - |
| 6 | `npx newman@6 run postman/... -e postman/...` | `requests 109, assertions 151, failed 0`, exit 0 | Coleccion Postman completa (CRUD, idempotencia, reversiones, reportes, CORS, rate limit, baja logica) | - |
| 7 | `curl.exe -s -X POST .../categories -d "{bad"` | 400 `VALIDATION_ERROR` **con** `requestId` | Correccion del filtro: trazabilidad en errores de JSON malformado | - |
| 8 | GET 404 + `docker compose logs gateway/backend` filtrados por el `X-Request-ID` | Misma `request_id` `62630ab2...` en el log JSON del Gateway (`status 404, upstream_status 404`) y en el del backend | Trazabilidad extremo a extremo | - |
| 9 | `docker compose down` + `docker compose up -d` | Volumen `stockguard-pgdata` conservado; `GET /reports/summary` identico antes y despues (`activeProducts 12, totalUnits 126, lowStockProducts 5, categories 15`); seed `movementsReplayed: 9` | Persistencia sin eliminar el volumen | - |
| 10 | `docker compose stop db` -> `GET /api/v1/health/ready` -> `docker compose start db` | 503 `SERVICE_UNAVAILABLE` (`database: down`) y luego 200 (`database: up`) | Readiness real contra PostgreSQL; respuesta 503 atravesando el Gateway | - |
| 11 | 60 GET por una conexion keep-alive (`curl.exe` con 60 URLs) | 22 x 200, 38 x 429 | Rate limiting (10 r/s, rafaga 20) | La proporcion varia con la velocidad del cliente |
| 12 | Comparacion de 4 formas de enviar JSON con `curl.exe` en PowerShell 5.1 | `-d "{\"name\":...}"` llega **malformado** (400 "Expected property name"); `-d '{\"name\":...}'`, `-d "@archivo"` e `Invoke-RestMethod` funcionan | Validez de los ejemplos del README para Windows | Solo PowerShell 5.1; por eso el README adopta el archivo JSON como forma recomendada |
| 13 | `java -jar plantuml.jar -tpng/-tsvg docs/diagrams/*.puml` | Exportacion correcta de los 4 archivos | Diagramas C4 actualizados y legibles | Requiere internet para incluir C4-PlantUML |
| 14 | `docker compose config` con y sin `COMPOSE_PROJECT_NAME=sgclone` | Nombres `stockguard-*`/`stockguard-pgdata` por defecto y `sgclone-*`/`sgclone-pgdata` con la variable | Aislamiento de una segunda instancia | - |

### 10.1 Prueba desde clon limpio del repositorio remoto

Ver `docs/08-resultados-verificacion.md`, seccion "Clon limpio", donde se registra el commit comprobado, el proyecto Compose aislado utilizado (`sgclone`, puerto 18080, volumen `sgclone-pgdata`) y el resultado.

### 10.1b Reverificacion del cierre tecnico (2026-10-17)

Repetida de forma independiente sobre la copia de trabajo local (rama `feature/cierre-tecnico`, commit `eefb37f` + cambios de documentacion de este cierre), sin tocar la base de demostracion:

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` (en `backend/`) | Sin errores |
| `docker compose -f docker-compose.test.yml run --rm --build backend-test` | `Test Suites: 5 passed, 5 total`; `Tests: 35 passed, 35 total` (BD efimera `stockguard_test`, sin afectar `stockguard-pgdata`) |
| `.\scripts\smoke-test.ps1` contra la instancia de demostracion ya en ejecucion (`http://localhost:8080`) | `29 OK, 0 FAIL`; datos previos del usuario preservados, solo se agrego la categoria/producto `SMOKE-<timestamp>` (baja logica, se conserva como historial, como documenta el propio script) |
| `docker ps` / `GET /api/v1/reports/summary` antes y despues | Contenedores `stockguard-gateway/backend/db` y volumen `stockguard-pgdata` intactos; no se uso `down -v` en ningun momento |
| `git fetch origin` + `git log --oneline` en `main`, `develop` y `feature/cierre-tecnico` | `main` = solo el commit inicial (`3b522f8`); no existe la etiqueta `v1.0.0` ni la rama `release/1.0.0`; `develop` esta al dia con `origin/develop`; `feature/cierre-tecnico` un commit por delante de `develop` |

Conclusion: el codigo y las 35 pruebas siguen pasando tras los cambios de documentacion de este cierre; la unica brecha es de Git Flow (integracion `develop` -> `main` pendiente), no de funcionalidad.

### 10.2 No verificado por Devin ni en la reverificacion

- Pruebas manuales y capturas del estudiante (pendientes, ver `GUIA_PRUEBAS_Y_CAPTURAS.md`).
- Ejecucion en otro equipo o sistema operativo distinto de Windows + Docker Desktop.
- PowerShell 7 (`pwsh`) no estaba instalado; los scripts contemplan ambas versiones pero solo se ejecutaron en 5.1.

---

## 11. Git Flow y rubrica

### 11.1 Ramas e integraciones

| Rama | Commits principales | Integracion |
| --- | --- | --- |
| `feature/backend-foundation` | scaffold NestJS; CRUD; movimientos transaccionales con idempotencia y reversiones; seed; pruebas de integracion; Dockerfile multi-etapa | merge `--no-ff` en `develop` |
| `feature/gateway` | Nginx (CORS, logs, rate limiting, request id); Compose con healthchecks y runner; smoke tests | merge `--no-ff` en `develop` |
| `feature/docs` | coleccion Postman; documentacion | merge `--no-ff` en `develop` |
| `fix/line-endings` | `.gitattributes` LF (hallado en un clon limpio en Windows) | merge `--no-ff` en `develop` |
| `fix/tsconfig-forward-compat` | `moduleResolution node16`; puerto de BD de pruebas configurable | merge `--no-ff` en `develop` |
| `feature/cierre-tecnico` | aislamiento del entorno de pruebas, nombres de Compose parametrizables, `requestId` en errores de JSON malformado, alcance sin frontend, README/docs/C4 definitivos, base para el informe y guia de pruebas, correcciones de este cierre | Pull Request `#2` fusionado en `develop` (merge commit) |
| `release/1.0.0` | ajustes finales de README/documentacion para la version estable | Fusionada en `main` (merge commit) y de vuelta en `develop`; etiqueta anotada `v1.0.0` sobre el commit de `main` |

Estado real verificado tras la integracion (ver `docs/08-resultados-verificacion.md` para los comandos y SHA exactos): `main` contiene el merge de `release/1.0.0` (todo el codigo de `backend/`, `gateway/`, Docker Compose, documentacion, Postman y diagramas) y esta etiquetado `v1.0.0`; `develop` recibio la misma release de vuelta. El informe PDF y la entrega en Moodle son posteriores y corresponden al estudiante.

### 11.2 Criterios del examen vs. evidencia

| Criterio | Archivos / implementacion | Evidencia disponible |
| --- | --- | --- |
| Gateway: unico punto de entrada | `docker-compose.yml` (solo `gateway` con `ports`) | `docker compose ps`; captura E01 de la guia |
| Gateway: proxy inverso funcional | `gateway/templates/10-stockguard.conf.template`, `snippets/proxy.conf` | Smoke tests, Newman, Swagger via 8080; capturas E02-E13 |
| Gateway: >= 2 transversales | `snippets/cors.conf`, `15-cors-origins.sh`, `nginx.conf` (logs), `limit_req*`, `X-Request-ID` | Pruebas 4, 5, 6, 8, 11; capturas E16-E18 |
| NestJS + TypeScript | `backend/src/**`, `tsconfig.json` | Prueba 1 |
| PostgreSQL y persistencia | `data-source.ts`, migracion, volumen | Pruebas 3, 9; captura E19 |
| CRUD categorias y productos | `categories/`, `products/` | Pruebas 2, 4-6; capturas E03-E05, E14, E15 |
| DTO / Repository / DI | `*/dto`, `*.repository.ts`, modulos | Prueba 2; seccion 5 |
| Endpoints REST y reglas de negocio | seccion 6, `docs/02-reglas-de-negocio.md` | Pruebas 2, 4-6; capturas E06-E13 |
| Dockerfiles | `gateway/Dockerfile`, `backend/Dockerfile` | Prueba 3 |
| Compose: 3 servicios, bridge, depends_on, healthchecks, volumen, un puerto | `docker-compose.yml` | Pruebas 3, 9, 14; captura E01 |
| Dominio y C4 | `docs/01-dominio.md`, `docs/diagrams/*` | Prueba 13; archivos PNG/SVG |
| Git Flow, README, repositorio publico | historial, `README.md` | `git log --graph`; `docs/08` |

### 11.3 Pendientes del estudiante

1. Ejecutar las pruebas manuales de `GUIA_PRUEBAS_Y_CAPTURAS.md` y tomar las capturas.
2. Redactar el informe PDF (5-8 paginas) con ChatGPT a partir de este documento, las capturas y los archivos listados en 12.5.
3. Subir el PDF y el enlace del repositorio a Moodle.

### 11.4 Integracion tecnica completada (no es tarea del estudiante)

El Pull Request `#2` (`feature/cierre-tecnico` -> `develop`) se fusiono; se creo `release/1.0.0` desde `develop`, se fusiono en `main` y de vuelta en `develop`; se publico la etiqueta anotada `v1.0.0`. Detalle y comandos verificados en `docs/08-resultados-verificacion.md`.

---

## 12. Material para redactar el informe

### 12.1 Explicacion de los diagramas C4

**Nivel 1 - Contexto** (`docs/diagrams/export/c4-level1-context.png`): muestra a las dos personas (Operador de tienda; Evaluador/Desarrollador), el sistema **StockGuard** como caja unica y, como sistema externo, los **clientes HTTP de prueba** (Swagger UI, Postman, cURL) a traves de los cuales ambos interactuan con la API por HTTP en el puerto 8080. Deja explicito que no existe un frontend propio.

**Nivel 2 - Contenedores** (`docs/diagrams/export/c4-level2-containers.png`): dentro del limite del sistema (Docker Compose, red bridge `stockguard-net`) aparecen los tres contenedores con su tecnologia y responsabilidades: **API Gateway** (Nginx 1.28; unico con puerto publicado; CORS, logs JSON, rate limiting, X-Request-ID, limites), **Microservicio StockGuard** (NestJS 11 / TypeScript / Node 22; `/api/v1`, transacciones con `FOR UPDATE`, idempotencia, reversiones, reportes, migraciones, Swagger) y **Base de datos** (PostgreSQL 16; tablas, restricciones, volumen `stockguard-pgdata`). Las relaciones indican protocolo y puerto: cliente -> Gateway HTTP 8080; Gateway -> backend HTTP 3000 (solo red interna); backend -> PostgreSQL TCP 5432 (solo red interna); y la respuesta backend -> Gateway sin cabeceras CORS (las agrega el Gateway). Los diagramas coinciden con `docker-compose.yml` y el codigo.

Fuentes editables: `docs/diagrams/c4-level1-context.puml`, `docs/diagrams/c4-level2-containers.puml` (C4-PlantUML). Exportados: `docs/diagrams/export/*.png` y `*.svg`.

### 12.2 Conclusiones tecnicas sustentadas

1. **El Gateway como unico punto de entrada simplifica la seguridad perimetral y la observabilidad**: todas las politicas transversales (CORS, limites, trazabilidad, logs) viven en un solo lugar y el backend queda inaccesible desde el host (verificado con `docker compose ps`: un solo puerto publicado).
2. **La consistencia del stock se garantiza en la base de datos, no solo en el codigo**: la combinacion de transaccion unica + `SELECT ... FOR UPDATE` + restricciones `CHECK`/`UNIQUE` hizo que dos salidas simultaneas por la ultima unidad produjeran exactamente un exito y un `409` con stock final 0, y que 12 salidas concurrentes nunca dejaran stock negativo (pruebas de integracion y smoke tests).
3. **La idempotencia persistida convierte los reintentos en operaciones seguras**: el reintento con la misma clave devolvio el mismo movimiento (`Idempotent-Replayed: true`) sin tocar el stock, incluso con 6 reintentos simultaneos; la reutilizacion de la clave con otro contenido fue rechazada (409). Al apoyarse en la clave primaria de `idempotency_records` el mecanismo funciona sin almacenamiento adicional (Redis) y sobrevive a reinicios.
4. **Los movimientos inmutables con compensaciones ofrecen auditoria completa**: ningun registro se edita ni borra; una correccion es un nuevo movimiento vinculado al original, con una sola reversion posible por movimiento (indice unico parcial).
5. **El despliegue es reproducible**: `docker compose up --build -d` desde un clon limpio levanta los tres servicios saludables, aplica migraciones y carga datos de demostracion; los datos sobreviven a `down`/`up` gracias al volumen nombrado.
6. **La separacion DTO / Service / Repository y la inyeccion de dependencias facilitaron las pruebas**: 35 pruebas automatizadas (unitarias e integracion contra PostgreSQL real) y 151 aserciones de Postman se ejecutan sin modificar el codigo de produccion.

### 12.3 Limitaciones (para la seccion correspondiente del informe)

Las de la seccion 1.5, mas: el rate limiting es por IP y con una sola instancia de Nginx (no distribuido); el seed esta pensado para demostracion; no se midio rendimiento bajo carga sostenida; PowerShell 7 no se probo.

### 12.4 Referencias oficiales utilizadas

- NestJS: <https://docs.nestjs.com/> (modulos, providers, pipes, exception filters, middleware, OpenAPI).
- TypeORM: <https://typeorm.io/> (migraciones, transacciones, `pessimistic_write`).
- PostgreSQL 16: <https://www.postgresql.org/docs/16/> (`SELECT ... FOR UPDATE`, restricciones, indices parciales, `pgcrypto`).
- Nginx: <https://nginx.org/en/docs/> (`ngx_http_proxy_module`, `ngx_http_limit_req_module`, `log_format`, `add_header`, `map`).
- Imagen oficial de Nginx (plantillas `envsubst`): <https://hub.docker.com/_/nginx>.
- Docker Compose: <https://docs.docker.com/compose/> (`depends_on` con `condition`, healthchecks, volumenes, redes).
- C4 model: <https://c4model.com/> y C4-PlantUML: <https://github.com/plantuml-stdlib/C4-PlantUML>.
- Idempotency-Key (borrador IETF): <https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/>.

### 12.5 Archivos complementarios para entregar a ChatGPT junto con este documento

| Archivo | Para que sirve |
| --- | --- |
| `docs/BASE_PARA_INFORME.md` (este) | Base tecnica completa |
| `docs/GUIA_PRUEBAS_Y_CAPTURAS.md` | Identificadores de las capturas (E01...) y lo que muestra cada una |
| `docs/08-resultados-verificacion.md` | Resultados reales de las verificaciones tecnicas, commit comprobado, enlaces a PR |
| `docs/06-matriz-rubrica.md` | Relacion criterio -> evidencia |
| `docs/diagrams/export/c4-level1-context.png` y `c4-level2-containers.png` | Figuras del informe |
| `README.md` | Instrucciones de clonacion/ejecucion (para citar) |
| `docs/03-endpoints.md` | Tabla de endpoints (si se desea anexar) |
| Capturas del estudiante (`docs/evidencias/E01-...png`, carpeta local no versionada) | Evidencias reales |
