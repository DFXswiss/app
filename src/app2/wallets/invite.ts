/** Referral/recommendation codes are case-insensitive at input and canonicalized for auth. */
export function normalizeInviteCode(value: string | undefined | null): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized || undefined;
}
