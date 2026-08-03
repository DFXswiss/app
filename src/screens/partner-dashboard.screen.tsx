import { usePartnerDashboardGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useSettingsContext } from 'src/contexts/settings.context';
import PartnerDashboardView from 'src/partner-dashboard/App';

/**
 * Partner dashboard as a main-app screen — same pattern as Support Dashboard:
 * role guard first, then layout title, then the presentation view.
 *
 * Route: `/partner/dashboard` (mirrors `/support/dashboard` staff-tool path shape).
 */
export default function PartnerDashboardScreen(): JSX.Element {
  usePartnerDashboardGuard();

  const { translate } = useSettingsContext();

  useLayoutOptions({
    title: translate('screens/partner', 'Partner Dashboard'),
    backButton: false,
    noMaxWidth: true,
    noPadding: true,
  });

  return <PartnerDashboardView />;
}
