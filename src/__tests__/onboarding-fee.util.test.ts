jest.mock('src/util/utils', () => ({
  formatChf: (value: number) => value.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
}));

jest.mock('@dfx.swiss/react', () => ({
  UserRole: {
    USER: 'User',
    SUPPORT: 'Support',
    MARKETING: 'Marketing',
    COMPLIANCE: 'Compliance',
    ADMIN: 'Admin',
    PARTNER: 'Partner',
  },
}));

import { UserRole } from '@dfx.swiss/react';
import {
  canManageOnboardingFee,
  canUsePartnerOnboardingFee,
  formatChf,
  ONBOARDING_FEE_API_OFF,
  ONBOARDING_FEE_MAX_AMOUNT,
  ONBOARDING_FEE_MIN_AMOUNT,
  onboardingFeeFailureMessage,
  parseOnboardingFeeAmount,
} from 'src/util/onboarding-fee.util';

describe('canManageOnboardingFee', () => {
  it('allows the Admin role', () => {
    expect(canManageOnboardingFee(UserRole.ADMIN)).toBe(true);
  });

  it.each([UserRole.COMPLIANCE, UserRole.SUPPORT, UserRole.MARKETING, UserRole.PARTNER, UserRole.USER, undefined])(
    'refuses %s',
    (role) => {
      expect(canManageOnboardingFee(role)).toBe(false);
    },
  );
});

describe('canUsePartnerOnboardingFee', () => {
  it('allows the Partner role', () => {
    expect(canUsePartnerOnboardingFee(UserRole.PARTNER)).toBe(true);
  });

  it.each([UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.SUPPORT, UserRole.MARKETING, UserRole.USER, undefined])(
    'refuses %s',
    (role) => {
      expect(canUsePartnerOnboardingFee(role)).toBe(false);
    },
  );
});

describe('onboardingFeeFailureMessage', () => {
  it('uses the message of an API error', () => {
    const message = onboardingFeeFailureMessage(
      Object.assign(new Error('Address not found'), { statusCode: 404 }),
      'fallback',
    );
    expect(message).toBe('Address not found');
  });

  it.each([{ statusCode: 404 }, Object.assign(new Error('Not Found'), { statusCode: 404 })])(
    'names the switched-off API for a bare 404 (%p)',
    (error) => {
      expect(onboardingFeeFailureMessage(error, 'fallback')).toBe(ONBOARDING_FEE_API_OFF);
    },
  );

  it('falls back when the failure carries no text message', () => {
    expect(onboardingFeeFailureMessage({ statusCode: 400, message: 42 }, 'fallback')).toBe('fallback');
    expect(onboardingFeeFailureMessage(undefined, 'fallback')).toBe('fallback');
  });
});

describe('formatChf', () => {
  it.each([400, 1000, 72000])('prefixes the Swiss number %i with CHF', (amount) => {
    const swissNumber = amount.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    expect(formatChf(amount)).toBe(`CHF ${swissNumber}`);
  });
});

describe('onboarding fee range', () => {
  it('is the whole CHF range the API accepts', () => {
    expect(ONBOARDING_FEE_MIN_AMOUNT).toBe(1);
    expect(ONBOARDING_FEE_MAX_AMOUNT).toBe(1000000);
  });
});

describe('parseOnboardingFeeAmount', () => {
  it.each<[string, string | number | undefined | null, number | undefined]>([
    ['plain digits', '14000', 14000],
    ['a suggested amount', '400', 400],
    ['the lower bound', '1', 1],
    ['the upper bound', '1000000', 1000000],
    ['surrounding whitespace', '  14000\t', 14000],
    ['leading zeros', '0800', 800],
    ['an empty string', '', undefined],
    ['whitespace only', '   ', undefined],
    ['zero, just below the range', '0', undefined],
    ['just above the range', '1000001', undefined],
    ['far above the range', '99999999999999999999', undefined],
    ['a minus sign', '-400', undefined],
    ['a plus sign', '+400', undefined],
    ['a decimal point', '800.5', undefined],
    ['a whole number with a decimal point', '800.0', undefined],
    ['a decimal comma', '800,5', undefined],
    ['an apostrophe thousands separator', "14'000", undefined],
    ['a comma thousands separator', '14,000', undefined],
    ['an inner space', '14 000', undefined],
    ['an exponent', '1e3', undefined],
    ['letters', 'abc', undefined],
    ['a currency suffix', '400 CHF', undefined],
    ['a hex literal', '0x10', undefined],
    ['a whole number', 14000, 14000],
    ['the lower bound as number', 1, 1],
    ['the upper bound as number', 1000000, 1000000],
    ['zero as number', 0, undefined],
    ['above the range as number', 1000001, undefined],
    ['a negative number', -400, undefined],
    ['a fractional number', 800.5, undefined],
    ['NaN', Number.NaN, undefined],
    ['Infinity', Number.POSITIVE_INFINITY, undefined],
    ['undefined', undefined, undefined],
    ['null', null, undefined],
  ])('parses %s', (_case, input, expected) => {
    expect(parseOnboardingFeeAmount(input)).toBe(expected);
  });
});
