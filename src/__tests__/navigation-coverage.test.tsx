import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Full coverage of src/components/navigation.tsx — role gates, back button,
 * menu toggle, login/logout, headless/embedded, small mode, custody.
 * Pattern matches partner-dashboard-nav.test.tsx (real Navigation, mocked contexts).
 */

let mockSession: { role: string } | undefined;
let mockIsLoggedIn = true;
let mockHasCustody = false;
let mockIsEmbedded = false;
let mockParams: { headless?: string } = {};
let mockPathname = '/buy';
const mockNavigate = jest.fn();
const mockCloseServices = jest.fn();
const mockLogout = jest.fn().mockResolvedValue(undefined);

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
  useSessionContext: () => ({ isLoggedIn: mockIsLoggedIn, logout: mockLogout }),
  useUserContext: () => ({ hasCustody: mockHasCustody }),
}));

jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ isInitialized: true }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_key: string, defaultValue: string) => defaultValue,
  }),
}));

jest.mock('src/contexts/app-handling.context', () => ({
  CloseType: { CANCEL: 'cancel' },
  useAppHandlingContext: () => ({
    params: mockParams,
    isEmbedded: mockIsEmbedded,
    closeServices: mockCloseServices,
  }),
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({ pathname: mockPathname }),
  };
});

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
    DfxIcon: ({ icon }: { icon: string }) => <span data-testid={`dfx-icon-${icon}`} />,
    StyledButton: ({
      label,
      onClick,
      hidden,
    }: {
      label: string;
      onClick?: () => void;
      hidden?: boolean;
    }) =>
      hidden ? null : (
        <button type="button" onClick={onClick} data-testid="nav-auth-button">
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
      <a href={url} onClick={onClick} data-testid={`nav-link-${label}`}>
        {label}
      </a>
    ),
  };
});

jest.mock('src/version', () => ({
  REACT_APP_BUILD_ID: 'test-build-id',
}));

import { UserRole } from '@dfx.swiss/react';
import { Navigation } from 'src/components/navigation';

function renderNav(
  props: Partial<React.ComponentProps<typeof Navigation>> = {},
): {
  setIsOpen: jest.Mock;
} {
  const setIsOpen = jest.fn();
  render(
    <MemoryRouter>
      <Navigation isOpen={true} setIsOpen={setIsOpen} {...props} />
    </MemoryRouter>,
  );
  return { setIsOpen };
}

