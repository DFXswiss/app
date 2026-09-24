import { useAuthContext, UserRole } from '@dfx.swiss/react';
import { NavLink } from 'react-router-dom';
import { useSettingsContext } from 'src/contexts/settings.context';

const WIDE_ROLES = [UserRole.ADMIN, UserRole.REALUNIT, UserRole.COMPLIANCE];
// Same set as REALUNIT_QUOTES_ROLES. Not imported from the guard hook: that hook
// pulls the wallet context, which this nav does not need.
const QUOTES_ROLES = [UserRole.ADMIN, UserRole.REALUNIT, UserRole.COMPLIANCE, UserRole.SUPPORT];

function navClass({ isActive }: { isActive: boolean }): string {
  return `shrink-0 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 ${
    isActive
      ? 'border-dfxBlue-800 text-dfxBlue-800 font-semibold'
      : 'border-transparent text-dfxGray-700 hover:text-dfxBlue-800'
  }`;
}

export function RealunitSectionNav(): JSX.Element {
  const { translate } = useSettingsContext();
  const { session } = useAuthContext();
  const role = session?.role;
  const wide = role != null && WIDE_ROLES.includes(role);
  const quotes = role != null && QUOTES_ROLES.includes(role);

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-dfxGray-400">
      {wide && (
        <NavLink to="/realunit" end className={navClass}>
          {translate('screens/realunit', 'Overview')}
        </NavLink>
      )}
      {wide && (
        <NavLink to="/realunit/treasury" className={navClass}>
          {translate('screens/realunit', 'Treasury')}
        </NavLink>
      )}
      {wide && (
        <NavLink to="/realunit/insights" className={navClass}>
          {translate('screens/realunit', 'Insights')}
        </NavLink>
      )}
      {wide && (
        <NavLink to="/realunit/holders" className={navClass}>
          {translate('screens/realunit', 'Holders')}
        </NavLink>
      )}
      {quotes && (
        <NavLink to="/realunit/quotes" className={navClass}>
          {translate('screens/realunit', 'Pending Transactions')}
        </NavLink>
      )}
      {wide && (
        <NavLink to="/realunit/transactions" className={navClass}>
          {translate('screens/realunit', 'Received Transactions')}
        </NavLink>
      )}
      {wide && <div aria-hidden className="w-px self-center h-4 bg-dfxGray-400 mx-1" />}
      {wide && (
        <NavLink to="/realunit/support" className={navClass}>
          {translate('screens/support', 'RealUnit Support')}
        </NavLink>
      )}
      {wide && (
        <NavLink to="/realunit/compliance" className={navClass}>
          {translate('screens/compliance', 'RealUnit Compliance')}
        </NavLink>
      )}
      {wide && (
        <NavLink to="/realunit/referral" className={navClass}>
          {translate('screens/referral', 'RealUnit Referral')}
        </NavLink>
      )}
    </nav>
  );
}
