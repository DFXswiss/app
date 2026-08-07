// Coverage of App.tsx route table: every lazy() factory, loaders, Suspense fallback path.
// Pattern follows app-widget-rerender.test.tsx — real App + createMemoryRouter, screens mocked.

import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouteObject } from 'react-router-dom';
import { Router } from '@remix-run/router';
import App, { Routes, Service } from '../App';

jest.mock('@dfx.swiss/react', () => ({
  DfxContextProvider: ({ children }: any) => children,
  PaymentRoutesContextProvider: ({ children }: any) => children,
  SupportChatContextProvider: ({ children }: any) => children,
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => (
    <div data-testid="suspense-fallback" data-size={size ?? ''} />
  ),
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

jest.mock('../contexts/app-handling.context', () => ({
  AppHandlingContextProvider: ({ children }: any) => children,
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
  LayoutWrapper: ({ children }: any) => <div data-testid="layout">{children}</div>,
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

jest.mock('../screens/sell.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-sell.screen" />,
}));

jest.mock('../screens/swap.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-swap.screen" />,
}));

jest.mock('../screens/account.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-account.screen" />,
}));

jest.mock('../screens/settings.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-settings.screen" />,
}));

jest.mock('../screens/staff-kyc-required.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-staff-kyc-required.screen" />,
}));

jest.mock('../screens/buy-failure.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-buy-failure.screen" />,
}));

jest.mock('../screens/buy-info.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-buy-info.screen" />,
}));

jest.mock('../screens/buy-success.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-buy-success.screen" />,
}));

jest.mock('../screens/buy.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-buy.screen" />,
}));

jest.mock('../screens/kyc-redirect.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-kyc-redirect.screen" />,
}));

jest.mock('../screens/kyc-file.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-kyc-file.screen" />,
}));

jest.mock('../screens/download.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-download.screen" />,
}));

jest.mock('../screens/kyc.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-kyc.screen" />,
}));

jest.mock('../screens/kyc-log.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-kyc-log.screen" />,
}));

jest.mock('../screens/link.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-link.screen" />,
}));

jest.mock('../screens/payment-routes.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-payment-routes.screen" />,
}));

jest.mock('../screens/payment-link.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-payment-link.screen" />,
}));

jest.mock('../screens/payment-link-pos.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-payment-link-pos.screen" />,
}));

jest.mock('../screens/payment-link-assign.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-payment-link-assign.screen" />,
}));

jest.mock('../screens/payment-link-result.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-payment-link-result.screen" />,
}));

jest.mock('../screens/invoice.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-invoice.screen" />,
}));

jest.mock('../screens/sell-info.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-sell-info.screen" />,
}));

jest.mock('../screens/support-issue.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-support-issue.screen" />,
}));

jest.mock('../screens/support-tickets.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-support-tickets.screen" />,
}));

jest.mock('../screens/support.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-support.screen" />,
}));

jest.mock('../screens/chat.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-chat.screen" />,
}));

jest.mock('../screens/tfa.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-tfa.screen" />,
}));

jest.mock('../screens/transaction.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-transaction.screen" />,
}));

jest.mock('../screens/account-merge.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-account-merge.screen" />,
}));

jest.mock('../screens/mail-login.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-mail-login.screen" />,
}));

jest.mock('../screens/sepa.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-sepa.screen" />,
}));

jest.mock('../screens/sepa-manual.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-sepa-manual.screen" />,
}));

jest.mock('../screens/stickers.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-stickers.screen" />,
}));

jest.mock('../screens/blockchain-tx.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-blockchain-tx.screen" />,
}));

jest.mock('../screens/edit-mail.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-edit-mail.screen" />,
}));

jest.mock('../screens/safe.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-safe.screen" />,
}));

jest.mock('../screens/compliance.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance.screen" />,
}));

jest.mock('../screens/compliance-bank-tx.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-bank-tx.screen" />,
}));

jest.mock('../screens/compliance-bank-tx-recall.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-bank-tx-recall.screen" />,
}));

