jest.mock('../utils/url', () => {
  const actual = jest.requireActual('../utils/url') as typeof import('../utils/url');
  return {
    ...actual,
    isSafeHttpsUrl: (value: string | undefined | null) => {
      if (typeof value === 'string' && value.includes('mempool.space')) return false;
      return actual.isSafeHttpsUrl(value);
    },
  };
});

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    ETHEREUM: 'Ethereum',
    LIGHTNING: 'Lightning',
    MONERO: 'Monero',
  },
}));

import { Blockchain } from '@dfx.swiss/react';
import {
  dateGroupKey,
  explorerTxUrl,
  formatAmount,
  formatChf,
  formatDate,
  formatDateTime,
  formatNumber,
  localeFor,
  resolveTxUrl,
  shortAddress,
} from '../screens/parts/format';

describe('format helpers', () => {
  it('maps languages to locales and falls back to en-US', () => {
    expect(localeFor('de')).toBe('de-DE');
    expect(localeFor('en')).toBe('en-US');
    expect(localeFor('xx' as 'en')).toBe('en-US');
  });

  it('shortens addresses and leaves short values intact', () => {
    expect(shortAddress(undefined)).toBe('');
    expect(shortAddress('0xabc')).toBe('0xabc');
    expect(shortAddress('0x1234567890abcdef')).toBe('0x1234…cdef');
  });

  it('formats dates and amounts and drops invalid values', () => {
    expect(formatDate(undefined, 'en')).toBe('');
    expect(formatDate('not-a-date', 'en')).toBe('');
    expect(formatDateTime(undefined, 'en')).toBe('');
    expect(dateGroupKey(undefined)).toBe('');
    expect(dateGroupKey('2026-08-13T10:00:00Z')).toMatch(/^\d{4}-\d{1,2}-\d{1,2}$/);
    expect(formatNumber(undefined, 'en')).toBe('—');
    expect(formatNumber(Number.NaN, 'en')).toBe('—');
    expect(formatAmount(undefined, 'BTC', 'en')).toBe('');
    expect(formatAmount(1.5, undefined, 'en')).toBe(formatNumber(1.5, 'en'));
    expect(formatAmount(1.5, 'BTC', 'en')).toContain('BTC');
    expect(formatChf(undefined, 'en')).toBe('—');
    expect(formatChf(12500.4, 'en')).toContain('CHF');
    expect(formatDate(new Date('2026-01-15T12:00:00Z'), 'en')).not.toBe('');
    expect(formatDateTime(new Date('2026-01-15T12:00:00Z'), 'en')).not.toBe('');

    const dateTimeFormat = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('bad locale');
    });
    expect(formatDate(new Date('2026-01-15T12:00:00Z'), 'en')).toBe('2026-01-15');
    expect(formatDateTime(new Date('2026-01-15T12:00:00Z'), 'en')).toBeTruthy();
    dateTimeFormat.mockRestore();

    const toLocaleString = jest.spyOn(Number.prototype, 'toLocaleString').mockImplementation(() => {
      throw new Error('bad number');
    });
    expect(formatNumber(12.5, 'en')).toBe('12.5');
    toLocaleString.mockRestore();
  });

  it('falls back when Intl refuses the locale', () => {
    const original = Intl.DateTimeFormat;
    const numberOriginal = Number.prototype.toLocaleString;
    try {
      Object.defineProperty(Intl, 'DateTimeFormat', {
        configurable: true,
        writable: true,
        value: function DateTimeFormat() {
          throw new RangeError('invalid locale');
        },
      });
      expect(formatDate(new Date('2026-01-15T12:00:00Z'), 'en')).toBe('2026-01-15');
      expect(formatDateTime(new Date('2026-01-15T12:00:00Z'), 'en')).not.toBe('');
      Number.prototype.toLocaleString = () => {
        throw new RangeError('invalid locale');
      };
      expect(formatNumber(12.5, 'en')).toBe('12.5');
    } finally {
      Intl.DateTimeFormat = original;
      Number.prototype.toLocaleString = numberOriginal;
    }
  });

  it('builds explorer URLs only for known chains and prefers a safe API URL', () => {
    expect(explorerTxUrl(undefined, 'abc')).toBeUndefined();
    expect(explorerTxUrl(Blockchain.BITCOIN, undefined)).toBeUndefined();
    expect(explorerTxUrl(Blockchain.BITCOIN, 'abc')).toBeUndefined();
    expect(explorerTxUrl(Blockchain.ETHEREUM, '0xabc')).toMatch(/^https:\/\//);
    expect(explorerTxUrl(Blockchain.LIGHTNING, 'abc')).toBeUndefined();
    expect(resolveTxUrl('https://ok.example/tx/1', Blockchain.BITCOIN, 'abc')).toBe('https://ok.example/tx/1');
    expect(resolveTxUrl('javascript:alert(1)', Blockchain.BITCOIN, 'abc')).toBeUndefined();
  });
});
