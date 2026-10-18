import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Codigos de error de negocio expuestos en el campo `code` de las respuestas de error.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  CATEGORY_NAME_TAKEN: 'CATEGORY_NAME_TAKEN',
  CATEGORY_HAS_PRODUCTS: 'CATEGORY_HAS_PRODUCTS',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  PRODUCT_SKU_TAKEN: 'PRODUCT_SKU_TAKEN',
  PRODUCT_INACTIVE: 'PRODUCT_INACTIVE',
  PRODUCT_HAS_STOCK: 'PRODUCT_HAS_STOCK',
  MOVEMENT_NOT_FOUND: 'MOVEMENT_NOT_FOUND',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  MOVEMENT_ALREADY_REVERSED: 'MOVEMENT_ALREADY_REVERSED',
  MOVEMENT_IS_REVERSAL: 'MOVEMENT_IS_REVERSAL',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_INVALID: 'IDEMPOTENCY_KEY_INVALID',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  CONFLICT: 'CONFLICT',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorBody {
  statusCode: number;
  code: ErrorCode | string;
  message: string;
  details?: unknown;
}

/**
 * Excepcion HTTP con codigo de negocio. El filtro global completa timestamp, path y requestId.
 */
export class AppException extends HttpException {
  constructor(status: HttpStatus, code: ErrorCode, message: string, details?: unknown) {
    const body: ErrorBody = { statusCode: status, code, message };
    if (details !== undefined) body.details = details;
    super(body, status);
  }

  static notFound(code: ErrorCode, message: string) {
    return new AppException(HttpStatus.NOT_FOUND, code, message);
  }

  static conflict(code: ErrorCode, message: string, details?: unknown) {
    return new AppException(HttpStatus.CONFLICT, code, message, details);
  }

  static badRequest(code: ErrorCode, message: string, details?: unknown) {
    return new AppException(HttpStatus.BAD_REQUEST, code, message, details);
  }
}
