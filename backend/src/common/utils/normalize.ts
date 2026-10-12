import { TransformFnParams } from 'class-transformer';

/** Recorta espacios al inicio/final y colapsa espacios internos repetidos. */
export const normalizeText = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

/** Recorta y convierte a mayusculas (usado para SKU). */
export const normalizeSku = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/** Convierte cadena vacia/espacios en undefined para campos opcionales. */
export const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const trimTransform = ({ value }: TransformFnParams) => normalizeText(value);
export const skuTransform = ({ value }: TransformFnParams) => normalizeSku(value);
export const optionalTextTransform = ({ value }: TransformFnParams) => emptyToUndefined(normalizeText(value));
export const upperTransform = ({ value }: TransformFnParams) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
