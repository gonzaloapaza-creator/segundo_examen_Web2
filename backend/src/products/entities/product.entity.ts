import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';

/**
 * El precio referencial se almacena como NUMERIC(12,2) y se expone en JSON como cadena
 * ("199.99") para evitar errores de coma flotante. El backend nunca opera aritmeticamente con el.
 */
export const decimalTransformer = {
  to: (value?: string | null) => value ?? null,
  from: (value?: string | null) => (value === null || value === undefined ? value : String(value)),
};

@Entity({ name: 'products' })
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_products_sku', { unique: true })
  @Column({ type: 'varchar', length: 40 })
  sku: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string | null;

  @Column({ name: 'reference_price', type: 'numeric', precision: 12, scale: 2, transformer: decimalTransformer })
  referencePrice: string;

  @Column({ type: 'integer', default: 0 })
  stock: number;

  @Column({ name: 'minimum_stock', type: 'integer', default: 0 })
  minimumStock: number;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => Category, (category) => category.products, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
