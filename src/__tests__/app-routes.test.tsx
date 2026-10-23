// Covers the route table in App.tsx: every lazily loaded screen import, the redirect loaders
// and the Suspense fallback. The providers and statically imported screens are stubbed as in
// app-widget-rerender.test.tsx, and every lazily imported screen module is replaced by stubs
// before App is required, so the test checks App.tsx's own wiring, not the screens.

import { render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PropsWithChildren } from 'react';
import { LoaderFunctionArgs, RouteObject } from 'react-router-dom';

type AppModule = typeof import('../App');

jest.mock('@dfx.swiss/react', () => ({
  DfxContextProvider: ({ children }: PropsWithChildren) => children,
  PaymentRoutesContextProvider: ({ children }: PropsWithChildren) => children,
  SupportChatContextProvider: ({ children }: PropsWithChildren) => children,
  UserRole: { ADMIN: 'Admin', REALUNIT: 'RealUnit', COMPLIANCE: 'Compliance', SUPPORT: 'Support' },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: () => <div>loading</div>,
}));

jest.mock('../contexts/window.context', () => ({
  WindowContextProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('../contexts/balance.context', () => ({
  BalanceContextProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('../contexts/order-ui.context', () => ({
  OrderUIContextProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('../contexts/app-handling.context', () => ({
  AppHandlingContextProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('../contexts/settings.context', () => ({
  SettingsContextProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('../contexts/wallet.context', () => ({
  WalletContextProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('../contexts/payment-link.context', () => ({
  PaymentLinkProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('../contexts/payment-link-pos.context', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => children,
}));
jest.mock('../contexts/realunit.context', () => ({
  RealunitContextProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('../components/deleted-address-notice', () => ({
  DeletedAddressGate: ({ children }: PropsWithChildren) => children,
}));
jest.mock('../components/layout-wrapper', () => ({
  LayoutWrapper: ({ children }: PropsWithChildren) => children,
}));
jest.mock('../components/realunit/workspace', () => ({
  RealunitWorkspace: ({ children }: PropsWithChildren) => children,
}));
jest.mock('../screens/home.screen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/error.screen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/compliance-user.screen', () => ({ __esModule: true, default: () => null }));

// Each lazily imported screen is replaced by a module with the screen file's real export names,
// every export a distinct stub component, so a loader that picks the wrong export fails.
const appSource = readFileSync(join(__dirname, '../App.tsx'), 'utf8');
const lazyScreenLoads = Array.from(
  appSource.matchAll(
    /import\('\.\/(screens\/[^']+)'\)(?:\.then\(\(module\) => \(\{\s*default: module\.(\w+),?\s*\}\)\))?/g,
  ),
  (match) => ({ path: match[1], exportName: match[2] ?? 'default' }),
);
const screenStubs = new Map<string, Record<string, () => null>>();
for (const { path } of lazyScreenLoads) {
  if (screenStubs.has(path)) continue;
  const source = readFileSync(join(__dirname, `../${path}.tsx`), 'utf8');
  const names = Array.from(source.matchAll(/^export (?:function|const|class) (\w+)/gm), (match) => match[1]);
  const stubs = Object.fromEntries(['default', ...names].map((name) => [name, () => null]));
  screenStubs.set(path, stubs);
  jest.doMock(`../${path}`, () => ({ __esModule: true, ...stubs }));
}

// App is required after the screen stubs above are registered.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Routes, lazyScreenImports } = require('../App') as AppModule;

function searchRoute(routes: RouteObject[], path: string): RouteObject | undefined {
  for (const route of routes) {
    const match = route.path === path ? route : route.children && searchRoute(route.children, path);
    if (match) return match;
  }
  return undefined;
}

function findRoute(routes: RouteObject[], path: string): RouteObject {
  const route = searchRoute(routes, path);
  if (!route) throw new Error(`Route ${path} not found`);
  return route;
}

async function load(path: string, url: string): Promise<Response> {
  const loader = findRoute(Routes as RouteObject[], path).loader as (args: LoaderFunctionArgs) => Promise<Response>;
  return loader({ request: new Request(url), params: {} });
}

describe('App routes', () => {
  it('loads the intended export for every lazily loaded screen', async () => {
    expect(lazyScreenLoads.length).toBeGreaterThan(0);
    expect(lazyScreenImports).toHaveLength(lazyScreenLoads.length);

    const modules = await Promise.all(lazyScreenImports.map((loadScreen) => loadScreen()));

    modules.forEach((module, index) => {
      const { path, exportName } = lazyScreenLoads[index];
      const stub = screenStubs.get(path)?.[exportName];
      expect(stub).toBeDefined();
      expect(module.default).toBe(stub);
    });
  });

  it('loads the Kundengelder lines screen from its named export, not the default', async () => {
    const index = lazyScreenLoads.findIndex(
      ({ exportName }) => exportName === 'DashboardFinancialKundengelderLinesScreen',
    );
    const stubs = screenStubs.get('screens/dashboard-financial-kundengelder.screen');

    expect(index).toBeGreaterThanOrEqual(0);
    const module = await lazyScreenImports[index]();
    expect(module.default).toBe(stubs?.DashboardFinancialKundengelderLinesScreen);
    expect(module.default).not.toBe(stubs?.default);
  });

  it('redirects the old payment link path to /pl and keeps the query', async () => {
    const response = await load('payment-link', 'https://app.example/payment-link?lightning=abc');

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/pl?lightning=abc');
  });

  it('redirects the old recommendation path to /account and keeps the query', async () => {
    const response = await load('recommendation', 'https://app.example/recommendation?code=xyz');

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/account?code=xyz');
  });

  it('shows the loading spinner while a lazy screen is loading', () => {
    const { unmount } = render(<>{findRoute(Routes as RouteObject[], 'sitemap').element}</>);

    expect(screen.getByText('loading')).toBeInTheDocument();
    unmount();
  });
});
