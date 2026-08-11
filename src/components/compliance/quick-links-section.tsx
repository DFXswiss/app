import { useSettingsContext } from 'src/contexts/settings.context';
import { useNavigation } from 'src/hooks/navigation.hook';
import { todayAsString } from 'src/util/compliance-helpers';

interface QuickLink {
  label: string;
  path: string;
}

export function QuickLinksSection(): JSX.Element {
  const { translate } = useSettingsContext();
  const { navigate } = useNavigation();

  const links: QuickLink[] = [
    { label: 'Aktennotiz erstellen', path: `kyc/log?eventDate=${todayAsString()}` },
    { label: 'Unzugeordnete Bankeingänge', path: 'compliance/bank-tx/unassigned' },
  ];

  return (
    <div className="w-full">
      <h2 className="text-dfxGray-700 flex items-center justify-center gap-2 select-none">
        {translate('screens/compliance', 'Quick links')}
      </h2>
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
          <tbody>
            {links.map((link) => (
              <tr
                key={link.path}
                className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300 cursor-pointer"
                onClick={() => navigate(link.path)}
              >
                <td className="px-4 py-3 text-left text-sm text-dfxBlue-300 underline">{link.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
