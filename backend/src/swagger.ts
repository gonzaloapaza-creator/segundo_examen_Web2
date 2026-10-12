import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'docs';
export const OPENAPI_JSON_PATH = 'docs/openapi.json';

const DESCRIPTION = `
API de control de inventario para una tienda de accesorios tecnologicos.

**Autor:** Gonzalo Gabriel Apaza Ticona - Universidad Catolica Boliviana "San Pablo".

### Modelo de operaciones
- **Categorias y productos**: CRUD completo. El *stock* de un producto nunca se edita directamente.
- **Movimientos**: registros **auditables e inmutables** (sin PATCH/DELETE). Operaciones del dominio:
  - \`POST /movements\`: entrada (IN) o salida (OUT) con \`previousStock\`/\`resultingStock\` calculados en el servidor.
  - \`POST /movements/{id}/reversal\`: compensacion que genera el movimiento contrario y lo vincula al original.
- **Baja logica**: \`DELETE /products/{id}\` marca \`isActive=false\` (solo con stock 0) y conserva el historial.
  Los productos inactivos siguen consultables por id, no aparecen en listados por defecto (\`status=active\`),
  no admiten PATCH ni movimientos (409 \`PRODUCT_INACTIVE\`).

### Transacciones y concurrencia
Cada movimiento se ejecuta en **una transaccion PostgreSQL** con \`SELECT ... FOR UPDATE\` sobre la fila del producto.
Dos salidas simultaneas sobre la ultima unidad se serializan: una se completa y la otra recibe 409 \`INSUFFICIENT_STOCK\`.
Restricciones en la BD (\`CHECK stock >= 0\`, unicidad, FK) refuerzan las reglas.

### Idempotencia (\`Idempotency-Key\`)
Obligatoria en \`POST /movements\` y \`POST /movements/{id}/reversal\`.
- Formato: 8-128 caracteres \`[A-Za-z0-9._-]\`. Alcance: global (una clave = una operacion en todo el sistema).
- Primera ejecucion: **201** + \`Idempotent-Replayed: false\`.
- Reintento con la misma clave y la misma huella (operacion + parametros normalizados, SHA-256): **201** con el cuerpo original y \`Idempotent-Replayed: true\`, sin tocar el stock.
- Misma clave con contenido u operacion diferente: **409** \`IDEMPOTENCY_KEY_REUSED\`.
- Solicitudes fallidas (4xx) no reservan la clave: se puede reintentar tras corregir la causa.
- Reintentos simultaneos se serializan en la BD (clave primaria de \`idempotency_records\`).

### Errores
Formato unico: \`{ statusCode, code, message, details?, timestamp, path, requestId }\`.
El \`requestId\` lo genera el Gateway (cabecera \`X-Request-ID\`) y permite correlacionar logs.

> Esta primera fase **no incluye autenticacion**: pensada para demostracion local detras del Gateway Nginx.
`;

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('StockGuard API')
    .setDescription(DESCRIPTION)
    .setVersion('0.1.0')
    .setContact('Gonzalo Gabriel Apaza Ticona', '', '')
    .addServer('/', 'Gateway (mismo origen)')
    .addTag('Categorias', 'CRUD de categorias')
    .addTag('Productos', 'CRUD de productos con baja logica')
    .addTag('Movimientos', 'Entradas, salidas y reversiones (inmutables, idempotentes)')
    .addTag('Reportes', 'Stock bajo y resumen')
    .addTag('Salud', 'Liveness y readiness')
    .build();

  const document = SwaggerModule.createDocument(app, config, { operationIdFactory: (_c, method) => method });
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    yamlDocumentUrl: 'docs/openapi.yaml',
    useGlobalPrefix: false,
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, tagsSorter: 'alpha', operationsSorter: 'alpha' },
    customSiteTitle: 'StockGuard API - Swagger',
  });
  return document;
}
