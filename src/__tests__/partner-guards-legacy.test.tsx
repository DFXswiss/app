import { renderHook } from '@testing-library/react';

const mockNavigate = jest.fn();

let mockSession: { role: string; address?: string } | undefined = { role: 'User', address: '0xabc' };
let mockIsLoggedIn = true;
let mockIsInitialized = true;
let mockUser: { kyc: { level: number } } | undefined = { kyc: { level: 10 } };
let mockIsUserLoading = false;

// Mock @dfx.swiss/react to avoid ES module issues in jest (same pattern as partner-dashboard-guard).
jest.mock('@dfx.swiss/react', () => ({
  UserRole: {
    ACCOUNT: 'Account',
    USER: 'User',
    VIP: 'VIP',
    BETA: 'Beta',
    ADMIN: 'Admin',
    SUPPORT: 'Support',
    COMPLIANCE: 'Compliance',
    KYC_CLIENT_COMPANY: 'KycClientCompany',
    CUSTODY: 'Custody',
    REALUNIT: 'RealUnit',
    MARKETING: 'Marketing',
    MONITORING: 'Monitoring',
  },
  useAuthContext: () => ({ session: mockSession }),
  useSessionContext: () => ({ isLoggedIn: mockIsLoggedIn }),
  useUserContext: () => ({ user: mockUser, isUserLoading: mockIsUserLoading }),
}));

jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ isInitialized: mockIsInitialized }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { UserRole } from '@dfx.swiss/react';
import {
  SUPPORT_DASHBOARD_ROLES,
  useAddressGuard,
  useAdminGuard,
  useComplianceGuard,
  useKycLevelGuard,
  useRealunitGuard,
  useSupportDashboardGuard,
  useUserGuard,
} from 'src/hooks/guard.hook';

function resetGuards(): void {
  mockNavigate.mockReset();
  mockIsLoggedIn = true;
  mockIsInitialized = true;
  mockSession = { role: UserRole.USER, address: '0xabc' };
  mockUser = { kyc: { level: 10 } };
  mockIsUserLoading = false;
}

describe('SUPPORT_DASHBOARD_ROLES allow-list', () => {
  it('includes Admin, Compliance, Support, and Marketing', () => {
    expect(SUPPORT_DASHBOARD_ROLES).toEqual([
      UserRole.ADMIN,
      UserRole.COMPLIANCE,
      UserRole.SUPPORT,
      UserRole.MARKETING,
    ]);
  });
});

