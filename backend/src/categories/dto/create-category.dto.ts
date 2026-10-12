import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { optionalTextTransform, trimTransform } from '../../common/utils/normalize';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Cables y adaptadores', minLength: 2, maxLength: 80, description: 'Nombre unico (sin distinguir mayusculas). Se normalizan espacios.' })
  @Transform(trimTransform)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ example: 'Cables USB-C, HDMI y adaptadores de video', maxLength: 500 })
  @Transform(optionalTextTransform)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
