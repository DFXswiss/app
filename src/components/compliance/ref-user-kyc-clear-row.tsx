import { useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { RefUserKycClearResult, useRefUserKycClear } from 'src/hooks/ref-user-kyc.hook';

interface Props {
  userDataId: number;
  // The parent is saving another decision; the waiver must not run alongside it.
  disabled: boolean;
  // Called after the API accepted the waiver: the parked transaction was reset, so the account is reloaded.
  onCleared?: () => Promise<void>;
}

export const REF_USER_KYC_CLEAR_LABEL = 'Empfehler-Check aufheben';

export const REF_USER_KYC_CLEAR_HINT =
  'Der Empfehler dieses Kunden steht auf KYC-Status Check. Damit bleibt jede Zahlung dieses Kunden hängen. ' +
  'Aufheben heisst: Der Empfehler-Status wird für diesen Kunden nicht mehr geprüft, solange der Empfehler auf ' +
  'Check steht. Die Zahlung wird danach automatisch neu geprüft und freigegeben, wenn kein weiterer Fehler ' +
  'offen ist. Wird im Support-Log mit deinem Namen festgehalten.';

export const REF_USER_KYC_CLEAR_CONFIRM =
  'Empfehler-Check für diesen Kunden wirklich aufheben?\n\nGilt für alle Zahlungen des Kunden, solange der ' +
  'Empfehler auf Check steht. Die hängenden Zahlungen werden neu geprüft.';

export function refUserKycClearSummary(result: RefUserKycClearResult): string {
  const referrers = result.referrers.map((r) => `#${r.userDataId}`).join(', ');
  const count = result.resetBuyCryptoIds.length + result.resetBuyFiatIds.length;
  const payments = count === 1 ? '1 Zahlung wird' : `${count} Zahlungen werden`;
  return `Empfehler-Check aufgehoben (Empfehler ${referrers || '-'}). ${payments} neu geprüft.`;
}

// One row inside the AML decision box, shown only while the transaction carries InvalidKycStatusRefUser:
// the account-level waiver of the referrer's open check. Not a Pass — the API resets the parked
// transactions and the automatic AML run decides again (docs/aml-pass-policy.md in the backend).
export function RefUserKycClearRow({ userDataId, disabled, onCleared }: Readonly<Props>): JSX.Element {
  const { clearRefUserKyc } = useRefUserKycClear();

  const [isClearing, setIsClearing] = useState(false);
  const [summary, setSummary] = useState<string>();
  const [error, setError] = useState<string>();

  // Sync guard: isClearing only disables the button after re-render; a second click in the same tick must
  // not start another call. mountedRef keeps a late answer from touching a row that is gone — the reload
  // after a successful waiver usually unmounts it, because the transaction leaves the pending list.
  const clearingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The screen keeps its panels mounted while the clerk moves to another account (same route, new id).
  // An answer for the previous account is not reported as a result of the current one.
  const userDataIdRef = useRef(userDataId);
  userDataIdRef.current = userDataId;
  useEffect(() => {
    clearingRef.current = false;
    setIsClearing(false);
    setSummary(undefined);
    setError(undefined);
  }, [userDataId]);

  async function handleClear(): Promise<void> {
    if (clearingRef.current) return;
    if (!window.confirm(REF_USER_KYC_CLEAR_CONFIRM)) return;
    clearingRef.current = true;

    setIsClearing(true);
    setError(undefined);
    const requestedId = userDataId;
    try {
      const result = await clearRefUserKyc(requestedId);
      if (mountedRef.current && userDataIdRef.current === requestedId) setSummary(refUserKycClearSummary(result));
      // The account changed on the API side either way; the owner reloads even when this row is gone.
      if (userDataIdRef.current === requestedId) await onCleared?.();
    } catch (e: unknown) {
      if (mountedRef.current && userDataIdRef.current === requestedId)
        setError(e instanceof Error ? e.message : 'Failed to clear the referrer check');
    } finally {
      if (userDataIdRef.current === requestedId) {
        clearingRef.current = false;
        if (mountedRef.current) setIsClearing(false);
      }
    }
  }

  return (
    <div className="px-3 py-2 border-b border-dfxGray-300 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-dfxBlue-800">Empfehler auf Check</span>
        {summary ? (
          <span className="text-xs text-dfxGray-700 text-right">{summary}</span>
        ) : (
          <button
            type="button"
            className="px-3 py-1.5 text-sm text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded transition-colors disabled:opacity-50"
            disabled={disabled || isClearing}
            onClick={handleClear}
          >
            {isClearing ? 'Wird aufgehoben...' : REF_USER_KYC_CLEAR_LABEL}
          </button>
        )}
      </div>
      {!summary && <p className="text-xs text-dfxGray-700">{REF_USER_KYC_CLEAR_HINT}</p>}
      {error && <ErrorHint message={error} />}
    </div>
  );
}
