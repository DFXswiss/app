import { DfxContextProvider, PaymentRoutesContextProvider, SupportChatContextProvider } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { Router } from '@remix-run/router';
import { Suspense, lazy, useRef } from 'react';
import { LoaderFunctionArgs, Outlet, RouteObject, RouterProvider, redirect } from 'react-router-dom';
import { LayoutWrapper } from './components/layout-wrapper';
import { AppHandlingContextProvider, AppParams, CloseMessageData } from './contexts/app-handling.context';
import { BalanceContextProvider } from './contexts/balance.context';
import { OrderUIContextProvider } from './contexts/order-ui.context';
import PaymentLinkPosContext from './contexts/payment-link-pos.context';
import { PaymentLinkProvider } from './contexts/payment-link.context';
import { RealunitContextProvider } from './contexts/realunit.context';
import { SettingsContextProvider } from './contexts/settings.context';
import { WalletContextProvider } from './contexts/wallet.context';
import { WindowContextProvider } from './contexts/window.context';
import ComplianceUserScreen from './screens/compliance-user.screen';
import ErrorScreen from './screens/error.screen';
import HomeScreen from './screens/home.screen';
import { setupLanguages } from './translations';

const SellScreen = lazy(() => import('./screens/sell.screen'));
const SwapScreen = lazy(() => import('./screens/swap.screen'));
const AccountScreen = lazy(() => import('./screens/account.screen'));
const SettingsScreen = lazy(() => import('./screens/settings.screen'));
const StaffKycRequiredScreen = lazy(() => import('./screens/staff-kyc-required.screen'));
const BuyFailureScreen = lazy(() => import('./screens/buy-failure.screen'));
const BuyInfoScreen = lazy(() => import('./screens/buy-info.screen'));
const BuySuccessScreen = lazy(() => import('./screens/buy-success.screen'));
const BuyScreen = lazy(() => import('./screens/buy.screen'));
const KycRedirectScreen = lazy(() => import('./screens/kyc-redirect.screen'));
const KycFileScreen = lazy(() => import('./screens/kyc-file.screen'));
const DownloadScreen = lazy(() => import('./screens/download.screen'));
const KycScreen = lazy(() => import('./screens/kyc.screen'));
const KycLogScreen = lazy(() => import('./screens/kyc-log.screen'));
const LinkScreen = lazy(() => import('./screens/link.screen'));
const PaymentRoutesScreen = lazy(() => import('./screens/payment-routes.screen'));
const PaymentLinkScreen = lazy(() => import('./screens/payment-link.screen'));
const PaymentLinkPosScreen = lazy(() => import('./screens/payment-link-pos.screen'));
const PaymentLinkAssignScreen = lazy(() => import('./screens/payment-link-assign.screen'));
const PaymentLinkResultScreen = lazy(() => import('./screens/payment-link-result.screen'));
const InvoiceScreen = lazy(() => import('./screens/invoice.screen'));
const SellInfoScreen = lazy(() => import('./screens/sell-info.screen'));
const SupportIssueScreen = lazy(() => import('./screens/support-issue.screen'));
const SupportTicketsScreen = lazy(() => import('./screens/support-tickets.screen'));
const SupportScreen = lazy(() => import('./screens/support.screen'));
const ChatScreen = lazy(() => import('./screens/chat.screen'));
const TfaScreen = lazy(() => import('./screens/tfa.screen'));
const TransactionScreen = lazy(() => import('./screens/transaction.screen'));
const AccountMerge = lazy(() => import('./screens/account-merge.screen'));
const MailLoginScreen = lazy(() => import('./screens/mail-login.screen'));
const SepaScreen = lazy(() => import('./screens/sepa.screen'));
const SepaManualScreen = lazy(() => import('./screens/sepa-manual.screen'));
const StickersScreen = lazy(() => import('./screens/stickers.screen'));
const BlockchainTransactionScreen = lazy(() => import('./screens/blockchain-tx.screen'));
const EditMailScreen = lazy(() => import('./screens/edit-mail.screen'));
const SafeScreen = lazy(() => import('./screens/safe.screen'));
const ComplianceScreen = lazy(() => import('./screens/compliance.screen'));
const ComplianceBankTxScreen = lazy(() => import('./screens/compliance-bank-tx.screen'));
const ComplianceBankTxRecallScreen = lazy(() => import('./screens/compliance-bank-tx-recall.screen'));
const ComplianceBankTxReturnScreen = lazy(() => import('./screens/compliance-bank-tx-return.screen'));
const ComplianceKycFilesScreen = lazy(() => import('./screens/compliance-kyc-files.screen'));
const ComplianceKycFilesDetailsScreen = lazy(() => import('./screens/compliance-kyc-files-details.screen'));
const ComplianceKycStatsScreen = lazy(() => import('./screens/compliance-kyc-stats.screen'));
const ComplianceTransactionListScreen = lazy(() => import('./screens/compliance-transaction-list.screen'));
const ComplianceKycStepScreen = lazy(() => import('./screens/compliance-kyc-step.screen'));
const ComplianceSupportIssueScreen = lazy(() => import('./screens/compliance-support-issue.screen'));
const ComplianceRecommendationGraphScreen = lazy(() => import('./screens/compliance-recommendation-graph.screen'));
const ComplianceScorechainScreen = lazy(() => import('./screens/compliance-scorechain.screen'));
const ComplianceCustodyOrdersScreen = lazy(() => import('./screens/compliance-custody-orders.screen'));
const ComplianceMrosListScreen = lazy(() => import('./screens/compliance-mros-list.screen'));
const ComplianceMrosCreateScreen = lazy(() => import('./screens/compliance-mros-create.screen'));
const ComplianceMrosDetailScreen = lazy(() => import('./screens/compliance-mros-detail.screen'));
const ComplianceRecallListScreen = lazy(() => import('./screens/compliance-recall-list.screen'));
const ComplianceChargebackListScreen = lazy(() => import('./screens/compliance-chargeback-list.screen'));
const ComplianceReviewScreen = lazy(() => import('./screens/compliance-review.screen'));
const ComplianceCallQueuesScreen = lazy(() => import('./screens/compliance-call-queues.screen'));
const ComplianceCallQueueScreen = lazy(() => import('./screens/compliance-call-queue.screen'));
const ComplianceCallQueueDetailScreen = lazy(() => import('./screens/compliance-call-queue-detail.screen'));
const SupportDashboardOverviewScreen = lazy(() => import('./screens/support-dashboard-overview.screen'));
const SupportDashboardScreen = lazy(() => import('./screens/support-dashboard.screen'));
const SupportDashboardIssueScreen = lazy(() => import('./screens/support-dashboard-issue.screen'));
const SupportDashboardCreateScreen = lazy(() => import('./screens/support-dashboard-create.screen'));
const NotesScreen = lazy(() => import('./screens/notes.screen'));
const TemplatesScreen = lazy(() => import('./screens/support-templates.screen'));
const RealunitScreen = lazy(() => import('./screens/realunit.screen'));
const RealunitHoldersScreen = lazy(() => import('./screens/realunit-holders.screen'));
const RealunitQuotesScreen = lazy(() => import('./screens/realunit-quotes.screen'));
const RealunitTransactionsScreen = lazy(() => import('./screens/realunit-transactions.screen'));
const RealunitQuoteDetailScreen = lazy(() => import('./screens/realunit-quote-detail.screen'));
const RealunitTransactionDetailScreen = lazy(() => import('./screens/realunit-transaction-detail.screen'));
const RealunitUserScreen = lazy(() => import('./screens/realunit-user.screen'));
const RealunitSupportScreen = lazy(() => import('./screens/realunit-support.screen'));
const RealunitSupportIssueScreen = lazy(() => import('./screens/realunit-support-issue.screen'));
const RealunitComplianceScreen = lazy(() => import('./screens/realunit-compliance.screen'));
const RealunitComplianceUserScreen = lazy(() => import('./screens/realunit-compliance-user.screen'));
const PersonalIbanScreen = lazy(() => import('./screens/personal-iban.screen'));
const BuyCryptoUpdateScreen = lazy(() => import('./screens/buy-crypto-update.screen'));
const DashboardScreen = lazy(() => import('./screens/dashboard.screen'));
const DashboardFinancialScreen = lazy(() => import('./screens/dashboard-financial.screen'));
const DashboardFinancialOverviewScreen = lazy(() => import('./screens/dashboard-financial-overview.screen'));
const DashboardFinancialHistoryScreen = lazy(() => import('./screens/dashboard-financial-history.screen'));
const DashboardFinancialLiveScreen = lazy(() => import('./screens/dashboard-financial-live.screen'));
const DashboardFinancialExpensesScreen = lazy(() => import('./screens/dashboard-financial-expenses.screen'));
const DashboardFinancialLiquidityScreen = lazy(() => import('./screens/dashboard-financial-liquidity.screen'));
const DashboardFinancialLogValidityScreen = lazy(() => import('./screens/dashboard-financial-log-validity.screen'));
const SitemapScreen = lazy(() => import('./screens/sitemap.screen'));

