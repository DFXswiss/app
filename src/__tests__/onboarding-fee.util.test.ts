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
  onboardingFeeFailureMessage,
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
