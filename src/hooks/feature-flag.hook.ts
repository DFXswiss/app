import { useMemo } from 'react';

/**
 * URL feature flags: `?feature=Passkey` (case-insensitive, comma-separated list) unlocks the passkey
 * login tile on app.dfx.swiss. Without the parameter the feature is invisible — no tile, no route.
 */
const PASSKEY_FEATURE = 'passkey';

export function useFeatureFlags(): { isEnabled: (feature: string) => boolean } {
  const enabled = useMemo(() => parseFeatures(window.location.search), []);

  return {
    isEnabled: (feature: string) => enabled.includes(feature.toLowerCase()),
  };
}

export function parseFeatures(search: string | undefined): string[] {
  if (!search) return [];

  try {
    const params = new URLSearchParams(search);
    return (params.get('feature') ?? '')
      .split(',')
      .map((feature) => feature.trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** The visibility rule of a gated tile: no feature field = always visible, otherwise the flag must match. */
export function isTileVisible(tile: { feature?: string }, flags: string[]): boolean {
  return !tile.feature || flags.includes(tile.feature);
}

export const PASSKEY_FLAG = PASSKEY_FEATURE;
