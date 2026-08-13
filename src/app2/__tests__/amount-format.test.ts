import {
  fiatSymbol,
  formatAmount,
  formatFiat,
  localeFor,
  parseAmt,
  quickChipSymbol,
  shortAddress,
} from '../screens/trade/amount';

describe('trade amount helpers', () => {
  it('rejects empty, zero and malformed amounts', () => {
    expect(parseAmt(undefined)).toBeNull();
    expect(parseAmt('')).toBeNull();
    expect(parseAmt('0')).toBeNull();
    expect(parseAmt('-1')).toBeNull();
    expect(parseAmt('12.3.4')).toBeNull();
    expect(parseAmt(12.5)).toBe(12.5);
  });

  it('formats fiat, amounts and symbols and falls back on a bad currency', () => {
    expect(localeFor('de')).toBe('de-CH');
    expect(formatFiat(100, 'EUR', 'en')).toMatch(/100/);
    expect(formatFiat(100, 'NOTACURRENCY', 'en')).toBe('100.00 NOTACURRENCY');
    expect(formatAmount(1.23456789, 6, 'en')).toMatch(/1\.23456/);
    expect(fiatSymbol('EUR', 'en')).not.toBe('');
    expect(fiatSymbol('NOTACURRENCY', 'en')).toBe('NOTACURRENCY');
    expect(quickChipSymbol('EUR')).toBe('€');
    expect(quickChipSymbol('CHF')).toBe('CHF ');
    expect(quickChipSymbol('XYZ')).toBe('XYZ ');
    expect(shortAddress(undefined)).toBe('');
    expect(shortAddress('abcd')).toBe('abcd');
    expect(shortAddress('0x1234567890abcdef')).toBe('0x1234…cdef');
  });
});
