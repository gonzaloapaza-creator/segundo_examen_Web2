import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsIn, IsOptional, IsUUID, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface, Validate } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { upperTransform } from '../../common/utils/normalize';
import { MovementType } from '../entities/movement.entity';

@ValidatorConstraint({ name: 'dateRange', async: false })
class DateRangeConstraint implements ValidatorConstraintInterface {
  validate(to: unknown, args: ValidationArguments) {
    const from = (args.object as ListMovementsQueryDto).from;
    if (!from || typeof to !== 'string') return true;
    return new Date(from).getTime() <= new Date(to).getTime();
  }

  defaultMessage() {
    return 'to no puede ser anterior a from';
  }
}

export class ListMovementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ enum: MovementType })
  @IsOptional()
  @Transform(upperTransform)
  @IsEnum(MovementType)
  type?: MovementType;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z', description: 'Fecha/hora ISO 8601 inicial (inclusive)' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59.999Z', description: 'Fecha/hora ISO 8601 final (inclusive). No puede ser anterior a `from`.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Validate(DateRangeConstraint)
  to?: string;

  @ApiPropertyOptional({ enum: ['createdAt'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt'])
  sortBy: 'createdAt' = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc', description: 'Por defecto los movimientos mas recientes primero' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  override order: 'asc' | 'desc' = 'desc';
}
