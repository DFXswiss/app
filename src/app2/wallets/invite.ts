/**
 * Referral/recommendation codes are passed through case-preserved (only trimmed of surrounding
 * whitespace), mirroring the static preview's REF_RE=/^[A-Za-z0-9-]{4,14}$/ handling which keeps
 * the typed case (case-sensitivity of DFX codes is unconfirmed, so the original never mutates it).
 */
export function normalizeInviteCode(value: string | undefined | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

/**
 * The two invite-code shapes the API actually accepts are mutually exclusive, and sending one
 * where the other belongs is a guaranteed 400 (surfaced as a generic sign-in failure to the
 * user): a short partner/wallet ref code goes in the `usedRef` field, a full referral code in
 * `recommendationCode` — never both, never the wrong one.
 *
 * Regexes taken from the API's validators (not re-derived), so they stay in lockstep:
 * - `usedRef`: `api/src/config/config.ts` `formats.ref` — `/^(\w{1,3}-\w{1,3})$/`, enforced on
 *   `OptionalSignUpDto`/`SignUpDto.usedRef` (`auth-credentials.dto.ts`). Already anchored.
 * - `recommendationCode`: `api/src/config/config.ts` `formats.recommendationCode` —
 *   `/[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{2}/`, enforced on the same DTOs'
 *   `recommendationCode` field. The API's own regex has no `^`/`$`, so it technically accepts
 *   the shape anywhere inside a longer string; anchored here on purpose — this classifier only
 *   needs to recognize a *complete* recommendation code, not validate arbitrary API input.
 */
const USED_REF_RE = /^(\w{1,3}-\w{1,3})$/;
const RECOMMENDATION_CODE_RE = /^[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{2}$/;

/** Length of a full recommendation code ("XX-XXXX-XXXX-XX" — 2+1+4+1+4+1+2). Invite/recommendation
 * input fields must allow at least this many characters, or a full code gets truncated before it
 * ever reaches `classifyInviteCode`/the API. */
export const RECOMMENDATION_CODE_LENGTH = 15;

export interface ClassifiedInviteCode {
  kind: 'usedRef' | 'recommendationCode';
  code: string;
}

/** Classifies which API field an invite code belongs in. Returns `undefined` for anything that
 * matches neither real API shape, so a caller can simply not send it rather than guarantee a 400.
 *
 * Case handling is intentional and asymmetric:
 * - `recommendationCode` is upper-cased (API regex is `[0-9A-Z]`; codes are upper-case by
 *   definition). Classification is still tried first so a full recommendation code never falls
 *   through as `usedRef`.
 * - `usedRef` is returned with its original case after trim only. The API looks up the referrer
 *   with an exact `findOne({ where: { ref } })` and nowhere normalizes `ref`/`usedRef` case
 *   (user.service.ts); live codes in the wild are sometimes lower-case (e.g. `stb-tax`). Whether
 *   the database comparison itself is case-sensitive depends on collation and was not verified
 *   here. `USED_REF_RE`'s `\w` class already accepts either case, so upper-casing the payload is
 *   never required for classification and can only lose a match the API would otherwise find. */
export function classifyInviteCode(value: string | undefined | null): ClassifiedInviteCode | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  // Recommendation first (unchanged priority): upper-case only for that branch's test + payload.
  const upper = trimmed.toUpperCase();
  if (RECOMMENDATION_CODE_RE.test(upper)) return { kind: 'recommendationCode', code: upper };
  if (USED_REF_RE.test(trimmed)) return { kind: 'usedRef', code: trimmed };
  return undefined;
}
