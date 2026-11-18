import { IconColor, StyledInfoText, StyledInfoTextSize } from '@dfx.swiss/react-components';
import { useLocation } from 'react-router-dom';
import { useSettingsContext } from '../contexts/settings.context';

// Sell and swap pages show the prominent variant; every other page shows the slim one.
const PROMINENT_PATHS = /^\/(sell|swap)\/?$/;

// Service notice shown on every page. It cannot be dismissed, so it is back after every reload.
export function ServiceNoticeBanner(): JSX.Element {
  const { translate } = useSettingsContext();
  const { pathname } = useLocation();

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
          'Selling and swapping are temporarily unavailable. Do not send funds to any deposit address you received from DFX before 18 November 2026 — these addresses must no longer be used.',
        )}
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
          'Selling is temporarily unavailable. Do not send funds to deposit addresses you received from DFX before 18 November 2026.',
        )}
      </StyledInfoText>
    </div>
  );
}
