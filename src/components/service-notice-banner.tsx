import { IconColor, StyledInfoText, StyledInfoTextSize } from '@dfx.swiss/react-components';
import { Link, useLocation } from 'react-router-dom';
import { FeatureFlags } from '../config/feature-flags';
import { useSettingsContext } from '../contexts/settings.context';

// Sell and swap pages show the prominent variant; every other page shows the slim one.
const PROMINENT_PATHS = /^\/(sell|swap)\/?$/;
// The buy page shows its payment details below the notice, so the slim notice there adds that buying still works.
const BUY_PATH = /^\/buy\/?$/;

// Questions about the notice go to the support tickets, never to an email address.
function SupportTicketHint(): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <>
      {' '}
      {translate('components/service-notice', 'Questions:')}{' '}
      <Link to="/support/tickets" className="underline">
        {translate('components/service-notice', 'Open a support ticket')}
      </Link>
    </>
  );
}

// Service notice shown on every page while FeatureFlags.serviceNotice is on. It cannot be
// dismissed, so it is back after every reload.
export function ServiceNoticeBanner(): JSX.Element | null {
  const { translate } = useSettingsContext();
  const { pathname } = useLocation();

  if (!FeatureFlags.serviceNotice) return null;

  return PROMINENT_PATHS.test(pathname) ? (
    <div
      role="alert"
      data-testid="service-notice-banner"
      data-variant="prominent"
      className="w-full rounded-lg border-2 border-dfxRed-100 p-3 text-left"
    >
      <StyledInfoText iconColor={IconColor.RED}>
        {translate(
          'components/service-notice',
          'Due to a security incident affecting DFX deposit addresses, selling and swapping are temporarily unavailable. Customer data and customer funds are not affected. All customer data and customer funds are safe and will be processed as quickly as possible. Do not send crypto tokens to any deposit address you received from DFX before 18 November 2026 — these addresses must no longer be used.',
        )}
        <SupportTicketHint />
      </StyledInfoText>
    </div>
  ) : (
    <div
      role="note"
      data-testid="service-notice-banner"
      data-variant="slim"
      className="w-full rounded-md border border-dfxGray-400 bg-dfxGray-300 px-3 py-1.5 text-left"
    >
      <StyledInfoText iconColor={IconColor.DARK_GRAY} textSize={StyledInfoTextSize.XS}>
        {translate(
          'components/service-notice',
          'Due to a security incident affecting DFX deposit addresses, selling is temporarily unavailable. Customer data and customer funds are not affected. All customer data and customer funds are safe and will be processed as quickly as possible. Do not send crypto tokens to deposit addresses you received from DFX before 18 November 2026.',
        )}
        {BUY_PATH.test(pathname) &&
          ` ${translate('components/service-notice', 'Buying works as usual; just follow the details below.')}`}
        <SupportTicketHint />
      </StyledInfoText>
    </div>
  );
}
