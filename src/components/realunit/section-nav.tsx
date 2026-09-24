import { NavLink } from 'react-router-dom';
import { useSettingsContext } from 'src/contexts/settings.context';

function navClass({ isActive }: { isActive: boolean }): string {
  return `shrink-0 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 ${
    isActive
      ? 'border-dfxBlue-800 text-dfxBlue-800 font-semibold'
      : 'border-transparent text-dfxGray-700 hover:text-dfxBlue-800'
  }`;
}

export function RealunitSectionNav(): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-dfxGray-400">
      <NavLink to="/realunit" end className={navClass}>
        {translate('screens/realunit', 'Overview')}
      </NavLink>
      <NavLink to="/realunit/treasury" className={navClass}>
        {translate('screens/realunit', 'Treasury')}
      </NavLink>
      <NavLink to="/realunit/insights" className={navClass}>
        {translate('screens/realunit', 'Insights')}
      </NavLink>
      <NavLink to="/realunit/holders" className={navClass}>
        {translate('screens/realunit', 'Holders')}
      </NavLink>
      <NavLink to="/realunit/quotes" className={navClass}>
        {translate('screens/realunit', 'Pending Transactions')}
      </NavLink>
      <NavLink to="/realunit/transactions" className={navClass}>
        {translate('screens/realunit', 'Received Transactions')}
      </NavLink>
      <div aria-hidden className="w-px self-center h-4 bg-dfxGray-400 mx-1" />
      <NavLink to="/realunit/support" className={navClass}>
        {translate('screens/support', 'RealUnit Support')}
      </NavLink>
      <NavLink to="/realunit/compliance" className={navClass}>
        {translate('screens/compliance', 'RealUnit Compliance')}
      </NavLink>
      <NavLink to="/realunit/referral" className={navClass}>
        {translate('screens/referral', 'RealUnit Referral')}
      </NavLink>
    </nav>
  );
}
