import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { ListCategoriesQueryDto } from './dto/list-categories.dto';
import { Category } from './entities/category.entity';

/**
 * Patron Repository: encapsula el acceso a datos de categorias.
 * El servicio no construye consultas directamente.
 */
@Injectable()
export class CategoriesRepository {
  constructor(@InjectRepository(Category) private readonly repo: Repository<Category>) {}

  get manager(): EntityManager {
    return this.repo.manager;
  }

  create(data: Pick<Category, 'name' | 'description'>): Promise<Category> {
    return this.repo.save(this.repo.create(data));
  }

  save(category: Category): Promise<Category> {
    return this.repo.save(category);
  }

  findById(id: string): Promise<Category | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByNameInsensitive(name: string): Promise<Category | null> {
    return this.repo.createQueryBuilder('c').where('lower(c.name) = lower(:name)', { name }).getOne();
  }

  async findPage(query: ListCategoriesQueryDto, limit: number): Promise<[Category[], number]> {
    const qb = this.repo.createQueryBuilder('c');
    if (query.search) qb.andWhere('c.name ILIKE :search', { search: `%${escapeLike(query.search)}%` });
    const column = query.sortBy === 'createdAt' ? 'c.created_at' : 'c.name';
    const direction = query.order.toUpperCase() as 'ASC' | 'DESC';
    qb.orderBy(column, direction).addOrderBy('c.id', 'ASC');
    qb.skip((query.page - 1) * limit).take(limit);
    return qb.getManyAndCount();
  }

  count(): Promise<number> {
    return this.repo.count();
  }

  /** Cuenta productos asociados, incluidos los dados de baja (is_active = false). */
  countProducts(manager: EntityManager, categoryId: string): Promise<number> {
    return manager.getRepository(Product).count({ where: { categoryId } });
  }

  delete(manager: EntityManager, id: string) {
    return manager.getRepository(Category).delete({ id });
  }
}

export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (m) => `\\${m}`);
