# StockGuard - Descripcion del dominio

**Proyecto:** StockGuard - API de control de inventario para una pequena tienda de accesorios tecnologicos.
**Autor:** Gonzalo Gabriel Apaza Ticona - Universidad Catolica Boliviana "San Pablo".

## Problema de negocio

Una tienda pequena de accesorios tecnologicos (cables, cargadores, audio, almacenamiento, fundas) controla su
inventario de forma manual o con hojas de calculo. Esto produce:

| Problema | Consecuencia | Como lo resuelve StockGuard |
| --- | --- | --- |
| Diferencias de inventario | El stock real no coincide con el registrado | El stock **solo** cambia mediante movimientos registrados en la misma transaccion |
| Salidas superiores al stock disponible | Ventas de productos inexistentes | Rechazo `409 INSUFFICIENT_STOCK`; `CHECK stock >= 0` en la BD |
| Falta de historial de entradas y salidas | Imposible auditar que paso | Movimientos **inmutables** con `previousStock`/`resultingStock` y motivo |
| Dificultad para identificar reposiciones | Quiebres de stock | Reporte `low-stock` (`stock <= minimumStock`) y resumen |
| Duplicacion de movimientos por reintentos del cliente | Stock inflado o desinflado | Idempotencia obligatoria con `Idempotency-Key` persistida en PostgreSQL |

## Entidades

### Categoria (`categories`)

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID | generado por la BD (`gen_random_uuid()`) |
| `name` | varchar(80) | obligatorio, unico sin distinguir mayusculas (`uq_categories_name_lower`), espacios normalizados |
| `description` | varchar(500) nullable | cadena vacia -> `null` |
| `createdAt` / `updatedAt` | timestamptz | ISO 8601 UTC en JSON |

### Producto (`products`)

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID | |
| `sku` | varchar(40) | unico (`uq_products_sku`), normalizado a MAYUSCULAS, patron `[A-Z0-9][A-Z0-9._-]*` |
| `name` | varchar(120) | obligatorio |
| `description` | varchar(1000) nullable | |
| `referencePrice` | numeric(12,2) | **no negativo**; en JSON se expone como **cadena** (`"49.90"`) para no introducir errores de coma flotante. El backend nunca opera aritmeticamente con el precio |
| `stock` | integer | `CHECK >= 0`; siempre nace en **0**; no editable por POST/PATCH |
| `minimumStock` | integer | `CHECK >= 0`; umbral de reposicion |
| `categoryId` | UUID FK | `ON DELETE RESTRICT` |
| `isActive` | boolean | baja logica |
| `createdAt` / `updatedAt` | timestamptz | |

Campo derivado en la respuesta: `isLowStock = stock <= minimumStock`.

### Movimiento de inventario (`inventory_movements`)

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID | |
| `productId` | UUID FK | `ON DELETE RESTRICT` |
| `type` | enum `IN` / `OUT` | |
| `quantity` | integer | `CHECK > 0`, maximo 1 000 000 |
| `reason` | varchar(255) | obligatorio (3-255 caracteres) |
| `previousStock` | integer | calculado en el servidor |
| `resultingStock` | integer | calculado en el servidor; `CHECK` de coherencia con `type` y `quantity` |
| `idempotencyKey` | varchar(128) | unico (`uq_movements_idempotency_key`) |
| `reversesMovementId` | UUID nullable | enlaza la compensacion con el original; indice unico parcial (`uq_movements_single_reversal`) |
| `createdAt` | timestamptz | |

Campo derivado solo en el detalle: `reversedByMovementId`.

### Registro de idempotencia (`idempotency_records`)

| Campo | Tipo | Notas |
| --- | --- | --- |
| `key` | varchar(128) PK | la clave `Idempotency-Key` |
| `operation` | varchar(40) | `CREATE_MOVEMENT` o `REVERSE_MOVEMENT` |
| `requestHash` | char(64) | SHA-256 de la peticion canonicalizada |
| `responseStatus` | smallint | estado HTTP de la primera ejecucion (201) |
| `responseBody` | json | cuerpo devuelto en la primera ejecucion |
| `createdAt` | timestamptz | |

## Modelo de operaciones

- **Categorias y productos tienen CRUD** (crear, listar, obtener, actualizar parcialmente, eliminar/dar de baja).
- **Los movimientos NO son un CRUD**: son registros auditables e inmutables con operaciones propias del dominio:
  - `POST /movements` registra una entrada o salida.
  - `POST /movements/{id}/reversal` registra una compensacion.
  - `GET` para listar y consultar.
  - **No existen** `PATCH` ni `DELETE` de movimientos; una correccion siempre es un nuevo movimiento.

## Glosario

- **Baja logica**: `isActive = false`. El producto deja de aparecer en listados por defecto y no admite cambios ni movimientos, pero conserva su historial y sigue consultable por id.
- **Compensacion / reversion**: movimiento del tipo contrario por la cantidad total del original, vinculado por `reversesMovementId`.
- **Stock bajo**: producto activo con `stock <= minimumStock` (incluye stock cero).
