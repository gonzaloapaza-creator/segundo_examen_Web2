import 'reflect-metadata';
import { Logger, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { API_PREFIX } from './common/constants';
import { APP_CONFIG, AppConfig } from './config/configuration';
import { SeedService } from './database/seed/seed.service';
import { setupSwagger } from './swagger';

const LEVELS: Record<AppConfig['logLevel'], LogLevel[]> = {
  error: ['error'],
  warn: ['error', 'warn'],
  log: ['error', 'warn', 'log'],
  debug: ['error', 'warn', 'log', 'debug'],
  verbose: ['error', 'warn', 'log', 'debug', 'verbose'],
};

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useLogger(LEVELS[config.logLevel]);

  // Detras del Gateway: respeta X-Forwarded-* solo del proxy inmediato.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.setGlobalPrefix(API_PREFIX);
  // CORS lo gestiona exclusivamente el Gateway Nginx para evitar cabeceras duplicadas.
  app.enableShutdownHooks();

  // Migraciones antes de aceptar trafico: un fallo detiene el arranque de forma visible.
  const dataSource = app.get(DataSource);
  const executed = await dataSource.runMigrations({ transaction: 'each' });
  logger.log(executed.length ? `Migraciones aplicadas: ${executed.map((m) => m.name).join(', ')}` : 'Esquema al dia (sin migraciones pendientes)');

  if (config.seedOnStart) {
    const report = await app.get(SeedService).run();
    logger.log(`Seed de demostracion: ${JSON.stringify(report)}`);
  }

  setupSwagger(app);
  await app.listen(config.port, '0.0.0.0');
  logger.log(`StockGuard backend escuchando en puerto ${config.port} (prefijo /${API_PREFIX}, docs en /docs)`);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Arranque fallido:', error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
