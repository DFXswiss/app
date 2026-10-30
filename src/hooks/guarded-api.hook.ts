import { ApiError, CallConfig, TfaLevel, useApi } from '@dfx.swiss/react';
import { useCallback } from 'react';
import { useNavigation } from './navigation.hook';

export function useStaffErrorGuard(): <T>(promise: Promise<T>) => Promise<T> {
  const { navigate } = useNavigation();

  return useCallback(
    <T>(promise: Promise<T>): Promise<T> =>
      promise.catch((error: ApiError) => {
        // staff 2FA is always STRICT/TOTP; route into the bearer-based (session-mode) 2FA flow
        if (error.code === 'TFA_REQUIRED') {
          navigate('/2fa', { state: { level: TfaLevel.STRICT, sessionMode: true }, setRedirect: true });
        }
        // The role is fine but the account behind it is not identified. Surfacing the raw error would
        // leave staff with a bare 403 and no idea that their own KYC is what unblocks it, so route to a
        // screen that says so and starts the process.
        //
        // Deliberately WITHOUT setRedirect, unlike the 2FA branch: 2FA is resolved in one step and the
        // caller can be sent straight back, whereas the blocked screen stays blocked until an
        // identification is completed. Remembering it would bounce the user right back into the same
        // 403, and the regular KYC flow never consumes the stored path, so it would linger and
        // misdirect a later goBack().
        if (error.code === 'STAFF_KYC_REQUIRED') {
          navigate('/staff-kyc-required');
        }
        throw error;
      }),
    [navigate],
  );
}

// Drop-in replacement for useApi() on staff hooks: staff endpoints answer HTTP 403 { code: 'TFA_REQUIRED' }
// when a mail-origin session still needs 2FA. Instead of surfacing a raw error, route into the bearer-based
// (session-mode) 2FA flow. Every staff dashboard hook must obtain its `call` from here, not from useApi(),
// so the 2FA redirect works everywhere — not only on the support dashboard.
export function useGuardedApi(): { call: <T>(config: CallConfig) => Promise<T> } {
  const { call } = useApi();
  const guard = useStaffErrorGuard();

  const guardedCall = useCallback(<T>(config: CallConfig): Promise<T> => guard(call<T>(config)), [call, guard]);

  return { call: guardedCall };
}
