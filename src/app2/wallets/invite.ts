/**
 * Referral/recommendation codes are passed through case-preserved (only trimmed of surrounding
 * whitespace), mirroring the static preview's REF_RE=/^[A-Za-z0-9-]{4,14}$/ handling which keeps
 * the typed case (case-sensitivity of DFX codes is unconfirmed, so the original never mutates it).
 */
export function normalizeInviteCode(value: string | undefined | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
