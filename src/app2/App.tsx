// DFX App 2.0 — routing root.
//
// Hash routing is required: the CDN serving /app2/ has no SPA rewrite, so a
// direct/refresh load of e.g. /app2/#/account must resolve without a server
// round-trip. createBrowserRouter would 404 on refresh; createHashRouter does not.

import { createHashRouter, RouterProvider } from 'react-router-dom';
import { Shell } from './components/Shell';
import { ToastProvider } from './components/ui';
import { LanguageProvider } from './i18n';
import AccountScreen from './screens/account';
import HomeScreen from './screens/home';
import KycScreen from './screens/kyc';
import { NotFound } from './screens/parts/NotFound';
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
      { path: '/support', element: <SupportScreen /> },
      // Catch-all (finding #7): an unmatched hash path used to fall through to react-router's
      // own unbranded "Unexpected Application Error!" page instead of rendering inside the Shell.
      { path: '*', element: <NotFound /> },
    ],
  },
]);

function App2() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <WalletSessionProvider>
          <RouterProvider router={router} />
        </WalletSessionProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}

export default App2;
