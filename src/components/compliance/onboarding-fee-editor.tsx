import { useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import type { UserInfo } from 'src/hooks/compliance.hook';
import { useOnboardingFee } from 'src/hooks/onboarding-fee.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import {
  formatChf,
  ONBOARDING_FEE_MAX_AMOUNT,
  ONBOARDING_FEE_MIN_AMOUNT,
  onboardingFeeFailureMessage,
  parseOnboardingFeeAmount,
} from 'src/util/onboarding-fee.util';
import { formatChf as formatSwissNumber } from 'src/util/utils';
import { STAFF_NAME_MISSING, staffNameLoadError } from './staff-identity';

interface Props {
  userDataId: number;
  users: UserInfo[];
  // Called after the API accepted the change so the screen reloads the account (Users tab).
  onChanged: () => void;
}

const buttonClass =
  'px-3 py-1 text-xs text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded transition-colors whitespace-nowrap';

// The bounds use the same Swiss grouping as the amounts in the notice, so the clerk reads one format.
const MAX_AMOUNT_LABEL = formatSwissNumber(ONBOARDING_FEE_MAX_AMOUNT);
const AMOUNT_HINT = `Enter a whole CHF amount between ${ONBOARDING_FEE_MIN_AMOUNT} and ${MAX_AMOUNT_LABEL}.`;
const AMOUNT_SUGGESTIONS_ID = 'onboarding-fee-amount-suggestions';

function userOptionLabel(user: UserInfo): string {
  return `${user.address} (${user.status}, ${user.usedRef ?? '-'})`;
}

// The "Set onboarding fee" / "Remove onboarding fee" controls in the UserData section and the small
// forms behind them. The clerk is shown because the API stores that name with the change; without a
// verified name the API refuses, so the form does not offer to save.
export function OnboardingFeeEditor({ userDataId, users, onChanged }: Readonly<Props>): JSX.Element {
  const { setOnboardingFee, removeOnboardingFee, getOnboardingFeeAmounts } = useOnboardingFee();
  const { name: clerk, isLoading: isLoadingClerk, error: clerkError } = useStaffVerifiedName();

  const [mode, setMode] = useState<'closed' | 'set' | 'remove'>('closed');
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [amounts, setAmounts] = useState<number[]>();
  const [amountsError, setAmountsError] = useState<string>();
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
    setMode('closed');
    setAmount('');
    setAddress('');
    setError(undefined);
    setNotice(undefined);
  }, [userDataId]);

  // Any whole CHF amount the API accepts can be saved, including an agreed amount that is not among
  // the suggestions; the range check here only keeps an amount the API would refuse from being sent.
  const amountNumber = parseOnboardingFeeAmount(amount);
  const canSaveAmount = amountNumber !== undefined;
  const isAmountInvalid = amount !== '' && !canSaveAmount;
  const canSubmit = !!clerk && !isLoadingClerk && !isSaving && canSaveAmount && !!address;

  // Loaded once per box: the suggestions are global and do not change while the clerk stays on the
  // page. They only fill the input, so a pending or failed load does not block saving; a failed load
  // is retried the next time the form is opened.
  async function loadAmounts(): Promise<void> {
    setAmountsError(undefined);
    try {
      const loaded = await getOnboardingFeeAmounts();
      if (mountedRef.current) setAmounts(loaded);
    } catch (e: unknown) {
      if (mountedRef.current)
        setAmountsError(onboardingFeeFailureMessage(e, 'Failed to load the onboarding fee amounts'));
    }
  }

  function openSet(): void {
    setAmount('');
    setAddress('');
    setError(undefined);
    setNotice(undefined);
    if (amounts === undefined) void loadAmounts();
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
    // canSubmit, which enables the only caller, requires a parsed amount; the check keeps an unparsed
    // amount from ever reaching the API without asserting the type away.
    if (savingRef.current || amountNumber === undefined) return;
    savingRef.current = true;

    setIsSaving(true);
    setError(undefined);
    setNotice(undefined);
    const requestedId = userDataId;
    const attempt = attemptRef.current;
    const isCurrent = (): boolean => mountedRef.current && attemptRef.current === attempt;
    const savedAmount = amountNumber;
    try {
      await setOnboardingFee(requestedId, { amount: savedAmount, address });
      if (isCurrent()) {
        const fee = formatChf(savedAmount);
        setMode('closed');
        setNotice(`Onboarding fee of ${fee} set; ${address} attributed to the key account manager.`);
        onChanged();
      } else if (mountedRef.current && userDataIdRef.current === requestedId) {
        // An earlier attempt for the account shown again (A -> B -> A) changed it: reload the row,
        // but leave the form and the lock of the current attempt alone.
        onChanged();
      }
    } catch (e: unknown) {
      if (isCurrent()) setError(onboardingFeeFailureMessage(e, 'Failed to set the onboarding fee'));
    } finally {
      if (attemptRef.current === attempt) {
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
    const attempt = attemptRef.current;
    const isCurrent = (): boolean => mountedRef.current && attemptRef.current === attempt;
    try {
      await removeOnboardingFee(requestedId);
      if (isCurrent()) {
        setMode('closed');
        setNotice('Onboarding fee removed.');
        onChanged();
      } else if (mountedRef.current && userDataIdRef.current === requestedId) {
        // An earlier attempt for the account shown again (A -> B -> A) changed it: reload the row,
        // but leave the form and the lock of the current attempt alone.
        onChanged();
      }
    } catch (e: unknown) {
      if (isCurrent()) setError(onboardingFeeFailureMessage(e, 'Failed to remove the onboarding fee'));
    } finally {
      if (attemptRef.current === attempt) {
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
              type="text"
              inputMode="numeric"
              list={AMOUNT_SUGGESTIONS_ID}
              className="px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 w-full"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isSaving}
            />
            {/* The suggestions only fill the input; the clerk may type any other agreed amount. */}
            <datalist id={AMOUNT_SUGGESTIONS_ID}>
              {(amounts ?? []).map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
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
        {isAmountInvalid && <p className="text-xs text-dfxRed-100">{AMOUNT_HINT}</p>}
        {amountsError && <p className="text-xs text-dfxRed-100">{amountsError}</p>}
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
