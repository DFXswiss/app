import { useAuthContext, UserRole, useSessionContext, useUserContext } from '@dfx.swiss/react';
import { useEffect } from 'react';
import { useWalletContext } from '../contexts/wallet.context';
import { useNavigation } from './navigation.hook';

export function useAddressGuard(redirectPath = '/', isActive = true) {
  useSessionGuard(true, redirectPath, isActive);
}

export function useUserGuard(redirectPath = '/', isActive = true) {
  useSessionGuard(false, redirectPath, isActive);
}

export function useAdminGuard(redirectPath = '/', isActive = true) {
  useUserRoleGuard([UserRole.ADMIN], redirectPath, isActive);
}

export function useRealunitGuard(redirectPath = '/', isActive = true) {
  useUserRoleGuard([UserRole.ADMIN, UserRole.REALUNIT, UserRole.COMPLIANCE], redirectPath, isActive);
}

export const REALUNIT_QUOTES_ROLES = [UserRole.ADMIN, UserRole.REALUNIT, UserRole.COMPLIANCE, UserRole.SUPPORT];

export function useRealunitQuotesGuard(redirectPath = '/', isActive = true) {
  useUserRoleGuard(REALUNIT_QUOTES_ROLES, redirectPath, isActive);
}

export function useComplianceGuard(redirectPath = '/', isActive = true) {
  useUserRoleGuard([UserRole.ADMIN, UserRole.COMPLIANCE], redirectPath, isActive);
}

// 'Partner' is exported as UserRole.PARTNER in @dfx.swiss/react >= 1.4.0-beta.2.
// Cast keeps this PR independent of the packages publish; switch to UserRole.PARTNER once consumed.
export function usePartnerGuard(redirectPath = '/', isActive = true) {
  useUserRoleGuard([UserRole.ADMIN, 'Partner' as UserRole], redirectPath, isActive);
}

export const SUPPORT_DASHBOARD_ROLES = [UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.SUPPORT, UserRole.MARKETING];

export function useSupportDashboardGuard(redirectPath = '/', isActive = true) {
  useUserRoleGuard(SUPPORT_DASHBOARD_ROLES, redirectPath, isActive);
}

export const SUPPORT_STAFF_ROLES = [UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.SUPPORT];

export function useSupportStaffGuard(redirectPath = '/', isActive = true) {
  useUserRoleGuard(SUPPORT_STAFF_ROLES, redirectPath, isActive);
}

// No default arguments here: every caller above is a public guard that already applies its own
// defaults and passes both values on, so defaults on this one would be unreachable branches.
function useUserRoleGuard(requiresUserRoles: UserRole[], redirectPath: string, isActive: boolean) {
  const { isLoggedIn } = useSessionContext();
  const { isInitialized } = useWalletContext();
  const { navigate } = useNavigation();
  const { session } = useAuthContext();

  useEffect(() => {
    if (isActive && isInitialized && (!isLoggedIn || (session && !requiresUserRoles.includes(session.role)))) {
      navigate(redirectPath, { setRedirect: true });
    }
  }, [session, isLoggedIn, isInitialized, navigate, isActive]);
}

function useSessionGuard(requireActiveAddress: boolean, redirectPath: string, isActive: boolean) {
  const { isLoggedIn } = useSessionContext();
  const { session } = useAuthContext();
  const { isInitialized } = useWalletContext();
  const { navigate } = useNavigation();

  useEffect(() => {
    if (isActive && isInitialized) {
      if (!isLoggedIn) {
        navigate(redirectPath, { setRedirect: true });
      } else if (isLoggedIn && requireActiveAddress && !session?.address) {
        navigate('/connect', { setRedirect: true });
      }
    }
  }, [session, isInitialized, isLoggedIn, navigate, isActive]);
}

export function useKycLevelGuard(minLevel: number, redirectPath = '/') {
  const { isInitialized } = useWalletContext();
  const { user, isUserLoading } = useUserContext();
  const { navigate } = useNavigation();

  useEffect(() => {
    if (user && !isUserLoading && isInitialized && user.kyc.level < minLevel) {
      navigate(redirectPath, { setRedirect: true });
    }
  }, [isInitialized, user, isUserLoading, navigate]);
}
