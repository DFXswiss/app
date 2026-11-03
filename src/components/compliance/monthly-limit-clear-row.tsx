import { useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { MonthlyLimitClearTarget, useMonthlyLimitClear } from 'src/hooks/monthly-limit-clear.hook';

interface Props {
  target: MonthlyLimitClearTarget;
  // The parent is saving another decision; the acknowledgement must not run alongside it.
  disabled: boolean;
  // Called after the API accepted the acknowledgement: the transaction was reset, so the account is reloaded.
  onCleared?: () => Promise<void>;
}

export const MONTHLY_LIMIT_CLEAR_LABEL = 'Monatslimit quittieren';

export const MONTHLY_LIMIT_CLEAR_TITLE = 'Monatslimit blockiert die Zahlung';

export const MONTHLY_LIMIT_CLEAR_HINT =
  'Quittieren heisst: Du hast das Monatslimit für diese Zahlung geprüft, für diese Zahlung gilt es als erledigt. Die 500\u2019000-CHF-Prüfung bleibt für die nächste Zahlung bestehen. Die Zahlung wird danach automatisch neu geprüft und freigegeben, wenn kein weiterer Fehler offen ist. Ein Jahreslimit wird dadurch nicht aufgehoben. Wird im Support-Log mit deinem Namen festgehalten.';

export const MONTHLY_LIMIT_CLEAR_CONFIRM =
  'Monatslimit für diese Zahlung wirklich quittieren?\n\nDie Zahlung wird danach automatisch neu geprüft.';

export const MONTHLY_LIMIT_CLEAR_SUMMARY = 'Monatslimit quittiert. Die Zahlung wird neu geprüft.';

function targetKey(target: MonthlyLimitClearTarget): string {
  return `${target.kind}:${target.id}`;
}

// One row inside the AML decision box, shown only while the transaction carries MonthlyLimitReached:
// the per-transaction acknowledgement of that hold. Reset alone runs into the same hold again. Not a Pass —
// the API stamps the transaction and resets it, and the automatic AML run then drops only MonthlyLimitReached.
// There is no payout-address exemption, and a yearly limit stays in place.
export function MonthlyLimitClearRow({ target, disabled, onCleared }: Readonly<Props>): JSX.Element {
  const { clearMonthlyLimit } = useMonthlyLimitClear();

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
    if (!window.confirm(MONTHLY_LIMIT_CLEAR_CONFIRM)) return;
    clearingRef.current = true;

    setIsClearing(true);
    setError(undefined);
    const requestedKey = key;
    try {
      await clearMonthlyLimit(target);
      if (mountedRef.current && keyRef.current === requestedKey) setIsCleared(true);
      // The transaction changed on the API side either way; the owner reloads even when this row is gone.
      if (keyRef.current === requestedKey) await onClearedRef.current?.();
    } catch (e: unknown) {
      if (mountedRef.current && keyRef.current === requestedKey)
        setError(e instanceof Error ? e.message : 'Failed to clear the monthly limit hold');
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
        <span className="text-sm text-dfxBlue-800">{MONTHLY_LIMIT_CLEAR_TITLE}</span>
        {isCleared ? (
          <span className="text-xs text-dfxGray-700 text-right">{MONTHLY_LIMIT_CLEAR_SUMMARY}</span>
        ) : (
          <button
            type="button"
            className="px-3 py-1.5 text-sm text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded transition-colors disabled:opacity-50"
            disabled={disabled || isClearing}
            onClick={handleClear}
          >
            {isClearing ? 'Wird quittiert...' : MONTHLY_LIMIT_CLEAR_LABEL}
          </button>
        )}
      </div>
      {!isCleared && <p className="text-xs text-dfxGray-700">{MONTHLY_LIMIT_CLEAR_HINT}</p>}
      {error && <ErrorHint message={error} />}
    </div>
  );
}
