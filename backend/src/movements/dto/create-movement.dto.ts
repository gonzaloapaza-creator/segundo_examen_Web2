import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { trimTransform, upperTransform } from '../../common/utils/normalize';
import { MAX_STOCK } from '../../products/dto/create-product.dto';
import { MovementType } from '../entities/movement.entity';

export class CreateMovementDto {
  @ApiProperty({ format: 'uuid', example: '7c9e6679-7425-40de-944b-e07fc1f90ae7', description: 'Producto activo' })
  @IsUUID()
  productId: string;

  @ApiProperty({ enum: MovementType, example: MovementType.IN, description: 'IN incrementa el stock, OUT lo disminuye' })
  @Transform(upperTransform)
  @IsEnum(MovementType)
  type: MovementType;

  @ApiProperty({ example: 10, minimum: 1, maximum: MAX_STOCK, description: 'Entero mayor que cero' })
  @IsInt()
  @Min(1)
  @Max(MAX_STOCK)
  quantity: number;

  @ApiProperty({ example: 'Compra a proveedor - factura 0012', minLength: 3, maxLength: 255 })
  @Transform(trimTransform)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  reason: string;
}

export class ReverseMovementDto {
  @ApiProperty({ example: 'Salida registrada por error', minLength: 3, maxLength: 255, description: 'Motivo obligatorio de la compensacion' })
  @Transform(trimTransform)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  reason: string;
}
