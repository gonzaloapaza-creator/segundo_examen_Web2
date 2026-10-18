import { SeedService } from '../src/database/seed/seed.service';
import { api, createCategory, createProduct, createTestApp, movement, TestContext } from './test-app';

describe('Reportes, salud y seed', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  it('stock bajo incluye solo activos con stock <= minimo y el resumen es consistente', async () => {
    const c1 = await createCategory(ctx, 'Cables');
    const c2 = await createCategory(ctx, 'Audio');
    const normal = await createProduct(ctx, c1.id, { sku: 'NORMAL-1', minimumStock: 2 });
    const low = await createProduct(ctx, c1.id, { sku: 'LOW-1', minimumStock: 5 });
    const zero = await createProduct(ctx, c2.id, { sku: 'ZERO-1', minimumStock: 1 });
    const inactive = await createProduct(ctx, c2.id, { sku: 'INACT-1', minimumStock: 3 });

    await movement(ctx, 'test-in-00001', { productId: normal.id, type: 'IN', quantity: 10 }).expect(201);
    await movement(ctx, 'test-in-00002', { productId: low.id, type: 'IN', quantity: 5 }).expect(201);
    await ctx.http().delete(api(`/products/${inactive.id}`)).expect(204);

    const lowStock = await ctx.http().get(api('/reports/low-stock')).expect(200);
    expect(lowStock.body.data.map((p: { sku: string }) => p.sku).sort()).toEqual(['LOW-1', 'ZERO-1']);
    expect(lowStock.body.data.every((p: { isLowStock: boolean; isActive: boolean }) => p.isLowStock && p.isActive)).toBe(true);
    expect(zero.stock).toBe(0);

    const summary = await ctx.http().get(api('/reports/summary')).expect(200);
    expect(summary.body).toMatchObject({ activeProducts: 3, totalUnits: 15, lowStockProducts: 2, categories: 2 });
    expect(summary.body.generatedAt).toMatch(/Z$/);
  });

  it('health live/ready responden 200 con BD disponible', async () => {
    const live = await ctx.http().get(api('/health/live')).expect(200);
    expect(live.body.status).toBe('ok');
    const ready = await ctx.http().get(api('/health/ready')).expect(200);
    expect(ready.body.checks.database).toBe('up');
    expect(ready.headers['x-request-id']).toBeDefined();
  });

  it('propaga el X-Request-ID recibido y lo incluye en errores', async () => {
    const res = await ctx.http().get(api('/products/00000000-0000-4000-8000-000000000000')).set('X-Request-ID', 'gateway-req-12345').expect(404);
    expect(res.headers['x-request-id']).toBe('gateway-req-12345');
    expect(res.body.requestId).toBe('gateway-req-12345');
  });

  it('el seed es idempotente y no sobrescribe stock modificado por el usuario', async () => {
    const seed = ctx.app.get(SeedService);
    const first = await seed.run();
    expect(first.productsCreated).toBeGreaterThan(0);
    expect(first.movementsCreated).toBeGreaterThan(0);

    const products = await ctx.http().get(api('/products?search=CAB-USBC-1M')).expect(200);
    const product = products.body.data[0];
    await movement(ctx, 'test-user-out', { productId: product.id, type: 'OUT', quantity: 3 }).expect(201);
    const stockAfterUser = product.stock - 3;

    const second = await seed.run();
    expect(second).toMatchObject({ categoriesCreated: 0, productsCreated: 0, movementsCreated: 0 });
    expect(second.movementsReplayed).toBe(first.movementsCreated);

    const after = await ctx.http().get(api(`/products/${product.id}`)).expect(200);
    expect(after.body.stock).toBe(stockAfterUser);
    const movements = await ctx.http().get(api(`/movements?productId=${product.id}`)).expect(200);
    expect(movements.body.meta.totalItems).toBe(2);
  });
});
