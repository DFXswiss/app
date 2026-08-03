import {
  ABSENT_LABEL,
  computeConversionRate,
  displayNullable,
  formatAmount,
  formatCount,
  formatPercent,
} from 'src/partner-dashboard/util/format';

describe('partner format helpers', () => {
  it('uses the en-dash placeholder for absent values (never a zero or prose label)', () => {
    expect(ABSENT_LABEL).toBe('–');
    expect(ABSENT_LABEL).not.toBe('0');
    expect(ABSENT_LABEL.toLowerCase()).not.toMatch(/angabe/);
  });

  it('formats amounts with thousands separators and currency code', () => {
    expect(formatAmount(11858002.52, 'CHF')).toMatch(/11.?858.?002[,.]52 CHF/);
    expect(formatAmount(0, 'EUR')).toBe('0.00 EUR');
  });

  it('formats counts with thousands separators', () => {
    expect(formatCount(126547)).toMatch(/126.?547/);
    expect(formatCount(0)).toBe('0');
  });

  it('formats rates as percent with one decimal place', () => {
    expect(formatPercent(0.1538)).toMatch(/15[,.]4 %/);
    expect(formatPercent(0)).toMatch(/0[,.]0 %/);
  });

  it('returns empty string for null format inputs (caller handles display)', () => {
    expect(formatAmount(null, 'CHF')).toBe('');
    expect(formatCount(null)).toBe('');
    expect(formatPercent(null)).toBe('');
  });

  it('displayNullable distinguishes null (genuinely absent) from 0 (real zero)', () => {
    const absent = displayNullable(null, (n) => formatCount(n));
    expect(absent.kind).toBe('absent');
    if (absent.kind === 'absent') {
      expect(absent.text).toBe('–');
      expect(absent.text).not.toBe('0');
    }

    const zero = displayNullable(0, (n) => formatCount(n));
    expect(zero.kind).toBe('value');
    if (zero.kind === 'value') {
      expect(zero.text).toBe('0');
    }
  });

  describe('computeConversionRate', () => {
    it('returns tradingUsers / registeredUsers for a normal partner', () => {
      const rate = computeConversionRate(24360, 126547);
      expect(rate).toBeCloseTo(0.1925, 4);
    });

    it('returns null (not 0, NaN, or Infinity) when there are no registered users', () => {
      const rate = computeConversionRate(0, 0);
      expect(rate).toBeNull();
      expect(rate).not.toBe(0);
      expect(Number.isNaN(rate as unknown as number)).toBe(false);
      expect(rate).not.toBe(Infinity);
    });

    it('returns 0 (distinct from null) when registered users exist but none traded', () => {
      const rate = computeConversionRate(0, 100);
      expect(rate).toBe(0);
      expect(rate).not.toBeNull();
    });
  });
});
