/* eslint-disable */
// Generador de la coleccion Postman (ejecutar: node postman/build-collection.js).
// Mantener la coleccion como codigo evita errores manuales en el JSON.
const fs = require('node:fs');
const path = require('node:path');

const json = (body) => ({ mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } });
const url = (p, query = []) => ({ raw: `{{baseUrl}}${p}${query.length ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : ''}`, host: ['{{baseUrl}}'], path: p.replace(/^\//, '').split('/'), query });
const H = (...pairs) => pairs.map(([key, value]) => ({ key, value, type: 'text' }));
const JSON_H = ['Content-Type', 'application/json'];

const req = (name, method, p, { body, headers = [], query = [], tests = [], pre = [] } = {}) => {
  const item = { name, request: { method, header: H(...headers), url: url(p, query) }, event: [] };
  if (body !== undefined) item.request.body = typeof body === 'string' ? { mode: 'raw', raw: body, options: { raw: { language: 'json' } } } : json(body);
  if (pre.length) item.event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: pre } });
  if (tests.length) item.event.push({ listen: 'test', script: { type: 'text/javascript', exec: tests } });
  return item;
};

const okJson = (status) => [
  `pm.test("Status ${status}", () => pm.response.to.have.status(${status}));`,
  `pm.test("X-Request-ID presente", () => pm.expect(pm.response.headers.get("X-Request-ID")).to.be.a("string").and.not.empty);`,
];
const errCode = (status, code) => [
  ...okJson(status),
  `pm.test("code = ${code}", () => pm.expect(pm.response.json().code).to.eql("${code}"));`,
  `pm.test("Formato de error completo", () => { const b = pm.response.json(); ["statusCode","code","message","timestamp","path","requestId"].forEach(k => pm.expect(b).to.have.property(k)); });`,
];

