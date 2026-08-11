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
import {
  isPartnerDashboardRole,
  PARTNER_DASHBOARD_ROLES,
  usePartnerDashboardGuard,
} from 'src/hooks/guard.hook';

/** Character-identical to the API enum value — any drift breaks the guard silently. */
const API_PARTNER_ROLE = 'NonCustodialWalletPartner';

describe('PARTNER_DASHBOARD_ROLES matches API enum value', () => {
  it('lists exactly the API role string NonCustodialWalletPartner', () => {
    expect(PARTNER_DASHBOARD_ROLES).toEqual([API_PARTNER_ROLE]);
    expect(PARTNER_DASHBOARD_ROLES[0]).toBe(API_PARTNER_ROLE);
    // Guard path uses string equality — prove the allow-list entry is the live value.
    expect(isPartnerDashboardRole(API_PARTNER_ROLE)).toBe(true);
  });
});

describe('isPartnerDashboardRole', () => {
  it('rejects missing and non-partner roles', () => {
    expect(isPartnerDashboardRole(undefined)).toBe(false);
    expect(isPartnerDashboardRole(UserRole.USER)).toBe(false);
    expect(isPartnerDashboardRole(UserRole.ADMIN)).toBe(false);
    expect(isPartnerDashboardRole(UserRole.SUPPORT)).toBe(false);
  });

  it('accepts the API role name NonCustodialWalletPartner (runtime string)', () => {
    // BEFUND: UserRole has no NonCustodialWalletPartner member yet — compare the
    // runtime string the API sends. Character-identical match is required.
    expect(isPartnerDashboardRole('NonCustodialWalletPartner')).toBe(true);
  });

  it('rejects the former role name Partner', () => {
    expect(isPartnerDashboardRole('Partner')).toBe(false);
  });
});

describe('usePartnerDashboardGuard — route not reachable without NonCustodialWalletPartner role', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockIsLoggedIn = true;
    mockIsInitialized = true;
    mockSession = { role: UserRole.USER };
  });

  it('redirects when the session role is not NonCustodialWalletPartner', () => {
    renderHook(() => usePartnerDashboardGuard());
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });

  it('redirects when not logged in', () => {
    mockIsLoggedIn = false;
    mockSession = undefined;
    renderHook(() => usePartnerDashboardGuard());
    expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
  });

  it('does not redirect when the session role is NonCustodialWalletPartner', () => {
    mockSession = { role: 'NonCustodialWalletPartner' };
    renderHook(() => usePartnerDashboardGuard());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
