import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { SeedService } from './seed.service';

/**
 * Ejecuta el seed de demostracion de forma independiente (dentro de Docker):
 *   docker compose exec backend node dist/database/seed/run-seed.js
 * Es seguro repetirlo: no duplica datos ni modifica stock existente.
 */
async function main() {
  const logger = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    await app.get(DataSource).runMigrations({ transaction: 'each' });
    const report = await app.get(SeedService).run();
    logger.log(`Resultado: ${JSON.stringify(report)}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Seed fallido:', error instanceof Error ? error.message : error);
  process.exit(1);
});
