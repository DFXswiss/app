import { IconColor, StyledInfoText, StyledInfoTextSize } from '@dfx.swiss/react-components';
import { useLocation } from 'react-router-dom';
import { FeatureFlags } from '../config/feature-flags';
import { useSettingsContext } from '../contexts/settings.context';

// Sell and swap send crypto to a deposit address, so only these pages show the notice.
const NOTICE_PATHS = /^\/(sell|swap)\/?$/;

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

// Service notice shown on /sell and /swap while FeatureFlags.serviceNotice is on. It cannot be
// dismissed, so it is back after every reload.
export function ServiceNoticeBanner(): JSX.Element | null {
  const { pathname } = useLocation();

  if (!FeatureFlags.serviceNotice || !NOTICE_PATHS.test(pathname)) return null;

  return (
    <div
      role="note"
      data-testid="service-notice-banner"
      className="w-full rounded-md border border-dfxGray-400 bg-dfxGray-300 px-3 py-1.5 text-left"
    >
      <StyledInfoText iconColor={IconColor.DARK_GRAY} textSize={StyledInfoTextSize.XS}>
        <NoticeText />
      </StyledInfoText>
    </div>
  );
}
