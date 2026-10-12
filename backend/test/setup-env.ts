import { config as loadDotenv } from 'dotenv';

/**
 * Variables de entorno para las pruebas de integracion.
 * 1. Carga backend/.env si existe (host/puerto/credenciales de PostgreSQL).
 * 2. Fuerza SIEMPRE una base de datos separada (TEST_POSTGRES_DB, por defecto `stockguard_test`).
 * Las pruebas TRUNCAN las tablas de esa base de datos: nunca apuntar a la BD de demostracion.
 */
loadDotenv();

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'error';
process.env.SEED_ON_START = 'false';
process.env.POSTGRES_HOST = process.env.TEST_POSTGRES_HOST ?? process.env.POSTGRES_HOST ?? '127.0.0.1';
process.env.POSTGRES_PORT = process.env.TEST_POSTGRES_PORT ?? process.env.POSTGRES_PORT ?? '55432';
process.env.POSTGRES_USER = process.env.TEST_POSTGRES_USER ?? process.env.POSTGRES_USER ?? 'stockguard';
process.env.POSTGRES_PASSWORD = process.env.TEST_POSTGRES_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'change_me_local_only';
process.env.POSTGRES_DB = process.env.TEST_POSTGRES_DB ?? 'stockguard_test';
process.env.PAGINATION_MAX_LIMIT = '50';
