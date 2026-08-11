import { getPartnerLocale } from 'src/partner-dashboard/util/i18n';

describe('getPartnerLocale defensive base fallback', () => {
  it('covers the split base ?? en arm via a non-string truthy lang with empty first segment', () => {
    // Force raw to a value whose split('-')[0] is undefined after optional chain:
    // a custom object whose split returns [''] would still toLowerCase to ''.
    // The only way to hit `?? 'en'` is when [0]?.toLowerCase() yields null/undefined.
    // A string never does that — simulate with a split that returns an empty array.
    const weird = {
      split: () => [] as string[],
    };
    // lang is truthy so we do not fall through to i18n.language
    expect(getPartnerLocale(weird as unknown as string)).toBe('en-US');
  });
});
