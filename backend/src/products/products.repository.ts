import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { escapeLike } from '../categories/categories.repository';
import { ListProductsQueryDto } from './dto/list-products.dto';
import { Product } from './entities/product.entity';

const SORT_COLUMNS: Record<string, string> = { name: 'p.name', sku: 'p.sku', stock: 'p.stock', createdAt: 'p.created_at' };

@Injectable()
export class ProductsRepository {
  constructor(@InjectRepository(Product) private readonly repo: Repository<Product>) {}

  get manager(): EntityManager {
    return this.repo.manager;
  }

  create(data: Partial<Product>): Promise<Product> {
    return this.repo.save(this.repo.create(data));
  }

  save(product: Product): Promise<Product> {
    return this.repo.save(product);
  }

  findById(id: string): Promise<Product | null> {
    return this.repo.findOne({ where: { id } });
  }

  findBySku(sku: string): Promise<Product | null> {
    return this.repo.findOne({ where: { sku } });
  }

  /**
   * Bloqueo pesimista de fila (SELECT ... FOR UPDATE). Serializa movimientos y bajas sobre el
   * mismo producto dentro de una transaccion.
   */
  findByIdForUpdate(manager: EntityManager, id: string): Promise<Product | null> {
    return manager.getRepository(Product).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  updateStock(manager: EntityManager, id: string, stock: number) {
    return manager.getRepository(Product).update({ id }, { stock });
  }

  deactivate(manager: EntityManager, id: string) {
    return manager.getRepository(Product).update({ id }, { isActive: false });
  }

  async findPage(query: ListProductsQueryDto, limit: number): Promise<[Product[], number]> {
    const qb = this.repo.createQueryBuilder('p');
    if (query.status !== 'all') qb.andWhere('p.is_active = :active', { active: query.status === 'active' });
    if (query.categoryId) qb.andWhere('p.category_id = :categoryId', { categoryId: query.categoryId });
    if (query.search) {
      qb.andWhere('(p.name ILIKE :search OR p.sku ILIKE :search)', { search: `%${escapeLike(query.search)}%` });
    }
    qb.orderBy(SORT_COLUMNS[query.sortBy] ?? 'p.name', query.order.toUpperCase() as 'ASC' | 'DESC').addOrderBy('p.id', 'ASC');
    qb.skip((query.page - 1) * limit).take(limit);
    return qb.getManyAndCount();
  }

  async findLowStock(page: number, limit: number): Promise<[Product[], number]> {
    return this.repo
      .createQueryBuilder('p')
      .where('p.is_active = true')
      .andWhere('p.stock <= p.minimum_stock')
      .orderBy('p.stock - p.minimum_stock', 'ASC')
      .addOrderBy('p.name', 'ASC')
      .addOrderBy('p.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }

  async summary(): Promise<{ activeProducts: number; totalUnits: number; lowStockProducts: number }> {
    const row = await this.repo
      .createQueryBuilder('p')
      .select('COUNT(*)', 'activeProducts')
      .addSelect('COALESCE(SUM(p.stock), 0)', 'totalUnits')
      .addSelect('COUNT(*) FILTER (WHERE p.stock <= p.minimum_stock)', 'lowStockProducts')
      .where('p.is_active = true')
      .getRawOne<{ activeProducts: string; totalUnits: string; lowStockProducts: string }>();
    return {
      activeProducts: Number(row?.activeProducts ?? 0),
      totalUnits: Number(row?.totalUnits ?? 0),
      lowStockProducts: Number(row?.lowStockProducts ?? 0),
    };
  }
}
