import { useSessionContext } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useCallback, useEffect, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { ChargebackBlockReason, PendingChargebackEntry } from 'src/dto/chargeback.dto';
import { useCompliance } from 'src/hooks/compliance.hook';
import { useComplianceGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { formatSwissDateTime } from 'src/util/utils';

export default function ComplianceChargebackListScreen(): JSX.Element {
  useComplianceGuard();
  useLayoutOptions({ title: 'Pending Chargebacks', backButton: true, noMaxWidth: true });

  const { isLoggedIn } = useSessionContext();
  const { getPendingChargebacks } = useCompliance();
  const { navigate } = useNavigation();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [data, setData] = useState<PendingChargebackEntry[]>([]);

  const loadData = useCallback(() => {
    if (!isLoggedIn) return;

    setIsLoading(true);
    setError(undefined);

    getPendingChargebacks()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [isLoggedIn, getPendingChargebacks]);

  useEffect(() => {
    loadData();
  }, [isLoggedIn]);

  function formatDate(date: Date): string {
    return formatSwissDateTime(date);
  }

  function formatAmount(amount?: number, asset?: string): string {
    if (amount == null) return '-';
    return `${amount} ${asset ?? ''}`.trim();
  }

  function txReference(entry: PendingChargebackEntry): string {
    if (entry.uid) return entry.uid;
    return String(entry.txId);
  }

  function hasBlockReason(entry: PendingChargebackEntry, reason: ChargebackBlockReason): boolean {
    return entry.blockReasons.includes(reason);
  }

  function rowClassName(entry: PendingChargebackEntry): string {
    const base = 'border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300 cursor-pointer';
    // Safety sentinel: chargebackDate must be empty in this backlog; surface API exclusion loss.
    if (entry.chargebackDate) return `${base} bg-dfxRed-100/20`;
    // Customer not released / risk-flagged — must not be waved through casually.
    if (hasBlockReason(entry, ChargebackBlockReason.USER_NOT_RELEASED)) return `${base} bg-dfxYellow-500/20`;
    return base;
  }

  function blockReasonBadge(reason: ChargebackBlockReason): JSX.Element {
    const isUserNotReleased = reason === ChargebackBlockReason.USER_NOT_RELEASED;
    const classes = isUserNotReleased
      ? 'bg-dfxGray-300 text-primary-red'
      : 'bg-dfxGray-300 text-dfxBlue-800';
    return (
      <span key={reason} className={`px-2 py-1 rounded text-xs font-semibold ${classes}`}>
        {reason}
      </span>
    );
  }

  return (
    <StyledVerticalStack gap={6} full>
      {isLoading && data.length === 0 ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : error ? (
        <ErrorHint message={error} />
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
            <thead>
              <tr className="bg-dfxGray-300">
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Requested</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Transaction</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Customer</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-dfxBlue-800">Input</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-dfxBlue-800">Chargeback</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Block reasons</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Names</th>
              </tr>
            </thead>
            <tbody>
              {data.length > 0 ? (
                data.map((entry) => {
                  const showNames = hasBlockReason(entry, ChargebackBlockReason.NAME_MISMATCH);
                  return (
                    <tr
                      key={`${entry.sourceType}-${entry.entityId}-${entry.txId}`}
                      className={rowClassName(entry)}
                      onClick={() => navigate(`compliance/bank-tx/${entry.txId}/return`)}
                    >
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                        {formatDate(entry.requestedDate)}
                      </td>
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                        {txReference(entry)}
                        {entry.chargebackDate ? (
                          <span className="ml-2 px-2 py-1 rounded text-xs font-semibold bg-dfxRed-100/20 text-dfxRed-150">
                            ERROR: chargebackDate set
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{entry.userName ?? '-'}</td>
                      <td className="px-4 py-3 text-right text-sm text-dfxBlue-800">
                        {formatAmount(entry.inputAmount, entry.inputAsset)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-dfxBlue-800">
                        {formatAmount(entry.chargebackAmount, entry.chargebackAsset)}
                      </td>
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                        {entry.blockReasons.length > 0 ? (
                          <div className="flex flex-wrap gap-1">{entry.blockReasons.map(blockReasonBadge)}</div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                        {showNames ? (
                          <div className="flex gap-3 whitespace-nowrap">
                            <span>
                              <span className="text-dfxGray-700">verified: </span>
                              {entry.verifiedName ?? '-'}
                            </span>
                            <span>
                              <span className="text-dfxGray-700">complete: </span>
                              {entry.completeName ?? '-'}
                            </span>
                            <span>
                              <span className="text-dfxGray-700">creditor: </span>
                              {entry.creditorName ?? '-'}
                            </span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-3 text-center text-dfxGray-700">
                    No pending chargebacks found
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
