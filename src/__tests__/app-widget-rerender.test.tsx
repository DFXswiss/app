// Regression test for: a widget attribute/property change (r2wc calling root.render() again
// with new params) must NOT recreate the router or re-navigate to the service's home route.
// Mounts the REAL App component (the shared engine behind MainWidget/MainLib) with a REAL
// createMemoryRouter, capturing the created router instance via a spy routerFactory. Every
// context provider App.tsx renders directly, plus the two non-lazy screens it statically
// imports (HomeScreen, ErrorScreen), is mocked to a trivial pass-through/stub — this test is
// scoped to App.tsx's own router-lifecycle logic, not to any screen's business logic. Other
// lazy-loaded screens are never required (React.lazy only imports on actual navigation, and
// this test never navigates to a route that resolves to one).

import { act, render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouteObject } from 'react-router-dom';
import { Router } from '@remix-run/router';
import App, { Service, WidgetParams } from '../App';

jest.mock('@dfx.swiss/react', () => ({
  DfxContextProvider: ({ children }: any) => children,
  PaymentRoutesContextProvider: ({ children }: any) => children,
  SupportChatContextProvider: ({ children }: any) => children,
  // App statically imports the RealUnit workspace, whose nav reads these at load time.
  UserRole: {
    ADMIN: 'Admin',
    REALUNIT: 'RealUnit',
    COMPLIANCE: 'Compliance',
    SUPPORT: 'Support',
  },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: () => null,
}));

jest.mock('../contexts/window.context', () => ({
  WindowContextProvider: ({ children }: any) => children,
  useWindowContext: () => ({}),
}));

jest.mock('../contexts/balance.context', () => ({
  BalanceContextProvider: ({ children }: any) => children,
  useBalanceContext: () => ({ getBalances: () => [], readBalances: () => undefined, hasBalance: false }),
}));

jest.mock('../contexts/order-ui.context', () => ({
  OrderUIContextProvider: ({ children }: any) => children,
  useOrderUIContext: () => ({}),
}));

let lastAppHandlingParams: WidgetParams | undefined;
jest.mock('../contexts/app-handling.context', () => ({
  AppHandlingContextProvider: (props: any) => {
    lastAppHandlingParams = props.params;
    return props.children;
  },
  useAppHandlingContext: () => ({}),
}));

jest.mock('../contexts/settings.context', () => ({
  SettingsContextProvider: ({ children }: any) => children,
  useSettingsContext: () => ({}),
}));

jest.mock('../contexts/wallet.context', () => ({
  WalletContextProvider: ({ children }: any) => children,
  useWalletContext: () => ({}),
}));

jest.mock('../components/layout-wrapper', () => ({
  LayoutWrapper: ({ children }: any) => children,
}));

jest.mock('../screens/home.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="home-screen">home</div>,
}));

jest.mock('../screens/error.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="error-screen">error</div>,
}));

jest.mock('../contexts/payment-link.context', () => ({
  PaymentLinkProvider: ({ children }: any) => children,
  usePaymentLinkContext: () => ({}),
}));

jest.mock('../contexts/payment-link-pos.context', () => ({
  __esModule: true,
  default: ({ children }: any) => children,
  usePaymentPosContext: () => ({}),
}));

jest.mock('../contexts/realunit.context', () => ({
  RealunitContextProvider: ({ children }: any) => children,
  useRealunitContext: () => ({}),
}));

jest.mock('../screens/compliance-user.screen', () => ({
  __esModule: true,
  default: () => null,
}));

function createCapturingRouterFactory() {
  let router: Router | undefined;
  const factory = jest.fn((routes: RouteObject[]) => {
    router = createMemoryRouter(routes);
    return router as Router;
  });
  return { factory, getRouter: () => router as Router };
}

describe('App widget re-render stability (router + home navigation)', () => {
  beforeEach(() => {
    lastAppHandlingParams = undefined;
  });

  it('keeps the router and the current route stable and re-forwards params props across a widget attribute re-render', async () => {
    const { factory, getRouter } = createCapturingRouterFactory();
    const initialParams: WidgetParams = { service: Service.CONNECT, lang: 'en' };

    const { rerender } = render(<App routerFactory={factory} params={initialParams} />);

    // First mount: router created exactly once, navigated to the service's home route.
    expect(factory).toHaveBeenCalledTimes(1);
    const router = getRouter();
    await waitFor(() => expect(router.state.location.pathname).toBe('/connect'));
    // App.tsx prop-forwarding only (AppHandlingContextProvider is fully mocked here).
    expect(lastAppHandlingParams?.lang).toBe('en');

    // Customer navigates deeper (past the start screen).
    await act(async () => {
      router.navigate('/login');
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));

    // Simulate a widget attribute change: r2wc calls root.render() again with new params,
    // re-executing App() on the SAME mounted React root (same fiber, hook state preserved).
    const changedParams: WidgetParams = { service: Service.CONNECT, lang: 'de' };
    rerender(<App routerFactory={factory} params={changedParams} />);

    // Router must not be recreated...
    expect(factory).toHaveBeenCalledTimes(1);
    // ...and the customer must still be on the route they navigated to, not kicked back home.
    await waitFor(() => expect(getRouter().state.location.pathname).toBe('/login'));
    // Asserts only that App.tsx re-forwards the raw `params` prop to the (mocked)
    // AppHandlingContextProvider on re-render — not that arbitrary params are live inside
    // the real context (real params are read once at init; only personalIban is live-wired).
    expect(lastAppHandlingParams?.lang).toBe('de');
  });

  it('still navigates to the service home route on the very first mount (unchanged behavior)', async () => {
    const { factory, getRouter } = createCapturingRouterFactory();
    render(<App routerFactory={factory} params={{ service: Service.CONNECT }} />);

    await waitFor(() => expect(getRouter().state.location.pathname).toBe('/connect'));
  });

  it('never navigates when no service is set (standalone/app scenario unaffected)', async () => {
    const { factory, getRouter } = createCapturingRouterFactory();
    render(<App routerFactory={factory} />);

    await waitFor(() => expect(getRouter()).toBeDefined());
    expect(getRouter().state.location.pathname).toBe('/');
  });
});
