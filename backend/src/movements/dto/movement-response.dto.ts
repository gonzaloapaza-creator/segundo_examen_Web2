import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Movement, MovementType } from '../entities/movement.entity';

export class MovementResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty({ enum: MovementType, example: MovementType.OUT })
  type: MovementType;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({ example: 'Venta mostrador - ticket 1045' })
  reason: string;

  @ApiProperty({ example: 10, description: 'Stock antes del movimiento (calculado en el servidor)' })
  previousStock: number;

  @ApiProperty({ example: 8, description: 'Stock despues del movimiento (calculado en el servidor)' })
  resultingStock: number;

  @ApiProperty({ example: 'ticket-1045-out', description: 'Clave de idempotencia usada al crear el movimiento' })
  idempotencyKey: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Si es una compensacion, id del movimiento revertido' })
  reversesMovementId: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Id del movimiento compensatorio que lo revirtio (solo en detalle)' })
  reversedByMovementId?: string | null;

  @ApiProperty({ example: '2026-10-11T15:04:05.123Z' })
  createdAt: Date;

  static from(m: Movement, options: { includeReversedBy?: boolean } = {}): MovementResponseDto {
    const dto: MovementResponseDto = {
      id: m.id,
      productId: m.productId,
      type: m.type,
      quantity: m.quantity,
      reason: m.reason,
      previousStock: m.previousStock,
      resultingStock: m.resultingStock,
      idempotencyKey: m.idempotencyKey,
      reversesMovementId: m.reversesMovementId ?? null,
      createdAt: m.createdAt,
    };
    if (options.includeReversedBy) dto.reversedByMovementId = m.reversedBy?.id ?? null;
    return dto;
  }
}
