const mockClearParams = jest.fn();
const mockAppParams: { borderless?: boolean } = {};
let mockAttachNavRef = true;

jest.mock('../App', () => ({
  __esModule: true,
  Routes: [
    {
      children: [
        { path: 'kyc', isKycScreen: true },
        { path: 'account' },
      ],
    },
  ],
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ clearParams: mockClearParams }),
}));

jest.mock('src/hooks/app-params.hook', () => ({
  useAppParams: () => mockAppParams,
}));

jest.mock('src/util/utils', () => ({
  isNode: (e: EventTarget | null) => mockIsNode(e),
}));

const mockIsNode = jest.fn((e: EventTarget | null) => e != null && 'nodeType' in e);

jest.mock('src/components/info-banner', () => ({
  InfoBannerComponent: () => <div data-testid="info-banner" />,
}));

jest.mock('src/components/navigation', () => {
  const { forwardRef } = jest.requireActual('react') as typeof import('react');

  return {
    Navigation: forwardRef<
      HTMLDivElement,
      {
        title?: string;
        backButton?: boolean;
        onBack?: () => void;
        isOpen: boolean;
        setIsOpen: (value: boolean) => void;
        small?: boolean;
      }
    >(function NavigationMock({ title, backButton, onBack, isOpen, setIsOpen, small }, ref) {
      return (
        <div
          ref={mockAttachNavRef ? ref : undefined}
          data-testid="navigation"
          data-small={small ? 'true' : 'false'}
          data-open={isOpen ? 'true' : 'false'}
          data-back-button={backButton ? 'true' : 'false'}
        >
          {title ? <span data-testid="nav-title">{title}</span> : null}
          {onBack ? (
            <button type="button" data-testid="nav-back" onClick={onBack}>
              back
            </button>
          ) : null}
          <button type="button" data-testid="open-nav" onClick={() => setIsOpen(true)}>
            open-nav
          </button>
        </div>
      );
    }),
  };
});

import { fireEvent, render, screen } from '@testing-library/react';
import { MutableRefObject, ReactNode, useLayoutEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from 'src/components/layout';
import { LayoutConfig, LayoutConfigProvider, useLayoutConfigContext } from 'src/contexts/layout-config.context';
import { LayoutContextProvider } from 'src/contexts/layout.context';
import { Routes } from '../App';

const defaultRouteChildren = [
  { path: 'kyc', isKycScreen: true },
  { path: 'account' },
];

function ApplyLayoutConfig({ config }: { config: LayoutConfig }): null {
  const { setConfig } = useLayoutConfigContext();
  useLayoutEffect(() => {
    setConfig(config);
  }, [config, setConfig]);
  return null;
}

function contentColumn(): HTMLElement {
  const page = screen.getByTestId('page-content');
  const column = page.parentElement;
  if (!column) {
    throw new Error('content column missing');
  }
  return column;
}

function appRoot(): HTMLElement {
  const root = document.getElementById('app-root');
  if (!root) {
    throw new Error('app-root missing');
  }
  return root;
}

function renderLayout({
  path = '/support',
  config,
  children = <div data-testid="page-content">page</div>,
}: {
  path?: string;
  config?: LayoutConfig;
  children?: ReactNode;
} = {}) {
  const modalRootRef: MutableRefObject<HTMLDivElement | null> = { current: null };
  const scrollRef: MutableRefObject<HTMLDivElement | null> = { current: null };
  const rootRef: MutableRefObject<HTMLDivElement | null> = { current: null };

  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <LayoutContextProvider modalRootRef={modalRootRef} scrollRef={scrollRef} rootRef={rootRef}>
        <LayoutConfigProvider>
          {config ? <ApplyLayoutConfig config={config} /> : null}
          <Layout>{children}</Layout>
        </LayoutConfigProvider>
      </LayoutContextProvider>
    </MemoryRouter>,
  );

  return { ...view, modalRootRef, scrollRef, rootRef };
}

