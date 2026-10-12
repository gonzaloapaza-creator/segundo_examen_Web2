import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { buildPage, Paginated } from '../common/dto/pagination.dto';
import { AppException, ErrorCode } from '../common/errors/app.exception';
import { isUniqueViolation } from '../common/errors/pg-error.util';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { MAX_STOCK } from '../products/dto/create-product.dto';
import { Product } from '../products/entities/product.entity';
import { ProductsRepository } from '../products/products.repository';
import { CreateMovementDto, ReverseMovementDto } from './dto/create-movement.dto';
import { ListMovementsQueryDto } from './dto/list-movements.dto';
import { MovementResponseDto } from './dto/movement-response.dto';
import { Movement, MovementType } from './entities/movement.entity';
import { fingerprint, IdempotencyService, IdempotentResult } from './idempotency/idempotency.service';
import { MovementsRepository } from './movements.repository';

export const UQ_SINGLE_REVERSAL = 'uq_movements_single_reversal';
export const UQ_MOVEMENT_KEY = 'uq_movements_idempotency_key';

/**
 * Movimientos de inventario: registros auditables e inmutables.
 * Cada operacion se ejecuta en una unica transaccion PostgreSQL:
 *   reserva de idempotencia -> SELECT ... FOR UPDATE del producto -> validacion -> UPDATE stock -> INSERT movimiento.
 * El bloqueo pesimista de la fila del producto serializa salidas concurrentes y las coordina con la baja logica.
 */
@Injectable()
export class MovementsService {
  constructor(
    private readonly movements: MovementsRepository,
    private readonly products: ProductsRepository,
    private readonly idempotency: IdempotencyService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(dto: CreateMovementDto, idempotencyKey: string): Promise<IdempotentResult<MovementResponseDto>> {
    const hash = fingerprint('CREATE_MOVEMENT', { productId: dto.productId, type: dto.type, quantity: dto.quantity, reason: dto.reason });
    return this.runIdempotent(idempotencyKey, 'CREATE_MOVEMENT', hash, async (tx) => {
      const product = await this.lockActiveProduct(tx, dto.productId);
      const movement = await this.applyMovement(tx, product, dto.type, dto.quantity, dto.reason, idempotencyKey, null);
      return MovementResponseDto.from(movement);
    });
  }

  /**
   * Reversion explicita: genera el movimiento contrario por la cantidad total, vinculado al original.
   * Reglas: no revertir dos veces, no revertir una compensacion, no dejar stock negativo, producto activo.
   */
  async reverse(movementId: string, dto: ReverseMovementDto, idempotencyKey: string): Promise<IdempotentResult<MovementResponseDto>> {
    const hash = fingerprint('REVERSE_MOVEMENT', { movementId, reason: dto.reason });
    return this.runIdempotent(idempotencyKey, 'REVERSE_MOVEMENT', hash, async (tx) => {
      const original = await this.movements.findByIdForUpdate(tx, movementId);
      if (!original) throw AppException.notFound(ErrorCode.MOVEMENT_NOT_FOUND, `Movimiento ${movementId} no encontrado`);
      if (original.reversesMovementId) {
        throw AppException.conflict(ErrorCode.MOVEMENT_IS_REVERSAL, 'No se puede revertir un movimiento compensatorio', { reversesMovementId: original.reversesMovementId });
      }
      const existingReversal = await this.movements.findReversalOf(tx, movementId);
      if (existingReversal) {
        throw AppException.conflict(ErrorCode.MOVEMENT_ALREADY_REVERSED, 'El movimiento ya fue revertido', { reversedByMovementId: existingReversal.id });
      }
      const product = await this.lockActiveProduct(tx, original.productId);
      const oppositeType = original.type === MovementType.IN ? MovementType.OUT : MovementType.IN;
      const movement = await this.applyMovement(tx, product, oppositeType, original.quantity, dto.reason, idempotencyKey, original.id);
      return MovementResponseDto.from(movement);
    });
  }

  async findAll(query: ListMovementsQueryDto): Promise<Paginated<MovementResponseDto>> {
    const limit = Math.min(query.limit, this.config.pagination.maxLimit);
    const [items, total] = await this.movements.findPage(query, limit);
    return buildPage(items.map((m) => MovementResponseDto.from(m)), total, query.page, limit);
  }

  async findOne(id: string): Promise<MovementResponseDto> {
    const movement = await this.movements.findById(id);
    if (!movement) throw AppException.notFound(ErrorCode.MOVEMENT_NOT_FOUND, `Movimiento ${id} no encontrado`);
    return MovementResponseDto.from(movement, { includeReversedBy: true });
  }

  private async runIdempotent(
    key: string,
    operation: 'CREATE_MOVEMENT' | 'REVERSE_MOVEMENT',
    hash: string,
    work: (tx: EntityManager) => Promise<MovementResponseDto>,
  ): Promise<IdempotentResult<MovementResponseDto>> {
    try {
      return await this.idempotency.execute(this.movements.manager, key, operation, hash, work, HttpStatus.CREATED);
    } catch (error) {
      if (isUniqueViolation(error, UQ_SINGLE_REVERSAL)) throw AppException.conflict(ErrorCode.MOVEMENT_ALREADY_REVERSED, 'El movimiento ya fue revertido');
      if (isUniqueViolation(error, UQ_MOVEMENT_KEY)) throw AppException.conflict(ErrorCode.IDEMPOTENCY_KEY_REUSED, 'La clave de idempotencia ya fue utilizada');
      throw error;
    }
  }

  private async lockActiveProduct(tx: EntityManager, productId: string): Promise<Product> {
    const product = await this.products.findByIdForUpdate(tx, productId);
    if (!product) throw AppException.notFound(ErrorCode.PRODUCT_NOT_FOUND, `Producto ${productId} no encontrado`);
    if (!product.isActive) throw AppException.conflict(ErrorCode.PRODUCT_INACTIVE, `El producto ${product.sku} esta dado de baja; no admite movimientos`);
    return product;
  }

  /** Calcula previousStock/resultingStock exclusivamente en el servidor y persiste stock + movimiento. */
  private async applyMovement(
    tx: EntityManager,
    product: Product,
    type: MovementType,
    quantity: number,
    reason: string,
    idempotencyKey: string,
    reversesMovementId: string | null,
  ): Promise<Movement> {
    const previousStock = product.stock;
    const resultingStock = type === MovementType.IN ? previousStock + quantity : previousStock - quantity;
    if (resultingStock < 0) {
      throw AppException.conflict(ErrorCode.INSUFFICIENT_STOCK, `Stock insuficiente: disponible ${previousStock}, solicitado ${quantity}`, {
        available: previousStock,
        requested: quantity,
      });
    }
    if (resultingStock > MAX_STOCK) {
      throw AppException.conflict(ErrorCode.CONFLICT, `El stock resultante (${resultingStock}) supera el maximo permitido (${MAX_STOCK})`);
    }
    await this.products.updateStock(tx, product.id, resultingStock);
    return this.movements.insert(tx, { productId: product.id, type, quantity, reason, previousStock, resultingStock, idempotencyKey, reversesMovementId });
  }
}
