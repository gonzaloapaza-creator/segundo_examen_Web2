import { Inject, Injectable } from '@nestjs/common';
import { buildPage, Paginated } from '../common/dto/pagination.dto';
import { AppException, ErrorCode } from '../common/errors/app.exception';
import { isForeignKeyViolation, isUniqueViolation } from '../common/errors/pg-error.util';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { CategoriesRepository } from './categories.repository';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories.dto';
import { Category } from './entities/category.entity';

export const UQ_CATEGORY_NAME = 'uq_categories_name_lower';
export const FK_PRODUCTS_CATEGORY = 'fk_products_category';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categories: CategoriesRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    await this.assertNameAvailable(dto.name);
    try {
      return CategoryResponseDto.from(await this.categories.create({ name: dto.name, description: dto.description ?? null }));
    } catch (error) {
      throw this.translate(error, dto.name);
    }
  }

  async findAll(query: ListCategoriesQueryDto): Promise<Paginated<CategoryResponseDto>> {
    const limit = Math.min(query.limit, this.config.pagination.maxLimit);
    const [items, total] = await this.categories.findPage(query, limit);
    return buildPage(items.map(CategoryResponseDto.from), total, query.page, limit);
  }

  async findOne(id: string): Promise<CategoryResponseDto> {
    return CategoryResponseDto.from(await this.getOrFail(id));
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryResponseDto> {
    const category = await this.getOrFail(id);
    if (dto.name !== undefined && dto.name.toLowerCase() !== category.name.toLowerCase()) await this.assertNameAvailable(dto.name, id);
    if (dto.name !== undefined) category.name = dto.name;
    if (dto.description !== undefined) category.description = dto.description;
    try {
      return CategoryResponseDto.from(await this.categories.save(category));
    } catch (error) {
      throw this.translate(error, dto.name ?? category.name);
    }
  }

  /**
   * Eliminacion fisica solo si no existen productos asociados (activos o inactivos).
   * La FK ON DELETE RESTRICT protege frente a carreras con creacion concurrente de productos.
   */
  async remove(id: string): Promise<void> {
    await this.getOrFail(id);
    try {
      await this.categories.manager.transaction(async (manager) => {
        const linked = await this.categories.countProducts(manager, id);
        if (linked > 0) {
          throw AppException.conflict(ErrorCode.CATEGORY_HAS_PRODUCTS, `La categoria tiene ${linked} producto(s) asociado(s) y no puede eliminarse`, { linkedProducts: linked });
        }
        await this.categories.delete(manager, id);
      });
    } catch (error) {
      if (isForeignKeyViolation(error, FK_PRODUCTS_CATEGORY)) {
        throw AppException.conflict(ErrorCode.CATEGORY_HAS_PRODUCTS, 'La categoria tiene productos asociados y no puede eliminarse');
      }
      throw error;
    }
  }

  async getOrFail(id: string): Promise<Category> {
    const category = await this.categories.findById(id);
    if (!category) throw AppException.notFound(ErrorCode.CATEGORY_NOT_FOUND, `Categoria ${id} no encontrada`);
    return category;
  }

  private async assertNameAvailable(name: string, exceptId?: string) {
    const existing = await this.categories.findByNameInsensitive(name);
    if (existing && existing.id !== exceptId) throw this.nameTaken(name);
  }

  private translate(error: unknown, name: string): unknown {
    return isUniqueViolation(error, UQ_CATEGORY_NAME) ? this.nameTaken(name) : error;
  }

  private nameTaken(name: string) {
    return AppException.conflict(ErrorCode.CATEGORY_NAME_TAKEN, `Ya existe una categoria con el nombre "${name}"`);
  }
}
