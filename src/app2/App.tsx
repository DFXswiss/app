// DFX App 2.0 — routing root.
//
// Hash routing is required: the CDN serving /app2/ has no SPA rewrite, so a
// direct/refresh load of e.g. /app2/#/account must resolve without a server
// round-trip. createBrowserRouter would 404 on refresh; createHashRouter does not.

import { Component, type ReactNode } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import logoWhite from './assets/brand/logo-white.svg';
import { Shell } from './components/Shell';
import { ToastProvider } from './components/ui';
import { LanguageProvider, useT } from './i18n';
import AccountScreen from './screens/account';
import HomeScreen from './screens/home';
import KycScreen from './screens/kyc';
import LimitScreen from './screens/limit';
import OcpScreen from './screens/ocp/OcpScreen';
import { NotFound } from './screens/parts/NotFound';
import ReturnRouteScreen from './screens/return-route';
import SupportScreen from './screens/support';
import TransactionsScreen from './screens/transactions';
import { WalletSessionProvider } from './wallets/session';

const router = createHashRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <HomeScreen /> },
      { path: '/account', element: <AccountScreen /> },
      { path: '/tx', element: <TransactionsScreen /> },
      { path: '/kyc', element: <KycScreen /> },
      { path: '/limit', element: <LimitScreen /> },
      // OpenCryptoPay merchant suite. The hub is `/ocp`; a sub-view is selected
      // via `?sub=<name>` (see OcpScreen) so the Drawer can deep-link to one.
      { path: '/ocp', element: <OcpScreen /> },
      { path: '/support', element: <SupportScreen /> },
      // External-return handlers (account-merge + Checkout.com card-payment return).
      // Registered as hash routes so the flows work when reached; the production
      // real-path deep-link contract is a hosting concern (see return-route.tsx).
      { path: '/account-merge', element: <ReturnRouteScreen /> },
      { path: '/buy/success', element: <ReturnRouteScreen /> },
      { path: '/buy/failure', element: <ReturnRouteScreen /> },
      // Catch-all (finding #7): an unmatched hash path used to fall through to react-router's
      // own unbranded "Unexpected Application Error!" page instead of rendering inside the Shell.
      { path: '*', element: <NotFound /> },
    ],
  },
]);

class App2ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <App2ErrorFallback /> : this.props.children;
  }
}

function App2ErrorFallback() {
  const { t } = useT();
  return (
    <div className="app">
      <div className="layer">
        <div className="topbar" style={{ justifyContent: 'center' }}>
          <img className="brand-logo" src={logoWhite} alt="DFX" />
        </div>
        <div className="body">
          <div className="account" style={{ display: 'grid', placeContent: 'center', textAlign: 'center', gap: 14 }}>
            <div className="paybox-note warn">{t('genErr')}</div>
            <button className="btn-primary" type="button" onClick={() => window.location.reload()}>
              {t('retry')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function App2() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <App2ErrorBoundary>
          <WalletSessionProvider>
            <RouterProvider router={router} />
          </WalletSessionProvider>
        </App2ErrorBoundary>
      </ToastProvider>
    </LanguageProvider>
  );
}

export default App2;
