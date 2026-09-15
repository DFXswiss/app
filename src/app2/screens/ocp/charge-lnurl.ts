/**
 * Charge-specific LNURL from a POS payment create response.
 * Only `payment.lnurl` is the amount-bound charge. Top-level `lnurl` is the
 * reusable payment-link LNURL and must never back a live POS QR.
 */
export function extractChargeLnurl(data: {
  payment?: { lnurl?: string };
  lnurl?: string;
} | null | undefined): string | undefined {
  const value = data?.payment?.lnurl?.trim();
  return value || undefined;
}
