import type { ApiError } from '@dfx.swiss/react';
import { useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import type { UserInfo } from 'src/hooks/compliance.hook';
import { useOnboardingFee } from 'src/hooks/onboarding-fee.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { STAFF_NAME_MISSING, staffNameLoadError } from './staff-identity';

interface Props {
  userDataId: number;
  users: UserInfo[];
  // Called after the API accepted the change so the screen reloads the account (Users tab).
  onChanged: () => void;
}

// Both endpoints answer 404 with an empty body while ONBOARDING_FEE_API_ENABLED is not 'true'.
export const ONBOARDING_FEE_API_OFF = 'The onboarding fee API is switched off.';

const buttonClass =
  'px-3 py-1 text-xs text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded transition-colors whitespace-nowrap';

// The API client raises its ApiError type for a failed call: statusCode plus the API's message. A bare
// 404 has no message, which is how the disabled feature is recognised.
function failureMessage(e: unknown, fallback: string): string {
  const apiError = e as Partial<ApiError> | null | undefined;
  if (apiError?.statusCode === 404 && !apiError.message) return ONBOARDING_FEE_API_OFF;
  return e instanceof Error ? e.message : fallback;
}

function userOptionLabel(user: UserInfo): string {
  return `${user.address} (${user.status}, ${user.usedRef ?? '-'})`;
}

// The "Set onboarding fee" / "Remove onboarding fee" controls in the UserData section and the small
// forms behind them. The clerk is shown because the API stores that name with the change; without a
// verified name the API refuses, so the form does not offer to save.
export function OnboardingFeeEditor({ userDataId, users, onChanged }: Readonly<Props>): JSX.Element {
  const { setOnboardingFee, removeOnboardingFee } = useOnboardingFee();
  const { name: clerk, isLoading: isLoadingClerk, error: clerkError } = useStaffVerifiedName();

  const [mode, setMode] = useState<'closed' | 'set' | 'remove'>('closed');
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
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
  // arrives for the previous account is not reported as a change of the current one.
  const userDataIdRef = useRef(userDataId);
  userDataIdRef.current = userDataId;
  useEffect(() => {
    savingRef.current = false;
    setIsSaving(false);
    setMode('closed');
    setAmount('');
    setAddress('');
    setError(undefined);
    setNotice(undefined);
  }, [userDataId]);

  const amountNumber = parseFloat(amount);
  const canSaveAmount = !Number.isNaN(amountNumber) && amountNumber > 0;
  const canSubmit = !!clerk && !isLoadingClerk && !isSaving && canSaveAmount && !!address;

  function openSet(): void {
    setAmount('');
    setAddress('');
    setError(undefined);
    setNotice(undefined);
    setMode('set');
  }

  function openRemove(): void {
    setError(undefined);
    setNotice(undefined);
    setMode('remove');
  }

  function close(): void {
    setMode('closed');
    setError(undefined);
  }

  // Only reachable through the Save button, which is disabled until canSubmit holds.
  async function handleSet(): Promise<void> {
    if (savingRef.current) return;
    savingRef.current = true;

    setIsSaving(true);
    setError(undefined);
    setNotice(undefined);
    const requestedId = userDataId;
    try {
      await setOnboardingFee(requestedId, { amount: amountNumber, address });
      if (!mountedRef.current || userDataIdRef.current !== requestedId) return;
      setMode('closed');
      setNotice(`Onboarding fee of ${amountNumber} CHF set; ${address} attributed to the key account manager.`);
      onChanged();
    } catch (e: unknown) {
      if (mountedRef.current && userDataIdRef.current === requestedId)
        setError(failureMessage(e, 'Failed to set the onboarding fee'));
    } finally {
      if (userDataIdRef.current === requestedId) {
        savingRef.current = false;
        if (mountedRef.current) setIsSaving(false);
      }
    }
  }

  // Only reachable through the Remove button in the inline confirmation.
  async function handleRemove(): Promise<void> {
    if (savingRef.current) return;
    savingRef.current = true;

    setIsSaving(true);
    setError(undefined);
    setNotice(undefined);
    const requestedId = userDataId;
    try {
      await removeOnboardingFee(requestedId);
      if (!mountedRef.current || userDataIdRef.current !== requestedId) return;
      setMode('closed');
      setNotice('Onboarding fee removed.');
      onChanged();
    } catch (e: unknown) {
      if (mountedRef.current && userDataIdRef.current === requestedId)
        setError(failureMessage(e, 'Failed to remove the onboarding fee'));
    } finally {
      if (userDataIdRef.current === requestedId) {
        savingRef.current = false;
        if (mountedRef.current) setIsSaving(false);
      }
    }
  }

  if (mode === 'closed')
    return (
      <div className="px-3 py-2 flex flex-col gap-2">
        <div className="flex gap-2 flex-wrap">
          <button type="button" className={buttonClass} onClick={openSet}>
            Set onboarding fee
          </button>
          <button type="button" className={buttonClass} onClick={openRemove}>
            Remove onboarding fee
          </button>
        </div>
        {notice && <p className="text-xs text-dfxGreen-100">{notice}</p>}
      </div>
    );

  if (mode === 'set')
    return (
      <div className="px-3 py-2 flex flex-col gap-2">
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="onboarding-fee-amount" className="text-xs text-dfxGray-700">
              Amount (CHF)
            </label>
            <input
              id="onboarding-fee-amount"
              type="number"
              min={0}
              step="any"
              className="px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 w-full"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label htmlFor="onboarding-fee-address" className="text-xs text-dfxGray-700">
              Address
            </label>
            <select
              id="onboarding-fee-address"
              className="px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 w-full"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isSaving}
            >
              <option value="">Select address</option>
              {users.map((user) => (
                <option key={user.id} value={user.address}>
                  {userOptionLabel(user)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-dfxGray-700">Clerk</span>
            <p className="px-2 py-1.5 text-xs text-dfxBlue-800">{isLoadingClerk ? '…' : (clerk ?? '—')}</p>
          </div>
        </div>
        {!isLoadingClerk && !clerk && (
          <ErrorHint message={clerkError ? staffNameLoadError(clerkError) : STAFF_NAME_MISSING} />
        )}
        {!users.length && <p className="text-xs text-dfxGray-700">This account has no address.</p>}
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
          {users.length > 0 && (
            <button
              type="button"
              className="px-3 py-1 text-xs font-medium bg-dfxBlue-800 text-white rounded hover:bg-dfxBlue-800/80 transition-colors disabled:opacity-50"
              onClick={handleSet}
              disabled={!canSubmit}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    );

  return (
    <div className="px-3 py-2 flex flex-col gap-2">
      <p className="text-xs text-dfxBlue-800">Remove the onboarding fee of this account?</p>
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
          onClick={handleRemove}
          disabled={isSaving}
        >
          {isSaving ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </div>
  );
}
