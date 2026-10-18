import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppException, ErrorCode } from '../../common/errors/app.exception';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
/** Formato permitido: 8 a 128 caracteres entre letras, numeros, "-", "_" y ".". */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Extrae y valida la cabecera Idempotency-Key. Obligatoria para crear y revertir movimientos.
 */
export const IdempotencyKey = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const raw = req.header(IDEMPOTENCY_HEADER)?.trim();
  if (!raw) {
    throw AppException.badRequest(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, `La cabecera ${IDEMPOTENCY_HEADER} es obligatoria`);
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(raw)) {
    throw AppException.badRequest(ErrorCode.IDEMPOTENCY_KEY_INVALID, `${IDEMPOTENCY_HEADER} debe tener entre 8 y 128 caracteres [A-Za-z0-9._-]`);
  }
  return raw;
});
