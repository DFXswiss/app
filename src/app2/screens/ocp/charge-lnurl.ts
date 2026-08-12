/**
 * Charge-specific LNURL from a POS payment create response.
 * Live charges must never fall back to the reusable link LNURL or a demo value —
 * those do not represent a server-side charge for the entered amount.
 */
export function extractChargeLnurl(data: {
  payment?: { lnurl?: string };
  lnurl?: string;
} | null | undefined): string | undefined {
  const value = data?.payment?.lnurl || data?.lnurl;
  return value?.trim() || undefined;
}
