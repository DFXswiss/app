import { render, screen, waitFor } from '@testing-library/react';
import { LayoutConfig } from 'src/contexts/layout-config.context';
import PartnerDashboardView from 'src/partner-dashboard/App';
import { mockSettingsState } from 'src/test-helpers/mock-settings-context';

const layoutOptionsCalls: LayoutConfig[] = [];

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

// Guard runs for real when the screen mounts — only its dependencies are stubbed.
// Wiring (redirect without role) is covered in partner-dashboard-screen-wiring.test.tsx.
jest.mock('@dfx.swiss/react', () => ({
  UserRole: {
    ADMIN: 'Admin',
    USER: 'User',
    SUPPORT: 'Support',
    COMPLIANCE: 'Compliance',
    MARKETING: 'Marketing',
  },
  useAuthContext: () => ({ session: { role: 'NonCustodialWalletPartner' } }),
  useSessionContext: () => ({ isLoggedIn: true }),
  useUserContext: () => ({}),
}));

jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ isInitialized: true }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (config: LayoutConfig) => {
    layoutOptionsCalls.push(config);
  },
}));

import PartnerDashboardScreen from 'src/screens/partner-dashboard.screen';

/**
 * Page title must appear exactly once: the dashboard header owns it.
 * The app layout bar must not also receive a title for this screen —
 * that regression is what stacked two identical headlines.
 */
describe('partner dashboard page title appears once', () => {
  const originalFixture = process.env.REACT_APP_PARTNER_FIXTURE;

  beforeEach(() => {
    process.env.REACT_APP_PARTNER_FIXTURE = 'true';
    layoutOptionsCalls.length = 0;
  });

  afterEach(() => {
    process.env.REACT_APP_PARTNER_FIXTURE = originalFixture;
  });

  it('does not pass a layout title (avoids stacking under the app bar)', async () => {
    render(<PartnerDashboardScreen />);

    await waitFor(() => {
      expect(layoutOptionsCalls.length).toBeGreaterThan(0);
    });
    const last = layoutOptionsCalls[layoutOptionsCalls.length - 1];
    expect(last.title).toBeUndefined();
    expect(last.noPadding).toBe(true);
    expect(last.noMaxWidth).toBe(true);
    expect(last.backButton).toBe(false);

    // Drain async fixture load so the suite does not warn about unwrapped updates.
    await waitFor(() => {
      expect(screen.getByTestId('partner-title')).toBeInTheDocument();
    });
  });

  it('renders exactly one page title in the dashboard header', async () => {
    render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('partner-title')).toBeInTheDocument();
    });

    // Text match — not testid — so a second headline with another testid still fails.
    const titleEls = screen.getAllByText('Non-Custodial Partner Program', { exact: true });
    expect(titleEls).toHaveLength(1);
    expect(titleEls[0].tagName).toBe('H1');
    expect(titleEls[0]).toHaveAttribute('data-testid', 'partner-title');

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { name: 'Non-Custodial Partner Program' })).toHaveLength(
      1,
    );
  });
});
