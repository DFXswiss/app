import type { ApiError } from '@dfx.swiss/react';
import { UserRole } from '@dfx.swiss/react';
import { formatChf as formatSwissNumber } from 'src/util/utils';

// The onboarding-fee endpoints are only routed while the backend enables the onboarding-fee
// switch; until then Nest answers their paths with a bare 404.
export const ONBOARDING_FEE_API_OFF = 'The onboarding fee API is switched off.';

/**
 * Managing an onboarding fee is an Admin action. The API enforces the same rule fail-closed
 * (`RoleGuard(UserRole.ADMIN)` on PUT/DELETE userData/:id/onboardingFee); the UI only hides the
 * controls for roles that would be refused.
 */
export function canManageOnboardingFee(role: UserRole | undefined): boolean {
  return role === UserRole.ADMIN;
}

/**
 * Partner key-account managers assign fees through the same feature with their own endpoints. The
 * API guards them with `RoleGuard(UserRole.PARTNER)`; this mirrors that rule for the UI.
 */
export function canUsePartnerOnboardingFee(role: UserRole | undefined): boolean {
  return role === UserRole.PARTNER;
}

// The API client raises ApiException (an Error) with the status and the API's message. While the
// feature switch is off, the endpoints throw Nest's plain NotFoundException, whose body message is
// "Not Found"; a 404 with a meaning carries its own text ("Address not found"). The message is also
// read from a plain { statusCode, message } object, which some callers reject with.
export function onboardingFeeFailureMessage(e: unknown, fallback: string): string {
  const apiError = e as Partial<ApiError> | null | undefined;
  const message = typeof apiError?.message === 'string' ? apiError.message : undefined;
  if (apiError?.statusCode === 404 && (!message || message === 'Not Found')) return ONBOARDING_FEE_API_OFF;
  return message || fallback;
}

// Onboarding fees are whole CHF amounts of any size within the range below. The Swiss grouping keeps
// large values readable and the prefix makes the currency explicit in suggestions and confirmation
// messages.
export function formatChf(amount: number): string {
  return `CHF ${formatSwissNumber(amount)}`;
}

// Whole CHF. The API enforces the same range; the UI mirrors it so an amount it would refuse is not sent.
export const ONBOARDING_FEE_MIN_AMOUNT = 1;
export const ONBOARDING_FEE_MAX_AMOUNT = 1_000_000;

// Plain digits only: a sign, a decimal point or comma, a thousands separator or an exponent would let
// Number() accept input the clerk did not mean as a whole CHF amount (e.g. "1e3" or "-0").
const WHOLE_AMOUNT = /^\d+$/;

// Returns the amount for input that is a whole number of CHF within the range, otherwise undefined.
export function parseOnboardingFeeAmount(input: string | number | undefined | null): number | undefined {
  let amount: number;
  if (typeof input === 'number') {
    amount = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!WHOLE_AMOUNT.test(trimmed)) return undefined;
    amount = Number(trimmed);
  } else {
    return undefined;
  }
  return Number.isInteger(amount) && amount >= ONBOARDING_FEE_MIN_AMOUNT && amount <= ONBOARDING_FEE_MAX_AMOUNT
    ? amount
    : undefined;
}
