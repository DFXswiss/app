import { render, screen } from '@testing-library/react';

// Mock @dfx.swiss/react to avoid ES module issues in jest.
jest.mock('@dfx.swiss/react', () => ({
  UserRole: {
    ADMIN: 'Admin',
    USER: 'User',
    SUPPORT: 'Support',
  },
  useAuthContext: () => ({}),
  useSessionContext: () => ({}),
  useUserContext: () => ({}),
}));

// guard.hook imports wallet.context (which pulls deep ESM from @dfx.swiss/react).
jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ isInitialized: true }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { UserRole } from '@dfx.swiss/react';
import { isPartnerDashboardRole } from 'src/hooks/guard.hook';

/**
 * Burger-entry visibility mirrors navigation.tsx:
 * `session?.role && isPartnerDashboardRole(session.role)`.
 * Full Navigation mounts many providers; this isolates the role gate that
 * decides whether the Non-Custodial Partner Program link is offered.
 */
function PartnerNavProbe({ role }: { role?: string }): JSX.Element {
  const show = !!role && isPartnerDashboardRole(role);
  return (
    <div>
      {show && (
        <a href="/partner/dashboard" data-testid="partner-dashboard-nav">
          Non-Custodial Partner Program
        </a>
      )}
    </div>
  );
}

describe('Non-Custodial Partner Program burger entry role gate', () => {
  it('hides the entry without a session role', () => {
    render(<PartnerNavProbe />);
    expect(screen.queryByTestId('partner-dashboard-nav')).not.toBeInTheDocument();
  });

  it('hides the entry for a non-partner role', () => {
    const { unmount } = render(<PartnerNavProbe role={UserRole.USER} />);
    expect(screen.queryByTestId('partner-dashboard-nav')).not.toBeInTheDocument();
    unmount();

    render(<PartnerNavProbe role={UserRole.ADMIN} />);
    expect(screen.queryByTestId('partner-dashboard-nav')).not.toBeInTheDocument();
  });

  it('shows the entry for the NonCustodialWalletPartner role', () => {
    render(<PartnerNavProbe role="NonCustodialWalletPartner" />);
    expect(screen.getByTestId('partner-dashboard-nav')).toBeInTheDocument();
    expect(screen.getByTestId('partner-dashboard-nav')).toHaveAttribute('href', '/partner/dashboard');
  });
});
