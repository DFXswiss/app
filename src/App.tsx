import { DfxContextProvider, PaymentRoutesContextProvider, SupportChatContextProvider } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { Router } from '@remix-run/router';
import { ComponentType, Suspense, lazy, useRef } from 'react';
import { LoaderFunctionArgs, Outlet, RouteObject, RouterProvider, redirect } from 'react-router-dom';
import { DeletedAddressGate } from './components/deleted-address-notice';
import { LayoutWrapper } from './components/layout-wrapper';
import { RealunitWorkspace } from './components/realunit/workspace';
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

type ScreenImport = () => Promise<{ default: ComponentType }>;

// Every lazily loaded screen, so a test can check that each import resolves to a component.
export const lazyScreenImports: ScreenImport[] = [];

function lazyScreen(load: ScreenImport) {
  lazyScreenImports.push(load);
  return lazy(load);
}

const SellScreen = lazyScreen(() => import('./screens/sell.screen'));
const SwapScreen = lazyScreen(() => import('./screens/swap.screen'));
const AccountScreen = lazyScreen(() => import('./screens/account.screen'));
const SettingsScreen = lazyScreen(() => import('./screens/settings.screen'));
const StaffKycRequiredScreen = lazyScreen(() => import('./screens/staff-kyc-required.screen'));
const BuyFailureScreen = lazyScreen(() => import('./screens/buy-failure.screen'));
const BuyInfoScreen = lazyScreen(() => import('./screens/buy-info.screen'));
const BuySuccessScreen = lazyScreen(() => import('./screens/buy-success.screen'));
const BuyScreen = lazyScreen(() => import('./screens/buy.screen'));
const KycRedirectScreen = lazyScreen(() => import('./screens/kyc-redirect.screen'));
const KycFileScreen = lazyScreen(() => import('./screens/kyc-file.screen'));
const DownloadScreen = lazyScreen(() => import('./screens/download.screen'));
const KycScreen = lazyScreen(() => import('./screens/kyc.screen'));
const KycLogScreen = lazyScreen(() => import('./screens/kyc-log.screen'));
const LinkScreen = lazyScreen(() => import('./screens/link.screen'));
const PaymentRoutesScreen = lazyScreen(() => import('./screens/payment-routes.screen'));
const PaymentLinkScreen = lazyScreen(() => import('./screens/payment-link.screen'));
const PaymentLinkPosScreen = lazyScreen(() => import('./screens/payment-link-pos.screen'));
const PaymentLinkAssignScreen = lazyScreen(() => import('./screens/payment-link-assign.screen'));
const PaymentLinkResultScreen = lazyScreen(() => import('./screens/payment-link-result.screen'));
const InvoiceScreen = lazyScreen(() => import('./screens/invoice.screen'));
const SellInfoScreen = lazyScreen(() => import('./screens/sell-info.screen'));
const SupportIssueScreen = lazyScreen(() => import('./screens/support-issue.screen'));
const SupportTicketsScreen = lazyScreen(() => import('./screens/support-tickets.screen'));
const SupportScreen = lazyScreen(() => import('./screens/support.screen'));
const ChatScreen = lazyScreen(() => import('./screens/chat.screen'));
const TfaScreen = lazyScreen(() => import('./screens/tfa.screen'));
const TransactionScreen = lazyScreen(() => import('./screens/transaction.screen'));
const AccountMerge = lazyScreen(() => import('./screens/account-merge.screen'));
const MailLoginScreen = lazyScreen(() => import('./screens/mail-login.screen'));
const SepaScreen = lazyScreen(() => import('./screens/sepa.screen'));
const SepaManualScreen = lazyScreen(() => import('./screens/sepa-manual.screen'));
const StickersScreen = lazyScreen(() => import('./screens/stickers.screen'));
const BlockchainTransactionScreen = lazyScreen(() => import('./screens/blockchain-tx.screen'));
const EditMailScreen = lazyScreen(() => import('./screens/edit-mail.screen'));
const SafeScreen = lazyScreen(() => import('./screens/safe.screen'));
const ComplianceScreen = lazyScreen(() => import('./screens/compliance.screen'));
const ComplianceBankTxScreen = lazyScreen(() => import('./screens/compliance-bank-tx.screen'));
const ComplianceBankTxUnassignedScreen = lazyScreen(() => import('./screens/compliance-bank-tx-unassigned.screen'));
const ComplianceBankTxRecallScreen = lazyScreen(() => import('./screens/compliance-bank-tx-recall.screen'));
const ComplianceBankTxReturnScreen = lazyScreen(() => import('./screens/compliance-bank-tx-return.screen'));
const ComplianceKycFilesScreen = lazyScreen(() => import('./screens/compliance-kyc-files.screen'));
const ComplianceKycFilesDetailsScreen = lazyScreen(() => import('./screens/compliance-kyc-files-details.screen'));
const ComplianceKycStatsScreen = lazyScreen(() => import('./screens/compliance-kyc-stats.screen'));
const ComplianceTransactionListScreen = lazyScreen(() => import('./screens/compliance-transaction-list.screen'));
const ComplianceKycStepScreen = lazyScreen(() => import('./screens/compliance-kyc-step.screen'));
const ComplianceSupportIssueScreen = lazyScreen(() => import('./screens/compliance-support-issue.screen'));
const ComplianceRecommendationGraphScreen = lazyScreen(
  () => import('./screens/compliance-recommendation-graph.screen'),
);
const ComplianceScorechainScreen = lazyScreen(() => import('./screens/compliance-scorechain.screen'));
const ComplianceCustodyOrdersScreen = lazyScreen(() => import('./screens/compliance-custody-orders.screen'));
const ComplianceMrosListScreen = lazyScreen(() => import('./screens/compliance-mros-list.screen'));
const ComplianceMrosCreateScreen = lazyScreen(() => import('./screens/compliance-mros-create.screen'));
const ComplianceMrosDetailScreen = lazyScreen(() => import('./screens/compliance-mros-detail.screen'));
const ComplianceRecallListScreen = lazyScreen(() => import('./screens/compliance-recall-list.screen'));
const ComplianceChargebackListScreen = lazyScreen(() => import('./screens/compliance-chargeback-list.screen'));
const ComplianceReviewScreen = lazyScreen(() => import('./screens/compliance-review.screen'));
const ComplianceCallQueuesScreen = lazyScreen(() => import('./screens/compliance-call-queues.screen'));
const ComplianceCallQueueScreen = lazyScreen(() => import('./screens/compliance-call-queue.screen'));
const ComplianceCallQueueDetailScreen = lazyScreen(() => import('./screens/compliance-call-queue-detail.screen'));
const ComplianceNotFoundScreen = lazyScreen(() => import('./screens/compliance-not-found.screen'));
const SupportDashboardOverviewScreen = lazyScreen(() => import('./screens/support-dashboard-overview.screen'));
const SupportDashboardScreen = lazyScreen(() => import('./screens/support-dashboard.screen'));
const SupportDashboardIssueScreen = lazyScreen(() => import('./screens/support-dashboard-issue.screen'));
const SupportDashboardCreateScreen = lazyScreen(() => import('./screens/support-dashboard-create.screen'));
const NotesScreen = lazyScreen(() => import('./screens/notes.screen'));
const TemplatesScreen = lazyScreen(() => import('./screens/support-templates.screen'));
const RealunitScreen = lazyScreen(() => import('./screens/realunit.screen'));
const RealunitTreasuryScreen = lazyScreen(() => import('./screens/realunit-treasury.screen'));
const RealunitInsightsScreen = lazyScreen(() => import('./screens/realunit-insights.screen'));
const RealunitHoldersScreen = lazyScreen(() => import('./screens/realunit-holders.screen'));
const RealunitQuotesScreen = lazyScreen(() => import('./screens/realunit-quotes.screen'));
const RealunitTransactionsScreen = lazyScreen(() => import('./screens/realunit-transactions.screen'));
const RealunitQuoteDetailScreen = lazyScreen(() => import('./screens/realunit-quote-detail.screen'));
const RealunitTransactionDetailScreen = lazyScreen(() => import('./screens/realunit-transaction-detail.screen'));
const RealunitUserScreen = lazyScreen(() => import('./screens/realunit-user.screen'));
const RealunitSupportScreen = lazyScreen(() => import('./screens/realunit-support.screen'));
const RealunitSupportIssueScreen = lazyScreen(() => import('./screens/realunit-support-issue.screen'));
const RealunitComplianceScreen = lazyScreen(() => import('./screens/realunit-compliance.screen'));
const RealunitComplianceUserScreen = lazyScreen(() => import('./screens/realunit-compliance-user.screen'));
const RealunitReferralScreen = lazyScreen(() => import('./screens/realunit-referral.screen'));
const RealunitPromoScreen = lazyScreen(() => import('./screens/realunit-promo.screen'));
const RealunitReferralDetailScreen = lazyScreen(() => import('./screens/realunit-referral-detail.screen'));
const PersonalIbanScreen = lazyScreen(() => import('./screens/personal-iban.screen'));
const BuyCryptoUpdateScreen = lazyScreen(() => import('./screens/buy-crypto-update.screen'));
const DashboardScreen = lazyScreen(() => import('./screens/dashboard.screen'));
const DashboardFinancialScreen = lazyScreen(() => import('./screens/dashboard-financial.screen'));
const DashboardFinancialOverviewScreen = lazyScreen(() => import('./screens/dashboard-financial-overview.screen'));
const DashboardFinancialHistoryScreen = lazyScreen(() => import('./screens/dashboard-financial-history.screen'));
const DashboardFinancialLiveScreen = lazyScreen(() => import('./screens/dashboard-financial-live.screen'));
const DashboardFinancialExpensesScreen = lazyScreen(() => import('./screens/dashboard-financial-expenses.screen'));
const DashboardFinancialLiquidityScreen = lazyScreen(() => import('./screens/dashboard-financial-liquidity.screen'));
const DashboardFinancialLogValidityScreen = lazyScreen(
  () => import('./screens/dashboard-financial-log-validity.screen'),
);
const DashboardFinancialKundengelderScreen = lazyScreen(
  () => import('./screens/dashboard-financial-kundengelder.screen'),
);
const DashboardFinancialKundengelderLinesScreen = lazyScreen(() =>
  import('./screens/dashboard-financial-kundengelder.screen').then((module) => ({
    default: module.DashboardFinancialKundengelderLinesScreen,
  })),
);
const SitemapScreen = lazyScreen(() => import('./screens/sitemap.screen'));

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
        path: 'tx/:id/:secret/assign',
        element: withSuspense(<TransactionScreen />),
      },
      {
        path: 'tx/:id/:secret/refund',
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
        path: 'tx/:id/:secret',
        element: withSuspense(<TransactionScreen />),
      },
      {
        path: 'tx/:id',
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
        path: 'compliance/bank-tx/unassigned',
        element: withSuspense(<ComplianceBankTxUnassignedScreen />),
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
      // Must stay last among the compliance routes: React Router ranks static segments above a splat,
      // so this only matches paths none of the screens above claim.
      {
        path: 'compliance/*',
        element: withSuspense(<ComplianceNotFoundScreen />),
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
            <RealunitWorkspace />
          </RealunitContextProvider>
        ),
        children: [
          {
            index: true,
            element: withSuspense(<RealunitScreen />),
          },
          {
            path: 'treasury',
            element: withSuspense(<RealunitTreasuryScreen />),
          },
          {
            path: 'insights',
            element: withSuspense(<RealunitInsightsScreen />),
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
          {
            path: 'promo',
            element: withSuspense(<RealunitPromoScreen />),
          },
          {
            path: 'promo/:id',
            element: withSuspense(<RealunitReferralDetailScreen />),
          },
          {
            path: 'referral',
            element: withSuspense(<RealunitReferralScreen />),
          },
          {
            path: 'referral/:id',
            element: withSuspense(<RealunitReferralDetailScreen />),
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
              {
                path: 'kundengelder',
                children: [
                  {
                    index: true,
                    element: withSuspense(<DashboardFinancialKundengelderScreen />),
                  },
                  {
                    path: 'lines',
                    element: withSuspense(<DashboardFinancialKundengelderLinesScreen />),
                  },
                ],
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
                  <DeletedAddressGate router={router}>
                    <RouterProvider router={router} />
                  </DeletedAddressGate>
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
