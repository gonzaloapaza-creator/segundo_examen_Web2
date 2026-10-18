import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Limite maximo absoluto por pagina. El limite efectivo se puede reducir con PAGINATION_MAX_LIMIT.
 */
export const ABSOLUTE_MAX_LIMIT = 1000;
export const DEFAULT_LIMIT = 20;

export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Numero de pagina (desde 1)', default: 1, minimum: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Elementos por pagina (maximo configurable, por defecto 100)', default: DEFAULT_LIMIT, minimum: 1, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ABSOLUTE_MAX_LIMIT)
  limit: number = DEFAULT_LIMIT;

  @ApiPropertyOptional({ description: 'Direccion de ordenamiento', enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';
}

export interface PageMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export const buildPage = <T>(data: T[], totalItems: number, page: number, limit: number): Paginated<T> => {
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  return { data, meta: { page, limit, totalItems, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } };
};
