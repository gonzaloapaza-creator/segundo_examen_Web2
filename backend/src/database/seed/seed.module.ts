import { Module } from '@nestjs/common';
import { CategoriesModule } from '../../categories/categories.module';
import { MovementsModule } from '../../movements/movements.module';
import { ProductsModule } from '../../products/products.module';
import { SeedService } from './seed.service';

@Module({
  imports: [CategoriesModule, ProductsModule, MovementsModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
