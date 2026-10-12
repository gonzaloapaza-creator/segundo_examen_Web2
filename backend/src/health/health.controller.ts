import { Controller, Get, HttpStatus, Logger } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppException, ErrorCode } from '../common/errors/app.exception';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' }) status: 'ok';
  @ApiProperty({ example: { database: 'up' } }) checks: Record<string, 'up' | 'down'>;
  @ApiProperty({ example: '2026-10-11T15:04:05.123Z' }) timestamp: string;
  @ApiProperty({ example: 1234.5, description: 'Segundos desde el arranque del proceso' }) uptime: number;
}

@ApiTags('Salud')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness: el proceso responde' })
  @ApiOkResponse({ type: HealthResponseDto })
  live(): HealthResponseDto {
    return { status: 'ok', checks: {}, timestamp: new Date().toISOString(), uptime: process.uptime() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: comprueba la conexion a PostgreSQL', description: 'Devuelve 503 SERVICE_UNAVAILABLE si la base de datos no responde.' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  async ready(): Promise<HealthResponseDto> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch (error) {
      this.logger.warn(`Readiness fallida: ${error instanceof Error ? error.message : String(error)}`);
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.SERVICE_UNAVAILABLE, 'La base de datos no esta disponible', { database: 'down' });
    }
    return { status: 'ok', checks: { database: 'up' }, timestamp: new Date().toISOString(), uptime: process.uptime() };
  }
}
