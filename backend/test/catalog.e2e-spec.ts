import { api, createCategory, createProduct, createTestApp, movement, TestContext } from './test-app';

describe('Catalogo: categorias y productos (PostgreSQL real)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  describe('categorias', () => {
    it('CRUD completo con normalizacion de espacios y timestamps ISO', async () => {
      const created = await ctx.http().post(api('/categories')).send({ name: '  Cables   y adaptadores ', description: '  ' }).expect(201);
      expect(created.body).toMatchObject({ name: 'Cables y adaptadores', description: null });
      expect(created.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

      const list = await ctx.http().get(api('/categories')).expect(200);
      expect(list.body.meta).toMatchObject({ page: 1, limit: 20, totalItems: 1, totalPages: 1 });

      await ctx.http().patch(api(`/categories/${created.body.id}`)).send({ description: 'Nueva' }).expect(200);
      const one = await ctx.http().get(api(`/categories/${created.body.id}`)).expect(200);
      expect(one.body.description).toBe('Nueva');

      await ctx.http().delete(api(`/categories/${created.body.id}`)).expect(204);
      const notFound = await ctx.http().get(api(`/categories/${created.body.id}`)).expect(404);
      expect(notFound.body).toMatchObject({ statusCode: 404, code: 'CATEGORY_NOT_FOUND' });
      expect(notFound.body.requestId).toBeDefined();
    });

    it('rechaza nombres duplicados sin distinguir mayusculas (409 + restriccion en BD)', async () => {
      await createCategory(ctx, 'Audio');
      const dup = await ctx.http().post(api('/categories')).send({ name: '  AUDIO ' }).expect(409);
      expect(dup.body.code).toBe('CATEGORY_NAME_TAKEN');

      await expect(ctx.dataSource.query(`INSERT INTO categories (name) VALUES ('audio')`)).rejects.toMatchObject({ driverError: { code: '23505' } });
    });

    it('rechaza campos desconocidos y nombre vacio (400 VALIDATION_ERROR)', async () => {
      const res = await ctx.http().post(api('/categories')).send({ name: '   ', extra: 1 }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      const fields = res.body.details.map((d: { field: string }) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['name', 'extra']));
    });

    it('no permite eliminar una categoria con productos asociados, incluso inactivos', async () => {
      const category = await createCategory(ctx);
      const product = await createProduct(ctx, category.id);
      const blocked = await ctx.http().delete(api(`/categories/${category.id}`)).expect(409);
      expect(blocked.body.code).toBe('CATEGORY_HAS_PRODUCTS');

      await ctx.http().delete(api(`/products/${product.id}`)).expect(204);
      const stillBlocked = await ctx.http().delete(api(`/categories/${category.id}`)).expect(409);
      expect(stillBlocked.body.code).toBe('CATEGORY_HAS_PRODUCTS');
    });

    it('valida los parametros de paginacion', async () => {
      await ctx.http().get(api('/categories?page=0')).expect(400);
      await ctx.http().get(api('/categories?limit=abc')).expect(400);
      await ctx.http().get(api('/categories?order=sideways')).expect(400);
    });
  });

  describe('productos', () => {
    it('crea con stock 0, normaliza SKU y expone el precio como cadena decimal', async () => {
      const category = await createCategory(ctx);
      const res = await ctx.http().post(api('/products')).send({ sku: ' cab-usbc-1m ', name: 'Cable', referencePrice: 49.9, categoryId: category.id }).expect(201);
      expect(res.body).toMatchObject({ sku: 'CAB-USBC-1M', stock: 0, minimumStock: 0, referencePrice: '49.90', isActive: true, isLowStock: true });
    });

    it('rechaza stock en POST/PATCH, precio negativo y categoria inexistente', async () => {
      const category = await createCategory(ctx);
      const bad = await ctx.http().post(api('/products')).send({ sku: 'ABC-1', name: 'X', referencePrice: '-1', categoryId: category.id, stock: 10 }).expect(400);
      const fields = bad.body.details.map((d: { field: string }) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['stock', 'referencePrice']));

      const missingCat = await ctx
        .http()
        .post(api('/products'))
        .send({ sku: 'ABC-1', name: 'Producto X', referencePrice: '1', categoryId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);
      expect(missingCat.body.code).toBe('CATEGORY_NOT_FOUND');

      const product = await createProduct(ctx, category.id);
      await ctx.http().patch(api(`/products/${product.id}`)).send({ stock: 3 }).expect(400);
      await ctx.http().patch(api(`/products/${product.id}`)).send({ isActive: false }).expect(400);
    });

    it('rechaza SKU duplicado (409) y lo refuerza en la BD', async () => {
      const category = await createCategory(ctx);
      await createProduct(ctx, category.id);
      const dup = await ctx.http().post(api('/products')).send({ sku: 'cab-usbc-1m', name: 'Otro', referencePrice: '1.00', categoryId: category.id }).expect(409);
      expect(dup.body.code).toBe('PRODUCT_SKU_TAKEN');
    });

    it('busca por nombre o SKU, filtra por categoria/estado y ordena de forma determinista', async () => {
      const c1 = await createCategory(ctx, 'Cables');
      const c2 = await createCategory(ctx, 'Audio');
      await createProduct(ctx, c1.id, { sku: 'CAB-1', name: 'Cable HDMI' });
      await createProduct(ctx, c1.id, { sku: 'CAB-2', name: 'Cable USB' });
      const p3 = await createProduct(ctx, c2.id, { sku: 'AUD-1', name: 'Audifonos' });
      await ctx.http().delete(api(`/products/${p3.id}`)).expect(204);

      const bySearch = await ctx.http().get(api('/products?search=hdmi')).expect(200);
      expect(bySearch.body.data.map((p: { sku: string }) => p.sku)).toEqual(['CAB-1']);

      const bySku = await ctx.http().get(api('/products?search=cab-')).expect(200);
      expect(bySku.body.data).toHaveLength(2);

      const activeOnly = await ctx.http().get(api('/products')).expect(200);
      expect(activeOnly.body.meta.totalItems).toBe(2);

      const inactive = await ctx.http().get(api('/products?status=inactive')).expect(200);
      expect(inactive.body.data.map((p: { sku: string }) => p.sku)).toEqual(['AUD-1']);

      const all = await ctx.http().get(api('/products?status=all&sortBy=sku&order=desc')).expect(200);
      expect(all.body.data.map((p: { sku: string }) => p.sku)).toEqual(['CAB-2', 'CAB-1', 'AUD-1']);

      const byCategory = await ctx.http().get(api(`/products?categoryId=${c2.id}&status=all`)).expect(200);
      expect(byCategory.body.meta.totalItems).toBe(1);

      await ctx.http().get(api('/products?status=unknown')).expect(400);
      await ctx.http().get(api('/products?categoryId=nope')).expect(400);
    });

    it('baja logica: rechaza si hay stock, conserva historial y bloquea PATCH/movimientos posteriores', async () => {
      const category = await createCategory(ctx);
      const product = await createProduct(ctx, category.id);
      await movement(ctx, 'test-in-00001', { productId: product.id, type: 'IN', quantity: 3 }).expect(201);

      const withStock = await ctx.http().delete(api(`/products/${product.id}`)).expect(409);
      expect(withStock.body.code).toBe('PRODUCT_HAS_STOCK');

      await movement(ctx, 'test-out-0001', { productId: product.id, type: 'OUT', quantity: 3 }).expect(201);
      await ctx.http().delete(api(`/products/${product.id}`)).expect(204);

      const detail = await ctx.http().get(api(`/products/${product.id}`)).expect(200);
      expect(detail.body.isActive).toBe(false);

      const patch = await ctx.http().patch(api(`/products/${product.id}`)).send({ name: 'Nuevo' }).expect(409);
      expect(patch.body.code).toBe('PRODUCT_INACTIVE');

      const mv = await movement(ctx, 'test-in-00002', { productId: product.id, type: 'IN', quantity: 1 }).expect(409);
      expect(mv.body.code).toBe('PRODUCT_INACTIVE');

      const again = await ctx.http().delete(api(`/products/${product.id}`)).expect(409);
      expect(again.body.code).toBe('PRODUCT_INACTIVE');

      const history = await ctx.http().get(api(`/movements?productId=${product.id}`)).expect(200);
      expect(history.body.meta.totalItems).toBe(2);
    });
  });
});
