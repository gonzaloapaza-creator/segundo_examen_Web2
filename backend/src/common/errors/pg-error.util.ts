import { QueryFailedError } from 'typeorm';

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
export const PG_CHECK_VIOLATION = '23514';

interface PgDriverError {
  code?: string;
  constraint?: string;
  detail?: string;
}

const driverError = (error: unknown): PgDriverError | undefined => {
  if (error instanceof QueryFailedError) return error.driverError as PgDriverError;
  if (error && typeof error === 'object' && 'code' in error) return error as PgDriverError;
  return undefined;
};

export const isPgError = (error: unknown, code: string, constraint?: string): boolean => {
  const err = driverError(error);
  if (!err || err.code !== code) return false;
  return constraint ? err.constraint === constraint : true;
};

export const isUniqueViolation = (error: unknown, constraint?: string) => isPgError(error, PG_UNIQUE_VIOLATION, constraint);
export const isForeignKeyViolation = (error: unknown, constraint?: string) => isPgError(error, PG_FOREIGN_KEY_VIOLATION, constraint);
export const isCheckViolation = (error: unknown, constraint?: string) => isPgError(error, PG_CHECK_VIOLATION, constraint);
