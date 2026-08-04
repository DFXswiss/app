import { render, waitFor } from '@testing-library/react';
import { LayoutConfig } from 'src/contexts/layout-config.context';
import { mockSettingsState } from 'src/test-helpers/mock-settings-context';

/**
 * Wiring test: PartnerDashboardScreen must call usePartnerDashboardGuard.
 * Logic of the guard is covered in partner-dashboard-guard.test.tsx; this file
 * proves the screen actually invokes it (removing the call must fail here).
 */

const mockNavigate = jest.fn();

let mockSession: { role: string } | undefined = { role: 'User' };
let mockIsLoggedIn = true;
let mockIsInitialized = true;

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

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => mockSettingsState,
}));

jest.mock('react-apexcharts', () => {
  return function MockChart() {
    return <div data-testid="mock-apex-chart" />;
  };
});

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: jest.fn() }),
}));

const layoutOptionsCalls: LayoutConfig[] = [];

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (config: LayoutConfig) => {
    layoutOptionsCalls.push(config);
  },
}));

// Intentionally NOT mocking src/hooks/guard.hook — the real guard must run.

import PartnerDashboardScreen from 'src/screens/partner-dashboard.screen';

describe('PartnerDashboardScreen wires usePartnerDashboardGuard', () => {
  const originalFixture = process.env.REACT_APP_PARTNER_FIXTURE;

  beforeEach(() => {
    process.env.REACT_APP_PARTNER_FIXTURE = 'true';
    mockNavigate.mockReset();
    mockIsLoggedIn = true;
    mockIsInitialized = true;
    mockSession = { role: 'User' };
    layoutOptionsCalls.length = 0;
  });

  afterEach(() => {
    process.env.REACT_APP_PARTNER_FIXTURE = originalFixture;
  });

  it('redirects when the session role is not NonCustodialWalletPartner', async () => {
    render(<PartnerDashboardScreen />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { setRedirect: true });
    });
  });

  it('does not redirect when the session role is NonCustodialWalletPartner', async () => {
    mockSession = { role: 'NonCustodialWalletPartner' };
    render(<PartnerDashboardScreen />);

    // Allow effects to flush; guard must stay silent for the partner role.
    await waitFor(() => {
      expect(layoutOptionsCalls.length).toBeGreaterThan(0);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
