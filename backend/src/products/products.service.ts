import { Inject, Injectable } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service';
import { buildPage, Paginated } from '../common/dto/pagination.dto';
import { AppException, ErrorCode } from '../common/errors/app.exception';
import { isUniqueViolation } from '../common/errors/pg-error.util';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { Product } from './entities/product.entity';
import { ProductsRepository } from './products.repository';

export const UQ_PRODUCT_SKU = 'uq_products_sku';

@Injectable()
export class ProductsService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly categoriesService: CategoriesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Todo producto nace con stock 0; las existencias iniciales se registran con un movimiento IN. */
  async create(dto: CreateProductDto): Promise<ProductResponseDto> {
    await this.categoriesService.getOrFail(dto.categoryId);
    await this.assertSkuAvailable(dto.sku);
    try {
      const product = await this.products.create({
        sku: dto.sku,
        name: dto.name,
        description: dto.description ?? null,
        referencePrice: dto.referencePrice,
        minimumStock: dto.minimumStock ?? 0,
        categoryId: dto.categoryId,
        stock: 0,
        isActive: true,
      });
      return ProductResponseDto.from(product);
    } catch (error) {
      throw this.translate(error, dto.sku);
    }
  }

  async findAll(query: ListProductsQueryDto): Promise<Paginated<ProductResponseDto>> {
    const limit = Math.min(query.limit, this.config.pagination.maxLimit);
    const [items, total] = await this.products.findPage(query, limit);
    return buildPage(items.map(ProductResponseDto.from), total, query.page, limit);
  }

  /** La consulta por id devuelve tambien productos inactivos (isActive=false) para conservar trazabilidad. */
  async findOne(id: string): Promise<ProductResponseDto> {
    return ProductResponseDto.from(await this.getOrFail(id));
  }

  /** Un producto inactivo no admite modificaciones (409 PRODUCT_INACTIVE). */
  async update(id: string, dto: UpdateProductDto): Promise<ProductResponseDto> {
    const product = await this.getOrFail(id);
    this.assertActive(product);
    if (dto.categoryId !== undefined && dto.categoryId !== product.categoryId) await this.categoriesService.getOrFail(dto.categoryId);
    if (dto.sku !== undefined && dto.sku !== product.sku) await this.assertSkuAvailable(dto.sku);

    if (dto.sku !== undefined) product.sku = dto.sku;
    if (dto.name !== undefined) product.name = dto.name;
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.referencePrice !== undefined) product.referencePrice = dto.referencePrice;
    if (dto.minimumStock !== undefined) product.minimumStock = dto.minimumStock;
    if (dto.categoryId !== undefined) product.categoryId = dto.categoryId;
    try {
      return ProductResponseDto.from(await this.products.save(product));
    } catch (error) {
      throw this.translate(error, dto.sku ?? product.sku);
    }
  }

  /**
   * Baja logica. Se ejecuta con bloqueo de fila para coordinarse con los movimientos:
   * ningun movimiento puede intercalarse entre la comprobacion de stock y la desactivacion.
   */
  async remove(id: string): Promise<void> {
    await this.getOrFail(id);
    await this.products.manager.transaction(async (manager) => {
      const product = await this.products.findByIdForUpdate(manager, id);
      if (!product) throw AppException.notFound(ErrorCode.PRODUCT_NOT_FOUND, `Producto ${id} no encontrado`);
      this.assertActive(product);
      if (product.stock > 0) {
        throw AppException.conflict(ErrorCode.PRODUCT_HAS_STOCK, `El producto aun tiene ${product.stock} unidad(es); registre una salida antes de darlo de baja`, { stock: product.stock });
      }
      await this.products.deactivate(manager, id);
    });
  }

  async getOrFail(id: string): Promise<Product> {
    const product = await this.products.findById(id);
    if (!product) throw AppException.notFound(ErrorCode.PRODUCT_NOT_FOUND, `Producto ${id} no encontrado`);
    return product;
  }

  assertActive(product: Product) {
    if (!product.isActive) throw AppException.conflict(ErrorCode.PRODUCT_INACTIVE, `El producto ${product.sku} esta dado de baja`);
  }

  private async assertSkuAvailable(sku: string) {
    if (await this.products.findBySku(sku)) throw this.skuTaken(sku);
  }

  private translate(error: unknown, sku: string): unknown {
    return isUniqueViolation(error, UQ_PRODUCT_SKU) ? this.skuTaken(sku) : error;
  }

  private skuTaken(sku: string) {
    return AppException.conflict(ErrorCode.PRODUCT_SKU_TAKEN, `Ya existe un producto con el SKU "${sku}"`);
  }
}