describe('Layout', () => {
  beforeEach(() => {
    mockClearParams.mockReset();
    mockAppParams.borderless = undefined;
    mockAttachNavRef = true;
    mockIsNode.mockReset();
    mockIsNode.mockImplementation((e: EventTarget | null) => e != null && 'nodeType' in e);
    Routes[0].children = [...defaultRouteChildren];
  });

  it('places the info banner inside the content column after navigation on /support', () => {
    const { modalRootRef, scrollRef, rootRef } = renderLayout({
      config: { title: 'Support tickets', backButton: true },
    });

    const root = appRoot();
    const nav = screen.getByTestId('navigation');
    const banner = screen.getByTestId('info-banner');
    const page = screen.getByTestId('page-content');
    const column = contentColumn();

    expect(root.firstElementChild).toBe(nav);
    expect(column.firstElementChild).toBe(banner);
    expect(column.children[1]).toBe(page);
    expect(banner.parentElement).toBe(column);
    expect(nav.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(column.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['relative', 'w-full', 'max-w-screen-md', 'text-center', 'p-5', 'gap-2']),
    );
    expect(rootRef.current).toBe(root);
    expect(modalRootRef.current).toBe(scrollRef.current);
    expect(modalRootRef.current?.className.split(/\s+/)).toContain('overflow-auto');
    expect(modalRootRef.current?.contains(banner)).toBe(true);
    expect(screen.getByTestId('nav-title')).toHaveTextContent('Support tickets');
    expect(nav).toHaveAttribute('data-small', 'false');
  });

  it('keeps the banner on nested /support paths and hides it elsewhere', () => {
    const { unmount } = renderLayout({ path: '/support/tickets' });
    expect(screen.getByTestId('info-banner')).toBeInTheDocument();
    unmount();

    renderLayout({ path: '/account' });
    expect(screen.queryByTestId('info-banner')).not.toBeInTheDocument();
    expect(contentColumn().firstElementChild).toBe(screen.getByTestId('page-content'));
  });

  it('does not show the banner on a KYC route', () => {
    renderLayout({ path: '/kyc' });
    expect(screen.queryByTestId('info-banner')).not.toBeInTheDocument();
    expect(mockClearParams).not.toHaveBeenCalled();
  });

  it('clears the code param on non-KYC routes', () => {
    renderLayout({ path: '/support' });
    expect(mockClearParams).toHaveBeenCalledWith(['code']);
  });

  it('clears the code param when KYC children are missing', () => {
    Routes[0].children = undefined;
    renderLayout({ path: '/account' });
    expect(mockClearParams).toHaveBeenCalledWith(['code']);
  });

  it('does not close the navigation when the click is inside it', () => {
    renderLayout();
    fireEvent.click(screen.getByTestId('open-nav'));
    expect(screen.getByTestId('navigation')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByTestId('navigation'));
    expect(screen.getByTestId('navigation')).toHaveAttribute('data-open', 'true');
  });

  it('closes the navigation when clicking outside of it', () => {
    renderLayout();
    fireEvent.click(screen.getByTestId('open-nav'));
    expect(screen.getByTestId('navigation')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByTestId('page-content'));
    expect(screen.getByTestId('navigation')).toHaveAttribute('data-open', 'false');
  });

  it('ignores outside clicks while the navigation is closed', () => {
    renderLayout();
    fireEvent.click(screen.getByTestId('page-content'));
    expect(screen.getByTestId('navigation')).toHaveAttribute('data-open', 'false');
  });

  it('does not close the navigation when the click target is not a node', () => {
    renderLayout();
    fireEvent.click(screen.getByTestId('open-nav'));
    mockIsNode.mockReturnValue(false);

    fireEvent.click(screen.getByTestId('page-content'));
    expect(screen.getByTestId('navigation')).toHaveAttribute('data-open', 'true');
  });

  it('does not close the navigation when the nav ref is unattached', () => {
    mockAttachNavRef = false;
    renderLayout();
    fireEvent.click(screen.getByTestId('open-nav'));
    expect(screen.getByTestId('navigation')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByTestId('page-content'));
    expect(screen.getByTestId('navigation')).toHaveAttribute('data-open', 'true');
  });

  it('applies textStart, noPadding, noMaxWidth and smallMenu', () => {
    const onBack = jest.fn();
    renderLayout({
      config: { textStart: true, noPadding: true, noMaxWidth: true, smallMenu: true, onBack },
    });

    const classes = contentColumn().className.split(/\s+/);
    expect(classes).toContain('text-start');
    expect(classes).not.toContain('text-center');
    expect(classes).not.toContain('max-w-screen-md');
    expect(classes).not.toContain('p-5');
    expect(screen.getByTestId('navigation')).toHaveAttribute('data-small', 'true');

    fireEvent.click(screen.getByTestId('nav-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('drops padding when borderless is set', () => {
    mockAppParams.borderless = true;
    renderLayout();
    expect(contentColumn().className.split(/\s+/)).not.toContain('p-5');
  });

  it('leaves the scroll ref unchanged on unmount', () => {
    const { unmount, modalRootRef, scrollRef } = renderLayout();
    expect(modalRootRef.current).not.toBeNull();
    expect(scrollRef.current).not.toBeNull();
    unmount();
    expect(modalRootRef.current).not.toBeNull();
    expect(scrollRef.current).not.toBeNull();
  });
});