const collection = {
  info: {
    _postman_id: 'b7f2c9e1-4d35-4a8e-8f61-9c0d1e2f3a4b',
    name: 'StockGuard API',
    description:
      'Coleccion de StockGuard a traves del Gateway Nginx ({{baseUrl}}).\n\n' +
      'Ejecutar las carpetas en orden (Runner o manualmente). Los IDs creados se guardan en el entorno.\n' +
      'Las pruebas de idempotencia reutilizan DELIBERADAMENTE la misma clave (variables idemKey*), generada una sola vez por ejecucion (runId).\n\n' +
      'Autor: Gonzalo Gabriel Apaza Ticona - UCB "San Pablo".',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  event: [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [
          '// Inicializa un identificador de ejecucion y las claves de idempotencia UNA sola vez.',
          'if (!pm.environment.get("runId")) {',
          '  const runId = Date.now().toString(36);',
          '  pm.environment.set("runId", runId);',
          '  pm.environment.set("idemKeyIn", `pm-${runId}-in-0001`);',
          '  pm.environment.set("idemKeyOut", `pm-${runId}-out-0001`);',
          '  pm.environment.set("idemKeyReversal", `pm-${runId}-rev-0001`);',
          '}',
        ],
      },
    },
  ],
  variable: [{ key: 'baseUrl', value: 'http://localhost:8080' }],
  item: [
    {
      name: '00 Salud y documentacion',
      item: [
        req('Gateway /health', 'GET', '/health', { tests: okJson(200) }),
        req('Backend liveness', 'GET', '/api/v1/health/live', { tests: okJson(200) }),
        req('Backend readiness (PostgreSQL)', 'GET', '/api/v1/health/ready', {
          tests: [...okJson(200), 'pm.test("database up", () => pm.expect(pm.response.json().checks.database).to.eql("up"));'],
        }),
        req('OpenAPI JSON', 'GET', '/docs/openapi.json', { tests: [...okJson(200), 'pm.test("openapi 3", () => pm.expect(pm.response.json().openapi).to.match(/^3\\./));'] }),
      ],
    },
    {
      name: '01 Categorias (CRUD)',
      item: [
        req('Crear categoria', 'POST', '/api/v1/categories', {
          headers: [JSON_H],
          body: { name: 'Postman {{runId}} - Cables', description: 'Categoria creada desde Postman' },
          tests: [...okJson(201), 'pm.environment.set("categoryId", pm.response.json().id);', 'pm.test("name normalizado", () => pm.expect(pm.response.json().name).to.include("Cables"));'],
        }),
        req('Crear categoria duplicada (409)', 'POST', '/api/v1/categories', {
          headers: [JSON_H],
          body: { name: '  postman {{runId}} - CABLES  ' },
          tests: errCode(409, 'CATEGORY_NAME_TAKEN'),
        }),
        req('Crear categoria invalida (400)', 'POST', '/api/v1/categories', {
          headers: [JSON_H],
          body: { name: ' ', extra: 'no permitido' },
          tests: [...errCode(400, 'VALIDATION_ERROR'), 'pm.test("details por campo", () => pm.expect(pm.response.json().details).to.be.an("array").that.is.not.empty);'],
        }),
        req('Listar categorias (paginado)', 'GET', '/api/v1/categories', {
          query: [{ key: 'page', value: '1' }, { key: 'limit', value: '10' }, { key: 'sortBy', value: 'name' }, { key: 'order', value: 'asc' }],
          tests: [...okJson(200), 'pm.test("meta de paginacion", () => { const m = pm.response.json().meta; ["page","limit","totalItems","totalPages","hasNextPage","hasPreviousPage"].forEach(k => pm.expect(m).to.have.property(k)); });'],
        }),
        req('Obtener categoria', 'GET', '/api/v1/categories/{{categoryId}}', { tests: okJson(200) }),
        req('Actualizar categoria', 'PATCH', '/api/v1/categories/{{categoryId}}', {
          headers: [JSON_H],
          body: { description: 'Descripcion actualizada desde Postman' },
          tests: [...okJson(200), 'pm.test("description actualizada", () => pm.expect(pm.response.json().description).to.include("actualizada"));'],
        }),
        req('Categoria inexistente (404)', 'GET', '/api/v1/categories/00000000-0000-4000-8000-000000000000', { tests: errCode(404, 'CATEGORY_NOT_FOUND') }),
      ],
    },
    {
      name: '02 Productos (CRUD)',
      item: [
        req('Crear producto (stock inicial 0)', 'POST', '/api/v1/products', {
          headers: [JSON_H],
          body: { sku: 'pm-{{runId}}-usbc', name: 'Cable USB-C Postman', description: 'Trenzado 60 W', referencePrice: '49.90', minimumStock: 3, categoryId: '{{categoryId}}' },
          tests: [
            ...okJson(201),
            'const p = pm.response.json(); pm.environment.set("productId", p.id);',
            'pm.test("stock inicial 0", () => pm.expect(p.stock).to.eql(0));',
            'pm.test("SKU normalizado a mayusculas", () => pm.expect(p.sku).to.eql(p.sku.toUpperCase()));',
            'pm.test("precio como cadena decimal", () => pm.expect(p.referencePrice).to.eql("49.90"));',
          ],
        }),
        req('Crear producto con stock en el body (400)', 'POST', '/api/v1/products', {
          headers: [JSON_H],
          body: { sku: 'pm-{{runId}}-bad', name: 'Invalido', referencePrice: '-5', categoryId: '{{categoryId}}', stock: 10 },
          tests: errCode(400, 'VALIDATION_ERROR'),
        }),
        req('Crear producto SKU duplicado (409)', 'POST', '/api/v1/products', {
          headers: [JSON_H],
          body: { sku: 'PM-{{runId}}-USBC', name: 'Otro', referencePrice: '1.00', categoryId: '{{categoryId}}' },
          tests: errCode(409, 'PRODUCT_SKU_TAKEN'),
        }),
        req('Listar productos (busqueda y filtros)', 'GET', '/api/v1/products', {
          query: [{ key: 'search', value: 'usbc' }, { key: 'categoryId', value: '{{categoryId}}' }, { key: 'status', value: 'active' }, { key: 'sortBy', value: 'name' }, { key: 'limit', value: '20' }],
          tests: [...okJson(200), 'pm.test("incluye el producto creado", () => pm.expect(pm.response.json().data.map(p => p.id)).to.include(pm.environment.get("productId")));'],
        }),
        req('Obtener producto', 'GET', '/api/v1/products/{{productId}}', { tests: okJson(200) }),
        req('Actualizar producto (sin stock)', 'PATCH', '/api/v1/products/{{productId}}', {
          headers: [JSON_H],
          body: { minimumStock: 5, description: 'Actualizado desde Postman' },
          tests: [...okJson(200), 'pm.test("minimumStock = 5", () => pm.expect(pm.response.json().minimumStock).to.eql(5));'],
        }),
        req('Eliminar categoria con productos (409)', 'DELETE', '/api/v1/categories/{{categoryId}}', { tests: errCode(409, 'CATEGORY_HAS_PRODUCTS') }),
      ],
    },
    {
      name: '03 Movimientos e idempotencia',
      item: [
        req('Entrada IN 10 (clave idemKeyIn)', 'POST', '/api/v1/movements', {
          headers: [JSON_H, ['Idempotency-Key', '{{idemKeyIn}}']],
          body: { productId: '{{productId}}', type: 'IN', quantity: 10, reason: 'Compra a proveedor - Postman' },
          tests: [
            ...okJson(201),
            'const m = pm.response.json(); pm.environment.set("movementInId", m.id);',
            'pm.test("previous 0 -> resulting 10", () => { pm.expect(m.previousStock).to.eql(0); pm.expect(m.resultingStock).to.eql(10); });',
            'pm.test("Idempotent-Replayed: false", () => pm.expect(pm.response.headers.get("Idempotent-Replayed")).to.eql("false"));',
          ],
        }),
        req('Reintento IN con LA MISMA clave (replay)', 'POST', '/api/v1/movements', {
          headers: [JSON_H, ['Idempotency-Key', '{{idemKeyIn}}']],
          body: { productId: '{{productId}}', type: 'in', quantity: 10, reason: '  Compra a proveedor -   Postman ' },
          tests: [
            ...okJson(201),
            'pm.test("Idempotent-Replayed: true", () => pm.expect(pm.response.headers.get("Idempotent-Replayed")).to.eql("true"));',
            'pm.test("mismo movimiento, sin duplicar", () => pm.expect(pm.response.json().id).to.eql(pm.environment.get("movementInId")));',
          ],
        }),
        req('Misma clave con contenido distinto (409)', 'POST', '/api/v1/movements', {
          headers: [JSON_H, ['Idempotency-Key', '{{idemKeyIn}}']],
          body: { productId: '{{productId}}', type: 'IN', quantity: 11, reason: 'Compra a proveedor - Postman' },
          tests: errCode(409, 'IDEMPOTENCY_KEY_REUSED'),
        }),
        req('Sin cabecera Idempotency-Key (400)', 'POST', '/api/v1/movements', {
          headers: [JSON_H],
          body: { productId: '{{productId}}', type: 'IN', quantity: 1, reason: 'Sin clave' },
          tests: errCode(400, 'IDEMPOTENCY_KEY_REQUIRED'),
        }),
        req('Salida OUT 4 (clave idemKeyOut)', 'POST', '/api/v1/movements', {
          headers: [JSON_H, ['Idempotency-Key', '{{idemKeyOut}}']],
          body: { productId: '{{productId}}', type: 'OUT', quantity: 4, reason: 'Venta mostrador - Postman' },
          tests: [...okJson(201), 'const m = pm.response.json(); pm.environment.set("movementOutId", m.id);', 'pm.test("resulting 6", () => pm.expect(m.resultingStock).to.eql(6));'],
        }),
        req('Salida mayor al stock (409 INSUFFICIENT_STOCK)', 'POST', '/api/v1/movements', {
          headers: [JSON_H, ['Idempotency-Key', 'pm-{{runId}}-out-9999']],
          body: { productId: '{{productId}}', type: 'OUT', quantity: 999, reason: 'Venta imposible' },
          tests: [...errCode(409, 'INSUFFICIENT_STOCK'), 'pm.test("details.available = 6", () => pm.expect(pm.response.json().details.available).to.eql(6));'],
        }),
        req('Stock del producto = 6', 'GET', '/api/v1/products/{{productId}}', { tests: [...okJson(200), 'pm.test("stock 6", () => pm.expect(pm.response.json().stock).to.eql(6));'] }),
        req('Listar movimientos del producto', 'GET', '/api/v1/movements', {
          query: [{ key: 'productId', value: '{{productId}}' }, { key: 'order', value: 'desc' }, { key: 'limit', value: '20' }],
          tests: [...okJson(200), 'pm.test("2 movimientos", () => pm.expect(pm.response.json().meta.totalItems).to.eql(2));'],
        }),
        req('Filtro de fechas invalido (400)', 'GET', '/api/v1/movements', {
          query: [{ key: 'from', value: '2026-12-31T00:00:00Z' }, { key: 'to', value: '2026-01-01T00:00:00Z' }],
          tests: errCode(400, 'VALIDATION_ERROR'),
        }),
        req('Obtener movimiento OUT', 'GET', '/api/v1/movements/{{movementOutId}}', { tests: okJson(200) }),
      ],
    },
    {
      name: '04 Reversiones',
      item: [
        req('Revertir salida OUT (clave idemKeyReversal)', 'POST', '/api/v1/movements/{{movementOutId}}/reversal', {
          headers: [JSON_H, ['Idempotency-Key', '{{idemKeyReversal}}']],
          body: { reason: 'Venta anulada por el cliente - Postman' },
          tests: [
            ...okJson(201),
            'const r = pm.response.json(); pm.environment.set("reversalId", r.id);',
            'pm.test("IN 4 vinculado al original", () => { pm.expect(r.type).to.eql("IN"); pm.expect(r.quantity).to.eql(4); pm.expect(r.reversesMovementId).to.eql(pm.environment.get("movementOutId")); });',
            'pm.test("stock vuelve a 10", () => pm.expect(r.resultingStock).to.eql(10));',
          ],
        }),
        req('Reintento de reversion con LA MISMA clave (replay)', 'POST', '/api/v1/movements/{{movementOutId}}/reversal', {
          headers: [JSON_H, ['Idempotency-Key', '{{idemKeyReversal}}']],
          body: { reason: 'Venta anulada por el cliente - Postman' },
          tests: [...okJson(201), 'pm.test("Idempotent-Replayed: true", () => pm.expect(pm.response.headers.get("Idempotent-Replayed")).to.eql("true"));', 'pm.test("mismo id", () => pm.expect(pm.response.json().id).to.eql(pm.environment.get("reversalId")));'],
        }),
        req('Segunda reversion con otra clave (409)', 'POST', '/api/v1/movements/{{movementOutId}}/reversal', {
          headers: [JSON_H, ['Idempotency-Key', 'pm-{{runId}}-rev-0002']],
          body: { reason: 'Intento de doble reversion' },
          tests: errCode(409, 'MOVEMENT_ALREADY_REVERSED'),
        }),
        req('Revertir una compensacion (409)', 'POST', '/api/v1/movements/{{reversalId}}/reversal', {
          headers: [JSON_H, ['Idempotency-Key', 'pm-{{runId}}-rev-0003']],
          body: { reason: 'No se puede revertir una reversion' },
          tests: errCode(409, 'MOVEMENT_IS_REVERSAL'),
        }),
        req('Revertir entrada IN dejaria stock negativo (409)', 'POST', '/api/v1/movements/{{movementInId}}/reversal', {
          headers: [JSON_H, ['Idempotency-Key', 'pm-{{runId}}-rev-0004']],
          pre: ['// Antes: registrar una salida de 3 para que revertir la entrada de 10 deje stock negativo (10 - 3 = 7 < 10).',
            'pm.sendRequest({ url: pm.environment.get("baseUrl") + "/api/v1/movements", method: "POST", header: { "Content-Type": "application/json", "Idempotency-Key": "pm-" + pm.environment.get("runId") + "-out-0003" }, body: { mode: "raw", raw: JSON.stringify({ productId: pm.environment.get("productId"), type: "OUT", quantity: 3, reason: "Venta previa a la prueba de reversion" }) } }, () => {});'],
          body: { reason: 'Entrada registrada por error' },
          tests: errCode(409, 'INSUFFICIENT_STOCK'),
        }),
        req('Detalle del OUT revertido (reversedByMovementId)', 'GET', '/api/v1/movements/{{movementOutId}}', {
          tests: [...okJson(200), 'pm.test("reversedByMovementId = reversalId", () => pm.expect(pm.response.json().reversedByMovementId).to.eql(pm.environment.get("reversalId")));'],
        }),
      ],
    },
    {
      name: '05 Reportes',
      item: [
        req('Stock bajo', 'GET', '/api/v1/reports/low-stock', {
          query: [{ key: 'page', value: '1' }, { key: 'limit', value: '50' }],
          tests: [...okJson(200), 'pm.test("solo activos con stock <= minimo", () => pm.response.json().data.forEach(p => { pm.expect(p.isActive).to.eql(true); pm.expect(p.stock).to.be.at.most(p.minimumStock); }));'],
        }),
        req('Resumen', 'GET', '/api/v1/reports/summary', {
          tests: [...okJson(200), 'pm.test("campos del resumen", () => { const b = pm.response.json(); ["activeProducts","totalUnits","lowStockProducts","categories","generatedAt"].forEach(k => pm.expect(b).to.have.property(k)); });'],
        }),
      ],
    },
    {
      name: '06 Gateway (CORS, rate limit, trazabilidad)',
      item: [
        req('Preflight CORS origen permitido', 'OPTIONS', '/api/v1/movements', {
          headers: [['Origin', '{{origin}}'], ['Access-Control-Request-Method', 'POST'], ['Access-Control-Request-Headers', 'content-type, idempotency-key']],
          tests: [
            'pm.test("204", () => pm.response.to.have.status(204));',
            'pm.test("Allow-Origin = origin", () => pm.expect(pm.response.headers.get("Access-Control-Allow-Origin")).to.eql(pm.environment.get("origin")));',
            'pm.test("Allow-Headers incluye Idempotency-Key", () => pm.expect(pm.response.headers.get("Access-Control-Allow-Headers")).to.include("Idempotency-Key"));',
          ],
        }),
        req('Preflight CORS origen NO permitido', 'OPTIONS', '/api/v1/movements', {
          headers: [['Origin', 'http://evil.example'], ['Access-Control-Request-Method', 'POST']],
          tests: ['pm.test("sin Allow-Origin", () => pm.expect(pm.response.headers.get("Access-Control-Allow-Origin")).to.be.oneOf([null, undefined, ""]));'],
        }),
        req('X-Request-ID del cliente es reemplazado', 'GET', '/api/v1/health/live', {
          headers: [['X-Request-ID', 'spoofed-request-id-123']],
          tests: ['pm.test("id generado por el gateway", () => pm.expect(pm.response.headers.get("X-Request-ID")).to.not.eql("spoofed-request-id-123"));'],
        }),
        req('Rate limiting (rafaga de 60 -> al menos un 429)', 'GET', '/api/v1/categories', {
          query: [{ key: 'limit', value: '1' }],
          pre: [
            '// Dispara 60 peticiones en paralelo antes de esta; al menos una debe recibir 429 (RATE_LIMIT_RPS=10, BURST=20).',
            'let done = 0, c429 = 0;',
            'const total = 60;',
            'for (let i = 0; i < total; i++) {',
            '  pm.sendRequest(pm.environment.get("baseUrl") + "/api/v1/categories?limit=1", (err, res) => { if (res && res.code === 429) c429++; if (++done === total) pm.variables.set("count429", c429); });',
            '}',
          ],
          tests: [
            'pm.test("Esta peticion responde 200 o 429", () => pm.expect(pm.response.code).to.be.oneOf([200, 429]));',
            'pm.test("La rafaga previa produjo 429 (ver consola si falla: puede requerir reintentar)", () => pm.expect(Number(pm.variables.get("count429") || 0) + (pm.response.code === 429 ? 1 : 0)).to.be.above(0));',
            'if (pm.response.code === 429) pm.test("429 JSON con code RATE_LIMITED", () => pm.expect(pm.response.json().code).to.eql("RATE_LIMITED"));',
          ],
        }),
      ],
    },
    {
      name: '07 Baja logica y limpieza',
      item: [
        req('Dar de baja producto con stock (409)', 'DELETE', '/api/v1/products/{{productId}}', { tests: errCode(409, 'PRODUCT_HAS_STOCK') }),
        req('Salida del stock restante', 'POST', '/api/v1/movements', {
          headers: [JSON_H, ['Idempotency-Key', 'pm-{{runId}}-cleanup']],
          pre: ['pm.sendRequest(pm.environment.get("baseUrl") + "/api/v1/products/" + pm.environment.get("productId"), (err, res) => { pm.variables.set("remaining", res.json().stock); });'],
          body: '{"productId":"{{productId}}","type":"OUT","quantity":{{remaining}},"reason":"Limpieza final Postman"}',
          tests: ['pm.test("201 o ya sin stock", () => pm.expect(pm.response.code).to.be.oneOf([201, 400]));'],
        }),
        req('Dar de baja producto (204)', 'DELETE', '/api/v1/products/{{productId}}', { tests: ['pm.test("204", () => pm.response.to.have.status(204));'] }),
        req('Producto inactivo consultable', 'GET', '/api/v1/products/{{productId}}', { tests: [...okJson(200), 'pm.test("isActive false", () => pm.expect(pm.response.json().isActive).to.eql(false));'] }),
        req('Movimiento sobre producto inactivo (409)', 'POST', '/api/v1/movements', {
          headers: [JSON_H, ['Idempotency-Key', 'pm-{{runId}}-inactive']],
          body: { productId: '{{productId}}', type: 'IN', quantity: 1, reason: 'No permitido' },
          tests: errCode(409, 'PRODUCT_INACTIVE'),
        }),
        req('Listar inactivos', 'GET', '/api/v1/products', {
          query: [{ key: 'status', value: 'inactive' }, { key: 'search', value: 'pm-{{runId}}' }],
          tests: [...okJson(200), 'pm.test("aparece el producto inactivo", () => pm.expect(pm.response.json().data.map(p => p.id)).to.include(pm.environment.get("productId")));'],
        }),
        req('Eliminar categoria sigue bloqueado (409, historial)', 'DELETE', '/api/v1/categories/{{categoryId}}', {
          tests: [...errCode(409, 'CATEGORY_HAS_PRODUCTS'), '// Limpieza del entorno para permitir una nueva ejecucion completa', 'pm.environment.unset("runId");'],
        }),
      ],
    },
  ],
};

fs.writeFileSync(path.join(__dirname, 'StockGuard.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
console.log('Coleccion generada: postman/StockGuard.postman_collection.json');