jest.mock('../screens/compliance-bank-tx-return.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-bank-tx-return.screen" />,
}));

jest.mock('../screens/compliance-kyc-files.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-kyc-files.screen" />,
}));

jest.mock('../screens/compliance-kyc-files-details.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-kyc-files-details.screen" />,
}));

jest.mock('../screens/compliance-kyc-stats.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-kyc-stats.screen" />,
}));

jest.mock('../screens/compliance-transaction-list.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-transaction-list.screen" />,
}));

jest.mock('../screens/compliance-kyc-step.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-kyc-step.screen" />,
}));

jest.mock('../screens/compliance-support-issue.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-support-issue.screen" />,
}));

jest.mock('../screens/compliance-recommendation-graph.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-recommendation-graph.screen" />,
}));

jest.mock('../screens/compliance-scorechain.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-scorechain.screen" />,
}));

jest.mock('../screens/compliance-custody-orders.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-custody-orders.screen" />,
}));

jest.mock('../screens/compliance-mros-list.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-mros-list.screen" />,
}));

jest.mock('../screens/compliance-mros-create.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-mros-create.screen" />,
}));

jest.mock('../screens/compliance-mros-detail.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-mros-detail.screen" />,
}));

jest.mock('../screens/compliance-recall-list.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-recall-list.screen" />,
}));

jest.mock('../screens/compliance-review.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-review.screen" />,
}));

jest.mock('../screens/compliance-call-queues.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-call-queues.screen" />,
}));

jest.mock('../screens/compliance-call-queue.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-call-queue.screen" />,
}));

jest.mock('../screens/compliance-call-queue-detail.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-call-queue-detail.screen" />,
}));

jest.mock('../screens/support-dashboard-overview.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-support-dashboard-overview.screen" />,
}));

jest.mock('../screens/support-dashboard.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-support-dashboard.screen" />,
}));

jest.mock('../screens/support-dashboard-issue.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-support-dashboard-issue.screen" />,
}));

jest.mock('../screens/support-dashboard-create.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-support-dashboard-create.screen" />,
}));

jest.mock('../screens/partner-dashboard.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-partner-dashboard.screen" />,
}));

jest.mock('../screens/notes.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-notes.screen" />,
}));

jest.mock('../screens/support-templates.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-support-templates.screen" />,
}));

jest.mock('../screens/realunit.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-realunit.screen" />,
}));

jest.mock('../screens/realunit-holders.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-realunit-holders.screen" />,
}));

jest.mock('../screens/realunit-quotes.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-realunit-quotes.screen" />,
}));

jest.mock('../screens/realunit-transactions.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-realunit-transactions.screen" />,
}));

jest.mock('../screens/realunit-quote-detail.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-realunit-quote-detail.screen" />,
}));

jest.mock('../screens/realunit-transaction-detail.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-realunit-transaction-detail.screen" />,
}));

jest.mock('../screens/realunit-user.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-realunit-user.screen" />,
}));

jest.mock('../screens/realunit-support.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-realunit-support.screen" />,
}));

jest.mock('../screens/realunit-support-issue.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-realunit-support-issue.screen" />,
}));

jest.mock('../screens/realunit-compliance.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-realunit-compliance.screen" />,
}));

jest.mock('../screens/realunit-compliance-user.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-realunit-compliance-user.screen" />,
}));

jest.mock('../screens/personal-iban.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-personal-iban.screen" />,
}));

jest.mock('../screens/buy-crypto-update.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-buy-crypto-update.screen" />,
}));

jest.mock('../screens/dashboard.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-dashboard.screen" />,
}));

jest.mock('../screens/dashboard-financial.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-dashboard-financial.screen" />,
}));

jest.mock('../screens/dashboard-financial-overview.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-dashboard-financial-overview.screen" />,
}));

jest.mock('../screens/dashboard-financial-history.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-dashboard-financial-history.screen" />,
}));

jest.mock('../screens/dashboard-financial-live.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-dashboard-financial-live.screen" />,
}));

jest.mock('../screens/dashboard-financial-expenses.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-dashboard-financial-expenses.screen" />,
}));