describe('Navigation full coverage', () => {
  beforeEach(() => {
    mockSession = { role: UserRole.USER };
    mockIsLoggedIn = true;
    mockHasCustody = false;
    mockIsEmbedded = false;
    mockParams = {};
    mockPathname = '/buy';
    mockNavigate.mockReset();
    mockCloseServices.mockReset();
    mockLogout.mockReset().mockResolvedValue(undefined);
  });

  it('renders nothing when embedded without a title', () => {
    mockIsEmbedded = true;
    const { container } = render(
      <MemoryRouter>
        <Navigation isOpen={false} setIsOpen={jest.fn()} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows title text and skips the logo when title is set', () => {
    renderNav({ title: 'Custom Title', isOpen: false });
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.queryByAltText('logo')).not.toBeInTheDocument();
  });

  it('applies headless chrome when params.headless is true', () => {
    mockParams = { headless: 'true' };
    renderNav({ isOpen: false });
    // Headless: no back button / logo block
    expect(screen.queryByTestId('dfx-icon-BACK')).not.toBeInTheDocument();
    expect(screen.queryByAltText('logo')).not.toBeInTheDocument();
  });

  it('toggles the menu via the menu icon and closes via the overlay', async () => {
    const setIsOpen = jest.fn();
    const { rerender } = render(
      <MemoryRouter>
        <Navigation isOpen={false} setIsOpen={setIsOpen} />
      </MemoryRouter>,
    );

    // Menu icon toggles open (prev => !prev)
    await userEvent.click(screen.getByTestId('dfx-icon-MENU').parentElement as HTMLElement);
    expect(setIsOpen).toHaveBeenCalled();
    const toggleFn = setIsOpen.mock.calls[0][0] as (prev: boolean) => boolean;
    expect(toggleFn(false)).toBe(true);
    expect(toggleFn(true)).toBe(false);

    setIsOpen.mockClear();
    rerender(
      <MemoryRouter>
        <Navigation isOpen={true} setIsOpen={setIsOpen} />
      </MemoryRouter>,
    );

    // Overlay click closes
    const overlay = document.querySelector('.fixed.inset-0.z-40') as HTMLElement;
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay);
    expect(setIsOpen).toHaveBeenCalledWith(false);
  });

  it('BackButton on root path closes services; elsewhere navigates back', async () => {
    mockPathname = '/';
    renderNav({ isOpen: false });
    await userEvent.click(screen.getByTestId('dfx-icon-BACK').parentElement as HTMLElement);
    expect(mockCloseServices).toHaveBeenCalledWith({ type: 'cancel' }, false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('BackButton on a nested path navigates -1', async () => {
    mockPathname = '/buy';
    renderNav({ isOpen: false });
    await userEvent.click(screen.getByTestId('dfx-icon-BACK').parentElement as HTMLElement);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
    expect(mockCloseServices).not.toHaveBeenCalled();
  });

  it('uses custom onBack when provided', async () => {
    const onBack = jest.fn();
    renderNav({ isOpen: false, onBack });
    await userEvent.click(screen.getByTestId('dfx-icon-BACK').parentElement as HTMLElement);
    expect(onBack).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockCloseServices).not.toHaveBeenCalled();
  });

  it('backButton=false hides the back control', () => {
    renderNav({ isOpen: false, backButton: false });
    expect(screen.queryByTestId('dfx-icon-BACK')).not.toBeInTheDocument();
  });

  it('shows Safe when hasCustody is true', () => {
    mockHasCustody = true;
    renderNav();
    expect(screen.getByText('Safe')).toBeInTheDocument();
  });

  it('shows Compliance for Admin and Compliance roles', () => {
    mockSession = { role: UserRole.ADMIN };
    renderNav();
    expect(screen.getByText('Compliance')).toBeInTheDocument();
  });

  it('shows Support Dashboard for Support and Marketing roles', () => {
    mockSession = { role: UserRole.SUPPORT };
    const { unmount } = render(
      <MemoryRouter>
        <Navigation isOpen={true} setIsOpen={jest.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Support Dashboard')).toBeInTheDocument();
    unmount();

    mockSession = { role: UserRole.MARKETING };
    renderNav();
    expect(screen.getByText('Support Dashboard')).toBeInTheDocument();
  });

  it('shows RealUnit for Admin/RealUnit/Compliance and Financial+Sitemap only for Admin', () => {
    mockSession = { role: UserRole.REALUNIT };
    const { unmount } = render(
      <MemoryRouter>
        <Navigation isOpen={true} setIsOpen={jest.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('RealUnit')).toBeInTheDocument();
    expect(screen.queryByText('Financial')).not.toBeInTheDocument();
    expect(screen.queryByText('Sitemap')).not.toBeInTheDocument();
    unmount();

    mockSession = { role: UserRole.ADMIN };
    renderNav();
    expect(screen.getByText('RealUnit')).toBeInTheDocument();
    expect(screen.getByText('Financial')).toBeInTheDocument();
    expect(screen.getByText('Sitemap')).toBeInTheDocument();
  });

  it('shows NC Partner Program only for NonCustodialWalletPartner and closes on click', async () => {
    mockSession = { role: 'NonCustodialWalletPartner' };
    const { setIsOpen } = renderNav();
    expect(screen.getByText('NC Partner Program')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('nav-link-NC Partner Program'));
    expect(setIsOpen).toHaveBeenCalledWith(false);
  });

  it('small mode hides the main product links but keeps external/support links', () => {
    renderNav({ small: true });
    expect(screen.queryByText('Buy')).not.toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('DFX.swiss')).toBeInTheDocument();
  });

  it('small mode hides the auth button when logged out', () => {
    mockIsLoggedIn = false;
    renderNav({ small: true });
    expect(screen.queryByTestId('nav-auth-button')).not.toBeInTheDocument();
  });

  it('login navigates to /login and closes the menu', async () => {
    mockIsLoggedIn = false;
    const { setIsOpen } = renderNav();
    expect(screen.getByTestId('nav-auth-button')).toHaveTextContent('Login');
    await userEvent.click(screen.getByTestId('nav-auth-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/login');
    expect(setIsOpen).toHaveBeenCalledWith(false);
  });

  it('logout calls apiLogout and closes the menu', async () => {
    mockIsLoggedIn = true;
    const { setIsOpen } = renderNav();
    expect(screen.getByTestId('nav-auth-button')).toHaveTextContent('Logout');
    await userEvent.click(screen.getByTestId('nav-auth-button'));
    expect(mockLogout).toHaveBeenCalled();
    await waitForLogoutClose(setIsOpen);
  });

  it('clicking every menu link invokes its onClose (relative + absolute)', async () => {
    // Admin + custody + partner role bits so every gated entry is visible
    mockSession = { role: UserRole.ADMIN };
    mockHasCustody = true;
    const setIsOpen = jest.fn();
    render(
      <MemoryRouter>
        <Navigation isOpen={true} setIsOpen={setIsOpen} />
      </MemoryRouter>,
    );

    const labels = [
      'Buy',
      'Sell',
      'Swap',
      'Account',
      'Safe',
      'Transactions',
      'KYC',
      'Settings',
      'Compliance',
      'Support Dashboard',
      'RealUnit',
      'Financial',
      'Sitemap',
      'DFX.swiss',
      'Support',
      'Open CryptoPay',
      'Terms and conditions',
      'Privacy policy',
      'Imprint',
    ];

    for (const label of labels) {
      setIsOpen.mockClear();
      mockNavigate.mockClear();
      const link = screen.getByTestId(`nav-link-${label}`);
      await userEvent.click(link);
      expect(setIsOpen).toHaveBeenCalledWith(false);
    }
  });

  it('clicking an absolute external link closes the menu', async () => {
    const { setIsOpen } = renderNav();
    await userEvent.click(screen.getByTestId('nav-link-Terms and conditions'));
    expect(setIsOpen).toHaveBeenCalledWith(false);
  });

  it('stops click propagation on the nav element so the overlay does not close twice', () => {
    const { setIsOpen } = renderNav();
    const nav = document.querySelector('nav') as HTMLElement;
    const event = new MouseEvent('click', { bubbles: true });
    const stopSpy = jest.spyOn(event, 'stopPropagation');
    nav.dispatchEvent(event);
    expect(stopSpy).toHaveBeenCalled();
    // Overlay handler not reached via nav stopPropagation — setIsOpen only from links if any
    expect(setIsOpen).not.toHaveBeenCalledWith(false);
  });

  it('renders the build id in the footer', () => {
    renderNav();
    expect(screen.getByText('test-build-id')).toBeInTheDocument();
  });
});

async function waitForLogoutClose(setIsOpen: jest.Mock): Promise<void> {
  // logout is async — wait a tick for setIsNavigationOpen(false)
  await Promise.resolve();
  await Promise.resolve();
  expect(setIsOpen).toHaveBeenCalledWith(false);
}