setupLanguages();

export const Routes = [
  {
    path: '/',
    element: (
      <LayoutWrapper>
        <Outlet />
      </LayoutWrapper>
    ),
    errorElement: (
      <LayoutWrapper>
        <ErrorScreen />
      </LayoutWrapper>
    ),
    children: [
      {
        index: true,
        element: <HomeScreen />,
      },
      {
        path: 'account',
        element: withSuspense(<AccountScreen />),
      },
      {
        path: 'account/mail',
        element: withSuspense(<EditMailScreen />),
      },
      {
        path: 'settings',
        element: withSuspense(<SettingsScreen />),
      },
      {
        path: 'login',
        element: <HomeScreen />,
      },
      {
        path: 'login/mail',
        element: <HomeScreen />,
      },
      {
        path: 'login/wallet',
        element: <HomeScreen />,
      },
      {
        path: 'connect',
        element: <HomeScreen />,
      },
      {
        path: 'mail-login',
        element: withSuspense(<MailLoginScreen />),
      },
      {
        path: 'buy',
        element: withSuspense(<BuyScreen />),
      },
      {
        path: 'buy/info',
        element: withSuspense(<BuyInfoScreen />),
      },
      {
        path: 'buy/success',
        element: withSuspense(<BuySuccessScreen />),
      },
      {
        path: 'buy/failure',
        element: withSuspense(<BuyFailureScreen />),
      },
      {
        path: 'buy/personal-iban',
        element: withSuspense(<PersonalIbanScreen />),
      },
      {
        path: 'sell',
        element: withSuspense(<SellScreen />),
      },
      {
        path: 'sell/info',
        element: withSuspense(<SellInfoScreen />),
      },
      {
        path: 'swap',
        element: withSuspense(<SwapScreen />),
      },
      {
        path: 'routes',
        element: withSuspense(
          <PaymentRoutesContextProvider>
            <PaymentRoutesScreen />
          </PaymentRoutesContextProvider>,
        ),
      },
      {
        path: 'pl/pos',
        element: withSuspense(
          <PaymentLinkPosContext>
            <PaymentLinkPosScreen />
          </PaymentLinkPosContext>,
        ),
      },
      {
        path: 'pl',
        element: withSuspense(
          <PaymentLinkProvider>
            <Outlet />
          </PaymentLinkProvider>,
        ),
        children: [
          {
            index: true,
            element: <PaymentLinkScreen />,
          },
          {
            path: 'assign',
            element: <PaymentLinkAssignScreen />,
          },
        ],
      },
      {
        path: 'pl/result',
        element: withSuspense(<PaymentLinkResultScreen />),
      },
      {
        path: 'payment-link',
        loader: ({ request }: LoaderFunctionArgs) => {
          const url = new URL(request.url);
          return redirect(`/pl${url.search}`);
        },
      },
      {
        path: 'invoice',
        element: withSuspense(<InvoiceScreen />),
      },
      {
        path: 'kyc',
        element: withSuspense(<KycScreen />),
        isKycScreen: true,
      },
      {
        path: 'kyc/redirect',
        element: withSuspense(<KycRedirectScreen />),
        isKycScreen: true,
      },
      {
        path: 'profile',
        element: withSuspense(<KycScreen />),
        isKycScreen: true,
      },
      {
        path: 'contact',
        element: withSuspense(<KycScreen />),
        isKycScreen: true,
      },
      {
        path: 'link',
        element: withSuspense(<LinkScreen />),
        isKycScreen: true,
      },
      {
        path: '2fa',
        element: withSuspense(<TfaScreen />),
        isKycScreen: true,
      },
      {
        path: 'staff-kyc-required',
        element: withSuspense(<StaffKycRequiredScreen />),
        isKycScreen: true,
      },
      {
        path: 'file/download',
        element: withSuspense(<DownloadScreen />),
      },
      {
        path: 'file/:id',
        element: withSuspense(<KycFileScreen />),
      },
      {
        path: 'kyc/log',
        element: withSuspense(<KycLogScreen />),
      },
      {
        path: 'buyCrypto/update',
        element: withSuspense(<BuyCryptoUpdateScreen />),
      },
      {
        path: 'tx',
        element: withSuspense(<TransactionScreen />),
      },
      {
        path: 'tx/:id',
        element: withSuspense(<TransactionScreen />),
      },
      {
        path: 'tx/:id/assign',
        element: withSuspense(<TransactionScreen />),
      },
      {
        path: 'tx/:id/refund',
        element: withSuspense(<TransactionScreen />),
      },
      {
        path: 'support',
        element: withSuspense(<SupportScreen />),
      },
      {
        path: 'support',
        element: (
          <SupportChatContextProvider>
            <Outlet />
          </SupportChatContextProvider>
        ),
        children: [
          {
            path: 'tickets',
            element: withSuspense(<SupportTicketsScreen />),
          },
          {
            path: 'issue',
            element: withSuspense(<SupportIssueScreen />),
          },
          {
            path: 'chat',
            element: withSuspense(<ChatScreen />),
          },
          {
            path: 'chat/:id',
            element: withSuspense(<ChatScreen />),
          },
        ],
      },
      {
        path: 'account-merge',
        element: withSuspense(<AccountMerge />),
      },
      {
        path: 'sepa',
        element: withSuspense(<SepaScreen />),
      },
      {
        path: 'sepa/manual',
        element: withSuspense(<SepaManualScreen />),
      },
      {
        path: 'stickers',
        element: withSuspense(<StickersScreen />),
      },
      {
        path: 'blockchain/tx',
        element: withSuspense(<BlockchainTransactionScreen />),
      },
      {
        path: 'safe',
        element: withSuspense(<SafeScreen />),
      },
      {
        path: 'recommendation',
        loader: ({ request }: LoaderFunctionArgs) => {
          const url = new URL(request.url);
          return redirect(`/account${url.search}`);
        },
      },
      {
        path: 'compliance',
        element: withSuspense(<ComplianceScreen />),
      },
      {
        path: 'compliance/user/:id',
        element: withSuspense(<ComplianceUserScreen />),
      },
      {
        path: 'support/user/:id',
        element: withSuspense(<ComplianceUserScreen />),
      },
      {
        path: 'compliance/user/:id/kyc-step/:stepId',
        element: withSuspense(<ComplianceKycStepScreen />),
      },
      {
        path: 'compliance/user/:id/support-issue/:issueId',
        element: withSuspense(<ComplianceSupportIssueScreen />),
      },
      {
        path: 'compliance/recommendations/:id',
        element: withSuspense(<ComplianceRecommendationGraphScreen />),
      },
      {
        path: 'compliance/scorechain/user/:id',
        element: withSuspense(<ComplianceScorechainScreen />),
      },
      {
        path: 'compliance/bank-tx/:id',
        element: withSuspense(<ComplianceBankTxScreen />),
      },
      {
        path: 'compliance/bank-tx/:id/recall',
        element: withSuspense(<ComplianceBankTxRecallScreen />),
      },
      {
        path: 'compliance/bank-tx/:id/return',
        element: withSuspense(<ComplianceBankTxReturnScreen />),
      },
      {
        path: 'compliance/kyc-files',
        element: withSuspense(<ComplianceKycFilesScreen />),
      },
      {
        path: 'compliance/kyc-files/details',
        element: withSuspense(<ComplianceKycFilesDetailsScreen />),
      },
      {
        path: 'compliance/kyc-stats',
        element: withSuspense(<ComplianceKycStatsScreen />),
      },
      {
        path: 'compliance/transactions',
        element: withSuspense(<ComplianceTransactionListScreen />),
      },
      {
        path: 'compliance/custody-orders',
        element: withSuspense(<ComplianceCustodyOrdersScreen />),
      },
      {
        path: 'compliance/mros',
        element: withSuspense(<ComplianceMrosListScreen />),
      },
      {
        path: 'compliance/mros/create',
        element: withSuspense(<ComplianceMrosCreateScreen />),
      },
      {
        path: 'compliance/mros/:id',
        element: withSuspense(<ComplianceMrosDetailScreen />),
      },
      {
        path: 'compliance/recalls',
        element: withSuspense(<ComplianceRecallListScreen />),
      },
      {
        path: 'compliance/pending-chargebacks',
        element: withSuspense(<ComplianceChargebackListScreen />),
      },
      {
        path: 'compliance/user/:id/kyc',
        element: withSuspense(<ComplianceReviewScreen />),
      },
      {
        path: 'compliance/call-queues',
        element: withSuspense(<ComplianceCallQueuesScreen />),
      },
      {
        path: 'compliance/call-queues/:queue',
        element: withSuspense(<ComplianceCallQueueScreen />),
      },
      {
        path: 'compliance/call-queues/:queue/:userDataId',
        element: withSuspense(<ComplianceCallQueueDetailScreen />),
      },
      {
        path: 'sitemap',
        element: withSuspense(<SitemapScreen />),
      },
      {
        path: 'support/dashboard',
        element: withSuspense(<SupportDashboardOverviewScreen />),
      },
      {
        path: 'support/dashboard/all',
        element: withSuspense(<SupportDashboardScreen />),
      },
      {
        path: 'support/dashboard/issue/:id',
        element: withSuspense(<SupportDashboardIssueScreen />),
      },
      {
        path: 'support/dashboard/create',
        element: withSuspense(<SupportDashboardCreateScreen />),
      },
      {
        path: 'notes',
        element: withSuspense(<NotesScreen />),
      },
      {
        path: 'templates',
        element: withSuspense(<TemplatesScreen />),
      },
      {
        path: 'realunit',
        element: (
          <RealunitContextProvider>
            <Outlet />
          </RealunitContextProvider>
        ),
        children: [
          {
            index: true,
            element: withSuspense(<RealunitScreen />),
          },
          {
            path: 'holders',
            element: withSuspense(<RealunitHoldersScreen />),
          },
          {
            path: 'quotes',
            element: withSuspense(<RealunitQuotesScreen />),
          },
          {
            path: 'quotes/:id',
            element: withSuspense(<RealunitQuoteDetailScreen />),
          },
          {
            path: 'transactions',
            element: withSuspense(<RealunitTransactionsScreen />),
          },
          {
            path: 'transactions/:id',
            element: withSuspense(<RealunitTransactionDetailScreen />),
          },
          {
            path: 'user/:address',
            element: withSuspense(<RealunitUserScreen />),
          },
          {
            path: 'support',
            element: withSuspense(<RealunitSupportScreen />),
          },
          {
            path: 'support/issue/:id',
            element: withSuspense(<RealunitSupportIssueScreen />),
          },
          {
            path: 'compliance',
            element: withSuspense(<RealunitComplianceScreen />),
          },
          {
            path: 'compliance/user/:id',
            element: withSuspense(<RealunitComplianceUserScreen />),
          },
        ],
      },
      {
        path: 'dashboard',
        children: [
          {
            index: true,
            element: withSuspense(<DashboardScreen />),
          },
          {
            path: 'financial',
            children: [
              {
                index: true,
                element: withSuspense(<DashboardFinancialScreen />),
              },
              {
                path: 'overview',
                element: withSuspense(<DashboardFinancialOverviewScreen />),
              },
              {
                path: 'live',
                element: withSuspense(<DashboardFinancialLiveScreen />),
              },
              {
                path: 'history',
                children: [
                  {
                    index: true,
                    element: withSuspense(<DashboardFinancialHistoryScreen />),
                  },
                  {
                    path: 'expenses',
                    element: withSuspense(<DashboardFinancialExpensesScreen />),
                  },
                ],
              },
              {
                path: 'liquidity',
                element: withSuspense(<DashboardFinancialLiquidityScreen />),
              },
              {
                path: 'log-validity',
                element: withSuspense(<DashboardFinancialLogValidityScreen />),
              },
            ],
          },
        ],
      },
    ],
  },
];