jest.mock('../screens/dashboard-financial-liquidity.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-dashboard-financial-liquidity.screen" />,
}));

jest.mock('../screens/dashboard-financial-log-validity.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-dashboard-financial-log-validity.screen" />,
}));

jest.mock('../screens/sitemap.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-sitemap.screen" />,
}));

jest.mock('../screens/compliance-user.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-compliance-user.screen" />,
}));

jest.mock('../screens/error.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-error.screen" />,
}));

jest.mock('../screens/home.screen', () => ({
  __esModule: true,
  default: () => <div data-testid="screen-home.screen" />,
}));

const ROUTE_PATHS: string[] = [
  "/",
  "/account",
  "/account/mail",
  "/settings",
  "/login",
  "/login/mail",
  "/login/wallet",
  "/connect",
  "/mail-login",
  "/buy",
  "/buy/info",
  "/buy/success",
  "/buy/failure",
  "/buy/personal-iban",
  "/sell",
  "/sell/info",
  "/swap",
  "/routes",
  "/pl/pos",
  "/pl",
  "/pl/assign",
  "/pl/result",
  "/payment-link?foo=1",
  "/invoice",
  "/kyc",
  "/kyc/redirect",
  "/profile",
  "/contact",
  "/link",
  "/2fa",
  "/staff-kyc-required",
  "/file/download",
  "/file/abc",
  "/kyc/log",
  "/buyCrypto/update",
  "/tx",
  "/tx/tid",
  "/tx/tid/assign",
  "/tx/tid/refund",
  "/support",
  "/support/tickets",
  "/support/issue",
  "/support/chat",
  "/support/chat/cid",
  "/account-merge",
  "/sepa",
  "/sepa/manual",
  "/stickers",
  "/blockchain/tx",
  "/safe",
  "/recommendation?bar=2",
  "/compliance",
  "/compliance/user/1",
  "/support/user/1",
  "/compliance/user/1/kyc-step/s1",
  "/compliance/user/1/support-issue/i1",
  "/compliance/recommendations/1",
  "/compliance/scorechain/user/1",
  "/compliance/bank-tx/1",
  "/compliance/bank-tx/1/recall",
  "/compliance/bank-tx/1/return",
  "/compliance/kyc-files",
  "/compliance/kyc-files/details",
  "/compliance/kyc-stats",
  "/compliance/transactions",
  "/compliance/custody-orders",
  "/compliance/mros",
  "/compliance/mros/create",
  "/compliance/mros/9",
  "/compliance/recalls",
  "/compliance/user/1/kyc",
  "/compliance/call-queues",
  "/compliance/call-queues/q1",
  "/compliance/call-queues/q1/42",
  "/sitemap",
  "/support/dashboard",
  "/support/dashboard/all",
  "/support/dashboard/issue/1",
  "/support/dashboard/create",
  "/partner/dashboard",
  "/notes",
  "/templates",
  "/realunit",
  "/realunit/holders",
  "/realunit/quotes",
  "/realunit/quotes/1",
  "/realunit/transactions",
  "/realunit/transactions/1",
  "/realunit/user/0xabc",
  "/realunit/support",
  "/realunit/support/issue/1",
  "/realunit/compliance",
  "/realunit/compliance/user/1",
  "/dashboard",
  "/dashboard/financial",
  "/dashboard/financial/overview",
  "/dashboard/financial/live",
  "/dashboard/financial/history",
  "/dashboard/financial/history/expenses",
  "/dashboard/financial/liquidity",
  "/dashboard/financial/log-validity"
];

function createCapturingRouterFactory(initialEntries?: string[]) {
  let router: Router | undefined;
  const factory = jest.fn((routes: RouteObject[]) => {
    router = createMemoryRouter(routes, initialEntries ? { initialEntries } : undefined);
    return router as Router;
  });
  return { factory, getRouter: () => router as Router };
}

