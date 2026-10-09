let mockWebComponent = false;
const mockParams: { headless?: string } = {};

jest.mock('src/util/web-component-mode', () => ({
  isWebComponent: () => mockWebComponent,
}));

jest.mock('@dfx.swiss/react', () => ({
  UserRole: { ADMIN: 'Admin', COMPLIANCE: 'Compliance', REALUNIT: 'RealUnit' },
  useAuthContext: () => ({ session: undefined }),
  useSessionContext: () => ({ isLoggedIn: false, logout: jest.fn() }),
  useUserContext: () => ({ hasCustody: false }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  DfxIcon: ({ icon }: { icon: string }) => <span data-testid={`icon-${icon}`} />,
  IconVariant: { BACK: 'back', MENU: 'menu', CLOSE: 'close' },
  IconColor: { BLUE: 'blue' },
  IconSize: { LG: 'lg' },
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { FULL: 'full' },
  StyledButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
}));

jest.mock('src/hooks/guard.hook', () => ({ SUPPORT_DASHBOARD_ROLES: [] }));

jest.mock('src/contexts/app-handling.context', () => ({
  CloseType: { CANCEL: 'cancel' },
  useAppHandlingContext: () => ({ params: mockParams, isEmbedded: true, closeServices: jest.fn() }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('src/components/navigation-link', () => ({
  NavigationLink: ({ label }: { label: string }) => <a>{label}</a>,
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { MutableRefObject, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Navigation } from 'src/components/navigation';
import { LayoutContextProvider } from 'src/contexts/layout.context';

function rect(top: number, bottom: number): DOMRect {
  return { top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) };
}

function Harness({ rootRef }: { rootRef: MutableRefObject<HTMLDivElement | null> }): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div data-testid="root" ref={rootRef}>
      <Navigation title="Login" isOpen={isOpen} setIsOpen={setIsOpen} />
    </div>
  );
}

function renderNavigation() {
  const rootRef: MutableRefObject<HTMLDivElement | null> = { current: null };

  render(
    <MemoryRouter>
      <LayoutContextProvider modalRootRef={{ current: null }} scrollRef={{ current: null }} rootRef={rootRef}>
        <Harness rootRef={rootRef} />
      </LayoutContextProvider>
    </MemoryRouter>,
  );

  return rootRef;
}

function openMenu(): HTMLElement {
  fireEvent.click(screen.getByTestId('icon-menu'));
  const menu = screen.getByRole('navigation').firstElementChild;
  if (!(menu instanceof HTMLElement)) throw new Error('menu missing');
  return menu;
}

describe('Navigation menu placement', () => {
  let rectSpy: jest.SpyInstance;

  beforeEach(() => {
    mockWebComponent = false;
    mockParams.headless = undefined;
    rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset.testid === 'root' ? rect(0, 600) : rect(64, 700);
    });
  });

  afterEach(() => rectSpy.mockRestore());

  it('anchors the menu to the viewport with a backdrop in the standalone app', () => {
    renderNavigation();
    const menu = openMenu();

    expect(menu.className.split(/\s+/)).toEqual(expect.arrayContaining(['fixed', 'top-14', 'right-2']));
    expect(menu.className.split(/\s+/)).not.toContain('absolute');
    expect(menu.style.maxHeight).toBe('');

    const backdrop = document.querySelector('.fixed.inset-0');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('keeps the menu inside the widget in web component mode', () => {
    mockWebComponent = true;
    renderNavigation();
    const menu = openMenu();

    expect(menu.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['absolute', 'top-full', 'right-2', 'overflow-y-auto']),
    );
    expect(menu.className.split(/\s+/)).not.toContain('fixed');
    expect(menu.style.maxHeight).toBe('528px');
    expect(document.querySelector('.fixed')).toBeNull();
    expect(screen.getByRole('navigation').parentElement?.className.split(/\s+/)).toContain('relative');
  });

  it('keeps the navigation bar as the anchor in headless web component mode', () => {
    mockWebComponent = true;
    mockParams.headless = 'true';
    renderNavigation();
    openMenu();

    const bar = screen.getByRole('navigation').parentElement;
    expect(bar?.className.split(/\s+/)).toContain('relative');
    expect(bar?.className.split(/\s+/)).not.toContain('bg-dfxGray-300');
  });

  it('leaves the height unbounded when the widget has no room below the bar', () => {
    mockWebComponent = true;
    rectSpy.mockImplementation(function (this: HTMLElement) {
      return this.dataset.testid === 'root' ? rect(0, 60) : rect(64, 700);
    });
    renderNavigation();
    const menu = openMenu();

    expect(menu.style.maxHeight).toBe('');
  });
});
