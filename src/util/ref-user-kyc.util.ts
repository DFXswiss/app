// Internal AML-error token the api writes into a transaction comment (';'-joined list) when the account's
// referrer sits on a KYC status that does not allow payments. The manual-check UI offers the account-level
// waiver for it (see ref-user-kyc-clear-row.tsx). Kept next to scorechain.util.ts: same shape, same reason.
export const REF_USER_KYC_HOLD_TOKEN = 'InvalidKycStatusRefUser';

// True iff the comment carries the InvalidKycStatusRefUser token as one of its ';'-joined members.
// Membership (not substring): `InvalidKycStatus` is a different error and must not match.
export function hasRefUserKycHold(comment?: string): boolean {
  if (!comment) return false;
  return comment
    .split(';')
    .map((token) => token.trim())
    .includes(REF_USER_KYC_HOLD_TOKEN);
}
