// Pure Scorechain helpers (predicate + deep-link plumbing) split out of the types-only DTO so the DTO stays
// interface/enum-only per repo convention. These helpers have no React/DOM dependency, so they stay trivially
// unit-testable (see src/__tests__/scorechain.util.test.ts). Types come from src/dto/scorechain.dto.
import {
  ScorechainHighlight,
  ScorechainRelatedIds,
  ScorechainScreeningDto,
  ScorechainSeverity,
} from 'src/dto/scorechain.dto';

// The three sentinel severities that must be rendered neutrally (informational), not as a risk color.
export const SCORECHAIN_SENTINEL_SEVERITIES: ReadonlySet<string> = new Set<string>([
  ScorechainSeverity.NOT_SUPPORTED,
  ScorechainSeverity.NO_COVERAGE,
  ScorechainSeverity.NOT_FOUND,
]);

export function isSentinelSeverity(severity?: string): boolean {
  return severity != null && SCORECHAIN_SENTINEL_SEVERITIES.has(severity);
}

// Internal AML-error token the api writes into a transaction comment (';'-joined list) when a Scorechain
// screening flagged the transaction as high risk. The manual-check UI turns it into a deep-link.
export const SCORECHAIN_HIGH_RISK_TOKEN = 'ScorechainHighRisk';

// Internal AML-error token the api writes when a Scorechain screening produced no usable verdict (provider
// down, transaction not analysable). Like HighRisk it parks the transaction in the manual check.
export const SCORECHAIN_UNAVAILABLE_TOKEN = 'ScorechainUnavailable';

// The two Scorechain holds compliance may acknowledge for one transaction (PUT :id/scorechainCleared).
// A Sanction hit is a Fail and is never acknowledged this way.
export type ScorechainHold = 'HighRisk' | 'Unavailable';

function hasCommentToken(comment: string | undefined, token: string): boolean {
  if (!comment) return false;
  return comment
    .split(';')
    .map((t) => t.trim())
    .includes(token);
}

// True iff the comment carries the ScorechainHighRisk token as one of its ';'-joined members. Membership
// (not substring) so a longer token that merely contains the string is not a false positive.
export function hasScorechainHighRisk(comment?: string): boolean {
  return hasCommentToken(comment, SCORECHAIN_HIGH_RISK_TOKEN);
}

// The Scorechain hold a transaction comment carries, if any. HighRisk wins over Unavailable: it is the
// finding the clerk has to review, and one acknowledgement covers both.
export function scorechainHold(comment?: string): ScorechainHold | undefined {
  if (hasScorechainHighRisk(comment)) return 'HighRisk';
  if (hasCommentToken(comment, SCORECHAIN_UNAVAILABLE_TOKEN)) return 'Unavailable';
  return undefined;
}

// --- deep-link (highlight) plumbing shared by the link call-sites and the screen --- //

// The `?highlight=` query value that deep-links to the screening related to a given transaction.
// buyCrypto takes precedence over buyFiat; returns undefined when the tx has neither id.
export function scorechainHighlightValue(ids: ScorechainRelatedIds): string | undefined {
  if (ids.buyCryptoId != null) return `buyCrypto:${ids.buyCryptoId}`;
  if (ids.buyFiatId != null) return `buyFiat:${ids.buyFiatId}`;
  return undefined;
}

// Parse a `?highlight=` query value back into a typed highlight; undefined for absent/malformed values.
export function parseScorechainHighlight(value: string | null): ScorechainHighlight | undefined {
  if (!value) return undefined;
  const separatorIndex = value.indexOf(':');
  if (separatorIndex < 0) return undefined;
  const kind = value.slice(0, separatorIndex);
  const id = Number(value.slice(separatorIndex + 1));
  if ((kind === 'buyCrypto' || kind === 'buyFiat') && Number.isInteger(id)) return { kind, id };
  return undefined;
}

// Does a screening relate to the highlighted transaction id?
export function screeningMatchesHighlight(screening: ScorechainScreeningDto, highlight: ScorechainHighlight): boolean {
  return highlight.kind === 'buyCrypto'
    ? Boolean(screening.relatedBuyCryptoIds?.includes(highlight.id))
    : Boolean(screening.relatedBuyFiatIds?.includes(highlight.id));
}
