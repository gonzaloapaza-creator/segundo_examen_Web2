import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode } from '../errors/app.exception';

export interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  timestamp: string;
  path: string;
  requestId: string;
}

const DEFAULT_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
  [HttpStatus.INTERNAL_SERVER_ERROR]: ErrorCode.INTERNAL_ERROR,
};

/**
 * Convierte cualquier excepcion en el formato de error unico del backend.
 * Nunca expone stack traces, consultas SQL ni mensajes internos de errores 5xx.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, code, message, details } = this.normalize(exception);
    // Los errores del body-parser (JSON malformado) ocurren antes del RequestIdMiddleware:
    // se recupera el identificador que propaga el Gateway para no perder la trazabilidad.
    const requestId = req.requestId ?? req.header('x-request-id') ?? res.getHeader('X-Request-ID')?.toString() ?? 'unknown';
    if (status >= 500) {
      this.logger.error(
        JSON.stringify({ requestId, path: req.originalUrl, error: exception instanceof Error ? exception.message : String(exception) }),
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ErrorResponse = {
      statusCode: status,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      requestId,
    };
    res.status(status).json(body);
  }

  private normalize(exception: unknown): { status: number; code: string; message: string; details?: unknown } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') return { status, code: DEFAULT_CODES[status] ?? 'HTTP_ERROR', message: payload };
      const obj = payload as Record<string, unknown>;
      const rawMessage = obj.message;
      const message = Array.isArray(rawMessage) ? 'Datos de entrada invalidos' : String(rawMessage ?? exception.message);
      const details = obj.details ?? (Array.isArray(rawMessage) ? rawMessage : undefined);
      return { status, code: typeof obj.code === 'string' ? obj.code : (DEFAULT_CODES[status] ?? 'HTTP_ERROR'), message, details };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: ErrorCode.INTERNAL_ERROR, message: 'Error interno del servidor' };
  }
}
