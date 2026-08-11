// Unit tests for every exported guard in guard.hook.ts: allowed roles stay put, foreign roles
// and logged-out sessions navigate to the redirect path. useSupportStaffGuard is pinned against
// SUPPORT_DASHBOARD_ROLES by asserting MARKETING is rejected while ADMIN/COMPLIANCE/SUPPORT pass.

let mockIsLoggedIn = true;
let mockIsInitialized = true;
let mockIsUserLoading = false;
let mockSession: { role?: string; address?: string } | undefined = { role: 'Admin', address: '0xabc' };
let mockUser: { kyc: { level: number } } | undefined = { kyc: { level: 50 } };
const mockNavigate = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  UserRole: {
    ACCOUNT: 'Account',
    USER: 'User',
    ADMIN: 'Admin',
    SUPPORT: 'Support',
    COMPLIANCE: 'Compliance',
    MARKETING: 'Marketing',
    REALUNIT: 'RealUnit',
  },
  useSessionContext: () => ({ isLoggedIn: mockIsLoggedIn }),
  useAuthContext: () => ({ session: mockSession }),
  useUserContext: () => ({ user: mockUser, isUserLoading: mockIsUserLoading }),
}));

jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ isInitialized: mockIsInitialized }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { renderHook } from '@testing-library/react';
import { UserRole } from '@dfx.swiss/react';
import {
  useAddressGuard,
  useAdminGuard,
  useComplianceGuard,
  useKycLevelGuard,
  useRealunitGuard,
  useSupportDashboardGuard,
  useSupportStaffGuard,
  useUserGuard,
} from 'src/hooks/guard.hook';

function resetDefaults(): void {
  mockIsLoggedIn = true;
  mockIsInitialized = true;
  mockIsUserLoading = false;
  mockSession = { role: UserRole.ADMIN, address: '0xabc' };
  mockUser = { kyc: { level: 50 } };
  mockNavigate.mockClear();
}

