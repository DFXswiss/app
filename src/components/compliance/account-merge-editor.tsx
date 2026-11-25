import type { ApiError } from '@dfx.swiss/react';
import { useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import type { UserDataDetail } from 'src/hooks/compliance.hook';
import { useCompliance } from 'src/hooks/compliance.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { useUserDataOperatorMerge } from 'src/hooks/user-data-operator-merge.hook';
import { MergeAccount, planAccountMerge } from 'src/util/account-merge.util';
import { STAFF_NAME_MISSING, staffNameLoadError } from './staff-identity';

interface Props {
  userDataId: number;
  userData: UserDataDetail;
  onMerged: (remainingUserDataId: number) => void;
}

interface FormProps extends Props {
  onClose: () => void;
}

// The API answers plain 404 "Not Found" while its switch userDataOperatorMerge is off.
export const ACCOUNT_MERGE_API_OFF = 'Merging accounts is not enabled on this environment yet.';

const buttonClass =
  'px-3 py-1 text-xs text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded transition-colors whitespace-nowrap';

const secondaryButtonClass =
  'px-3 py-1 text-xs bg-white text-dfxBlue-800 border border-dfxBlue-800 rounded hover:bg-dfxGray-300 transition-colors whitespace-nowrap';

const fieldClass = 'px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 w-full';

const MERGE_ROW_KEYS = ['id', 'status', 'mail', 'kycLevel', 'verifiedName'] as const;

function toMergeAccount(userData: UserDataDetail): MergeAccount {
  return {
    id: userData.id,
    status: userData.status,
    mail: userData.mail,
    kycLevel: userData.kycLevel,
    verifiedName: userData.verifiedName,
  };
}

function displayOrDash(value: string | number | undefined): string {
  return value === undefined || value === '' ? '-' : String(value);
}

function isPositiveInteger(value: string): boolean {
  return /^[1-9]\d*$/.test(value.trim());
}

// The API client raises ApiException (an Error) with the status and the API's message. While the
// feature flag is off, the endpoint throws Nest's plain NotFoundException, whose body message is
// "Not Found". The message is also read from a plain { statusCode, message } object.
function mergeFailureMessage(e: unknown): string {
  const apiError = e as Partial<ApiError> | null | undefined;
  const message = typeof apiError?.message === 'string' ? apiError.message : undefined;
  if (apiError?.statusCode === 404 && (!message || message === 'Not Found')) return ACCOUNT_MERGE_API_OFF;
  return message || 'Failed to merge the accounts';
}

function loadFailureMessage(e: unknown): string {
  const apiError = e as Partial<ApiError> | null | undefined;
  const message = typeof apiError?.message === 'string' ? apiError.message : undefined;
  return message || 'Failed to load the other account';
}

// The "Merge accounts" button in the UserData section and the small form behind it. The form shows
// both accounts, lets the clerk pick the one that stays and refuses what the API would refuse anyway,
// so the clerk sees why before submitting. The closed state stays free of API hooks so the panel can
// render it anywhere.
export function AccountMergeEditor({ userDataId, userData, onMerged }: Readonly<Props>): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  // The screen keeps this box mounted while the clerk moves to another account (same route, new id).
  // The form belongs to the account it was opened for, so it closes on the switch.
  useEffect(() => {
    setIsOpen(false);
  }, [userDataId]);

  if (!isOpen) {
    return (
      <div className="px-3 py-2 flex flex-col gap-2">
        <div className="flex gap-2 flex-wrap">
          <button type="button" className={buttonClass} onClick={() => setIsOpen(true)}>
            Merge accounts
          </button>
        </div>
      </div>
    );
  }

  return (
    <AccountMergeForm
      userDataId={userDataId}
      userData={userData}
      onMerged={onMerged}
      onClose={() => setIsOpen(false)}
    />
  );
}

