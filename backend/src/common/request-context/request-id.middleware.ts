import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

/**
 * Toma el X-Request-ID generado por el Gateway Nginx (unico punto de entrada) o genera uno
 * si el backend recibe trafico directo (por ejemplo en pruebas). Siempre se devuelve al cliente.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  }
}
