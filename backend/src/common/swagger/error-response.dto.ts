import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 409 })
  statusCode: number;

  @ApiProperty({ example: 'INSUFFICIENT_STOCK', description: 'Codigo de error estable para el cliente' })
  code: string;

  @ApiProperty({ example: 'Stock insuficiente: disponible 1, solicitado 3' })
  message: string;

  @ApiPropertyOptional({ description: 'Detalle adicional (por ejemplo errores de validacion por campo)' })
  details?: unknown;

  @ApiProperty({ example: '2026-10-11T15:04:05.123Z' })
  timestamp: string;

  @ApiProperty({ example: '/api/v1/movements' })
  path: string;

  @ApiProperty({ example: 'f3b1c2d4e5a6b7c8d9e0f1a2b3c4d5e6', description: 'Identificador de la peticion generado por el Gateway' })
  requestId: string;
}