describe('useAddressGuard (session + active address)', () => {
  beforeEach(resetGuards);

  it('uses default redirectPath "/" when called without arguments', () => {
    mockIsLoggedIn = false;
    renderHook(() => useAddressGuard());
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });

  it('redirects to the path when not logged in', () => {
    mockIsLoggedIn = false;
    renderHook(() => useAddressGuard('/home'));
    expect(mockNavigate).toHaveBeenCalledWith('/home', { setRedirect: true });
  });

  it('redirects to /connect when logged in without an active address', () => {
    mockSession = { role: UserRole.USER };
    renderHook(() => useAddressGuard('/home'));
    expect(mockNavigate).toHaveBeenCalledWith('/connect', { setRedirect: true });
  });

  it('does not redirect when logged in with an address', () => {
    renderHook(() => useAddressGuard('/home'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect when inactive or wallet not initialized', () => {
    mockIsLoggedIn = false;
    renderHook(() => useAddressGuard('/home', false));
    expect(mockNavigate).not.toHaveBeenCalled();

    mockIsInitialized = false;
    renderHook(() => useAddressGuard('/home', true));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('useUserGuard (session only, no address check)', () => {
  beforeEach(resetGuards);

  it('uses default redirectPath "/" when called without arguments', () => {
    mockIsLoggedIn = false;
    renderHook(() => useUserGuard());
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });

  it('redirects when not logged in', () => {
    mockIsLoggedIn = false;
    renderHook(() => useUserGuard('/login'));
    expect(mockNavigate).toHaveBeenCalledWith('/login', { setRedirect: true });
  });

  it('does not redirect for a logged-in user without address (unlike useAddressGuard)', () => {
    mockSession = { role: UserRole.USER };
    renderHook(() => useUserGuard('/login'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('useAdminGuard', () => {
  beforeEach(resetGuards);

  it('uses default redirectPath "/" when called without arguments', () => {
    mockSession = { role: UserRole.USER, address: '0x1' };
    renderHook(() => useAdminGuard());
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });

  it('redirects non-admin roles', () => {
    mockSession = { role: UserRole.USER, address: '0x1' };
    renderHook(() => useAdminGuard('/'));
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });

  it('allows Admin', () => {
    mockSession = { role: UserRole.ADMIN, address: '0x1' };
    renderHook(() => useAdminGuard('/'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects when not logged in', () => {
    mockIsLoggedIn = false;
    mockSession = undefined;
    renderHook(() => useAdminGuard('/out'));
    expect(mockNavigate).toHaveBeenCalledWith('/out', { setRedirect: true });
  });
});

describe('useRealunitGuard', () => {
  beforeEach(resetGuards);

  it('uses default redirectPath "/" when called without arguments', () => {
    mockSession = { role: UserRole.USER, address: '0x1' };
    renderHook(() => useRealunitGuard());
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });

  it.each([UserRole.ADMIN, UserRole.REALUNIT, UserRole.COMPLIANCE])(
    'allows %s',
    (role) => {
      mockSession = { role, address: '0x1' };
      renderHook(() => useRealunitGuard('/'));
      expect(mockNavigate).not.toHaveBeenCalled();
    },
  );

  it('redirects Support (not in Realunit allow-list)', () => {
    mockSession = { role: UserRole.SUPPORT, address: '0x1' };
    renderHook(() => useRealunitGuard('/'));
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });
});

describe('useComplianceGuard', () => {
  beforeEach(resetGuards);

  it('uses default redirectPath "/" when called without arguments', () => {
    mockSession = { role: UserRole.USER, address: '0x1' };
    renderHook(() => useComplianceGuard());
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });

  it.each([UserRole.ADMIN, UserRole.COMPLIANCE])('allows %s', (role) => {
    mockSession = { role, address: '0x1' };
    renderHook(() => useComplianceGuard('/'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects Marketing (not in compliance allow-list)', () => {
    mockSession = { role: UserRole.MARKETING, address: '0x1' };
    renderHook(() => useComplianceGuard('/'));
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });
});

describe('useSupportDashboardGuard', () => {
  beforeEach(resetGuards);

  it('uses default redirectPath "/" when called without arguments', () => {
    mockSession = { role: UserRole.USER, address: '0x1' };
    renderHook(() => useSupportDashboardGuard());
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });

  it.each(SUPPORT_DASHBOARD_ROLES)('allows support-dashboard role %s', (role) => {
    mockSession = { role, address: '0x1' };
    renderHook(() => useSupportDashboardGuard('/'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects plain User', () => {
    mockSession = { role: UserRole.USER, address: '0x1' };
    renderHook(() => useSupportDashboardGuard('/'));
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });

  it('does nothing when isActive is false', () => {
    mockSession = { role: UserRole.USER, address: '0x1' };
    renderHook(() => useSupportDashboardGuard('/', false));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('useKycLevelGuard', () => {
  beforeEach(resetGuards);

  it('redirects when user kyc level is below the minimum', () => {
    mockUser = { kyc: { level: 10 } };
    renderHook(() => useKycLevelGuard(30, '/kyc'));
    expect(mockNavigate).toHaveBeenCalledWith('/kyc', { setRedirect: true });
  });

  it('does not redirect when level meets the minimum', () => {
    mockUser = { kyc: { level: 50 } };
    renderHook(() => useKycLevelGuard(30, '/kyc'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('uses default redirectPath "/" when only minLevel is provided', () => {
    mockUser = { kyc: { level: 0 } };
    renderHook(() => useKycLevelGuard(30));
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });

  it('does not redirect while user is loading or wallet is not initialized', () => {
    mockUser = { kyc: { level: 0 } };
    mockIsUserLoading = true;
    renderHook(() => useKycLevelGuard(30, '/kyc'));
    expect(mockNavigate).not.toHaveBeenCalled();

    mockIsUserLoading = false;
    mockIsInitialized = false;
    renderHook(() => useKycLevelGuard(30, '/kyc'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect when user is missing', () => {
    mockUser = undefined;
    renderHook(() => useKycLevelGuard(30, '/kyc'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
