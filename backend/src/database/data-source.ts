import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { join } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { IdempotencyRecord } from '../movements/entities/idempotency-record.entity';
import { Movement } from '../movements/entities/movement.entity';
import { Product } from '../products/entities/product.entity';

loadDotenv();

export const ENTITIES = [Category, Product, Movement, IdempotencyRecord];

export interface DatabaseConnection {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

/**
 * Opciones TypeORM compartidas por la aplicacion, la CLI de migraciones y las pruebas.
 * `synchronize` esta deshabilitado: el esquema se gestiona unicamente con migraciones versionadas.
 */
export const buildDataSourceOptions = (conn: DatabaseConnection): DataSourceOptions => ({
  type: 'postgres',
  ...conn,
  entities: ENTITIES,
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  uuidExtension: 'pgcrypto',
  // Los errores de consulta esperados (violaciones de unicidad) se traducen a 409; los 5xx los registra el filtro global.
  logging: ['warn', 'migration', 'schema'],
  applicationName: 'stockguard-backend',
});

export const connectionFromEnv = (): DatabaseConnection => ({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  username: process.env.POSTGRES_USER ?? 'stockguard',
  password: process.env.POSTGRES_PASSWORD ?? '',
  database: process.env.POSTGRES_DB ?? 'stockguard',
});

/** DataSource usado por la CLI: `npm run migration:run` / `migration:generate`. */
export default new DataSource(buildDataSourceOptions(connectionFromEnv()));
