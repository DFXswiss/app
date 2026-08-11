import { StyledVerticalStack } from '@dfx.swiss/react-components';
import { useLocation } from 'react-router-dom';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useComplianceGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';

// Catch-all for every unknown path below /compliance. Without it such a URL matches no route at all,
// so the router falls back to its errorElement — a screen that runs outside every guard and leaves the
// address bar untouched, which parks an unauthorised role on a /compliance URL (issue #1306). Guarding
// the catch-all makes the role check independent of whether a given compliance screen exists.
export default function ComplianceNotFoundScreen(): JSX.Element {
  useComplianceGuard();
  useLayoutOptions({ title: 'Not found', backButton: true });

  const { translate } = useSettingsContext();
  const { pathname } = useLocation();

  return (
    <StyledVerticalStack gap={4} full center>
      <h2 className="text-dfxBlue-800">{translate('screens/compliance', 'This compliance page does not exist')}</h2>
      <p className="text-dfxGray-700 text-sm">{pathname}</p>
    </StyledVerticalStack>
  );
}
