// Transaction status used to render the raw TransactionState enum string verbatim
// ("LiquidityPending", "PayoutInProgress", "FeeTooHigh", ...) in all four languages — kyc.tsx
// already guards the analogous KycStepStatus enum the same way transactions.tsx now does
// (via the shared stateLabel() helper pinned here).

import { stateLabel } from '../screens/transaction-state-label';
import type { TranslationKey } from '../i18n';

describe('stateLabel', () => {
  const t = (key: TranslationKey) => {
    const known: Partial<Record<TranslationKey, string>> = {
      txst_LiquidityPending: 'Preparing funds',
      txst_PayoutInProgress: 'Payout in progress',
      txst_FeeTooHigh: 'Fee too high',
    };
    return known[key] ?? key; // mirrors i18n.tsx's real fallback: unknown key -> the key itself
  };

  it('translates a known TransactionState value instead of showing the raw enum string', () => {
    expect(stateLabel(t, 'LiquidityPending')).toBe('Preparing funds');
    expect(stateLabel(t, 'PayoutInProgress')).toBe('Payout in progress');
    expect(stateLabel(t, 'FeeTooHigh')).toBe('Fee too high');
  });

  it('falls back to the raw state for a value the dictionary has no key for, not a translation key', () => {
    expect(stateLabel(t, 'SomeFutureState')).toBe('SomeFutureState');
    // Never leaks the internal `txst_*` key shape to the UI.
    expect(stateLabel(t, 'SomeFutureState')).not.toMatch(/^txst_/);
  });

  it('renders nothing for an absent state rather than an empty translation lookup', () => {
    expect(stateLabel(t, undefined)).toBe('');
  });
});
