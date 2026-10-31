import { renderHook } from '@testing-library/react';
import { isTileVisible, parseFeatures, PASSKEY_FLAG, useFeatureFlags } from '../hooks/feature-flag.hook';

function setSearch(search: string) {
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: { ...window.location, search },
  });
}

describe('parseFeatures (?feature= URL flag)', () => {
  it('reads a single case-insensitive feature', () => {
    expect(parseFeatures('?feature=Passkey')).toEqual(['passkey']);
    expect(parseFeatures('?feature=passkey')).toEqual(['passkey']);
  });

  it('reads a comma-separated list and trims blanks', () => {
    expect(parseFeatures('?feature=Passkey, Other ,third')).toEqual(['passkey', 'other', 'third']);
  });

  it('is empty without the parameter, on garbage and on empty values', () => {
    expect(parseFeatures(undefined)).toEqual([]);
    expect(parseFeatures('')).toEqual([]);
    expect(parseFeatures('?other=1')).toEqual([]);
    expect(parseFeatures('?feature=,,')).toEqual([]);
  });
});

describe('PASSKEY_FLAG', () => {
  it('is the passkey flag string', () => {
    expect(PASSKEY_FLAG).toBe('passkey');
  });
});

describe('isTileVisible', () => {
  it('shows a tile without a feature field', () => {
    expect(isTileVisible({}, ['passkey'])).toBe(true);
    expect(isTileVisible({}, [])).toBe(true);
  });

  it('shows a gated tile when the flag is present', () => {
    expect(isTileVisible({ feature: 'passkey' }, ['passkey', 'other'])).toBe(true);
  });

  it('hides a gated tile when the flag is missing', () => {
    expect(isTileVisible({ feature: 'passkey' }, ['other'])).toBe(false);
    expect(isTileVisible({ feature: 'passkey' }, [])).toBe(false);
  });
});

describe('useFeatureFlags', () => {
  it('enables flags from ?feature=Passkey, case-insensitive', () => {
    setSearch('?feature=Passkey');
    const { result } = renderHook(() => useFeatureFlags());

    expect(result.current.isEnabled('passkey')).toBe(true);
    expect(result.current.isEnabled('Passkey')).toBe(true);
    expect(result.current.isEnabled('other')).toBe(false);
  });

  it('does not enable passkey when the search has no feature parameter', () => {
    setSearch('?other=1');
    const { result } = renderHook(() => useFeatureFlags());

    expect(result.current.isEnabled('passkey')).toBe(false);
  });

  it('does not enable passkey on an empty search', () => {
    setSearch('');
    const { result } = renderHook(() => useFeatureFlags());

    expect(result.current.isEnabled('passkey')).toBe(false);
  });
});
