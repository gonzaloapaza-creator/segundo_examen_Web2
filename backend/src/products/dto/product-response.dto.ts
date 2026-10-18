import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Product } from '../entities/product.entity';

export class ProductResponseDto {
  @ApiProperty({ format: 'uuid', example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })
  id: string;

  @ApiProperty({ example: 'CAB-USBC-1M' })
  sku: string;

  @ApiProperty({ example: 'Cable USB-C a USB-C 1 m' })
  name: string;

  @ApiPropertyOptional({ example: 'Cable trenzado 60 W', nullable: true })
  description: string | null;

  @ApiProperty({ example: '49.90', type: String, description: 'Decimal exacto representado como cadena' })
  referencePrice: string;

  @ApiProperty({ example: 12, description: 'Solo cambia mediante movimientos de inventario' })
  stock: number;

  @ApiProperty({ example: 5 })
  minimumStock: number;

  @ApiProperty({ example: true, description: 'stock <= minimumStock' })
  isLowStock: boolean;

  @ApiProperty({ format: 'uuid' })
  categoryId: string;

  @ApiProperty({ example: true, description: 'false = producto dado de baja (baja logica)' })
  isActive: boolean;

  @ApiProperty({ example: '2026-10-11T15:04:05.123Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-10-11T15:04:05.123Z' })
  updatedAt: Date;

  static from(p: Product): ProductResponseDto {
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      referencePrice: p.referencePrice,
      stock: p.stock,
      minimumStock: p.minimumStock,
      isLowStock: p.stock <= p.minimumStock,
      categoryId: p.categoryId,
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
