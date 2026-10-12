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
  if (dataSource.options.database !== 'stockguard_test' && !String(dataSource.options.database).includes('test')) {
    throw new Error(`Proteccion: las pruebas solo se ejecutan contra una BD cuyo nombre contenga "test" (actual: ${String(dataSource.options.database)})`);
  }
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
