import { CustodyOrderStatus, CustodyOrderType, useSessionContext } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useCallback, useEffect, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { CustodyOrderListEntry } from 'src/dto/order.dto';
import { useCompliance } from 'src/hooks/compliance.hook';
import { useAdminGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { formatSwissDateTime } from 'src/util/utils';

function formatTransfer(entry: CustodyOrderListEntry): string {
  const input = entry.inputAmount != null && entry.inputAsset ? `${entry.inputAmount} ${entry.inputAsset}` : undefined;
  const output =
    entry.outputAmount != null && entry.outputAsset ? `${entry.outputAmount} ${entry.outputAsset}` : undefined;

  if (input && output) return `${output} → ${input}`;
  return input ?? output ?? '-';
}

const statusClasses: Record<CustodyOrderStatus, string> = {
  [CustodyOrderStatus.CREATED]: 'bg-dfxGray-400 text-dfxBlue-800',
  [CustodyOrderStatus.CONFIRMED]: 'bg-dfxRed-100/20 text-dfxRed-100',
  [CustodyOrderStatus.APPROVED]: 'bg-dfxBlue-300/20 text-dfxBlue-400',
  [CustodyOrderStatus.IN_PROGRESS]: 'bg-dfxRedBlue-300/20 text-dfxRedBlue-200',
  [CustodyOrderStatus.COMPLETED]: 'bg-dfxGreen-100/20 text-dfxGreen-300',
  [CustodyOrderStatus.FAILED]: 'bg-dfxRed-100/20 text-dfxRed-100',
};

function statusBadge(status: CustodyOrderStatus): JSX.Element {
  const classes = statusClasses[status] ?? 'bg-dfxGray-400 text-dfxBlue-800';

  return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${classes}`}>{status}</span>;
}

function canApprove(entry: CustodyOrderListEntry): boolean {
  return (
    entry.status === CustodyOrderStatus.CONFIRMED &&
    entry.type !== CustodyOrderType.DEPOSIT &&
    entry.type !== CustodyOrderType.RECEIVE
  );
}

export default function ComplianceCustodyOrdersScreen(): JSX.Element {
  useAdminGuard();
  useLayoutOptions({ title: 'Custody Orders', backButton: true, noMaxWidth: true });

  const { isLoggedIn } = useSessionContext();
  const { getCustodyOrders, approveCustodyOrder } = useCompliance();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [data, setData] = useState<CustodyOrderListEntry[]>([]);
  const [approvingId, setApprovingId] = useState<number>();

  const loadData = useCallback(() => {
    if (!isLoggedIn) return;

    setIsLoading(true);
    setError(undefined);

    getCustodyOrders()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [isLoggedIn, getCustodyOrders]);

  useEffect(() => {
    loadData();
  }, [isLoggedIn]);

  async function handleApprove(id: number): Promise<void> {
    setApprovingId(id);
    setError(undefined);

    try {
      await approveCustodyOrder(id);
      loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApprovingId(undefined);
    }
  }

  function formatDate(date: Date): string {
    return formatSwissDateTime(date);
  }

  return (
    <StyledVerticalStack gap={6} full>
      {error && <ErrorHint message={error} />}

      {isLoading && data.length === 0 ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
            <thead>
              <tr className="bg-dfxGray-300">
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Type</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Transfer</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-dfxBlue-800">UserData ID</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">User Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Updated</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.length > 0 ? (
                data.map((entry) => (
                  <tr key={entry.id} className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{entry.type}</td>
                    <td className="px-4 py-3 text-left text-sm">{statusBadge(entry.status)}</td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{formatTransfer(entry)}</td>
                    <td className="px-4 py-3 text-right text-sm text-dfxBlue-800">{entry.userDataId}</td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{entry.userName}</td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{formatDate(entry.updated)}</td>
                    <td className="px-4 py-3 text-left text-sm">
                      {canApprove(entry) && (
                        <button
                          className="px-3 py-1 text-sm text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded-lg transition-colors disabled:opacity-50"
                          onClick={() => handleApprove(entry.id)}
                          disabled={approvingId != null}
                        >
                          {approvingId === entry.id ? 'Approving...' : 'Approve'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-3 text-center text-dfxGray-700">
                    No orders found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </StyledVerticalStack>
  );
}
