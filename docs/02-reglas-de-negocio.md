# StockGuard - Reglas de negocio

Cada regla indica donde se aplica (codigo) y como se refuerza en PostgreSQL. Los codigos de error se devuelven en el campo `code`.

## Categorias

| # | Regla | Aplicacion | Refuerzo en BD | Error |
| --- | --- | --- | --- | --- |
| C1 | Nombre obligatorio, 2-80 caracteres, espacios normalizados (trim + colapso) | `CreateCategoryDto` (`@Transform`, `@MinLength`) | `CHECK length(btrim(name)) > 0` | 400 `VALIDATION_ERROR` |
| C2 | Nombre unico sin distinguir mayusculas | `CategoriesService.assertNameAvailable` + traduccion de `23505` | `UNIQUE INDEX lower(name)` | 409 `CATEGORY_NAME_TAKEN` |
| C3 | No eliminar categorias con productos asociados, **incluidos inactivos** | `CategoriesService.remove` (cuenta todos los productos en transaccion) | `FK ... ON DELETE RESTRICT` (protege carreras) | 409 `CATEGORY_HAS_PRODUCTS` |
| C4 | Campos desconocidos rechazados | `ValidationPipe({ whitelist, forbidNonWhitelisted })` | - | 400 |

## Productos

| # | Regla | Aplicacion | Refuerzo en BD | Error |
| --- | --- | --- | --- | --- |
| P1 | SKU normalizado (trim + MAYUSCULAS), 3-40 caracteres `[A-Z0-9._-]`, unico | `CreateProductDto` + `ProductsService.assertSkuAvailable` | `UNIQUE INDEX sku`, `CHECK not blank` | 409 `PRODUCT_SKU_TAKEN` |
| P2 | Precio referencial no negativo, decimal exacto con 2 decimales, representado como cadena | DTO (`@Matches ^\d{1,10}(\.\d{1,2})?$`, acepta numero y lo convierte a cadena) | `NUMERIC(12,2)`, `CHECK >= 0` | 400 |
| P3 | Stock y stock minimo enteros >= 0 (max 1 000 000) | DTO | `CHECK stock >= 0`, `CHECK minimum_stock >= 0` | 400 / 409 |
| P4 | Todo producto nace con stock 0; existencias iniciales via movimiento `IN` | `ProductsService.create` fija `stock: 0` | `DEFAULT 0` | - |
| P5 | `stock` e `isActive` **no** se aceptan en POST/PATCH | DTO no los declara + `forbidNonWhitelisted` | - | 400 (`property stock should not exist`) |
| P6 | La categoria debe existir | `CategoriesService.getOrFail` | FK | 404 `CATEGORY_NOT_FOUND` |
| P7 | DELETE = baja logica que conserva el historial | `ProductsService.remove` -> `isActive=false` | movimientos con `FK ON DELETE RESTRICT` | 204 |
| P8 | Rechazar la baja si el producto tiene existencias | mismo metodo, con `SELECT ... FOR UPDATE` | - | 409 `PRODUCT_HAS_STOCK` |
| P9 | Listados muestran solo activos por defecto; filtro explicito `status=active|inactive|all` | `ListProductsQueryDto` | indice `(is_active, name)` | - |
| P10 | Producto inactivo: `GET /products/{id}` lo devuelve (`isActive=false`); `PATCH` y `DELETE` responden 409; no admite movimientos | `ProductsService.assertActive`, `MovementsService.lockActiveProduct` | - | 409 `PRODUCT_INACTIVE` |
| P11 | Reactivacion **no** disponible en la fase 1 (limitacion documentada) | - | - | - |

## Movimientos

| # | Regla | Aplicacion | Refuerzo en BD | Error |
| --- | --- | --- | --- | --- |
| M1 | Cantidad entera > 0 (max 1 000 000); motivo obligatorio 3-255 | `CreateMovementDto` | `CHECK quantity > 0`, `CHECK reason not blank` | 400 |
| M2 | `previousStock` y `resultingStock` calculados **solo** en el servidor | `MovementsService.applyMovement` | `CHECK resulting = previous +/- quantity` | - |
| M3 | `IN` incrementa, `OUT` disminuye | idem | idem | - |
| M4 | Salida mayor al disponible rechazada | idem (`resultingStock < 0`) | `CHECK stock >= 0` | 409 `INSUFFICIENT_STOCK` (details: available, requested) |
| M5 | Stock resultante no supera 1 000 000 | idem | - | 409 `CONFLICT` |
| M6 | Movimientos inmutables: sin PATCH/DELETE | no existen rutas | - | 404 de ruta |
| M7 | Actualizacion de stock + insercion del movimiento en **una transaccion** | `IdempotencyService.execute` -> `manager.transaction` | atomicidad PostgreSQL | - |
| M8 | Concurrencia: bloqueo pesimista de la fila del producto | `ProductsRepository.findByIdForUpdate` (`SELECT ... FOR UPDATE`) | bloqueo de fila | - |
| M9 | Baja logica coordinada con movimientos (mismo bloqueo de fila) | `ProductsService.remove` usa `FOR UPDATE` | - | 409 `PRODUCT_INACTIVE` / `PRODUCT_HAS_STOCK` |
| M10 | Movimientos sobre productos inactivos rechazados | `lockActiveProduct` tras adquirir el bloqueo | - | 409 `PRODUCT_INACTIVE` |

