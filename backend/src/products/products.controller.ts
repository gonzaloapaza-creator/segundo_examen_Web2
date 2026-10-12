import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiConflict, ApiNotFound, ApiPaginatedResponse, ApiValidationError } from '../common/swagger/api-docs.decorators';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { ProductsService } from './products.service';

@ApiTags('Productos')
@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear producto',
    description: 'El producto nace con stock 0. Las existencias iniciales se registran con un movimiento IN. El SKU se normaliza a mayusculas.',
  })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiValidationError()
  @ApiNotFound('Categoria inexistente (code: CATEGORY_NOT_FOUND)')
  @ApiConflict('SKU duplicado (code: PRODUCT_SKU_TAKEN)')
  create(@Body() dto: CreateProductDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar productos', description: 'Por defecto solo activos. Busqueda por nombre/SKU, filtro por categoria y estado, paginacion y orden determinista.' })
  @ApiPaginatedResponse(ProductResponseDto)
  @ApiValidationError()
  findAll(@Query() query: ListProductsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener producto por id', description: 'Devuelve tambien productos inactivos (isActive=false) para conservar trazabilidad.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFound('Producto no encontrado (code: PRODUCT_NOT_FOUND)')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar producto (parcial)', description: 'No permite modificar stock ni isActive. Un producto inactivo responde 409 PRODUCT_INACTIVE.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiValidationError()
  @ApiNotFound()
  @ApiConflict('SKU duplicado (PRODUCT_SKU_TAKEN) o producto inactivo (PRODUCT_INACTIVE)')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Dar de baja producto (baja logica)', description: 'Conserva el historial. Rechazado si el producto tiene existencias (PRODUCT_HAS_STOCK) o ya esta inactivo (PRODUCT_INACTIVE).' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Producto dado de baja' })
  @ApiNotFound()
  @ApiConflict('Producto con stock o ya inactivo')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(id);
  }
}
