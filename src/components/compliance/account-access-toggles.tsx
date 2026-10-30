import { useAuthContext } from '@dfx.swiss/react';
import { useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { type AccountAccessInfo, useAccountAccess } from 'src/hooks/account-access.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { canManageAccountAccess, isOnboardingIncomplete, VIP_ROLE } from 'src/util/account-access.util';
import { STAFF_NAME_MISSING, staffNameLoadError } from './staff-identity';

interface Props {
  userDataId: number;
  provisionalApprovalDate?: string;
  kycLevel?: number;
  users: { id: number; role: string }[];
  onChanged: () => void;
}

type AccessChange = 'provisionalApproval' | 'vip';

interface StoredAccessAnswer {
  answer: AccountAccessInfo;
  provisionalApprovalDate?: string;
  vipEnabled: boolean;
}

const buttonClass =
  'px-3 py-1 text-xs text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded transition-colors whitespace-nowrap';

export function AccountAccessToggles({
  userDataId,
  provisionalApprovalDate,
  kycLevel,
  users,
  onChanged,
}: Readonly<Props>): JSX.Element | null {
  const { session } = useAuthContext();
  const { setProvisionalApproval, setVip } = useAccountAccess();
  const { name: clerk, isLoading: isLoadingClerk, error: clerkError } = useStaffVerifiedName();
  const [updatedAccess, setUpdatedAccess] = useState<StoredAccessAnswer>();
  const [saving, setSaving] = useState<AccessChange>();
  const [error, setError] = useState<string>();
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const userDataIdRef = useRef(userDataId);
  const vipEnabledFromProps = users.some((user) => user.role === VIP_ROLE);
  const accessPropsRef = useRef({ provisionalApprovalDate, vipEnabled: vipEnabledFromProps });
  userDataIdRef.current = userDataId;
  accessPropsRef.current = { provisionalApprovalDate, vipEnabled: vipEnabledFromProps };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    savingRef.current = false;
    setUpdatedAccess(undefined);
    setSaving(undefined);
    setError(undefined);
  }, [userDataId]);

  useEffect(() => {
    if (
      updatedAccess &&
      (updatedAccess.provisionalApprovalDate !== provisionalApprovalDate ||
        updatedAccess.vipEnabled !== vipEnabledFromProps)
    )
      setUpdatedAccess(undefined);
  }, [provisionalApprovalDate, updatedAccess, vipEnabledFromProps]);

  const currentAccess =
    updatedAccess?.answer.id === userDataId &&
    updatedAccess.provisionalApprovalDate === provisionalApprovalDate &&
    updatedAccess.vipEnabled === vipEnabledFromProps
      ? updatedAccess.answer
      : undefined;
  const provisionalEnabled = currentAccess ? !!currentAccess.provisionalApprovalDate : !!provisionalApprovalDate;
  const vipEnabled = currentAccess ? currentAccess.vipUserIds.length > 0 : vipEnabledFromProps;
  const onboardingIncomplete = isOnboardingIncomplete(kycLevel);
  const showProvisionalApproval = onboardingIncomplete || provisionalEnabled;
  const showVip = onboardingIncomplete || vipEnabled;
  const controlsDisabled = !clerk || isLoadingClerk || saving !== undefined;

  async function changeAccess(change: AccessChange, enabled: boolean): Promise<void> {
    if (savingRef.current || !clerk || isLoadingClerk) return;
    savingRef.current = true;
    setSaving(change);
    setError(undefined);
    const requestedId = userDataId;

    try {
      const answer =
        change === 'provisionalApproval'
          ? await setProvisionalApproval(requestedId, enabled)
          : await setVip(requestedId, enabled);
      if (mountedRef.current && userDataIdRef.current === requestedId) {
        if (answer.id === requestedId) setUpdatedAccess({ answer, ...accessPropsRef.current });
        onChanged();
      }
    } catch (e: unknown) {
      if (mountedRef.current && userDataIdRef.current === requestedId)
        setError(e instanceof Error ? e.message : 'Failed to update account access');
    } finally {
      if (userDataIdRef.current === requestedId) {
        savingRef.current = false;
        if (mountedRef.current) setSaving(undefined);
      }
    }
  }

  if (!canManageAccountAccess(session?.role) || (!showProvisionalApproval && !showVip)) return null;

  return (
    <div className="px-3 py-2 flex flex-col gap-2">
      {showProvisionalApproval && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-dfxBlue-800">Provisional approval: {provisionalEnabled ? 'on' : 'off'}</span>
          <button
            type="button"
            className={buttonClass}
            onClick={() => changeAccess('provisionalApproval', !provisionalEnabled)}
            disabled={controlsDisabled}
          >
            {saving === 'provisionalApproval' ? 'Saving…' : provisionalEnabled ? 'Revoke' : 'Grant'}
          </button>
        </div>
      )}
      {showVip && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-dfxBlue-800">VIP: {vipEnabled ? 'on' : 'off'}</span>
          <button
            type="button"
            className={buttonClass}
            onClick={() => changeAccess('vip', !vipEnabled)}
            disabled={controlsDisabled}
          >
            {saving === 'vip' ? 'Saving…' : vipEnabled ? 'Remove VIP' : 'Set VIP'}
          </button>
        </div>
      )}
      {!isLoadingClerk && !clerk && (
        <ErrorHint message={clerkError ? staffNameLoadError(clerkError) : STAFF_NAME_MISSING} />
      )}
      {error && <ErrorHint message={error} />}
    </div>
  );
}
