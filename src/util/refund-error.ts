/**
 * Maps raw API refund/chargeback error strings to compliance-facing English source keys
 * (for translate('screens/compliance', …)). Unknown messages are returned unchanged.
 */
export function mapRefundApiError(message: string): string {
  const m = message.trim();
  if (!m) return m;

  if (/transaction already charged back/i.test(m)) {
    return 'This refund has already been approved or paid out and cannot be submitted again.';
  }
  if (/request refund data first/i.test(m) || /refund data expired/i.test(m)) {
    return 'Refund details expired. Reload the page and try again.';
  }
  if (/cannot refund with this aml reason/i.test(m)) {
    return 'This transaction cannot be refunded with the current AML reason.';
  }
  if (/creditor data is required/i.test(m)) {
    return 'Creditor details are required for bank refunds.';
  }
  if (/iban not valid|bic not available/i.test(m)) {
    return 'The chargeback IBAN is invalid or the BIC is missing.';
  }

  return m;
}

export interface PendingChargebackNavState {
  blockReasons: string[];
  verifiedName?: string;
  completeName?: string;
  creditorName?: string;
  chargebackAmount?: number;
  chargebackAsset?: string;
}

export function isPendingChargebackNavState(value: unknown): value is PendingChargebackNavState {
  if (!value || typeof value !== 'object') return false;
  const v = value as PendingChargebackNavState;
  return Array.isArray(v.blockReasons);
}
