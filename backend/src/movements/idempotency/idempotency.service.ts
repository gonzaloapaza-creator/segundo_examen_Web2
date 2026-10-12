import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { EntityManager, Repository } from 'typeorm';
import { AppException, ErrorCode } from '../../common/errors/app.exception';
import { isUniqueViolation } from '../../common/errors/pg-error.util';
import { IdempotencyRecord } from '../entities/idempotency-record.entity';

export const PK_IDEMPOTENCY = 'pk_idempotency_records';

export type IdempotentOperation = 'CREATE_MOVEMENT' | 'REVERSE_MOVEMENT';

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

/** Serializa un objeto con claves ordenadas de forma recursiva para obtener una huella estable. */
export const canonicalize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
};

export const fingerprint = (operation: IdempotentOperation, payload: Record<string, unknown>): string =>
  createHash('sha256').update(canonicalize({ operation, ...payload })).digest('hex');

/**
 * Idempotencia respaldada por PostgreSQL.
 *
 * Protocolo dentro de UNA transaccion:
 *  1. `reserve`: INSERT del registro con la clave (PK). Si otra transaccion concurrente ya inserto
 *     la misma clave y aun no confirmo, PostgreSQL bloquea este INSERT hasta que aquella termine:
 *     - si confirma -> este INSERT falla con 23505 y el llamador devuelve la respuesta original;
 *     - si revierte (operacion fallida) -> este INSERT prospera y la operacion se ejecuta.
 *  2. Logica de negocio (bloqueo de fila del producto, calculo de stock, insercion del movimiento).
 *  3. `complete`: se guarda la respuesta final en el mismo registro.
 *  Si la operacion falla, la transaccion se revierte y NO queda registro: el cliente puede reintentar
 *  la misma clave una vez corregida la causa.
 */
@Injectable()
export class IdempotencyService {
  constructor(@InjectRepository(IdempotencyRecord) private readonly records: Repository<IdempotencyRecord>) {}

  async reserve(manager: EntityManager, key: string, operation: IdempotentOperation, requestHash: string): Promise<void> {
    await manager.getRepository(IdempotencyRecord).insert({ key, operation, requestHash, responseStatus: 0, responseBody: {} });
  }

  async complete(manager: EntityManager, key: string, status: number, body: unknown): Promise<void> {
    await manager.getRepository(IdempotencyRecord).update({ key }, { responseStatus: status, responseBody: JSON.parse(JSON.stringify(body)) });
  }

  /**
   * Ejecuta `work` de forma idempotente. `work` recibe el EntityManager transaccional y devuelve el cuerpo
   * de respuesta; el estado HTTP de la primera ejecucion es `status` (201 por defecto).
   * Un reintento con la misma clave y la misma huella devuelve el mismo estado y cuerpo (replayed=true).
   * Una clave reutilizada con huella distinta devuelve 409 IDEMPOTENCY_KEY_REUSED.
   */
  async execute<T>(
    manager: EntityManager,
    key: string,
    operation: IdempotentOperation,
    requestHash: string,
    work: (manager: EntityManager) => Promise<T>,
    status: number = HttpStatus.CREATED,
  ): Promise<IdempotentResult<T>> {
    try {
      const body = await manager.transaction(async (tx) => {
        await this.reserve(tx, key, operation, requestHash);
        const result = await work(tx);
        await this.complete(tx, key, status, result);
        return result;
      });
      return { status, body, replayed: false };
    } catch (error) {
      if (!isUniqueViolation(error, PK_IDEMPOTENCY)) throw error;
      return this.replay<T>(key, requestHash);
    }
  }

  private async replay<T>(key: string, requestHash: string): Promise<IdempotentResult<T>> {
    const existing = await this.records.findOne({ where: { key } });
    if (!existing) {
      throw AppException.conflict(ErrorCode.IDEMPOTENCY_KEY_REUSED, 'La clave de idempotencia esta siendo procesada; reintente en unos instantes');
    }
    if (existing.requestHash !== requestHash) {
      throw AppException.conflict(
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        'La clave de idempotencia ya fue utilizada con una operacion o contenido diferente',
        { operation: existing.operation, firstSeenAt: existing.createdAt },
      );
    }
    return { status: existing.responseStatus, body: existing.responseBody as T, replayed: true };
  }
}
