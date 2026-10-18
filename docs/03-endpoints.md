# StockGuard - Tabla de endpoints

Todas las rutas se consumen **a traves del Gateway** (`http://localhost:8080` por defecto). El backend no publica puertos.
Documentacion interactiva: `GET /docs` (Swagger UI). Especificacion: `GET /docs/openapi.json` y `GET /docs/openapi.yaml`.

Formato de error comun (backend):

```json
{
  "statusCode": 409,
  "code": "INSUFFICIENT_STOCK",
  "message": "Stock insuficiente: disponible 1, solicitado 3",
  "details": { "available": 1, "requested": 3 },
  "timestamp": "2026-10-11T23:55:43.443Z",
  "path": "/api/v1/movements",
  "requestId": "515945a7-4464-469f-bb35-3d6b83aba983"
}
```

Los errores generados por el propio Gateway (429, 413, 502/503/504) usan el mismo formato con `code` `RATE_LIMITED`, `PAYLOAD_TOO_LARGE` o `SERVICE_UNAVAILABLE`.

## Gateway

| Metodo | Ruta | Descripcion | Respuestas |
| --- | --- | --- | --- |
| GET | `/health` | Salud del propio Nginx (no pasa por el backend, sin rate limit) | 200 |
| GET | `/` | Pagina estatica de bienvenida con enlaces a Swagger, OpenAPI y salud (no hay frontend) | 200 |
| GET | `/docs` | Swagger UI (proxy al backend) | 200 |
| GET | `/docs/openapi.json` | OpenAPI 3 en JSON | 200 |
| GET | `/docs/openapi.yaml` | OpenAPI 3 en YAML | 200 |

## Salud del backend (`/api/v1/health`, sin rate limit)

| Metodo | Ruta | Descripcion | Respuestas |
| --- | --- | --- | --- |
| GET | `/api/v1/health/live` | El proceso responde | 200 |
| GET | `/api/v1/health/ready` | Ejecuta `SELECT 1` en PostgreSQL | 200 `{checks:{database:"up"}}` / 503 `SERVICE_UNAVAILABLE` |

## Categorias

| Metodo | Ruta | Cuerpo / Query | Respuestas |
| --- | --- | --- | --- |
| POST | `/api/v1/categories` | `{ name, description? }` | 201, 400, 409 `CATEGORY_NAME_TAKEN` |
| GET | `/api/v1/categories` | `page, limit, order(asc/desc), sortBy(name/createdAt), search` | 200 paginado, 400 |
| GET | `/api/v1/categories/{id}` | - | 200, 400 (uuid), 404 `CATEGORY_NOT_FOUND` |
| PATCH | `/api/v1/categories/{id}` | `{ name?, description? }` | 200, 400, 404, 409 |
| DELETE | `/api/v1/categories/{id}` | - | 204, 404, 409 `CATEGORY_HAS_PRODUCTS` |

## Productos

| Metodo | Ruta | Cuerpo / Query | Respuestas |
| --- | --- | --- | --- |
| POST | `/api/v1/products` | `{ sku, name, description?, referencePrice ("49.90"), minimumStock?, categoryId }` (sin `stock`) | 201 (stock 0), 400, 404 `CATEGORY_NOT_FOUND`, 409 `PRODUCT_SKU_TAKEN` |
| GET | `/api/v1/products` | `page, limit, order, sortBy(name/sku/stock/createdAt), search (nombre o SKU), categoryId, status(active*/inactive/all)` | 200 paginado, 400 |
| GET | `/api/v1/products/{id}` | - (devuelve tambien inactivos) | 200, 400, 404 `PRODUCT_NOT_FOUND` |
| PATCH | `/api/v1/products/{id}` | mismos campos que POST, todos opcionales (sin `stock`/`isActive`) | 200, 400, 404, 409 `PRODUCT_SKU_TAKEN` / `PRODUCT_INACTIVE` |
| DELETE | `/api/v1/products/{id}` | baja logica | 204, 404, 409 `PRODUCT_HAS_STOCK` / `PRODUCT_INACTIVE` |

## Movimientos (registros auditables, sin PATCH/DELETE)

| Metodo | Ruta | Cabeceras / Cuerpo / Query | Respuestas |
| --- | --- | --- | --- |
| POST | `/api/v1/movements` | `Idempotency-Key` **obligatoria**; `{ productId, type (IN/OUT), quantity, reason }` | 201 (+ `Idempotent-Replayed: false/true`), 400 `VALIDATION_ERROR` / `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_INVALID`, 404 `PRODUCT_NOT_FOUND`, 409 `INSUFFICIENT_STOCK` / `PRODUCT_INACTIVE` / `IDEMPOTENCY_KEY_REUSED` |
| GET | `/api/v1/movements` | `page, limit, order(desc*), productId, type, from, to (ISO 8601)` | 200 paginado, 400 |
| GET | `/api/v1/movements/{id}` | - (incluye `reversedByMovementId`) | 200, 400, 404 `MOVEMENT_NOT_FOUND` |
| POST | `/api/v1/movements/{id}/reversal` | `Idempotency-Key` **obligatoria**; `{ reason }` | 201, 400, 404 `MOVEMENT_NOT_FOUND`, 409 `MOVEMENT_ALREADY_REVERSED` / `MOVEMENT_IS_REVERSAL` / `INSUFFICIENT_STOCK` / `PRODUCT_INACTIVE` / `IDEMPOTENCY_KEY_REUSED` |

## Reportes

| Metodo | Ruta | Query | Respuestas |
| --- | --- | --- | --- |
| GET | `/api/v1/reports/low-stock` | `page, limit` | 200 paginado (solo activos con `stock <= minimumStock`) |
| GET | `/api/v1/reports/summary` | - | 200 `{ activeProducts, totalUnits, lowStockProducts, categories, generatedAt }` |

## Cabeceras relevantes

| Cabecera | Direccion | Descripcion |
| --- | --- | --- |
| `X-Request-ID` | respuesta | Generada por el Gateway en cada peticion; se propaga al backend y aparece en logs de ambos y en los errores. Un valor enviado por el cliente es **reemplazado** |
| `Idempotency-Key` | peticion | Obligatoria en creacion y reversion de movimientos |
| `Idempotent-Replayed` | respuesta | `true` cuando la respuesta proviene de una ejecucion anterior con la misma clave |
| `Access-Control-*` | respuesta | Emitidas solo por el Gateway y solo para origenes de `CORS_ALLOWED_ORIGINS` |

## Codigos de error (`code`)

`VALIDATION_ERROR`, `NOT_FOUND`, `CATEGORY_NOT_FOUND`, `CATEGORY_NAME_TAKEN`, `CATEGORY_HAS_PRODUCTS`, `PRODUCT_NOT_FOUND`, `PRODUCT_SKU_TAKEN`, `PRODUCT_INACTIVE`, `PRODUCT_HAS_STOCK`, `MOVEMENT_NOT_FOUND`, `INSUFFICIENT_STOCK`, `MOVEMENT_ALREADY_REVERSED`, `MOVEMENT_IS_REVERSAL`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_INVALID`, `IDEMPOTENCY_KEY_REUSED`, `CONFLICT`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`, `RATE_LIMITED` (gateway), `PAYLOAD_TOO_LARGE` (gateway).
