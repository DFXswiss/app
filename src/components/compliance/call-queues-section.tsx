import { useSettingsContext } from 'src/contexts/settings.context';
import { CallQueueSummaryEntry } from '@dfx.swiss/react';
import { useNavigation } from 'src/hooks/navigation.hook';
import { callQueueLabel } from 'src/util/call-queue.util';
import { CollapsibleSection } from './collapsible-section';

interface Props {
  entries: CallQueueSummaryEntry[];
}

export function CallQueuesSection({ entries }: Props): JSX.Element | null {
  const { translate } = useSettingsContext();
  const { navigate } = useNavigation();

  const visible = entries.filter((q) => q.count > 0);
  if (visible.length === 0) return null;

  const total = visible.reduce((sum, q) => sum + q.count, 0);

  return (
    <CollapsibleSection title={translate('screens/compliance', 'Call Queues')} count={total}>
      <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
        <thead>
          <tr className="bg-dfxGray-300">
            <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
              {translate('screens/compliance', 'Queue')}
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-dfxBlue-800">
              {translate('screens/compliance', 'Count')}
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((q) => (
            <tr
              key={q.queue}
              className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300 cursor-pointer"
              onClick={() => navigate(`compliance/call-queues/${q.queue}`)}
            >
              <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{callQueueLabel(q.queue)}</td>
              <td className="px-4 py-3 text-right text-sm text-dfxBlue-800 font-semibold">{q.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CollapsibleSection>
  );
}
