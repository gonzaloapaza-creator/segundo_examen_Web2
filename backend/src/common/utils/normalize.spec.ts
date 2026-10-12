import { emptyToUndefined, normalizeSku, normalizeText } from './normalize';

describe('normalize utils', () => {
  it('recorta y colapsa espacios', () => {
    expect(normalizeText('  Cables   y  adaptadores ')).toBe('Cables y adaptadores');
    expect(normalizeText(5)).toBe(5);
  });

  it('normaliza SKU a mayusculas sin espacios externos', () => {
    expect(normalizeSku(' cab-usbc-1m ')).toBe('CAB-USBC-1M');
  });

  it('convierte cadenas vacias en undefined', () => {
    expect(emptyToUndefined('   ')).toBeUndefined();
    expect(emptyToUndefined('x')).toBe('x');
  });
});