## Reversiones (compensaciones)

| # | Regla | Aplicacion | Refuerzo en BD | Error |
| --- | --- | --- | --- | --- |
| R1 | Genera el movimiento contrario por la cantidad **total** y lo vincula (`reversesMovementId`) | `MovementsService.reverse` | FK autorreferencial | 201 |
| R2 | Exige motivo y `Idempotency-Key` | `ReverseMovementDto`, decorador `@IdempotencyKey` | - | 400 |
| R3 | Rechaza una segunda reversion del mismo movimiento | bloqueo `FOR UPDATE` del original + `findReversalOf` | `UNIQUE INDEX reverses_movement_id WHERE NOT NULL` | 409 `MOVEMENT_ALREADY_REVERSED` |
| R4 | No permite revertir una compensacion | `original.reversesMovementId != null` | - | 409 `MOVEMENT_IS_REVERSAL` |
| R5 | Rechaza si dejaria stock negativo o el producto esta inactivo | `applyMovement` / `lockActiveProduct` | `CHECK stock >= 0` | 409 `INSUFFICIENT_STOCK` / `PRODUCT_INACTIVE` |
| R6 | El movimiento original permanece intacto | nunca se actualiza `inventory_movements` | - | - |

## Idempotencia

| Aspecto | Definicion |
| --- | --- |
| Cabecera | `Idempotency-Key`, **obligatoria** en `POST /movements` y `POST /movements/{id}/reversal` |
| Formato | 8 a 128 caracteres del conjunto `[A-Za-z0-9._-]` (400 `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_INVALID`) |
| Alcance de unicidad | **Global**: una clave identifica una unica operacion en todo el sistema (PK de `idempotency_records`, UNIQUE en `inventory_movements.idempotency_key`) |
| Huella de la peticion | SHA-256 de `{operation, ...parametros}` canonicalizados (claves ordenadas, DTO ya normalizado: `type` en mayusculas, `reason` con espacios colapsados). Para reversiones incluye `movementId` |
| Primera ejecucion | `201 Created`, cabecera `Idempotent-Replayed: false` |
| Reintento con la misma clave y huella | `201 Created` con el **cuerpo original** y `Idempotent-Replayed: true`; el stock no cambia |
| Misma clave, huella distinta (contenido u operacion diferente) | `409 IDEMPOTENCY_KEY_REUSED` |
| Peticiones simultaneas con la misma clave | Se serializan en la BD: el `INSERT` de la segunda espera al commit de la primera y luego reproduce la respuesta. Una sola operacion |
| Solicitudes fallidas (4xx/5xx) | La transaccion se revierte y **no** se guarda la clave; el cliente puede reintentarla tras corregir la causa |
| Persistencia | Tabla `idempotency_records` en PostgreSQL (no memoria), dentro de la misma transaccion que el movimiento |

## Reportes

| Reporte | Regla |
| --- | --- |
| `GET /reports/low-stock` | Solo productos **activos** con `stock <= minimumStock`; orden por deficit (`stock - minimumStock`) ascendente, luego nombre e id |
| `GET /reports/summary` | `activeProducts` (activos), `totalUnits` (suma de stock de activos), `lowStockProducts` (activos con stock bajo), `categories` (todas), `generatedAt` |

## Listados

- Paginacion `page` (>= 1) y `limit` (1..1000, recortado al valor `PAGINATION_MAX_LIMIT`, por defecto 100). Metadatos: `page, limit, totalItems, totalPages, hasNextPage, hasPreviousPage`.
- Ordenamiento determinista: campo elegido (`sortBy`) + desempate por `id`.
- Productos: `search` (nombre o SKU, ILIKE con escape de `% _ \`), `categoryId`, `status`.
- Movimientos: `productId`, `type`, `from`/`to` ISO 8601 (`to` no puede ser anterior a `from`), orden por fecha descendente por defecto.
- Todo parametro desconocido o invalido responde `400 VALIDATION_ERROR` con `details[]` por campo.

## Fechas

- Todas las columnas temporales son `timestamptz` (UTC en la BD).
- Las respuestas devuelven ISO 8601 con `Z` (`2026-10-11T23:55:42.281Z`).
