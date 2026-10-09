let mockWebComponent = false;
const mockParams: { headless?: string } = {};
let mockIsEmbedded = true;
let mockHasCustody = false;
let mockIsLoggedIn = false;
let mockSession: { role?: string } | undefined;
const mockLogout = jest.fn();
const mockNavigate = jest.fn();
const mockCloseServices = jest.fn();

jest.mock('src/util/web-component-mode', () => ({
  isWebComponent: () => mockWebComponent,
}));

jest.mock('@dfx.swiss/react', () => ({
  UserRole: { ADMIN: 'Admin', COMPLIANCE: 'Compliance', REALUNIT: 'RealUnit', SUPPORT: 'Support' },
  useAuthContext: () => ({ session: mockSession }),
  useSessionContext: () => ({ isLoggedIn: mockIsLoggedIn, logout: mockLogout }),
  useUserContext: () => ({ hasCustody: mockHasCustody }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  DfxIcon: ({ icon }: { icon: string }) => <span data-testid={`icon-${icon}`} />,
  IconVariant: new Proxy({}, { get: (_target, key) => String(key).toLowerCase() }),
  IconColor: { BLUE: 'blue' },
  IconSize: { LG: 'lg' },
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { FULL: 'full' },
  StyledButton: ({ label, onClick, hidden }: { label: string; onClick: () => void; hidden?: boolean }) => (
    <button type="button" data-testid="session-button" data-hidden={hidden ? 'true' : 'false'} onClick={onClick}>
      {label}
    </button>
  ),
}));

jest.mock('src/hooks/guard.hook', () => ({ SUPPORT_DASHBOARD_ROLES: ['Admin', 'Compliance', 'Support'] }));

jest.mock('src/contexts/app-handling.context', () => ({
  CloseType: { CANCEL: 'cancel' },
  useAppHandlingContext: () => ({ params: mockParams, isEmbedded: mockIsEmbedded, closeServices: mockCloseServices }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/components/navigation-link', () => ({
  NavigationLink: ({ label, url, onClose }: { label: string; url: string; onClose: () => void }) => (
    <button type="button" data-testid="nav-link" data-url={url} onClick={onClose}>
      {label}
    </button>
  ),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MutableRefObject, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Navigation } from 'src/components/navigation';
import { LayoutContextProvider } from 'src/contexts/layout.context';

interface HarnessProps {
  rootRef: MutableRefObject<HTMLDivElement | null>;
  title?: string;
  backButton?: boolean;
  onBack?: () => void;
  small?: boolean;
}

function rect(top: number, bottom: number): DOMRect {
  return { top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) };
}

function Harness({ rootRef, ...props }: HarnessProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div data-testid="root" ref={rootRef}>
      <Navigation {...props} isOpen={isOpen} setIsOpen={setIsOpen} />
    </div>
  );
}

function renderNavigation({
  path = '/buy',
  attachRoot = true,
  ...props
}: Omit<HarnessProps, 'rootRef'> & { path?: string; attachRoot?: boolean } = {}) {
  const rootRef: MutableRefObject<HTMLDivElement | null> = { current: null };
  const harnessRef: MutableRefObject<HTMLDivElement | null> = attachRoot ? rootRef : { current: null };

  return render(
    <MemoryRouter initialEntries={[path]}>
      <LayoutContextProvider modalRootRef={{ current: null }} scrollRef={{ current: null }} rootRef={rootRef}>
        <Harness rootRef={harnessRef} {...props} />
      </LayoutContextProvider>
    </MemoryRouter>,
  );
}

function openMenu(): HTMLElement {
  fireEvent.click(screen.getByTestId('icon-menu'));
  const menu = screen.getByRole('navigation').firstElementChild;
  if (!(menu instanceof HTMLElement)) throw new Error('menu missing');
  return menu;
}

function classes(element: Element | null | undefined): string[] {
  return element?.className.split(/\s+/) ?? [];
}

function linkLabels(): string[] {
  return screen.getAllByTestId('nav-link').map((link) => link.textContent ?? '');
}

describe('Navigation', () => {
  let rectSpy: jest.SpyInstance;

  beforeEach(() => {
    mockWebComponent = false;
    mockParams.headless = undefined;
    mockIsEmbedded = true;
    mockHasCustody = false;
    mockIsLoggedIn = false;
    mockSession = undefined;
    mockLogout.mockReset().mockResolvedValue(undefined);
    mockNavigate.mockReset();
    mockCloseServices.mockReset();
    rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset.testid === 'root' ? rect(0, 600) : rect(64, 700);
    });
  });

  afterEach(() => rectSpy.mockRestore());

  describe('bar', () => {
    it('renders nothing when embedded without a title', () => {
      const { container } = renderNavigation();
      expect(screen.getByTestId('root')).toBeEmptyDOMElement();
      expect(container.querySelector('nav')).toBeNull();
    });

    it('shows the logo when not embedded and no title is set', () => {
      mockIsEmbedded = false;
      renderNavigation();
      expect(screen.getByAltText('logo')).toBeInTheDocument();
    });

    it('shows the title instead of the logo', () => {
      mockIsEmbedded = false;
      renderNavigation({ title: 'Login' });
      expect(screen.getByText('Login')).toBeInTheDocument();
      expect(screen.queryByAltText('logo')).not.toBeInTheDocument();
    });

    it('hides back button and title in headless mode and drops positioning outside web component mode', () => {
      mockParams.headless = 'true';
      renderNavigation({ title: 'Login' });

      const bar = screen.getByTestId('root').firstElementChild;
      expect(classes(bar)).not.toContain('relative');
      expect(classes(bar)).not.toContain('bg-dfxGray-300');
      expect(screen.queryByText('Login')).not.toBeInTheDocument();
      expect(screen.queryByTestId('icon-back')).not.toBeInTheDocument();
    });

    it('keeps the bar as positioning anchor in headless web component mode', () => {
      mockWebComponent = true;
      mockParams.headless = 'true';
      renderNavigation({ title: 'Login' });

      const bar = screen.getByTestId('root').firstElementChild;
      expect(classes(bar)).toContain('relative');
      expect(classes(bar)).not.toContain('bg-dfxGray-300');
    });

    it('omits the back button when disabled', () => {
      renderNavigation({ title: 'Login', backButton: false });
      expect(screen.queryByTestId('icon-back')).not.toBeInTheDocument();
    });

    it('calls a custom back handler', () => {
      const onBack = jest.fn();
      renderNavigation({ title: 'Login', onBack });

      fireEvent.click(screen.getByTestId('icon-back'));
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates back on a sub page', () => {
      renderNavigation({ title: 'Login', path: '/buy' });

      fireEvent.click(screen.getByTestId('icon-back'));
      expect(mockNavigate).toHaveBeenCalledWith(-1);
      expect(mockCloseServices).not.toHaveBeenCalled();
    });

    it('closes the services on the start page', () => {
      renderNavigation({ title: 'Login', path: '/' });

      fireEvent.click(screen.getByTestId('icon-back'));
      expect(mockCloseServices).toHaveBeenCalledWith({ type: 'cancel' }, false);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('toggles the menu with the menu icon', () => {
      renderNavigation({ title: 'Login' });

      openMenu();
      fireEvent.click(screen.getByTestId('icon-close'));
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.getByTestId('icon-menu')).toBeInTheDocument();
    });
  });

  describe('menu placement', () => {
    it('anchors the menu to the viewport with a backdrop in the standalone app', () => {
      renderNavigation({ title: 'Login' });
      const menu = openMenu();

      expect(classes(menu)).toEqual(expect.arrayContaining(['fixed', 'top-14', 'right-2']));
      expect(classes(menu)).not.toContain('absolute');
      expect(menu.style.maxHeight).toBe('');

      const backdrop = document.querySelector('.fixed.inset-0');
      expect(backdrop).not.toBeNull();
      fireEvent.click(backdrop as Element);
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('keeps the menu inside the widget in web component mode', () => {
      mockWebComponent = true;
      renderNavigation({ title: 'Login' });
      const menu = openMenu();

      expect(classes(menu)).toEqual(expect.arrayContaining(['absolute', 'top-full', 'right-2', 'overflow-y-auto']));
      expect(classes(menu)).not.toContain('fixed');
      expect(menu.style.maxHeight).toBe('528px');
      expect(document.querySelector('.fixed')).toBeNull();
      expect(classes(screen.getByRole('navigation').parentElement)).toContain('relative');
    });

    it('leaves the height unbounded when the widget has no room below the bar', () => {
      mockWebComponent = true;
      rectSpy.mockImplementation(function (this: HTMLElement) {
        return this.dataset.testid === 'root' ? rect(0, 60) : rect(64, 700);
      });
      renderNavigation({ title: 'Login' });

      expect(openMenu().style.maxHeight).toBe('');
    });

    it('leaves the height unbounded when the widget root is not attached', () => {
      mockWebComponent = true;
      renderNavigation({ title: 'Login', attachRoot: false });

      expect(openMenu().style.maxHeight).toBe('');
    });

    it('keeps the menu open when clicking inside it', () => {
      renderNavigation({ title: 'Login' });
      const menu = openMenu();

      fireEvent.click(menu);
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  describe('menu content', () => {
    it('shows the full link list for a guest and logs in', () => {
      renderNavigation({ title: 'Login' });
      openMenu();

      expect(linkLabels()).toEqual([
        'Buy',
        'Sell',
        'Swap',
        'Account',
        'Transactions',
        'KYC',
        'Settings',
        'DFX.swiss',
        'Support',
        'Open CryptoPay',
        'Terms and conditions',
        'Privacy policy',
        'Imprint',
      ]);

      const button = screen.getByTestId('session-button');
      expect(button).toHaveTextContent('Login');
      expect(button).toHaveAttribute('data-hidden', 'false');

      fireEvent.click(button);
      expect(mockNavigate).toHaveBeenCalledWith('/login');
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('logs out a logged-in user', async () => {
      mockIsLoggedIn = true;
      renderNavigation({ title: 'Login' });
      openMenu();

      const button = screen.getByTestId('session-button');
      expect(button).toHaveTextContent('Logout');

      fireEvent.click(button);
      expect(mockLogout).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeInTheDocument());
    });

    it('shows only the general links in the small menu and hides login for guests', () => {
      renderNavigation({ title: 'Login', small: true });
      openMenu();

      expect(linkLabels()).toEqual([
        'DFX.swiss',
        'Support',
        'Open CryptoPay',
        'Terms and conditions',
        'Privacy policy',
        'Imprint',
      ]);
      expect(screen.getByTestId('session-button')).toHaveAttribute('data-hidden', 'true');
    });

    it('keeps logout visible in the small menu', () => {
      mockIsLoggedIn = true;
      renderNavigation({ title: 'Login', small: true });
      openMenu();

      expect(screen.getByTestId('session-button')).toHaveAttribute('data-hidden', 'false');
    });

    it('shows the safe for custody users', () => {
      mockHasCustody = true;
      renderNavigation({ title: 'Login' });
      openMenu();

      expect(linkLabels()).toContain('Safe');
    });

    it.each([
      ['Admin', ['Compliance', 'Support Dashboard', 'RealUnit', 'Financial', 'Sitemap']],
      ['Compliance', ['Compliance', 'Support Dashboard', 'RealUnit']],
      ['Support', ['Support Dashboard']],
      ['RealUnit', ['RealUnit']],
      ['User', []],
    ])('shows the staff links for role %s', (role, expected) => {
      mockSession = { role };
      renderNavigation({ title: 'Login' });
      openMenu();

      const staffLinks = ['Compliance', 'Support Dashboard', 'RealUnit', 'Financial', 'Sitemap'];
      expect(linkLabels().filter((label) => staffLinks.includes(label))).toEqual(expected);
    });

    it('closes the menu from every link', () => {
      mockHasCustody = true;
      mockSession = { role: 'Admin' };
      renderNavigation({ title: 'Login' });

      openMenu();
      const count = screen.getAllByTestId('nav-link').length;
      expect(count).toBe(19);

      for (let i = 0; i < count; i++) {
        if (!screen.queryByRole('navigation')) openMenu();
        fireEvent.click(screen.getAllByTestId('nav-link')[i]);
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      }
    });
  });
});
