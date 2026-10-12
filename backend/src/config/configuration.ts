import { EnvironmentVariables } from './env.validation';

export interface AppConfig {
  nodeEnv: EnvironmentVariables['NODE_ENV'];
  port: number;
  logLevel: EnvironmentVariables['LOG_LEVEL'];
  seedOnStart: boolean;
  pagination: { maxLimit: number };
  database: { host: string; port: number; username: string; password: string; database: string };
}

export const buildConfig = (env: EnvironmentVariables): AppConfig => ({
  nodeEnv: env.NODE_ENV,
  port: env.BACKEND_PORT,
  logLevel: env.LOG_LEVEL,
  seedOnStart: env.SEED_ON_START,
  pagination: { maxLimit: env.PAGINATION_MAX_LIMIT },
  database: {
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    username: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
  },
});

export const APP_CONFIG = 'APP_CONFIG';
