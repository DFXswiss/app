import PartnerDashboardApp from './partner-dashboard/App';
import { PartnerErrorBoundary } from './partner-dashboard/components/error-boundary';
import { isFixtureMode } from './partner-dashboard/util/format';

/**
 * Partner-dashboard build target entry shell.
 *
 * Fixture mode deliberately skips DfxContextProvider: that provider bootstraps
 * language/fiat/asset/settings against the API and would crash the page when the
 * API URL is missing or unreachable — the fixture path must run without a backend.
 *
 * Non-fixture mode also avoids DfxContextProvider; the partner hook uses a
 * standalone fetch with the stored session token. An ErrorBoundary keeps any
 * unexpected render failure from blanking the whole page.
 */
function MainPartner() {
  const fixture = isFixtureMode();

  return (
    <PartnerErrorBoundary>
      <div data-testid="partner-shell" data-fixture={fixture ? 'true' : 'false'}>
        <PartnerDashboardApp />
      </div>
    </PartnerErrorBoundary>
  );
}

export default MainPartner;
