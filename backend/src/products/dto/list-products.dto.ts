import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { optionalTextTransform } from '../../common/utils/normalize';

export const PRODUCT_SORT_FIELDS = ['name', 'sku', 'stock', 'createdAt'] as const;
export const PRODUCT_STATUS_FILTER = ['active', 'inactive', 'all'] as const;

export class ListProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busqueda por nombre o SKU (contiene, sin distinguir mayusculas)', maxLength: 120 })
  @Transform(optionalTextTransform)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtrar por categoria' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: PRODUCT_STATUS_FILTER, default: 'active', description: 'Por defecto solo productos activos. Use "inactive" o "all" para incluir bajas.' })
  @IsOptional()
  @IsIn(PRODUCT_STATUS_FILTER)
  status: (typeof PRODUCT_STATUS_FILTER)[number] = 'active';

  @ApiPropertyOptional({ enum: PRODUCT_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS)
  sortBy: (typeof PRODUCT_SORT_FIELDS)[number] = 'name';
}
