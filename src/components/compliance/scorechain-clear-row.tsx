import { useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { ScorechainClearTarget, useScorechainClear } from 'src/hooks/scorechain-clear.hook';
import { ScorechainHold } from 'src/util/scorechain.util';

interface Props {
  target: ScorechainClearTarget;
  hold: ScorechainHold;
  // The parent is saving another decision; the acknowledgement must not run alongside it.
  disabled: boolean;
  // Called after the API accepted the acknowledgement: the transaction was reset, so the account is reloaded.
  onCleared?: () => Promise<void>;
}

export const SCORECHAIN_CLEAR_LABEL = 'Scorechain quittieren';

export const SCORECHAIN_CLEAR_TITLE: Record<ScorechainHold, string> = {
  HighRisk: 'Scorechain-Warnung blockiert die Zahlung',
  Unavailable: 'Scorechain-Prüfung ohne Ergebnis',
};

export const SCORECHAIN_CLEAR_HINT: Record<ScorechainHold, string> = {
  HighRisk:
    'Quittieren heisst: Du hast die Warnung geprüft, für diese Zahlung gilt sie als erledigt. Bei einem Kauf ' +
    'per Banküberweisung gilt zusätzlich die Auszahlungsadresse 180 Tage als geprüft: Weitere Auszahlungen ' +
    'an diese Adresse werden wegen derselben Warnung nicht mehr angehalten, ein Sanktionstreffer führt ' +
    'weiterhin zur Ablehnung. Die Zahlung wird danach automatisch neu geprüft und freigegeben, wenn kein ' +
    'weiterer Fehler offen ist. Wird im Support-Log mit deinem Namen festgehalten.',
  Unavailable:
    'Scorechain hat für diese Zahlung kein Ergebnis geliefert. Quittieren heisst: Du hast die Zahlung ohne ' +
    'Scorechain-Ergebnis geprüft, für diese Zahlung gilt der Fehler als erledigt. Die Zahlung wird danach ' +
    'automatisch neu geprüft und freigegeben, wenn kein weiterer Fehler offen ist. Wird im Support-Log mit ' +
    'deinem Namen festgehalten.',
};

export const SCORECHAIN_CLEAR_CONFIRM =
  'Scorechain für diese Zahlung wirklich quittieren?\n\nDie Zahlung wird danach automatisch neu geprüft.';

export const SCORECHAIN_CLEAR_SUMMARY = 'Scorechain quittiert. Die Zahlung wird neu geprüft.';

function targetKey(target: ScorechainClearTarget): string {
  return `${target.kind}:${target.id}`;
}

// One row inside the AML decision box, shown only while the transaction carries ScorechainHighRisk or
// ScorechainUnavailable: the per-transaction acknowledgement of that hold. Reset alone runs into the same
// hold again. Not a Pass — the API resets the transaction and the automatic AML run decides again.
// Acknowledging a HighRisk hold on a payout also makes the API exempt the reviewed payout address
// (DFXswiss/backend SCORECHAIN-RISK-POLICY.md), which the HighRisk hint tells the clerk.
export function ScorechainClearRow({ target, hold, disabled, onCleared }: Readonly<Props>): JSX.Element {
  const { clearScorechain } = useScorechainClear();

  const [isClearing, setIsClearing] = useState(false);
  const [isCleared, setIsCleared] = useState(false);
  const [error, setError] = useState<string>();

  // Sync guard: isClearing only disables the button after re-render; a second click in the same tick must
  // not start another call. mountedRef keeps a late answer from touching a row that is gone — the reload
  // after a successful acknowledgement usually unmounts it, because the transaction leaves the pending list.
  const clearingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The screen keeps its panels mounted while the clerk moves to another account (same route, new id).
  // An answer for the previous transaction is not reported as a result of the current one.
  const key = targetKey(target);
  const keyRef = useRef(key);
  keyRef.current = key;
  // The click's function would still close over the previous account's reload. The screen replaces
  // that callback as soon as the route changes, and this ref follows it.
  const onClearedRef = useRef(onCleared);
  onClearedRef.current = onCleared;
  useEffect(() => {
    clearingRef.current = false;
    setIsClearing(false);
    setIsCleared(false);
    setError(undefined);
  }, [key]);

  async function handleClear(): Promise<void> {
    if (clearingRef.current) return;
    if (!window.confirm(SCORECHAIN_CLEAR_CONFIRM)) return;
    clearingRef.current = true;

    setIsClearing(true);
    setError(undefined);
    const requestedKey = key;
    try {
      await clearScorechain(target);
      if (mountedRef.current && keyRef.current === requestedKey) setIsCleared(true);
      // The transaction changed on the API side either way; the owner reloads even when this row is gone.
      if (keyRef.current === requestedKey) await onClearedRef.current?.();
    } catch (e: unknown) {
      if (mountedRef.current && keyRef.current === requestedKey)
        setError(e instanceof Error ? e.message : 'Failed to clear the Scorechain hold');
    } finally {
      if (keyRef.current === requestedKey) {
        clearingRef.current = false;
        if (mountedRef.current) setIsClearing(false);
      }
    }
  }

  return (
    <div className="px-3 py-2 border-b border-dfxGray-300 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-dfxBlue-800">{SCORECHAIN_CLEAR_TITLE[hold]}</span>
        {isCleared ? (
          <span className="text-xs text-dfxGray-700 text-right">{SCORECHAIN_CLEAR_SUMMARY}</span>
        ) : (
          <button
            type="button"
            className="px-3 py-1.5 text-sm text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded transition-colors disabled:opacity-50"
            disabled={disabled || isClearing}
            onClick={handleClear}
          >
            {isClearing ? 'Wird quittiert...' : SCORECHAIN_CLEAR_LABEL}
          </button>
        )}
      </div>
      {!isCleared && <p className="text-xs text-dfxGray-700">{SCORECHAIN_CLEAR_HINT[hold]}</p>}
      {error && <ErrorHint message={error} />}
    </div>
  );
}
