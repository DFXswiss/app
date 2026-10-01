import {
  fiatSymbol,
  formatAmount,
  formatFiat,
  localeFor,
  parseAmt,
  quickChipSymbol,
  shortAddress,
} from '../screens/trade/amount';
import { formatNumber, localeFor as screenLocaleFor } from '../screens/parts/format';

// Reality declaration: the SDK's chain constants are stubbed for the formatting helper import;
// these pure formatting assertions do not exercise the SDK or any block explorer.
jest.mock('@dfx.swiss/react', () => ({ Blockchain: {} }));

describe('trade amount helpers', () => {
  it('shares the locale resolver and German amount format with secondary screens', () => {
    // Use an explicit reference locale so a regression to de-DE still fails across ICU versions.
    const swissNumber = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(12500.5);
    const swissFiat = new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: 'CHF',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(12500.5);
    expect(localeFor).toBe(screenLocaleFor);
    expect(localeFor('xx' as 'en')).toBe('en-GB');
    expect(formatAmount(12500.5, 2, 'de')).toBe(swissNumber);
    expect(formatNumber(12500.5, 'de', 2)).toBe(swissNumber);
    expect(formatFiat(12500.5, 'CHF', 'de')).toBe(swissFiat);
  });

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

    const toLocaleString = jest.spyOn(Number.prototype, 'toLocaleString').mockImplementation(() => {
      throw new Error('bad number');
    });
    expect(formatAmount(1.23456789, 6, 'en')).toBe('1.234568');
    toLocaleString.mockRestore();

    const formatToParts = jest
      .spyOn(Intl.NumberFormat.prototype, 'formatToParts')
      .mockReturnValue([{ type: 'integer', value: '0' } as Intl.NumberFormatPart]);
    expect(fiatSymbol('EUR', 'en')).toBe('EUR');
    formatToParts.mockRestore();
  });
});
