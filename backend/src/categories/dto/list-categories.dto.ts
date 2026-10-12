import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { optionalTextTransform } from '../../common/utils/normalize';

export const CATEGORY_SORT_FIELDS = ['name', 'createdAt'] as const;

export class ListCategoriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busqueda por nombre (contiene, sin distinguir mayusculas)', maxLength: 80 })
  @Transform(optionalTextTransform)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ enum: CATEGORY_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(CATEGORY_SORT_FIELDS)
  sortBy: (typeof CATEGORY_SORT_FIELDS)[number] = 'name';
}
