// OCP payment-link / payment status must use translated labels
// (same pattern as transaction-state-label's stateLabel), not raw English enums.

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(httpStatus: number, errorMessage: string) {
      super(errorMessage);
      this.statusCode = httpStatus;
    }
  },
  PaymentLinkStatus: { ACTIVE: 'Active', INACTIVE: 'Inactive' },
}));

jest.mock('react-qr-code', () => () => null);

import { paymentLinkStatusLabel, paymentStatusLabel } from '../screens/ocp/links';
import type { TranslationKey } from '../i18n';

describe('paymentLinkStatusLabel / paymentStatusLabel (OCP status i18n)', () => {
  const t = (key: TranslationKey) => {
    const known: Partial<Record<TranslationKey, string>> = {
      plst_Active: 'Aktiv',
      plst_Inactive: 'Inaktiv',
      payst_Pending: 'Ausstehend',
      payst_Completed: 'Abgeschlossen',
      payst_Cancelled: 'Abgebrochen',
      payst_Expired: 'Abgelaufen',
    };
    return known[key] ?? key; // mirrors i18n.tsx: unknown key -> the key itself
  };

  it('translates known PaymentLinkStatus values instead of the raw English enum', () => {
    expect(paymentLinkStatusLabel(t, 'Active')).toBe('Aktiv');
    expect(paymentLinkStatusLabel(t, 'Inactive')).toBe('Inaktiv');
  });

  it('translates known PaymentLinkPaymentStatus values instead of the raw English enum', () => {
    expect(paymentStatusLabel(t, 'Pending')).toBe('Ausstehend');
    expect(paymentStatusLabel(t, 'Completed')).toBe('Abgeschlossen');
    expect(paymentStatusLabel(t, 'Cancelled')).toBe('Abgebrochen');
    expect(paymentStatusLabel(t, 'Expired')).toBe('Abgelaufen');
  });

  it('falls back to the raw value for an unknown status, not a translation-key shape', () => {
    expect(paymentLinkStatusLabel(t, 'SomeFutureStatus')).toBe('SomeFutureStatus');
    expect(paymentLinkStatusLabel(t, 'SomeFutureStatus')).not.toMatch(/^plst_/);
    expect(paymentStatusLabel(t, 'SomeFuturePay')).toBe('SomeFuturePay');
    expect(paymentStatusLabel(t, 'SomeFuturePay')).not.toMatch(/^payst_/);
  });

  it('renders nothing for an absent status rather than an empty translation lookup', () => {
    expect(paymentLinkStatusLabel(t, undefined)).toBe('');
    expect(paymentStatusLabel(t, undefined)).toBe('');
  });
});
