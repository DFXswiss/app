import { StyledVerticalStack } from '@dfx.swiss/react-components';
import { Link, useLocation } from 'react-router-dom';
import { useAdminGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { personalIbanOnlyParams } from 'src/util/personal-iban';
import { relativeUrl } from 'src/util/utils';

interface PageEntry {
  path: string;
  label: string;
}

interface PageSection {
  title: string;
  pages: PageEntry[];
}

const sections: PageSection[] = [
  {
    title: 'Auth & Account',
    pages: [
      { path: '/', label: 'Home' },
      { path: '/account', label: 'Account' },
      { path: '/account/mail', label: 'Edit Mail' },
      { path: '/settings', label: 'Settings' },
      { path: '/login', label: 'Login' },
      { path: '/login/mail', label: 'Login (Mail)' },
      { path: '/login/wallet', label: 'Login (Wallet)' },
      { path: '/connect', label: 'Connect' },
      { path: '/mail-login', label: 'Mail Login' },
      { path: '/account-merge', label: 'Account Merge' },
      { path: '/profile', label: 'Profile' },
      { path: '/contact', label: 'Contact' },
      { path: '/link', label: 'Link' },
      { path: '/2fa', label: '2FA' },
    ],
  },
  {
    title: 'Trading',
    pages: [
      { path: '/buy', label: 'Buy' },
      { path: '/buy/info', label: 'Buy Info' },
      { path: '/buy/success', label: 'Buy Success' },
      { path: '/buy/failure', label: 'Buy Failure' },
      { path: '/buy/personal-iban', label: 'Personal IBAN' },
      { path: '/sell', label: 'Sell' },
      { path: '/sell/info', label: 'Sell Info' },
      { path: '/swap', label: 'Swap' },
      { path: '/routes', label: 'Payment Routes' },
      { path: '/buyCrypto/update', label: 'Buy Crypto Update' },
    ],
  },
  {
    title: 'Payment Links & Invoices',
    pages: [
      { path: '/pl', label: 'Payment Link' },
      { path: '/pl/assign', label: 'Payment Link Assign' },
      { path: '/pl/pos', label: 'Payment Link POS' },
      { path: '/pl/result', label: 'Payment Link Result' },
      { path: '/payment-link', label: 'Payment Link (Legacy)' },
      { path: '/invoice', label: 'Invoice' },
    ],
  },
  {
    title: 'Transactions',
    pages: [
      { path: '/tx', label: 'Transactions' },
      { path: '/blockchain/tx', label: 'Blockchain Tx' },
    ],
  },
  {
    title: 'KYC',
    pages: [
      { path: '/kyc', label: 'KYC' },
      { path: '/kyc/redirect', label: 'KYC Redirect' },
      { path: '/kyc/log', label: 'KYC Log' },
      { path: '/file/download', label: 'File Download' },
    ],
  },
  {
    title: 'Support',
    pages: [
      { path: '/support', label: 'Support' },
      { path: '/support/tickets', label: 'Support Tickets' },
      { path: '/support/issue', label: 'Support Issue' },
      { path: '/support/chat', label: 'Support Chat' },
    ],
  },
  {
    title: 'Compliance',
    pages: [
      { path: '/compliance', label: 'Compliance Dashboard' },
      { path: '/compliance/kyc-files', label: 'KYC Files' },
      { path: '/compliance/kyc-files/details', label: 'KYC Files Details' },
      { path: '/compliance/kyc-stats', label: 'KYC Stats' },
      { path: '/compliance/transactions', label: 'Transaction List' },
      { path: '/compliance/custody-orders', label: 'Custody Orders' },
      { path: '/compliance/recalls', label: 'Recalls' },
      { path: '/compliance/pending-chargebacks', label: 'Pending Chargebacks' },
      { path: '/compliance/mros', label: 'MROS Reports' },
      { path: '/compliance/mros/create', label: 'Create MROS Report' },
      { path: '/compliance/call-queues', label: 'Call Queues' },
    ],
  },
  {
    title: 'Support Dashboard',
    pages: [
      { path: '/support/dashboard', label: 'Support Dashboard' },
      { path: '/support/dashboard/create', label: 'Create Issue' },
      { path: '/notes', label: 'Notes' },
      { path: '/templates', label: 'Support Templates' },
    ],
  },
  {
    title: 'RealUnit',
    pages: [
      { path: '/realunit', label: 'RealUnit' },
      { path: '/realunit/holders', label: 'Holders' },
      { path: '/realunit/quotes', label: 'Quotes' },
      { path: '/realunit/transactions', label: 'Transactions' },
    ],
  },
  {
    title: 'Dashboard',
    pages: [
      { path: '/dashboard', label: 'Dashboard' },
      { path: '/dashboard/financial', label: 'Financial' },
      { path: '/dashboard/financial/overview', label: 'Financial Overview' },
      { path: '/dashboard/financial/live', label: 'Financial Live' },
      { path: '/dashboard/financial/history', label: 'Financial History' },
      { path: '/dashboard/financial/history/expenses', label: 'Expenses' },
      { path: '/dashboard/financial/liquidity', label: 'Liquidity' },
      { path: '/dashboard/financial/log-validity', label: 'Log Validity' },
    ],
  },
  {
    title: 'Other',
    pages: [
      { path: '/sepa', label: 'SEPA' },
      { path: '/sepa/manual', label: 'SEPA Manual' },
      { path: '/stickers', label: 'Stickers' },
      { path: '/safe', label: 'Safe' },
      { path: '/recommendation', label: 'Recommendation' },
    ],
  },
  {
    title: 'Admin',
    pages: [{ path: '/sitemap', label: 'Sitemap' }],
  },
];

export default function SitemapScreen(): JSX.Element {
  useAdminGuard();
  useLayoutOptions({ title: 'Sitemap', backButton: true, noMaxWidth: true });
  const { search } = useLocation();
  const personalIbanParams = personalIbanOnlyParams(search);

  return (
    <StyledVerticalStack gap={6} full>
      <div className="w-full grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <div key={section.title} className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-dfxBlue-800 font-semibold text-base mb-3">{section.title}</h2>
            <ul className="space-y-1">
              {section.pages.map((page) => (
                <li key={page.path}>
                  <Link
                    to={relativeUrl({ path: page.path, params: personalIbanParams })}
                    className="block text-sm text-dfxBlue-400 hover:text-dfxBlue-800 hover:underline"
                  >
                    {page.label} <span className="text-dfxGray-700">({page.path})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </StyledVerticalStack>
  );
}
