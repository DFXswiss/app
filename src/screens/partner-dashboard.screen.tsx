import { usePartnerDashboardGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import PartnerDashboardView from 'src/partner-dashboard/App';

/**
 * Partner dashboard as a main-app screen — role guard first, then layout frame,
 * then the presentation view.
 *
 * No layout `title`: the dashboard header owns the page title (program kicker +
 * h1). Passing a title here would stack a second headline under the app bar.
 * `backButton: false` keeps the burger/menu chrome; `noMaxWidth` + `noPadding`
 * let the dashboard’s own `max-w-7xl` container and padding own the frame
 * (same idea as Support Dashboard full-bleed tools).
 *
 * Route: `/partner/dashboard` (mirrors `/support/dashboard` staff-tool path shape).
 */
export default function PartnerDashboardScreen(): JSX.Element {
  usePartnerDashboardGuard();

  useLayoutOptions({
    backButton: false,
    noMaxWidth: true,
    noPadding: true,
  });

  return <PartnerDashboardView />;
}
