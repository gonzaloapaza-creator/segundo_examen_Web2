import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Category } from '../entities/category.entity';

export class CategoryResponseDto {
  @ApiProperty({ format: 'uuid', example: '2f1b8e4a-6d3c-4e0a-9f1b-0c2d3e4f5a6b' })
  id: string;

  @ApiProperty({ example: 'Cables y adaptadores' })
  name: string;

  @ApiPropertyOptional({ example: 'Cables USB-C, HDMI y adaptadores de video', nullable: true })
  description: string | null;

  @ApiProperty({ example: '2026-10-11T15:04:05.123Z', description: 'ISO 8601 (UTC)' })
  createdAt: Date;

  @ApiProperty({ example: '2026-10-11T15:04:05.123Z' })
  updatedAt: Date;

  static from(entity: Category): CategoryResponseDto {
    return { id: entity.id, name: entity.name, description: entity.description, createdAt: entity.createdAt, updatedAt: entity.updatedAt };
  }
}
