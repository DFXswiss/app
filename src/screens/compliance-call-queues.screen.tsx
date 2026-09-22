import { useSessionContext } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useEffect, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { useSettingsContext } from 'src/contexts/settings.context';
import { CallQueueSummaryEntry } from '@dfx.swiss/react';
import { useCompliance } from 'src/hooks/compliance.hook';
import { useComplianceGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { callQueueLabel } from 'src/util/call-queue.util';

export default function ComplianceCallQueuesScreen(): JSX.Element {
  useComplianceGuard();

  const { translate } = useSettingsContext();
  const { getCallQueues } = useCompliance();
  const { navigate } = useNavigation();
  const { isLoggedIn } = useSessionContext();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [queues, setQueues] = useState<CallQueueSummaryEntry[]>([]);

  useEffect(() => {
    if (!isLoggedIn) return;

    getCallQueues()
      .then(setQueues)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [isLoggedIn]);

  useLayoutOptions({ title: translate('screens/compliance', 'Call Queues') });

  if (isLoading) {
    return <StyledLoadingSpinner size={SpinnerSize.LG} />;
  }

  if (error) {
    return <ErrorHint message={error} />;
  }

  return (
    <StyledVerticalStack gap={6} full>
      <div className="w-full overflow-x-auto">
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
            {queues.length > 0 ? (
              queues.map((q) => (
                <tr
                  key={q.queue}
                  data-queue={q.queue}
                  className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300 cursor-pointer"
                  onClick={() => navigate(`compliance/call-queues/${q.queue}`)}
                >
                  <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{callQueueLabel(q.queue)}</td>
                  <td className="px-4 py-3 text-right text-sm text-dfxBlue-800 font-semibold">{q.count}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="px-4 py-3 text-center text-dfxGray-700">
                  {translate('screens/compliance', 'No entries found')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </StyledVerticalStack>
  );
}
