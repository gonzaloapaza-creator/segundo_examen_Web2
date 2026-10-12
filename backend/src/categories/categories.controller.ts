import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiConflict, ApiNotFound, ApiPaginatedResponse, ApiValidationError } from '../common/swagger/api-docs.decorators';
import { CategoriesService } from './categories.service';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories.dto';

@ApiTags('Categorias')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear categoria', description: 'El nombre es unico sin distinguir mayusculas/minusculas; se normalizan espacios.' })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiValidationError()
  @ApiConflict('Nombre ya registrado (code: CATEGORY_NAME_TAKEN)')
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar categorias (paginado, orden determinista)' })
  @ApiPaginatedResponse(CategoryResponseDto)
  @ApiValidationError()
  findAll(@Query() query: ListCategoriesQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener categoria por id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFound('Categoria no encontrada (code: CATEGORY_NOT_FOUND)')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar categoria (parcial)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiValidationError()
  @ApiNotFound()
  @ApiConflict('Nombre ya registrado (code: CATEGORY_NAME_TAKEN)')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar categoria', description: 'Rechazado (409) si existen productos asociados, incluidos los dados de baja.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Eliminada' })
  @ApiNotFound()
  @ApiConflict('Categoria con productos asociados (code: CATEGORY_HAS_PRODUCTS)')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(id);
  }
}
