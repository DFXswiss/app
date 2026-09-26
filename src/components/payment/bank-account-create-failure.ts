export type BankAccountFailureKind = 'kyc-only' | 'multi-account' | 'other';

export function bankAccountFailureKind(error: { statusCode?: number; message?: string }): BankAccountFailureKind {
  if (error.statusCode !== 400) return 'other';
  if (error.message?.includes('KYC only account')) return 'kyc-only';
  if (error.message?.includes('Multi-account IBAN')) return 'multi-account';
  return 'other';
}
