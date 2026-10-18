import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { ProductsModule } from '../products/products.module';
import { ReportsController } from './reports.controller';

@Module({
  imports: [ProductsModule, CategoriesModule],
  controllers: [ReportsController],
})
export class ReportsModule {}
