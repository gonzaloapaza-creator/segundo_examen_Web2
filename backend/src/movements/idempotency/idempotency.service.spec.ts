import { canonicalize, fingerprint } from './idempotency.service';

describe('idempotency fingerprint', () => {
  it('canonicaliza con claves ordenadas y omite undefined', () => {
    expect(canonicalize({ b: 1, a: { d: [1, 2], c: 'x' }, e: undefined })).toBe('{"a":{"c":"x","d":[1,2]},"b":1}');
  });

  it('produce la misma huella para el mismo contenido con distinto orden de claves', () => {
    const a = fingerprint('CREATE_MOVEMENT', { productId: 'p', type: 'OUT', quantity: 1, reason: 'venta' });
    const b = fingerprint('CREATE_MOVEMENT', { reason: 'venta', quantity: 1, type: 'OUT', productId: 'p' });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('cambia la huella si cambia la operacion o el contenido', () => {
    const base = fingerprint('CREATE_MOVEMENT', { productId: 'p', type: 'OUT', quantity: 1, reason: 'venta' });
    expect(fingerprint('REVERSE_MOVEMENT', { productId: 'p', type: 'OUT', quantity: 1, reason: 'venta' })).not.toBe(base);
    expect(fingerprint('CREATE_MOVEMENT', { productId: 'p', type: 'OUT', quantity: 2, reason: 'venta' })).not.toBe(base);
  });
});
