import { ibanCheck, ibanErrorMessage } from '../screens/trade/iban';

describe('ibanCheck', () => {
  it('accepts a valid Swiss IBAN and rejects length and checksum errors', () => {
    expect(ibanCheck('CH93 0076 2011 6238 5295 7')).toEqual({ ok: true, cc: 'CH' });
    expect(ibanCheck('')).toEqual({ ok: false, reason: 'length' });
    expect(ibanCheck('CH00')).toEqual({ ok: false, reason: 'length' });
    expect(ibanCheck('CH93 0076 2011 6238 5295 8')).toEqual({ ok: false, reason: 'checksum', cc: 'CH' });
    expect(ibanCheck('CH93007620116238529570')).toEqual({ ok: false, reason: 'length', cc: 'CH' });
  });

  it('maps failures to the matching translation key', () => {
    const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
    expect(ibanErrorMessage(t, { ok: false, reason: 'checksum', cc: 'CH' })).toBe('ibanChecksum');
    expect(ibanErrorMessage(t, { ok: false, reason: 'length', cc: 'DE' })).toBe('ibanLenCC:{"c":"DE"}');
    expect(ibanErrorMessage(t, { ok: false, reason: 'length' })).toBe('ibanLength');
  });
});
