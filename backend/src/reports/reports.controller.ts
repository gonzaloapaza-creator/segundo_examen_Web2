import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { CategoriesRepository } from '../categories/categories.repository';
import { buildPage, PaginationQueryDto } from '../common/dto/pagination.dto';
import { ApiPaginatedResponse, ApiValidationError } from '../common/swagger/api-docs.decorators';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { ProductResponseDto } from '../products/dto/product-response.dto';
import { ProductsRepository } from '../products/products.repository';

export class SummaryResponseDto {
  @ApiProperty({ example: 12, description: 'Productos activos' }) activeProducts: number;
  @ApiProperty({ example: 348, description: 'Suma de unidades en stock de productos activos' }) totalUnits: number;
  @ApiProperty({ example: 3, description: 'Productos activos con stock <= minimumStock' }) lowStockProducts: number;
  @ApiProperty({ example: 5, description: 'Total de categorias' }) categories: number;
  @ApiProperty({ example: '2026-10-11T15:04:05.123Z' }) generatedAt: Date;
}

@ApiTags('Reportes')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly products: ProductsRepository,
    private readonly categories: CategoriesRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('low-stock')
  @ApiOperation({ summary: 'Productos activos con stock bajo', description: 'Condicion: stock <= minimumStock. Solo productos activos. Orden: deficit mas critico primero.' })
  @ApiPaginatedResponse(ProductResponseDto)
  @ApiValidationError()
  async lowStock(@Query() query: PaginationQueryDto) {
    const limit = Math.min(query.limit, this.config.pagination.maxLimit);
    const [items, total] = await this.products.findLowStock(query.page, limit);
    return buildPage(items.map(ProductResponseDto.from), total, query.page, limit);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Resumen de inventario' })
  @ApiOkResponse({ type: SummaryResponseDto })
  async summary(): Promise<SummaryResponseDto> {
    const [stats, categories] = await Promise.all([this.products.summary(), this.categories.count()]);
    return { ...stats, categories, generatedAt: new Date() };
  }
}
