import { MovementsRepository } from '../src/movements/movements.repository';
import { api, createCategory, createProduct, createTestApp, movement, stockOf, TestContext } from './test-app';

describe('Movimientos de inventario: transacciones, concurrencia, idempotencia y reversiones', () => {
  let ctx: TestContext;
  let productId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await ctx.reset();
    const category = await createCategory(ctx);
    productId = (await createProduct(ctx, category.id)).id;
  });
  afterAll(() => ctx.close());

  describe('entradas y salidas', () => {
    it('registra entrada y salida con previous/resulting calculados en el servidor', async () => {
      const inRes = await movement(ctx, 'test-in-00001', { productId, type: 'IN', quantity: 10 }).expect(201);
      expect(inRes.body).toMatchObject({ type: 'IN', quantity: 10, previousStock: 0, resultingStock: 10, reversesMovementId: null });
      expect(inRes.headers['idempotent-replayed']).toBe('false');

      const outRes = await movement(ctx, 'test-out-0001', { productId, type: 'out', quantity: 4 }).expect(201);
      expect(outRes.body).toMatchObject({ type: 'OUT', previousStock: 10, resultingStock: 6 });
      expect(await stockOf(ctx, productId)).toBe(6);
    });

    it('rechaza salidas superiores al stock (409 INSUFFICIENT_STOCK) sin alterar el stock', async () => {
      await movement(ctx, 'test-in-00001', { productId, type: 'IN', quantity: 2 }).expect(201);
      const res = await movement(ctx, 'test-out-0001', { productId, type: 'OUT', quantity: 3 }).expect(409);
      expect(res.body).toMatchObject({ code: 'INSUFFICIENT_STOCK', details: { available: 2, requested: 3 } });
      expect(await stockOf(ctx, productId)).toBe(2);
      const list = await ctx.http().get(api(`/movements?productId=${productId}&type=OUT`)).expect(200);
      expect(list.body.meta.totalItems).toBe(0);
    });

    it('valida cantidad, tipo, motivo y cabecera Idempotency-Key', async () => {
      await movement(ctx, 'test-bad-0001', { productId, type: 'IN', quantity: 0 }).expect(400);
      await movement(ctx, 'test-bad-0002', { productId, type: 'IN', quantity: 1.5 }).expect(400);
      await movement(ctx, 'test-bad-0003', { productId, type: 'SIDEWAYS' as never, quantity: 1 }).expect(400);
      await movement(ctx, 'test-bad-0004', { productId, type: 'IN', quantity: 1, reason: '  ' }).expect(400);
      const noKey = await ctx.http().post(api('/movements')).send({ productId, type: 'IN', quantity: 1, reason: 'Compra' }).expect(400);
      expect(noKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      const badKey = await movement(ctx, 'short', { productId, type: 'IN', quantity: 1 }).expect(400);
      expect(badKey.body.code).toBe('IDEMPOTENCY_KEY_INVALID');
      expect(await stockOf(ctx, productId)).toBe(0);
    });

    it('revierte la transaccion completa si falla el registro del movimiento', async () => {
      await movement(ctx, 'test-in-00001', { productId, type: 'IN', quantity: 5 }).expect(201);
      const repo = ctx.app.get(MovementsRepository);
      const spy = jest.spyOn(repo, 'insert').mockRejectedValueOnce(new Error('fallo simulado al insertar el movimiento'));

      const res = await movement(ctx, 'test-out-fail', { productId, type: 'OUT', quantity: 2 }).expect(500);
      expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
      expect(res.body.message).not.toContain('simulado');
      spy.mockRestore();

      expect(await stockOf(ctx, productId)).toBe(5);
      const records = await ctx.dataSource.query(`SELECT * FROM idempotency_records WHERE key = 'test-out-fail'`);
      expect(records).toHaveLength(0);

      // Tras el fallo la clave queda libre: el reintento se ejecuta normalmente.
      await movement(ctx, 'test-out-fail', { productId, type: 'OUT', quantity: 2 }).expect(201);
      expect(await stockOf(ctx, productId)).toBe(3);
    });

    it('filtra por producto, tipo y rango de fechas con validacion de rango', async () => {
      await movement(ctx, 'test-in-00001', { productId, type: 'IN', quantity: 5 }).expect(201);
      await movement(ctx, 'test-out-0001', { productId, type: 'OUT', quantity: 1 }).expect(201);
      const now = new Date();
      const from = new Date(now.getTime() - 60_000).toISOString();
      const to = new Date(now.getTime() + 60_000).toISOString();

      const inRange = await ctx.http().get(api(`/movements?productId=${productId}&from=${from}&to=${to}`)).expect(200);
      expect(inRange.body.meta.totalItems).toBe(2);
      expect(inRange.body.data[0].type).toBe('OUT'); // mas reciente primero

      const outOnly = await ctx.http().get(api(`/movements?type=OUT`)).expect(200);
      expect(outOnly.body.meta.totalItems).toBe(1);

      const invalidRange = await ctx.http().get(api(`/movements?from=${to}&to=${from}`)).expect(400);
      expect(invalidRange.body.details[0].field).toBe('to');
      await ctx.http().get(api(`/movements?from=ayer`)).expect(400);
    });
  });

  describe('concurrencia', () => {
    it('dos salidas simultaneas para la ultima unidad: solo una se completa y el stock queda en 0', async () => {
      await movement(ctx, 'test-in-00001', { productId, type: 'IN', quantity: 1 }).expect(201);

      const [a, b] = await Promise.all([
        movement(ctx, 'test-race-a', { productId, type: 'OUT', quantity: 1 }),
        movement(ctx, 'test-race-b', { productId, type: 'OUT', quantity: 1 }),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 409]);
      const failed = a.status === 409 ? a : b;
      expect(failed.body.code).toBe('INSUFFICIENT_STOCK');

      expect(await stockOf(ctx, productId)).toBe(0);
      const outs = await ctx.http().get(api(`/movements?productId=${productId}&type=OUT`)).expect(200);
      expect(outs.body.meta.totalItems).toBe(1);
    });

    it('muchas salidas concurrentes nunca producen stock negativo', async () => {
      await movement(ctx, 'test-in-00001', { productId, type: 'IN', quantity: 5 }).expect(201);
      const results = await Promise.all(Array.from({ length: 12 }, (_, i) => movement(ctx, `test-many-${String(i).padStart(4, '0')}`, { productId, type: 'OUT', quantity: 1 })));
      const ok = results.filter((r) => r.status === 201).length;
      const conflicts = results.filter((r) => r.status === 409).length;
      expect(ok).toBe(5);
      expect(conflicts).toBe(7);
      expect(await stockOf(ctx, productId)).toBe(0);
    });

    it('la baja logica no puede intercalarse con un movimiento concurrente', async () => {
      // Producto con stock 0 -> baja permitida; a la vez llega una entrada. Resultado valido:
      //  (a) entrada primero: baja rechazada por PRODUCT_HAS_STOCK, o
      //  (b) baja primero: entrada rechazada por PRODUCT_INACTIVE.
      const [del, inc] = await Promise.all([
        ctx.http().delete(api(`/products/${productId}`)),
        movement(ctx, 'test-in-race', { productId, type: 'IN', quantity: 1 }),
      ]);
      const outcome = `${del.status}-${inc.status}`;
      expect(['409-201', '204-409']).toContain(outcome);
      const product = await ctx.http().get(api(`/products/${productId}`)).expect(200);
      if (outcome === '204-409') expect(product.body).toMatchObject({ isActive: false, stock: 0 });
      else expect(product.body).toMatchObject({ isActive: true, stock: 1 });
    });
  });

  describe('idempotencia', () => {
    it('reintento secuencial con la misma clave devuelve la respuesta original sin duplicar', async () => {
      await movement(ctx, 'test-in-00001', { productId, type: 'IN', quantity: 10 }).expect(201);
      const first = await movement(ctx, 'test-idem-0001', { productId, type: 'OUT', quantity: 2, reason: 'Venta  mostrador' }).expect(201);
      const retry = await movement(ctx, 'test-idem-0001', { productId, type: 'out', quantity: 2, reason: '  Venta mostrador ' }).expect(201);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body).toEqual(first.body);
      expect(await stockOf(ctx, productId)).toBe(8);
      const outs = await ctx.http().get(api(`/movements?type=OUT`)).expect(200);
      expect(outs.body.meta.totalItems).toBe(1);
    });

    it('misma clave con contenido distinto u operacion distinta responde 409 IDEMPOTENCY_KEY_REUSED', async () => {
      await movement(ctx, 'test-in-00001', { productId, type: 'IN', quantity: 10 }).expect(201);
      const first = await movement(ctx, 'test-idem-0002', { productId, type: 'OUT', quantity: 2 }).expect(201);
      const other = await movement(ctx, 'test-idem-0002', { productId, type: 'OUT', quantity: 3 }).expect(409);
      expect(other.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      const otherOp = await ctx.http().post(api(`/movements/${first.body.id}/reversal`)).set('Idempotency-Key', 'test-idem-0002').send({ reason: 'Error de registro' }).expect(409);
      expect(otherOp.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await stockOf(ctx, productId)).toBe(8);
    });

    it('reintentos simultaneos con la misma clave producen una sola operacion', async () => {
      await movement(ctx, 'test-in-00001', { productId, type: 'IN', quantity: 10 }).expect(201);
      const results = await Promise.all(Array.from({ length: 6 }, () => movement(ctx, 'test-idem-race', { productId, type: 'OUT', quantity: 1 })));
      expect(results.every((r) => r.status === 201)).toBe(true);
      const ids = new Set(results.map((r) => r.body.id));
      expect(ids.size).toBe(1);
      expect(results.filter((r) => r.headers['idempotent-replayed'] === 'false')).toHaveLength(1);
      expect(await stockOf(ctx, productId)).toBe(9);
    });
  });

  describe('reversiones', () => {
    it('reversion valida genera movimiento contrario vinculado y deja intacto el original', async () => {
      await movement(ctx, 'test-in-00001', { productId, type: 'IN', quantity: 10 }).expect(201);
      const out = await movement(ctx, 'test-out-0001', { productId, type: 'OUT', quantity: 4 }).expect(201);

      const rev = await ctx.http().post(api(`/movements/${out.body.id}/reversal`)).set('Idempotency-Key', 'test-rev-00001').send({ reason: 'Salida por error' }).expect(201);
      expect(rev.body).toMatchObject({ type: 'IN', quantity: 4, previousStock: 6, resultingStock: 10, reversesMovementId: out.body.id });
      expect(await stockOf(ctx, productId)).toBe(10);

      const original = await ctx.http().get(api(`/movements/${out.body.id}`)).expect(200);
      expect(original.body).toMatchObject({ type: 'OUT', quantity: 4, previousStock: 10, resultingStock: 6, reversedByMovementId: rev.body.id });

      // Reintento idempotente de la reversion
      const replay = await ctx.http().post(api(`/movements/${out.body.id}/reversal`)).set('Idempotency-Key', 'test-rev-00001').send({ reason: 'Salida por error' }).expect(201);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(await stockOf(ctx, productId)).toBe(10);
    });

    it('rechaza una segunda reversion, revertir una compensacion y exige motivo + clave', async () => {
      await movement(ctx, 'test-in-00001', { productId, type: 'IN', quantity: 10 }).expect(201);
      const out = await movement(ctx, 'test-out-0001', { productId, type: 'OUT', quantity: 4 }).expect(201);
      const rev = await ctx.http().post(api(`/movements/${out.body.id}/reversal`)).set('Idempotency-Key', 'test-rev-00001').send({ reason: 'Error de registro' }).expect(201);

      const second = await ctx.http().post(api(`/movements/${out.body.id}/reversal`)).set('Idempotency-Key', 'test-rev-00002').send({ reason: 'Otra vez' }).expect(409);
      expect(second.body.code).toBe('MOVEMENT_ALREADY_REVERSED');

      const ofReversal = await ctx.http().post(api(`/movements/${rev.body.id}/reversal`)).set('Idempotency-Key', 'test-rev-00003').send({ reason: 'No deberia permitirse' }).expect(409);
      expect(ofReversal.body.code).toBe('MOVEMENT_IS_REVERSAL');

      await ctx.http().post(api(`/movements/${out.body.id}/reversal`)).set('Idempotency-Key', 'test-rev-00004').send({}).expect(400);
      const noKey = await ctx.http().post(api(`/movements/${out.body.id}/reversal`)).send({ reason: 'Motivo valido' }).expect(400);
      expect(noKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      const missing = await ctx.http().post(api(`/movements/00000000-0000-4000-8000-000000000000/reversal`)).set('Idempotency-Key', 'test-rev-00005').send({ reason: 'Motivo valido' }).expect(404);
      expect(missing.body.code).toBe('MOVEMENT_NOT_FOUND');
      expect(await stockOf(ctx, productId)).toBe(10);
    });

    it('rechaza revertir una entrada si dejaria stock negativo', async () => {
      const inc = await movement(ctx, 'test-in-00001', { productId, type: 'IN', quantity: 5 }).expect(201);
      await movement(ctx, 'test-out-0001', { productId, type: 'OUT', quantity: 3 }).expect(201);
      const res = await ctx.http().post(api(`/movements/${inc.body.id}/reversal`)).set('Idempotency-Key', 'test-rev-00001').send({ reason: 'Entrada erronea' }).expect(409);
      expect(res.body).toMatchObject({ code: 'INSUFFICIENT_STOCK', details: { available: 2, requested: 5 } });
      expect(await stockOf(ctx, productId)).toBe(2);
    });

    it('dos reversiones simultaneas del mismo movimiento: solo una prospera', async () => {
      await movement(ctx, 'test-in-00001', { productId, type: 'IN', quantity: 10 }).expect(201);
      const out = await movement(ctx, 'test-out-0001', { productId, type: 'OUT', quantity: 4 }).expect(201);
      const [a, b] = await Promise.all([
        ctx.http().post(api(`/movements/${out.body.id}/reversal`)).set('Idempotency-Key', 'test-rev-race-a').send({ reason: 'Reversion A' }),
        ctx.http().post(api(`/movements/${out.body.id}/reversal`)).set('Idempotency-Key', 'test-rev-race-b').send({ reason: 'Reversion B' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(await stockOf(ctx, productId)).toBe(10);
    });
  });
});
