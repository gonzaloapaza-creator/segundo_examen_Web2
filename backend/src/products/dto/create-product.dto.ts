import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { optionalTextTransform, skuTransform, trimTransform } from '../../common/utils/normalize';

export const MAX_STOCK = 1_000_000;
/** Precio como cadena decimal con hasta 10 enteros y 2 decimales (NUMERIC(12,2)). */
const PRICE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

export class CreateProductDto {
  @ApiProperty({ example: 'CAB-USBC-1M', minLength: 3, maxLength: 40, description: 'Se normaliza a mayusculas y sin espacios en extremos. Letras, numeros, guion, punto y guion bajo.' })
  @Transform(skuTransform)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(40)
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/, { message: 'sku solo admite letras, numeros, ".", "_" y "-"' })
  sku: string;

  @ApiProperty({ example: 'Cable USB-C a USB-C 1 m', minLength: 2, maxLength: 120 })
  @Transform(trimTransform)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Cable trenzado 60 W', maxLength: 1000 })
  @Transform(optionalTextTransform)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    example: '49.90',
    description: 'Precio referencial no negativo como cadena decimal (max. 2 decimales). Se devuelve igualmente como cadena para evitar errores de coma flotante.',
    type: String,
  })
  @Transform(({ value }) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(PRICE_PATTERN, { message: 'referencePrice debe ser un decimal no negativo con maximo 2 decimales, por ejemplo "49.90"' })
  referencePrice: string;

  @ApiPropertyOptional({ example: 5, minimum: 0, maximum: MAX_STOCK, default: 0, description: 'Umbral de reposicion. Stock bajo cuando stock <= minimumStock.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK)
  minimumStock?: number = 0;

  @ApiProperty({ format: 'uuid', example: '2f1b8e4a-6d3c-4e0a-9f1b-0c2d3e4f5a6b', description: 'Categoria existente' })
  @IsUUID()
  categoryId: string;
}

/**
 * El stock NO es editable: solo cambia mediante movimientos de inventario.
 * isActive tampoco: la baja se realiza con DELETE (baja logica).
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {}
