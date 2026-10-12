import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { CategoriesModule } from './categories/categories.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { RequestIdMiddleware } from './common/request-context/request-id.middleware';
import { RequestLoggerMiddleware } from './common/request-context/request-logger.middleware';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { SeedModule } from './database/seed/seed.module';
import { HealthModule } from './health/health.module';
import { MovementsModule } from './movements/movements.module';
import { ProductsModule } from './products/products.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, CategoriesModule, ProductsModule, MovementsModule, ReportsModule, HealthModule, SeedModule],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, RequestLoggerMiddleware).forRoutes('{*path}');
  }
}
