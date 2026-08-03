import { renderHook } from '@testing-library/react';

const mockNavigate = jest.fn();

let mockSession: { role: string } | undefined = { role: 'User' };
let mockIsLoggedIn = true;
let mockIsInitialized = true;

// Mock @dfx.swiss/react to avoid ES module issues in jest (same pattern as support-helpers).
jest.mock('@dfx.swiss/react', () => ({
  UserRole: {
    ADMIN: 'Admin',
    USER: 'User',
    SUPPORT: 'Support',
    COMPLIANCE: 'Compliance',
    MARKETING: 'Marketing',
  },
  useAuthContext: () => ({ session: mockSession }),
  useSessionContext: () => ({ isLoggedIn: mockIsLoggedIn }),
  useUserContext: () => ({}),
}));

jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ isInitialized: mockIsInitialized }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { UserRole } from '@dfx.swiss/react';
import { isPartnerDashboardRole, usePartnerDashboardGuard } from 'src/hooks/guard.hook';

describe('isPartnerDashboardRole', () => {
  it('rejects missing and non-partner roles', () => {
    expect(isPartnerDashboardRole(undefined)).toBe(false);
    expect(isPartnerDashboardRole(UserRole.USER)).toBe(false);
    expect(isPartnerDashboardRole(UserRole.ADMIN)).toBe(false);
    expect(isPartnerDashboardRole(UserRole.SUPPORT)).toBe(false);
  });

  it('accepts the API role name Partner (runtime string)', () => {
    // BEFUND: UserRole has no PARTNER member yet — compare the runtime string the API sends.
    expect(isPartnerDashboardRole('Partner')).toBe(true);
  });
});

describe('usePartnerDashboardGuard — route not reachable without Partner role', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockIsLoggedIn = true;
    mockIsInitialized = true;
    mockSession = { role: UserRole.USER };
  });

  it('redirects when the session role is not Partner', () => {
    renderHook(() => usePartnerDashboardGuard());
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });

  it('redirects when not logged in', () => {
    mockIsLoggedIn = false;
    mockSession = undefined;
    renderHook(() => usePartnerDashboardGuard());
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });

  it('does not redirect when the session role is Partner', () => {
    mockSession = { role: 'Partner' };
    renderHook(() => usePartnerDashboardGuard());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
