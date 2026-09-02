import { useSessionContext } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ErrorHint } from 'src/components/error-hint';
import { useSettingsContext } from 'src/contexts/settings.context';
import { CallQueue, CallQueueItem } from '@dfx.swiss/react';
import { useCompliance } from 'src/hooks/compliance.hook';
import { useComplianceGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { formatSwissDate } from 'src/util/utils';

function isCallQueue(value: string | undefined): value is CallQueue {
  return value != null && (Object.values(CallQueue) as string[]).includes(value);
}

export default function ComplianceCallQueueScreen(): JSX.Element {
  useComplianceGuard();

  const { translate } = useSettingsContext();
  const { getCallQueueItems } = useCompliance();
  const { navigate } = useNavigation();
  const { isLoggedIn } = useSessionContext();
  const { queue: queueParam } = useParams<{ queue: string }>();
  const queue = isCallQueue(queueParam) ? queueParam : undefined;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [items, setItems] = useState<CallQueueItem[]>([]);

  const isTxQueue = queue !== undefined && queue !== CallQueue.UNAVAILABLE_SUSPICIOUS;
  const showIp = queue === CallQueue.MANUAL_CHECK_IP_PHONE || queue === CallQueue.MANUAL_CHECK_IP_COUNTRY_PHONE;
  const showCountry = queue === CallQueue.MANUAL_CHECK_IP_COUNTRY_PHONE || queue === CallQueue.UNAVAILABLE_SUSPICIOUS;
  const showStatus = queue === CallQueue.UNAVAILABLE_SUSPICIOUS;
  // Preferred phone-call time is only relevant where a call is scheduled from the customer's own
  // phone details: the plain phone queue and the IP+country phone queue.
  const showPhoneCallTimes =
    queue === CallQueue.MANUAL_CHECK_PHONE || queue === CallQueue.MANUAL_CHECK_IP_COUNTRY_PHONE;

  const columnCount = 5 + [isTxQueue, showIp, showCountry, showStatus, showPhoneCallTimes].filter(Boolean).length;

  useEffect(() => {
    if (!isLoggedIn || !queue) return;
    setIsLoading(true);
    getCallQueueItems(queue)
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [isLoggedIn, queue]);

  function openDetail(item: CallQueueItem) {
    if (!queue) return;
    const search = item.txId != null ? `?txId=${item.txId}` : '';
    navigate(
      { pathname: `/compliance/call-queues/${queue}/${item.userDataId}`, search },
      { clearParams: ['status', 'search'] },
    );
  }

  useLayoutOptions({
    title: queue ?? translate('screens/compliance', 'Call Queue'),
    noMaxWidth: true,
    backButton: true,
    onBack: () => navigate(-1),
  });

  if (!queue) return <ErrorHint message={`Unknown call queue: ${queueParam}`} />;
  if (isLoading) return <StyledLoadingSpinner size={SpinnerSize.LG} />;
  if (error) return <ErrorHint message={error} />;

  return (
    <StyledVerticalStack gap={6} full>
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
          <thead>
            <tr className="bg-dfxGray-300">
              <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                {translate('screens/compliance', 'User')}
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                {translate('screens/compliance', 'Phone')}
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                {translate('screens/compliance', 'Lang')}
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">KYC</th>
              {isTxQueue && (
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Transaction')}
                </th>
              )}
              {showIp && <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">IP</th>}
              {showCountry && (
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Country')}
                </th>
              )}
              {showStatus && (
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Status')}
                </th>
              )}
              {showPhoneCallTimes && (
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Phone Call Times')}
                </th>
              )}
              <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                {translate('screens/compliance', 'Date')}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((item) => (
                <tr
                  key={itemKey(item)}
                  className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300 cursor-pointer"
                  onClick={() => openDetail(item)}
                >
                  <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                    {item.userDataId} {item.userName ?? ''}
                  </td>
                  <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{item.phone ?? '-'}</td>
                  <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{item.language ?? '-'}</td>
                  <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{item.kycLevel ?? '-'}</td>
                  {isTxQueue && (
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {item.txId ? `${item.sourceType} #${item.txId}` : '-'}
                      {item.inputAmount != null && ` (${item.inputAmount} ${item.inputAsset ?? ''})`}
                    </td>
                  )}
                  {showIp && <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{item.ip ?? '-'}</td>}
                  {showCountry && (
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {item.country ?? '-'}
                      {item.ipCountry && item.ipCountry !== item.country ? ` / IP: ${item.ipCountry}` : ''}
                    </td>
                  )}
                  {showStatus && (
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{item.phoneCallStatus ?? '-'}</td>
                  )}
                  {showPhoneCallTimes && (
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{item.phoneCallTimes || '-'}</td>
                  )}
                  <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{formatSwissDate(item.date)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columnCount} className="px-4 py-3 text-center text-dfxGray-700">
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

function itemKey(item: CallQueueItem): string {
  return item.txId ? `tx-${item.sourceType}-${item.txId}` : `ud-${item.userDataId}`;
}
