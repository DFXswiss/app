// Unit tests for the MonthlyLimitReached predicate the manual-check UI keys the acknowledgement row on.

import { hasMonthlyLimitReached, MONTHLY_LIMIT_REACHED_TOKEN } from 'src/util/monthly-limit.util';

describe('MONTHLY_LIMIT_REACHED_TOKEN', () => {
  it('is exactly MonthlyLimitReached', () => {
    expect(MONTHLY_LIMIT_REACHED_TOKEN).toBe('MonthlyLimitReached');
  });
});

describe('hasMonthlyLimitReached', () => {
  it('is true when the comment is exactly the token', () => {
    expect(hasMonthlyLimitReached('MonthlyLimitReached')).toBe(true);
    expect(hasMonthlyLimitReached(MONTHLY_LIMIT_REACHED_TOKEN)).toBe(true);
  });

  it('is true when the token is one member of a ;-joined list (with surrounding spaces)', () => {
    expect(hasMonthlyLimitReached('Other; MonthlyLimitReached ;Yet')).toBe(true);
  });

  it('is false for an unrelated comment', () => {
    expect(hasMonthlyLimitReached('ScorechainHighRisk')).toBe(false);
  });

  it('is false for undefined / empty comments', () => {
    expect(hasMonthlyLimitReached(undefined)).toBe(false);
    expect(hasMonthlyLimitReached('')).toBe(false);
  });

  it('is false when the token is missing from the list', () => {
    expect(hasMonthlyLimitReached('Other;Yet')).toBe(false);
  });

  it('is false for a longer token that merely contains the string (membership, not substring)', () => {
    expect(hasMonthlyLimitReached('MonthlyLimitReachedX')).toBe(false);
    expect(hasMonthlyLimitReached('MonthlyLimitReachedLegacy')).toBe(false);
  });
});
