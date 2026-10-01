import {
  ScorechainAnalysisType,
  ScorechainContext,
  ScorechainObjectType,
  ScorechainScreeningDto,
  ScorechainSeverity,
  ScorechainTriggerType,
} from 'src/dto/scorechain.dto';
import {
  hasScorechainHighRisk,
  isSentinelSeverity,
  parseScorechainHighlight,
  SCORECHAIN_HIGH_RISK_TOKEN,
  SCORECHAIN_UNAVAILABLE_TOKEN,
  scorechainHighlightValue,
  scorechainHold,
  screeningMatchesHighlight,
} from 'src/util/scorechain.util';

// Minimal screening factory: only the fields a given assertion cares about are overridden.
const screening = (overrides: Partial<ScorechainScreeningDto>): ScorechainScreeningDto => ({
  id: 1,
  created: '2026-01-01T00:00:00.000Z',
  objectType: ScorechainObjectType.ADDRESS,
  objectId: '0xabc',
  blockchain: 'Ethereum',
  analysisType: ScorechainAnalysisType.FULL,
  context: ScorechainContext.MANUAL,
  triggerType: ScorechainTriggerType.MANUAL,
  signatureValid: true,
  isHighRisk: false,
  ...overrides,
});

describe('hasScorechainHighRisk', () => {
  it('is true when the comment is exactly the token', () => {
    expect(hasScorechainHighRisk(SCORECHAIN_HIGH_RISK_TOKEN)).toBe(true);
  });

  it('is true when the token is one member of a ;-joined list (with surrounding spaces)', () => {
    expect(hasScorechainHighRisk('SomeOtherError; ScorechainHighRisk ;YetAnother')).toBe(true);
  });

  it('is false for an unrelated comment', () => {
    expect(hasScorechainHighRisk('ManualReviewRequired')).toBe(false);
  });

  it('is false for undefined / empty comments', () => {
    expect(hasScorechainHighRisk(undefined)).toBe(false);
    expect(hasScorechainHighRisk('')).toBe(false);
  });

  it('is false for a longer token that merely contains the string (membership, not substring)', () => {
    expect(hasScorechainHighRisk('ScorechainHighRiskLegacy')).toBe(false);
  });
});

describe('isSentinelSeverity', () => {
  it('is true for the three informational severities', () => {
    expect(isSentinelSeverity(ScorechainSeverity.NOT_SUPPORTED)).toBe(true);
    expect(isSentinelSeverity(ScorechainSeverity.NO_COVERAGE)).toBe(true);
    expect(isSentinelSeverity(ScorechainSeverity.NOT_FOUND)).toBe(true);
  });

  it('is false for a missing severity and for any other severity', () => {
    expect(isSentinelSeverity(undefined)).toBe(false);
    expect(isSentinelSeverity(ScorechainSeverity.HIGH_RISK)).toBe(false);
  });
});

describe('scorechainHold', () => {
  it('is HighRisk for the high-risk token', () => {
    expect(scorechainHold(SCORECHAIN_HIGH_RISK_TOKEN)).toBe('HighRisk');
  });

  it('is Unavailable for the unavailable token as one member of a ;-joined list', () => {
    expect(scorechainHold(`SomeOtherError; ${SCORECHAIN_UNAVAILABLE_TOKEN}`)).toBe('Unavailable');
  });

  it('prefers HighRisk when both tokens are present', () => {
    expect(scorechainHold(`${SCORECHAIN_UNAVAILABLE_TOKEN};${SCORECHAIN_HIGH_RISK_TOKEN}`)).toBe('HighRisk');
  });

  it('is undefined for a Sanction hit, an unrelated comment and a missing comment', () => {
    expect(scorechainHold('ScorechainSanction')).toBeUndefined();
    expect(scorechainHold('InvalidKycStatusRefUser')).toBeUndefined();
    expect(scorechainHold(undefined)).toBeUndefined();
  });

  it('is undefined for a longer token that merely contains the unavailable string', () => {
    expect(scorechainHold('ScorechainUnavailableLegacy')).toBeUndefined();
  });
});

describe('scorechainHighlightValue', () => {
  it('builds a buyCrypto highlight value', () => {
    expect(scorechainHighlightValue({ buyCryptoId: 42 })).toBe('buyCrypto:42');
  });

  it('builds a buyFiat highlight value', () => {
    expect(scorechainHighlightValue({ buyFiatId: 7 })).toBe('buyFiat:7');
  });

  it('prefers buyCrypto when both ids are present', () => {
    expect(scorechainHighlightValue({ buyCryptoId: 42, buyFiatId: 7 })).toBe('buyCrypto:42');
  });

  it('is undefined when neither id is present', () => {
    expect(scorechainHighlightValue({})).toBeUndefined();
  });
});

describe('parseScorechainHighlight', () => {
  it('parses a buyCrypto highlight', () => {
    expect(parseScorechainHighlight('buyCrypto:42')).toEqual({ kind: 'buyCrypto', id: 42 });
  });

  it('parses a buyFiat highlight', () => {
    expect(parseScorechainHighlight('buyFiat:7')).toEqual({ kind: 'buyFiat', id: 7 });
  });

  it('rejects null, unknown kinds and non-numeric ids', () => {
    expect(parseScorechainHighlight(null)).toBeUndefined();
    expect(parseScorechainHighlight('garbage')).toBeUndefined();
    expect(parseScorechainHighlight('buyCrypto:abc')).toBeUndefined();
    expect(parseScorechainHighlight('other:1')).toBeUndefined();
  });

  it('round-trips with scorechainHighlightValue', () => {
    const value = scorechainHighlightValue({ buyCryptoId: 99 });
    expect(value).toBeDefined();
    expect(parseScorechainHighlight(value ?? null)).toEqual({ kind: 'buyCrypto', id: 99 });
  });
});

describe('screeningMatchesHighlight', () => {
  it('matches when the related buyCrypto ids contain the highlight id', () => {
    const s = screening({ relatedBuyCryptoIds: [3, 42] });
    expect(screeningMatchesHighlight(s, { kind: 'buyCrypto', id: 42 })).toBe(true);
  });

  it('matches when the related buyFiat ids contain the highlight id', () => {
    const s = screening({ relatedBuyFiatIds: [7] });
    expect(screeningMatchesHighlight(s, { kind: 'buyFiat', id: 7 })).toBe(true);
  });

  it('does not match a different id', () => {
    const s = screening({ relatedBuyCryptoIds: [3] });
    expect(screeningMatchesHighlight(s, { kind: 'buyCrypto', id: 42 })).toBe(false);
  });

  it('does not cross-match buyCrypto highlight against buyFiat ids', () => {
    const s = screening({ relatedBuyFiatIds: [42] });
    expect(screeningMatchesHighlight(s, { kind: 'buyCrypto', id: 42 })).toBe(false);
  });

  it('is false when the related-id array is absent', () => {
    const s = screening({});
    expect(screeningMatchesHighlight(s, { kind: 'buyCrypto', id: 42 })).toBe(false);
  });
});
