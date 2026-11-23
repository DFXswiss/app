import type { ApiError } from '@dfx.swiss/react';
import { useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { OPERATOR_RISK_STATUSES, OperatorRiskStatus, useRiskStatus } from 'src/hooks/risk-status.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { STAFF_NAME_MISSING, staffNameLoadError } from './staff-identity';

interface Props {
  userDataId: number;
  currentRiskStatus?: string;
  // Called after the API accepted the change so the screen reloads the account (UserData row).
  onChanged: () => void;
}

// The endpoint answers 404 with Nest's plain NotFoundException while the API's userDataRiskStatus switch
// (its environment file) or the UserDataRiskStatus process is off.
export const RISK_STATUS_API_OFF = 'The risk status API is switched off.';

const buttonClass =
  'px-3 py-1 text-xs text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded transition-colors whitespace-nowrap';

const fieldClass = 'px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 w-full';

// The API client raises ApiException (an Error) with the status and the API's message. While the
// feature flag is off, the endpoint throws Nest's plain NotFoundException, whose body message is
// "Not Found"; an unknown account answers 404 with its own text ("User data not found"). The message
// is also read from a plain { statusCode, message } object, which some callers reject with.
function failureMessage(e: unknown, fallback: string): string {
  const apiError = e as Partial<ApiError> | null | undefined;
  const message = typeof apiError?.message === 'string' ? apiError.message : undefined;
  if (apiError?.statusCode === 404 && (!message || message === 'Not Found')) return RISK_STATUS_API_OFF;
  return message || fallback;
}

// The "Set risk status" button in the UserData section and the small form behind it. The clerk is
// shown because the API records that name with the change; without a verified name the API refuses,
// so the form does not offer to save. The form replaces the mask of the former risk-status spreadsheet.
export function RiskStatusEditor({ userDataId, currentRiskStatus, onChanged }: Readonly<Props>): JSX.Element {
  const { setRiskStatus } = useRiskStatus();
  const { name: clerk, isLoading: isLoadingClerk, error: clerkError } = useStaffVerifiedName();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<OperatorRiskStatus | ''>('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

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
  // arrives for the previous account is not reported as a change of the current one. The account id
  // alone cannot tell attempts apart (A -> B -> A ends on the same id), so every switch starts a new
  // attempt and only the save of the current attempt may close the form, show its result or release
  // the lock.
  const userDataIdRef = useRef(userDataId);
  userDataIdRef.current = userDataId;
  const attemptRef = useRef(0);
  useEffect(() => {
    attemptRef.current += 1;
    savingRef.current = false;
    setIsSaving(false);
    setIsOpen(false);
    setSelectedStatus('');
    setReason('');
    setError(undefined);
    setNotice(undefined);
  }, [userDataId]);

  const canSubmit = !!clerk && !isLoadingClerk && !isSaving && !!selectedStatus && reason.trim().length > 0;

  function open(): void {
    setSelectedStatus('');
    setReason('');
    setError(undefined);
    setNotice(undefined);
    setIsOpen(true);
  }

  function close(): void {
    setIsOpen(false);
    setError(undefined);
  }

  // Only reachable through the Save button, which is disabled until canSubmit holds.
  async function handleSave(): Promise<void> {
    if (savingRef.current) return;
    savingRef.current = true;

    setIsSaving(true);
    setError(undefined);
    setNotice(undefined);
    const requestedId = userDataId;
    const attempt = attemptRef.current;
    const isCurrent = (): boolean => mountedRef.current && attemptRef.current === attempt;
    // Save is disabled until a status is selected, so the lookup always matches. Indexing yields the
    // element type instead of the select's `''` union, without a cast.
    const value = OPERATOR_RISK_STATUSES.filter((status) => status === selectedStatus)[0];
    try {
      await setRiskStatus(requestedId, { riskStatus: value, reason: reason.trim() });
      if (isCurrent()) {
        setIsOpen(false);
        setNotice(`Risk status set to ${value}.`);
        onChanged();
      } else if (mountedRef.current && userDataIdRef.current === requestedId) {
        // An earlier attempt for the account shown again (A -> B -> A) changed it: reload the row,
        // but leave the form and the lock of the current attempt alone.
        onChanged();
      }
    } catch (e: unknown) {
      if (isCurrent()) setError(failureMessage(e, 'Failed to set the risk status'));
    } finally {
      if (attemptRef.current === attempt) {
        savingRef.current = false;
        if (mountedRef.current) setIsSaving(false);
      }
    }
  }

  if (!isOpen)
    return (
      <div className="px-3 py-2 flex flex-col gap-2">
        <div className="flex gap-2 flex-wrap">
          <button type="button" className={buttonClass} onClick={open}>
            Set risk status
          </button>
        </div>
        {notice && <p className="text-xs text-dfxGreen-100">{notice}</p>}
      </div>
    );

  return (
    <div className="px-3 py-2 flex flex-col gap-2">
      <p className="text-xs text-dfxGray-700">Current: {currentRiskStatus ?? 'NA'}</p>
      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="risk-status-value" className="text-xs text-dfxGray-700">
            Risk status
          </label>
          <select
            id="risk-status-value"
            className={fieldClass}
            value={selectedStatus}
            onChange={(e) => {
              const next = OPERATOR_RISK_STATUSES.find((status) => status === e.target.value);
              setSelectedStatus(next ?? '');
            }}
            disabled={isSaving}
          >
            <option value="">Select risk status</option>
            {OPERATOR_RISK_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label htmlFor="risk-status-reason" className="text-xs text-dfxGray-700">
            Reason
          </label>
          <textarea
            id="risk-status-reason"
            className={fieldClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
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
          onClick={handleSave}
          disabled={!canSubmit}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
