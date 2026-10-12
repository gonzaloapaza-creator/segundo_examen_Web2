import { Injectable, Logger } from '@nestjs/common';
import { CategoriesRepository } from '../../categories/categories.repository';
import { MovementType } from '../../movements/entities/movement.entity';
import { MovementsService } from '../../movements/movements.service';
import { ProductsRepository } from '../../products/products.repository';
import { SEED_CATEGORIES, SEED_PRODUCTS } from './seed-data';

export interface SeedReport {
  categoriesCreated: number;
  productsCreated: number;
  movementsCreated: number;
  movementsReplayed: number;
}

/**
 * Seed idempotente:
 *  - Categorias y productos se buscan por nombre/SKU y solo se crean si no existen (nunca se sobrescriben).
 *  - Las existencias iniciales se registran como movimientos IN con una clave de idempotencia determinista
 *    (`seed-initial-<SKU>`). Repetir el seed reproduce la respuesta original sin duplicar movimientos ni
 *    alterar el stock modificado posteriormente por el usuario.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly categories: CategoriesRepository,
    private readonly products: ProductsRepository,
    private readonly movements: MovementsService,
  ) {}

  async run(): Promise<SeedReport> {
    const report: SeedReport = { categoriesCreated: 0, productsCreated: 0, movementsCreated: 0, movementsReplayed: 0 };
    const categoryIds = new Map<string, string>();

    for (const seed of SEED_CATEGORIES) {
      let category = await this.categories.findByNameInsensitive(seed.name);
      if (!category) {
        category = await this.categories.create({ name: seed.name, description: seed.description });
        report.categoriesCreated++;
      }
      categoryIds.set(seed.name, category.id);
    }

    for (const seed of SEED_PRODUCTS) {
      let product = await this.products.findBySku(seed.sku);
      if (!product) {
        product = await this.products.create({
          sku: seed.sku,
          name: seed.name,
          description: seed.description,
          referencePrice: seed.referencePrice,
          minimumStock: seed.minimumStock,
          categoryId: categoryIds.get(seed.category)!,
          stock: 0,
          isActive: true,
        });
        report.productsCreated++;
      }
      if (seed.initialStock > 0 && product.isActive) {
        const result = await this.movements.create(
          { productId: product.id, type: MovementType.IN, quantity: seed.initialStock, reason: 'Inventario inicial (seed de demostracion)' },
          `seed-initial-${seed.sku}`,
        );
        if (result.replayed) report.movementsReplayed++;
        else report.movementsCreated++;
      }
    }

    this.logger.log(`Seed completado: ${JSON.stringify(report)}`);
    return report;
  }
}
