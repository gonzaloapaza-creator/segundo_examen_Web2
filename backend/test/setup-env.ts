import { config as loadDotenv } from 'dotenv';

/**
 * Variables de entorno para las pruebas de integracion.
 * 1. Carga backend/.env si existe, pero SOLO para leer variables con prefijo TEST_POSTGRES_*.
 *    Las variables POSTGRES_* del .env (entorno de demostracion) se ignoran deliberadamente:
 *    las pruebas TRUNCAN tablas y nunca deben heredar la conexion de la BD de demostracion.
 * 2. Los valores por defecto apuntan al PostgreSQL efimero de docker-compose.test.yml
 *    (host 127.0.0.1:55432 cuando se publica el puerto; `db-test:5432` dentro del runner).
 */
loadDotenv();

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'error';
process.env.SEED_ON_START = 'false';
process.env.POSTGRES_HOST = process.env.TEST_POSTGRES_HOST ?? '127.0.0.1';
process.env.POSTGRES_PORT = process.env.TEST_POSTGRES_PORT ?? '55432';
process.env.POSTGRES_USER = process.env.TEST_POSTGRES_USER ?? 'stockguard';
process.env.POSTGRES_PASSWORD = process.env.TEST_POSTGRES_PASSWORD ?? 'test_only_password';
process.env.POSTGRES_DB = process.env.TEST_POSTGRES_DB ?? 'stockguard_test';
process.env.PAGINATION_MAX_LIMIT = '50';
