import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Registro de idempotencia persistido en PostgreSQL.
 * La clave primaria (key) es la restriccion de unicidad: dos transacciones concurrentes que
 * intenten insertar la misma clave se serializan en la BD (la segunda espera a la primera y
 * falla con 23505 si aquella confirma).
 */
@Entity({ name: 'idempotency_records' })
export class IdempotencyRecord {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  key: string;

  @Column({ type: 'varchar', length: 40 })
  operation: string;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash: string;

  @Column({ name: 'response_status', type: 'smallint' })
  responseStatus: number;

  @Column({ name: 'response_body', type: 'json' })
  responseBody: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
