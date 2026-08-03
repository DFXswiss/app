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

export function useComplianceGuard(redirectPath = '/', isActive = true) {
  useUserRoleGuard([UserRole.ADMIN, UserRole.COMPLIANCE], redirectPath, isActive);
}

export const SUPPORT_DASHBOARD_ROLES = [UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.SUPPORT, UserRole.MARKETING];

export function useSupportDashboardGuard(redirectPath = '/', isActive = true) {
  useUserRoleGuard(SUPPORT_DASHBOARD_ROLES, redirectPath, isActive);
}

/**
 * API role name for the partner dashboard (`Partner`).
 *
 * BEFUND: `@dfx.swiss/core@0.6.0-beta.0` (re-exported by `@dfx.swiss/react`) has no
 * `UserRole.PARTNER` / `UserRole.Partner` member — the enum ends at `MONITORING`.
 * The product role is still `"Partner"` on the API. Until the package ships the enum
 * member, this allow-list holds the runtime role string; access checks use
 * `isPartnerDashboardRole` (string equality on `session.role`). No cast onto `UserRole`.
 */
export const PARTNER_DASHBOARD_ROLES = ['Partner'] as const;

export function isPartnerDashboardRole(role: UserRole | string | undefined): boolean {
  if (role == null) return false;
  const value = String(role);
  for (const allowed of PARTNER_DASHBOARD_ROLES) {
    if (value === allowed) return true;
  }
  return false;
}

export function usePartnerDashboardGuard(redirectPath = '/', isActive = true) {
  const { isLoggedIn } = useSessionContext();
  const { isInitialized } = useWalletContext();
  const { navigate } = useNavigation();
  const { session } = useAuthContext();

  useEffect(() => {
    if (isActive && isInitialized && (!isLoggedIn || (session && !isPartnerDashboardRole(session.role)))) {
      navigate(redirectPath, { setRedirect: true });
    }
  }, [session, isLoggedIn, isInitialized, navigate, isActive, redirectPath]);
}

function useUserRoleGuard(requiresUserRoles: UserRole[], redirectPath = '/', isActive = true) {
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
