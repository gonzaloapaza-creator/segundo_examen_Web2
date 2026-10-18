import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { API_PREFIX } from '../src/common/constants';

export interface TestContext {
  app: INestApplication;
  dataSource: DataSource;
  http: () => ReturnType<typeof request>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Arranca la aplicacion completa (filtros, pipes, middlewares) contra la BD de pruebas,
 * aplica migraciones y ofrece `reset()` que TRUNCA todas las tablas de negocio.
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  app.setGlobalPrefix(API_PREFIX);
  await app.init();
  app.getHttpServer().setMaxListeners(0);
  const dataSource = app.get(DataSource);
  await assertIsolatedTestDatabase(dataSource);
  await dataSource.runMigrations({ transaction: 'each' });

  const reset = async () => {
    await dataSource.query('TRUNCATE TABLE idempotency_records, inventory_movements, products, categories RESTART IDENTITY CASCADE');
  };

  return {
    app,
    dataSource,
    http: () => request(app.getHttpServer()),
    reset,
    close: () => app.close(),
  };
}

/**
 * Guardas contra ejecutar las pruebas (destructivas: TRUNCATE) sobre la BD de demostracion.
 * No basta con el nombre: se exige NODE_ENV=test, que la conexion provenga de setup-env.ts
 * (variables TEST_POSTGRES_*), un nombre con sufijo `_test` y que la BD realmente conectada
 * (`current_database()`) coincida con la configurada.
 */
async function assertIsolatedTestDatabase(dataSource: DataSource): Promise<void> {
  const configured = String(dataSource.options.database ?? '');
  const fail = (reason: string) => {
    throw new Error(`Proteccion de BD de pruebas: ${reason}. Las pruebas de integracion TRUNCAN tablas y solo se ejecutan contra la BD efimera de docker-compose.test.yml.`);
  };
  if (process.env.NODE_ENV !== 'test') fail(`NODE_ENV debe ser "test" (actual: ${process.env.NODE_ENV})`);
  if (!/_test$/.test(configured)) fail(`el nombre de la BD debe terminar en "_test" (actual: "${configured}")`);
  if (process.env.TEST_POSTGRES_DB !== undefined && process.env.TEST_POSTGRES_DB !== configured) {
    fail(`TEST_POSTGRES_DB (${process.env.TEST_POSTGRES_DB}) no coincide con la BD configurada (${configured})`);
  }
  const [row] = (await dataSource.query('SELECT current_database() AS db, current_user AS usr')) as { db: string; usr: string }[];
  if (row.db !== configured) fail(`la BD conectada (${row.db}) no coincide con la configurada (${configured})`);
}

export const api = (path: string) => `/${API_PREFIX}${path}`;

export async function createCategory(ctx: TestContext, name = 'Cables', description = 'Cables y adaptadores') {
  const res = await ctx.http().post(api('/categories')).send({ name, description }).expect(201);
  return res.body as { id: string; name: string };
}

export async function createProduct(ctx: TestContext, categoryId: string, overrides: Record<string, unknown> = {}) {
  const res = await ctx
    .http()
    .post(api('/products'))
    .send({ sku: 'CAB-USBC-1M', name: 'Cable USB-C 1 m', referencePrice: '49.90', minimumStock: 5, categoryId, ...overrides })
    .expect(201);
  return res.body as { id: string; sku: string; stock: number; minimumStock: number; isActive: boolean };
}

export function movement(
  ctx: TestContext,
  key: string,
  body: { productId: string; type: 'IN' | 'OUT' | string; quantity: number; reason?: string },
) {
  return ctx
    .http()
    .post(api('/movements'))
    .set('Idempotency-Key', key)
    .send({ reason: 'Motivo de prueba', ...body });
}

export async function stockOf(ctx: TestContext, productId: string): Promise<number> {
  const res = await ctx.http().get(api(`/products/${productId}`)).expect(200);
  return res.body.stock;
}
