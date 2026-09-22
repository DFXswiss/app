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
import {
  callbackDeadline,
  callQueueLabel,
  CallQueueItemWithStatusDate,
  isPastDeadline,
} from 'src/util/call-queue.util';
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
  const [items, setItems] = useState<CallQueueItemWithStatusDate[]>([]);

  // Every queue lists transactions. The Callback queue adds the account status, when the clerk marked
  // it and how long the customer still has to call back; the IP queues add the IP.
  const isCallback = queue === CallQueue.UNAVAILABLE_SUSPICIOUS;
  const showIp = queue === CallQueue.MANUAL_CHECK_IP_PHONE || queue === CallQueue.MANUAL_CHECK_IP_COUNTRY_PHONE;
  const showCountry = queue === CallQueue.MANUAL_CHECK_IP_COUNTRY_PHONE || isCallback;

  // User, Phone, Lang, KYC, Transaction, Date, plus the optional columns (Status, Marked, Deadline for Callback)
  const columnCount = 6 + (showIp ? 1 : 0) + (showCountry ? 1 : 0) + (isCallback ? 3 : 0);

  useEffect(() => {
    if (!isLoggedIn || !queue) return;
    // The route can move to another queue while a load is in flight (same screen instance); a response
    // for the queue shown before must not land on the one shown now.
    let current = true;
    setIsLoading(true);
    setError(undefined);
    setItems([]);
    getCallQueueItems(queue)
      .then((loaded) => {
        if (current) setItems(loaded);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setIsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [isLoggedIn, queue]);

  // Rows exist only for a known queue (see the guard on render), so `queue` is set here.
  function openDetail(item: CallQueueItem) {
    const search = item.txId != null ? `?txId=${item.txId}` : '';
    navigate(
      { pathname: `/compliance/call-queues/${queue}/${item.userDataId}`, search },
      { clearParams: ['status', 'search'] },
    );
  }

  useLayoutOptions({
    title: queue ? callQueueLabel(queue) : translate('screens/compliance', 'Call Queue'),
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
              <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                {translate('screens/compliance', 'Transaction')}
              </th>
              {showIp && <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">IP</th>}
              {showCountry && (
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Country')}
                </th>
              )}
              {isCallback && (
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Status')}
                </th>
              )}
              {isCallback && (
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Marked')}
                </th>
              )}
              {isCallback && (
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Deadline')}
                </th>
              )}
              <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                {translate('screens/compliance', 'Date')}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((item) => {
                const deadline = isCallback ? callbackDeadline(item) : undefined;
                return (
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
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {item.txId ? `${item.sourceType} #${item.txId}` : '-'}
                      {item.inputAmount != null && ` (${item.inputAmount} ${item.inputAsset ?? ''})`}
                      {isCallback && item.amlCheck && ` · ${item.amlCheck}`}
                    </td>
                    {showIp && <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{item.ip ?? '-'}</td>}
                    {showCountry && (
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                        {item.country ?? '-'}
                        {item.ipCountry && item.ipCountry !== item.country ? ` / IP: ${item.ipCountry}` : ''}
                      </td>
                    )}
                    {isCallback && (
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{item.phoneCallStatus ?? '-'}</td>
                    )}
                    {isCallback && (
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                        {item.phoneCallStatusDate ? formatSwissDate(item.phoneCallStatusDate) : '-'}
                      </td>
                    )}
                    {isCallback && (
                      <td
                        className={`px-4 py-3 text-left text-sm ${
                          isPastDeadline(deadline) ? 'text-dfxRed-100 font-semibold' : 'text-dfxBlue-800'
                        }`}
                      >
                        {deadline ? formatSwissDate(deadline) : '-'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{formatSwissDate(item.date)}</td>
                  </tr>
                );
              })
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
