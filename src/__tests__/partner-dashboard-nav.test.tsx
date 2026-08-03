import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

/**
 * Burger-entry visibility is gated in the real Navigation menu:
 * `session?.role && isPartnerDashboardRole(session.role)`.
 * This renders src/components/navigation.tsx (not a probe) so removing the
 * role check fails the test.
 */

let mockSession: { role: string } | undefined;

jest.mock('@dfx.swiss/react', () => ({
  UserRole: {
    ADMIN: 'Admin',
    USER: 'User',
    SUPPORT: 'Support',
    COMPLIANCE: 'Compliance',
    MARKETING: 'Marketing',
    REALUNIT: 'RealUnit',
  },
  useAuthContext: () => ({ session: mockSession }),
  useSessionContext: () => ({ isLoggedIn: true, logout: jest.fn() }),
  useUserContext: () => ({ hasCustody: false }),
}));

jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ isInitialized: true }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_key: string, defaultValue: string) => defaultValue,
  }),
}));

jest.mock('src/contexts/app-handling.context', () => ({
  CloseType: { CANCEL: 'cancel' },
  useAppHandlingContext: () => ({
    params: {},
    isEmbedded: false,
    closeServices: jest.fn(),
  }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  const IconVariant = new Proxy(
    {},
    {
      get: (_t, prop: string) => prop,
    },
  );
  return {
    IconVariant,
    IconColor: { BLUE: 'blue', RED: 'red' },
    IconSize: { LG: 'lg' },
    DfxIcon: () => <span data-testid="dfx-icon" />,
    StyledButton: ({ label, onClick }: { label: string; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>
        {label}
      </button>
    ),
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
    StyledButtonWidth: { FULL: 'full' },
    StyledLink: ({
      label,
      onClick,
      url,
    }: {
      label: string;
      onClick?: () => void;
      url?: string;
    }) => (
      <a href={url} onClick={onClick}>
        {label}
      </a>
    ),
  };
});

import { UserRole } from '@dfx.swiss/react';
import { Navigation } from 'src/components/navigation';

/** Label from navigation.tsx → translate('screens/partner', 'NC Partner Program'). */
const PARTNER_NAV_LABEL = 'NC Partner Program';

function renderOpenNavigation(): void {
  render(
    <MemoryRouter>
      <Navigation isOpen={true} setIsOpen={jest.fn()} />
    </MemoryRouter>,
  );
}

describe('Non-Custodial Partner Program burger entry (real Navigation)', () => {
  beforeEach(() => {
    mockSession = undefined;
  });

  it('hides the entry without a session role', () => {
    mockSession = undefined;
    renderOpenNavigation();
    expect(screen.queryByText(PARTNER_NAV_LABEL)).not.toBeInTheDocument();
  });

  it('hides the entry for a non-partner role', () => {
    mockSession = { role: UserRole.USER };
    const { unmount } = render(
      <MemoryRouter>
        <Navigation isOpen={true} setIsOpen={jest.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(PARTNER_NAV_LABEL)).not.toBeInTheDocument();
    unmount();

    mockSession = { role: UserRole.ADMIN };
    renderOpenNavigation();
    expect(screen.queryByText(PARTNER_NAV_LABEL)).not.toBeInTheDocument();
  });

  it('shows the entry for the NonCustodialWalletPartner role', () => {
    mockSession = { role: 'NonCustodialWalletPartner' };
    renderOpenNavigation();
    expect(screen.getByText(PARTNER_NAV_LABEL)).toBeInTheDocument();
  });
});