describe('App.tsx route table coverage', () => {
  it('invokes every lazy factory and both redirect loaders by navigating each path', async () => {
    const { factory, getRouter } = createCapturingRouterFactory(['/']);
    render(<App routerFactory={factory} />);
    const router = getRouter();
    expect(factory).toHaveBeenCalledTimes(1);
    // Routes export is the same table the factory received
    expect(Routes.length).toBeGreaterThan(0);

    for (const path of ROUTE_PATHS) {
      await act(async () => {
        await router.navigate(path);
      });
    }

    // Invoke redirect loaders via the route objects the factory received
    // (same table as Routes export — deterministic, no race with data-router redirects).
    type LoaderRoute = {
      path?: string;
      loader?: (args: { request: Request; params: Record<string, string>; context: unknown }) => unknown;
      children?: LoaderRoute[];
    };
    function findLoader(routes: LoaderRoute[], path: string): NonNullable<LoaderRoute['loader']> | undefined {
      for (const r of routes) {
        if (r.path === path && typeof r.loader === 'function') return r.loader;
        if (r.children) {
          const found = findLoader(r.children, path);
          if (found) return found;
        }
      }
      return undefined;
    }

    const factoryRoutes = factory.mock.calls[0][0] as LoaderRoute[];
    const paymentLoader = findLoader(factoryRoutes, 'payment-link') ?? findLoader(Routes as LoaderRoute[], 'payment-link');
    if (!paymentLoader) throw new Error('payment-link loader missing');
    const paymentResult = paymentLoader({
      request: new Request('http://localhost/payment-link?keep=1'),
      params: {},
      context: undefined,
    }) as Response;
    expect(paymentResult).toBeInstanceOf(Response);
    expect(paymentResult.headers.get('Location')).toBe('/pl?keep=1');

    const recLoader = findLoader(factoryRoutes, 'recommendation') ?? findLoader(Routes as LoaderRoute[], 'recommendation');
    if (!recLoader) throw new Error('recommendation loader missing');
    const recResult = recLoader({
      request: new Request('http://localhost/recommendation?keep=2'),
      params: {},
      context: undefined,
    }) as Response;
    expect(recResult).toBeInstanceOf(Response);
    expect(recResult.headers.get('Location')).toBe('/account?keep=2');

    // Layout still mounted after the tour
    expect(screen.getByTestId('layout')).toBeInTheDocument();
  }, 60000);

  it('navigates to service home when WidgetParams.service is set (BUY)', async () => {
    const { factory, getRouter } = createCapturingRouterFactory();
    render(<App routerFactory={factory} params={{ service: Service.BUY }} />);
    await waitFor(() => expect(getRouter().state.location.pathname).toBe('/buy'));
  });

  it('navigates to service home when WidgetParams.service is SELL', async () => {
    const { factory, getRouter } = createCapturingRouterFactory();
    render(<App routerFactory={factory} params={{ service: Service.SELL }} />);
    await waitFor(() => expect(getRouter().state.location.pathname).toBe('/sell'));
  });

  it('navigates to service home when WidgetParams.service is SWAP', async () => {
    const { factory, getRouter } = createCapturingRouterFactory();
    render(<App routerFactory={factory} params={{ service: Service.SWAP }} />);
    await waitFor(() => expect(getRouter().state.location.pathname).toBe('/swap'));
  });

  it('keeps the same router on re-render and does not re-run home navigation', async () => {
    const { factory, getRouter } = createCapturingRouterFactory();
    const { rerender } = render(
      <App routerFactory={factory} params={{ service: Service.CONNECT }} />,
    );
    await waitFor(() => expect(getRouter().state.location.pathname).toBe('/connect'));
    expect(factory).toHaveBeenCalledTimes(1);

    await act(async () => {
      getRouter().navigate('/login');
    });
    await waitFor(() => expect(getRouter().state.location.pathname).toBe('/login'));

    // Re-render hits the false arms of !routerRef.current and !hasNavigatedHomeRef.current
    rerender(<App routerFactory={factory} params={{ service: Service.CONNECT, lang: 'de' }} />);
    expect(factory).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getRouter().state.location.pathname).toBe('/login'));
  });
});
