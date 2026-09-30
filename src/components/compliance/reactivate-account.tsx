import { useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { useAccountReactivation, UserDataStatusInfo } from 'src/hooks/account-reactivation.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { STAFF_NAME_MISSING, staffNameLoadError } from './staff-identity';

interface Props {
  userDataId: number;
  // Called with the PUT response after the API accepted the change (caller applies it locally).
  onReactivated: (info: UserDataStatusInfo) => void;
}

// The "Reactivate" button next to the status of a deactivated account and the small form behind it. The
// clerk is shown because the API stores that name with the change; without a verified name the API
// refuses, so the form does not offer to save. The button is the same chrome as "Limit Request".
export function ReactivateAccount({ userDataId, onReactivated }: Readonly<Props>): JSX.Element {
  const { reactivateAccount } = useAccountReactivation();
  const { name: clerk, isLoading: isLoadingClerk, error: clerkError } = useStaffVerifiedName();

  const [isEditing, setIsEditing] = useState(false);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();

  // Sync guard: isSaving only disables the button after re-render; a second click in the same tick must
  // not start another update. mountedRef keeps a late answer from touching a box that is gone.
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The screen keeps this box mounted while the clerk moves to another account (same route, new id).
  // The form belongs to the account it was opened for: it closes on the switch, and an answer that
  // arrives for the previous account is not reported as a change of the current one.
  const userDataIdRef = useRef(userDataId);
  userDataIdRef.current = userDataId;
  useEffect(() => {
    savingRef.current = false;
    setIsSaving(false);
    setIsEditing(false);
    setError(undefined);
  }, [userDataId]);

  const canSubmit = !!clerk && !!reason.trim() && !isSaving && !isLoadingClerk;

  function open(): void {
    setReason('');
    setError(undefined);
    setIsEditing(true);
  }

  function close(): void {
    setIsEditing(false);
    setError(undefined);
  }

  // Only reachable through the Save button, which is disabled until canSubmit holds.
  async function handleSubmit(): Promise<void> {
    if (savingRef.current) return;
    savingRef.current = true;

    setIsSaving(true);
    setError(undefined);
    const requestedId = userDataId;
    try {
      const info = await reactivateAccount(requestedId, { reason: reason.trim() });
      if (!mountedRef.current || userDataIdRef.current !== requestedId) return;
      setIsEditing(false);
      onReactivated(info);
    } catch (e: unknown) {
      if (mountedRef.current && userDataIdRef.current === requestedId)
        setError(e instanceof Error ? e.message : 'Failed to reactivate the account');
    } finally {
      if (userDataIdRef.current === requestedId) {
        savingRef.current = false;
        if (mountedRef.current) setIsSaving(false);
      }
    }
  }

  if (!isEditing)
    return (
      <button
        type="button"
        className="px-3 py-1 text-xs text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded transition-colors whitespace-nowrap"
        onClick={open}
      >
        Reactivate
      </button>
    );

  return (
    <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label htmlFor="reactivate-reason" className="text-xs text-dfxGray-700">
            Reason
          </label>
          <input
            id="reactivate-reason"
            type="text"
            className="px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            disabled={isSaving}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-dfxGray-700">Clerk</span>
          <p className="px-2 py-1.5 text-xs text-dfxBlue-800">{isLoadingClerk ? '…' : (clerk ?? '—')}</p>
        </div>
      </div>
      {!isLoadingClerk && !clerk && (
        <ErrorHint message={clerkError ? staffNameLoadError(clerkError) : STAFF_NAME_MISSING} />
      )}
      {error && <p className="text-xs text-dfxRed-100">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="px-3 py-1 text-xs text-dfxBlue-800 hover:underline"
          onClick={close}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="px-3 py-1 text-xs font-medium bg-dfxBlue-800 text-white rounded hover:bg-dfxBlue-800/80 transition-colors disabled:opacity-50"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {isSaving ? 'Saving…' : 'Reactivate'}
        </button>
      </div>
    </div>
  );
}
