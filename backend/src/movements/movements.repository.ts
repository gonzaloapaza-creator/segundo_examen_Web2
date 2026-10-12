import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ListMovementsQueryDto } from './dto/list-movements.dto';
import { Movement } from './entities/movement.entity';

@Injectable()
export class MovementsRepository {
  constructor(@InjectRepository(Movement) private readonly repo: Repository<Movement>) {}

  get manager(): EntityManager {
    return this.repo.manager;
  }

  /** Insercion del movimiento dentro de la transaccion en curso. */
  async insert(manager: EntityManager, data: Omit<Movement, 'id' | 'createdAt' | 'product' | 'reverses' | 'reversedBy'>): Promise<Movement> {
    const repo = manager.getRepository(Movement);
    return repo.save(repo.create(data));
  }

  findById(id: string, manager?: EntityManager): Promise<Movement | null> {
    return (manager ?? this.manager).getRepository(Movement).findOne({ where: { id }, relations: { reversedBy: true } });
  }

  /** Bloquea el movimiento original para que dos reversiones concurrentes se serialicen. */
  findByIdForUpdate(manager: EntityManager, id: string): Promise<Movement | null> {
    return manager.getRepository(Movement).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  findReversalOf(manager: EntityManager, movementId: string): Promise<Movement | null> {
    return manager.getRepository(Movement).findOne({ where: { reversesMovementId: movementId } });
  }

  async findPage(query: ListMovementsQueryDto, limit: number): Promise<[Movement[], number]> {
    const qb = this.repo.createQueryBuilder('m');
    if (query.productId) qb.andWhere('m.product_id = :productId', { productId: query.productId });
    if (query.type) qb.andWhere('m.type = :type', { type: query.type });
    if (query.from) qb.andWhere('m.created_at >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('m.created_at <= :to', { to: new Date(query.to) });
    qb.orderBy('m.created_at', query.order.toUpperCase() as 'ASC' | 'DESC').addOrderBy('m.id', 'ASC');
    qb.skip((query.page - 1) * limit).take(limit);
    return qb.getManyAndCount();
  }

  countByProductAndType(productId: string, type: Movement['type']): Promise<number> {
    return this.repo.count({ where: { productId, type } });
  }
}