export enum Service {
  BUY = 'buy',
  SELL = 'sell',
  SWAP = 'swap',
  CONNECT = 'connect',
}

export interface WidgetParams extends AppParams {
  service?: Service;
  onClose?: (data: CloseMessageData) => void;
}

interface AppProps {
  routerFactory: (routes: RouteObject[]) => Router;
  params?: WidgetParams;
}

function App({ routerFactory, params }: AppProps) {
  const routerRef = useRef<Router>();
  if (!routerRef.current) {
    routerRef.current = routerFactory(Routes);
  }
  const router = routerRef.current;

  const hasNavigatedHomeRef = useRef(false);
  if (!hasNavigatedHomeRef.current) {
    hasNavigatedHomeRef.current = true;
    const home = params?.service && `/${params.service}`;
    if (home) router.navigate(home);
  }

  return (
    <WindowContextProvider>
      <DfxContextProvider api={{}} data={{}} includePrivateAssets={true}>
        <BalanceContextProvider>
          <OrderUIContextProvider>
            <AppHandlingContextProvider
              isWidget={params != null}
              service={params?.service}
              closeCallback={params?.onClose}
              params={params}
              router={router}
            >
              <SettingsContextProvider>
                <WalletContextProvider router={router}>
                  <RouterProvider router={router} />
                </WalletContextProvider>
              </SettingsContextProvider>
            </AppHandlingContextProvider>
          </OrderUIContextProvider>
        </BalanceContextProvider>
      </DfxContextProvider>
    </WindowContextProvider>
  );
}

function withSuspense(WrappedComponent: JSX.Element): JSX.Element {
  return <Suspense fallback={<SuspenseFallback />}>{WrappedComponent}</Suspense>;
}

function SuspenseFallback(): JSX.Element {
  return <StyledLoadingSpinner size={SpinnerSize.LG} />;
}

export default App;
