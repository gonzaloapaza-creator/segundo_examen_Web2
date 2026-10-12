import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? ['true', '1', 'yes'].includes(value.toLowerCase()) : Boolean(value);

export class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'production';

  @Transform(({ value }) => (value === undefined ? 3000 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(65535)
  BACKEND_PORT = 3000;

  @IsString()
  @MinLength(1)
  POSTGRES_HOST: string;

  @Transform(({ value }) => (value === undefined ? 5432 : Number(value)))
  @IsInt()
  POSTGRES_PORT = 5432;

  @IsString()
  @MinLength(1)
  POSTGRES_USER: string;

  @IsString()
  @MinLength(1)
  POSTGRES_PASSWORD: string;

  @IsString()
  @MinLength(1)
  POSTGRES_DB: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  SEED_ON_START = false;

  @Transform(({ value }) => (value === undefined ? 100 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(1000)
  PAGINATION_MAX_LIMIT = 100;

  @IsOptional()
  @IsIn(['error', 'warn', 'log', 'debug', 'verbose'])
  LOG_LEVEL: 'error' | 'warn' | 'log' | 'debug' | 'verbose' = 'log';
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: false });
  const errors = validateSync(validated, { whitelist: true, forbidUnknownValues: false });
  if (errors.length > 0) {
    const detail = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('; ');
    throw new Error(`Configuracion de entorno invalida -> ${detail}`);
  }
  return validated;
}