describe('guard.hook', () => {
  beforeEach(() => {
    resetDefaults();
  });

  describe('useAddressGuard', () => {
    it('does not navigate when logged in with an active address', () => {
      renderHook(() => useAddressGuard());
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates to the redirect path when not logged in', () => {
      mockIsLoggedIn = false;
      renderHook(() => useAddressGuard('/login'));
      expect(mockNavigate).toHaveBeenCalledWith('/login', { setRedirect: true });
    });

    it('navigates to /connect when logged in without an active address', () => {
      mockSession = { role: UserRole.ADMIN };
      renderHook(() => useAddressGuard());
      expect(mockNavigate).toHaveBeenCalledWith('/connect', { setRedirect: true });
    });
  });

  describe('useUserGuard', () => {
    it('does not navigate when logged in even without an address', () => {
      mockSession = { role: UserRole.USER };
      renderHook(() => useUserGuard());
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates to the redirect path when not logged in', () => {
      mockIsLoggedIn = false;
      renderHook(() => useUserGuard('/login'));
      expect(mockNavigate).toHaveBeenCalledWith('/login', { setRedirect: true });
    });
  });

  describe('useAdminGuard', () => {
    it('does not navigate for ADMIN', () => {
      mockSession = { role: UserRole.ADMIN, address: '0x1' };
      renderHook(() => useAdminGuard());
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates when the role is not ADMIN', () => {
      mockSession = { role: UserRole.SUPPORT, address: '0x1' };
      renderHook(() => useAdminGuard('/denied'));
      expect(mockNavigate).toHaveBeenCalledWith('/denied', { setRedirect: true });
    });

    it('navigates when not logged in', () => {
      mockIsLoggedIn = false;
      renderHook(() => useAdminGuard());
      expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
    });
  });

  describe('useRealunitGuard', () => {
    it('does not navigate for REALUNIT', () => {
      mockSession = { role: UserRole.REALUNIT, address: '0x1' };
      renderHook(() => useRealunitGuard());
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates for a foreign role', () => {
      mockSession = { role: UserRole.MARKETING, address: '0x1' };
      renderHook(() => useRealunitGuard('/home'));
      expect(mockNavigate).toHaveBeenCalledWith('/home', { setRedirect: true });
    });
  });

  describe('useComplianceGuard', () => {
    it('does not navigate for COMPLIANCE', () => {
      mockSession = { role: UserRole.COMPLIANCE, address: '0x1' };
      renderHook(() => useComplianceGuard());
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates for a foreign role', () => {
      mockSession = { role: UserRole.SUPPORT, address: '0x1' };
      renderHook(() => useComplianceGuard());
      expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
    });
  });

  describe('useSupportDashboardGuard', () => {
    it('does not navigate for MARKETING (dashboard-only role)', () => {
      mockSession = { role: UserRole.MARKETING, address: '0x1' };
      renderHook(() => useSupportDashboardGuard());
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates for a foreign role', () => {
      mockSession = { role: UserRole.USER, address: '0x1' };
      renderHook(() => useSupportDashboardGuard('/out'));
      expect(mockNavigate).toHaveBeenCalledWith('/out', { setRedirect: true });
    });
  });

  describe('useSupportStaffGuard', () => {
    it.each([
      [UserRole.ADMIN],
      [UserRole.COMPLIANCE],
      [UserRole.SUPPORT],
    ])('does not navigate for %s', (role) => {
      mockSession = { role, address: '0x1' };
      renderHook(() => useSupportStaffGuard());
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates for MARKETING (staff is narrower than the dashboard allow-list)', () => {
      mockSession = { role: UserRole.MARKETING, address: '0x1' };
      renderHook(() => useSupportStaffGuard('/denied'));
      expect(mockNavigate).toHaveBeenCalledWith('/denied', { setRedirect: true });
    });

    it('navigates when not logged in', () => {
      mockIsLoggedIn = false;
      renderHook(() => useSupportStaffGuard());
      expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
    });
  });

  describe('useKycLevelGuard', () => {
    it('does not navigate when the user is at or above the minimum level', () => {
      mockUser = { kyc: { level: 50 } };
      renderHook(() => useKycLevelGuard(40));
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates when the user is below the minimum level', () => {
      mockUser = { kyc: { level: 20 } };
      renderHook(() => useKycLevelGuard(40, '/kyc'));
      expect(mockNavigate).toHaveBeenCalledWith('/kyc', { setRedirect: true });
    });

    it('does not navigate while the user is still loading', () => {
      mockIsUserLoading = true;
      mockUser = { kyc: { level: 0 } };
      renderHook(() => useKycLevelGuard(40));
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not navigate when no user is loaded yet', () => {
      mockUser = undefined;
      renderHook(() => useKycLevelGuard(40));
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not navigate when the wallet is not initialised yet', () => {
      mockIsInitialized = false;
      mockUser = { kyc: { level: 0 } };
      renderHook(() => useKycLevelGuard(40));
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('shared inactive / uninitialised branches', () => {
    it('does not navigate when isActive is false even if the role is wrong', () => {
      mockSession = { role: UserRole.USER, address: '0x1' };
      renderHook(() => useAdminGuard('/', false));
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not navigate when the wallet is not initialised yet', () => {
      mockIsInitialized = false;
      mockIsLoggedIn = false;
      renderHook(() => useAdminGuard());
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('useSessionGuard does not navigate when inactive', () => {
      mockIsLoggedIn = false;
      renderHook(() => useUserGuard('/', false));
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('useSessionGuard does not navigate while the wallet is not initialised', () => {
      mockIsInitialized = false;
      mockIsLoggedIn = false;
      renderHook(() => useUserGuard());
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('role guard does not navigate when logged in without a session object', () => {
      mockSession = undefined;
      mockIsLoggedIn = true;
      renderHook(() => useAdminGuard());
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
