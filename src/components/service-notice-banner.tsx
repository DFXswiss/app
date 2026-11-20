import { IconColor, StyledInfoText, StyledInfoTextSize } from '@dfx.swiss/react-components';
import { useLocation } from 'react-router-dom';
import { FeatureFlags } from '../config/feature-flags';
import { useSettingsContext } from '../contexts/settings.context';

// Sell and swap send crypto to a deposit address, so these pages show the prominent variant; every other page
// shows the slim one. Both variants show the same text.
const PROMINENT_PATHS = /^\/(sell|swap)\/?$/;

// Report on the security incident of 18 November 2026 on the DFX website, in German and English.
export const SECURITY_INCIDENT_URL = 'https://dfx.swiss/security-incident.html';

function NoticeText(): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <>
      {translate(
        'components/service-notice',
        'All DFX core features are available again. Do not send crypto tokens to deposit addresses you received from DFX before 18 November 2026.',
      )}{' '}
      <a href={SECURITY_INCIDENT_URL} target="_blank" rel="noopener noreferrer" className="underline">
        {translate('components/service-notice', 'More')}
      </a>
    </>
  );
}

// Service notice shown on every page while FeatureFlags.serviceNotice is on. It cannot be
// dismissed, so it is back after every reload.
export function ServiceNoticeBanner(): JSX.Element | null {
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
        <NoticeText />
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
        <NoticeText />
      </StyledInfoText>
    </div>
  );
}
