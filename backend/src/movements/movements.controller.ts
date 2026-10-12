import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiConflict, ApiNotFound, ApiPaginatedResponse, ApiValidationError } from '../common/swagger/api-docs.decorators';
import { CreateMovementDto, ReverseMovementDto } from './dto/create-movement.dto';
import { ListMovementsQueryDto } from './dto/list-movements.dto';
import { MovementResponseDto } from './dto/movement-response.dto';
import { IDEMPOTENCY_HEADER, IdempotencyKey } from './idempotency/idempotency-key.decorator';
import { IdempotentResult } from './idempotency/idempotency.service';
import { MovementsService } from './movements.service';

export const REPLAYED_HEADER = 'Idempotent-Replayed';

const IdempotencyHeaderDoc = () =>
  ApiHeader({
    name: IDEMPOTENCY_HEADER,
    required: true,
    description:
      'Clave unica elegida por el cliente (8-128 caracteres [A-Za-z0-9._-]). Un reintento con la misma clave y el mismo contenido devuelve la respuesta original (cabecera Idempotent-Replayed: true) sin alterar el stock. La misma clave con contenido distinto responde 409 IDEMPOTENCY_KEY_REUSED.',
    example: 'ticket-1045-out',
  });

@ApiTags('Movimientos')
@Controller('movements')
export class MovementsController {
  constructor(private readonly service: MovementsService) {}

  @Post()
  @IdempotencyHeaderDoc()
  @ApiOperation({
    summary: 'Registrar entrada o salida de inventario',
    description:
      'Operacion transaccional: bloquea la fila del producto (SELECT ... FOR UPDATE), calcula previousStock/resultingStock en el servidor, ' +
      'actualiza el stock e inserta el movimiento en una sola transaccion. Las salidas superiores al stock disponible responden 409 INSUFFICIENT_STOCK. ' +
      'Los movimientos son inmutables: no existen endpoints PATCH/DELETE; las correcciones se hacen con /movements/{id}/reversal.',
  })
  @ApiCreatedResponse({ type: MovementResponseDto, description: 'Movimiento creado (o reproducido si Idempotent-Replayed: true)' })
  @ApiValidationError()
  @ApiNotFound('Producto inexistente (PRODUCT_NOT_FOUND)')
  @ApiConflict('INSUFFICIENT_STOCK, PRODUCT_INACTIVE o IDEMPOTENCY_KEY_REUSED')
  async create(@Body() dto: CreateMovementDto, @IdempotencyKey() key: string, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.service.create(dto, key));
  }

  @Get()
  @ApiOperation({ summary: 'Listar movimientos', description: 'Filtros por producto, tipo y rango de fechas (from/to ISO 8601). Orden por fecha, mas recientes primero por defecto.' })
  @ApiPaginatedResponse(MovementResponseDto)
  @ApiValidationError()
  findAll(@Query() query: ListMovementsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener movimiento por id', description: 'Incluye reversedByMovementId si el movimiento fue compensado.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: MovementResponseDto })
  @ApiNotFound('Movimiento no encontrado (MOVEMENT_NOT_FOUND)')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/reversal')
  @IdempotencyHeaderDoc()
  @ApiOperation({
    summary: 'Revertir un movimiento (compensacion)',
    description:
      'Genera el movimiento contrario por la cantidad total y lo vincula al original (reversesMovementId). ' +
      'El original permanece intacto. Rechaza una segunda reversion (MOVEMENT_ALREADY_REVERSED), revertir una compensacion (MOVEMENT_IS_REVERSAL), ' +
      'dejar stock negativo (INSUFFICIENT_STOCK) o productos inactivos (PRODUCT_INACTIVE).',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Movimiento a revertir' })
  @ApiCreatedResponse({ type: MovementResponseDto })
  @ApiValidationError()
  @ApiNotFound('Movimiento no encontrado (MOVEMENT_NOT_FOUND)')
  @ApiConflict('MOVEMENT_ALREADY_REVERSED, MOVEMENT_IS_REVERSAL, INSUFFICIENT_STOCK, PRODUCT_INACTIVE o IDEMPOTENCY_KEY_REUSED')
  async reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseMovementDto,
    @IdempotencyKey() key: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.send(res, await this.service.reverse(id, dto, key));
  }

  private send(res: Response, result: IdempotentResult<MovementResponseDto>) {
    res.status(result.status);
    res.setHeader(REPLAYED_HEADER, result.replayed ? 'true' : 'false');
    return result.body;
  }
}