function AccountMergeForm({ userDataId, userData, onMerged, onClose }: Readonly<FormProps>): JSX.Element {
  const { getUserData } = useCompliance();
  const { mergeUserData } = useUserDataOperatorMerge();
  const { name: clerk, isLoading: isLoadingClerk, error: clerkError } = useStaffVerifiedName();

  const [otherId, setOtherId] = useState('');
  const [otherAccount, setOtherAccount] = useState<MergeAccount>();
  const [isLoadingOther, setIsLoadingOther] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [keep, setKeep] = useState<'current' | 'other'>('current');
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

  // The account id alone cannot tell attempts apart (A -> B -> A ends on the same id), so every
  // switch starts a new attempt and only the answer for the current attempt may touch the form.
  const attemptRef = useRef(0);
  // A load belongs to the id it was requested for: editing the input, resetting the form or starting
  // another load begins a new load identity, so a slow answer cannot install its account under the id
  // currently shown in the input.
  const loadRef = useRef(0);
  const previousUserDataIdRef = useRef(userDataId);
  useEffect(() => {
    if (previousUserDataIdRef.current === userDataId) return;
    previousUserDataIdRef.current = userDataId;
    attemptRef.current += 1;
    loadRef.current += 1;
    savingRef.current = false;
    setIsSaving(false);
    setIsLoadingOther(false);
    setOtherId('');
    setOtherAccount(undefined);
    setLoadError(undefined);
    setKeep('current');
    setReason('');
    setError(undefined);
    onClose();
  }, [userDataId, onClose]);

  function reset(): void {
    loadRef.current += 1;
    setOtherId('');
    setOtherAccount(undefined);
    setIsLoadingOther(false);
    setLoadError(undefined);
    setKeep('current');
    setReason('');
    setError(undefined);
  }

  const current = toMergeAccount(userData);
  const plan = otherAccount ? planAccountMerge(current, otherAccount, keep) : undefined;
  const canLoad = isPositiveInteger(otherId) && !isLoadingOther;
  const canSubmit =
    !!plan && plan.errors.length === 0 && reason.trim().length > 0 && !!clerk && !isLoadingClerk && !isSaving;

  function changeOtherId(value: string): void {
    loadRef.current += 1;
    setOtherId(value);
    setOtherAccount(undefined);
    setIsLoadingOther(false);
    setLoadError(undefined);
  }

  async function loadOther(): Promise<void> {
    const attempt = attemptRef.current;
    const load = ++loadRef.current;
    const requestedId = Number(otherId);
    setIsLoadingOther(true);
    setLoadError(undefined);

    try {
      const result = await getUserData(requestedId);
      if (!mountedRef.current || attemptRef.current !== attempt || loadRef.current !== load) return;
      if (result.userData.id !== requestedId) {
        setLoadError('Failed to load the other account');
        return;
      }
      const loaded = toMergeAccount(result.userData);
      setOtherAccount(loaded);
      setKeep((loaded.kycLevel ?? 0) > (current.kycLevel ?? 0) ? 'other' : 'current');
    } catch (e: unknown) {
      if (mountedRef.current && attemptRef.current === attempt && loadRef.current === load) {
        setLoadError(loadFailureMessage(e));
      }
    } finally {
      if (attemptRef.current === attempt && loadRef.current === load && mountedRef.current) setIsLoadingOther(false);
    }
  }

  function cancel(): void {
    reset();
    onClose();
  }

  async function merge(): Promise<void> {
    if (
      savingRef.current ||
      !plan ||
      plan.errors.length > 0 ||
      reason.trim().length === 0 ||
      !clerk ||
      isLoadingClerk
    ) {
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setError(undefined);
    const attempt = attemptRef.current;
    const isCurrent = (): boolean => mountedRef.current && attemptRef.current === attempt;

    try {
      await mergeUserData(plan.masterId, plan.slaveId, reason.trim());
      if (isCurrent()) {
        onClose();
        reset();
        onMerged(plan.masterId);
      }
    } catch (e: unknown) {
      if (isCurrent()) setError(mergeFailureMessage(e));
    } finally {
      if (attemptRef.current === attempt) {
        savingRef.current = false;
        if (mountedRef.current) setIsSaving(false);
      }
    }
  }

  return (
    <form
      className="px-3 py-2 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        merge();
      }}
    >
      <div className="flex gap-2 flex-wrap items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="account-merge-other-id" className="text-xs text-dfxGray-700">
            Other UserDataID
          </label>
          <input
            id="account-merge-other-id"
            className={fieldClass}
            type="text"
            inputMode="numeric"
            value={otherId}
            onChange={(e) => changeOtherId(e.target.value)}
            disabled={isSaving}
          />
        </div>
        <button type="button" className={buttonClass} onClick={loadOther} disabled={!canLoad}>
          {isLoadingOther ? 'Loading…' : 'Load'}
        </button>
      </div>

      {loadError && <p className="text-xs text-dfxRed-100">{loadError}</p>}

      {otherAccount && plan && (
        <>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-dfxGray-300">
                <th className="px-2 py-1 text-left" />
                <th className="px-2 py-1 text-left">This account</th>
                <th className="px-2 py-1 text-left">Other account</th>
              </tr>
            </thead>
            <tbody>
              {MERGE_ROW_KEYS.map((key) => (
                <tr key={key} className="border-b border-dfxGray-300">
                  <td className="px-2 py-1 text-dfxGray-700">{key}</td>
                  <td className="px-2 py-1 text-dfxBlue-800">{displayOrDash(current[key])}</td>
                  <td className="px-2 py-1 text-dfxBlue-800">{displayOrDash(otherAccount[key])}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-xs text-dfxBlue-800">
              <input
                type="radio"
                name="account-merge-keep"
                checked={keep === 'current'}
                onChange={() => setKeep('current')}
                disabled={isSaving}
              />
              Keep this account ({current.id})
            </label>
            <label className="flex items-center gap-2 text-xs text-dfxBlue-800">
              <input
                type="radio"
                name="account-merge-keep"
                checked={keep === 'other'}
                onChange={() => setKeep('other')}
                disabled={isSaving}
              />
              Keep other account ({otherAccount.id})
            </label>
          </div>

          <p className="text-xs text-dfxGray-700">Mail after merge: {plan.resultingMail ?? '-'}</p>

          {plan.errors.map((message) => (
            <p key={message} data-testid="account-merge-validation" className="text-sm text-dfxRed-100">
              {message}
            </p>
          ))}
        </>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="account-merge-reason" className="text-xs text-dfxGray-700">
          Reason
        </label>
        <textarea
          id="account-merge-reason"
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

      {!isLoadingClerk && !clerk && (
        <ErrorHint message={clerkError ? staffNameLoadError(clerkError) : STAFF_NAME_MISSING} />
      )}
      {error && <p className="text-xs text-dfxRed-100">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButtonClass} onClick={cancel} disabled={isSaving}>
          Cancel
        </button>
        <button type="submit" className={buttonClass} disabled={!canSubmit}>
          {isSaving ? 'Merging…' : 'Merge'}
        </button>
      </div>
    </form>
  );
}
