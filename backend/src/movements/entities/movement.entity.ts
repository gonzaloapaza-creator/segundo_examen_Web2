import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Product } from '../../products/entities/product.entity';

export enum MovementType {
  IN = 'IN',
  OUT = 'OUT',
}

/**
 * Registro auditable e inmutable. No existen endpoints de edicion/borrado:
 * las correcciones se hacen con movimientos compensatorios (reversiones).
 */
@Entity({ name: 'inventory_movements' })
@Index('idx_movements_product_created', ['productId', 'createdAt'])
export class Movement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'enum', enum: MovementType, enumName: 'movement_type' })
  type: MovementType;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'varchar', length: 255 })
  reason: string;

  @Column({ name: 'previous_stock', type: 'integer' })
  previousStock: number;

  @Column({ name: 'resulting_stock', type: 'integer' })
  resultingStock: number;

  @Index('uq_movements_idempotency_key', { unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey: string;

  @Column({ name: 'reverses_movement_id', type: 'uuid', nullable: true })
  reversesMovementId: string | null;

  /** Un movimiento solo puede ser revertido una vez (indice unico parcial en la migracion). */
  @OneToOne(() => Movement, (movement) => movement.reversedBy, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reverses_movement_id' })
  reverses: Movement | null;

  @OneToOne(() => Movement, (movement) => movement.reverses)
  reversedBy: Movement | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
