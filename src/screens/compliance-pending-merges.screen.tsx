import { useSessionContext } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useCallback, useEffect, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { PendingMergeAccount, PendingMergeEntry } from 'src/dto/account-merge.dto';
import { useCompliance } from 'src/hooks/compliance.hook';
import { useComplianceGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { formatSwissDateTime } from 'src/util/utils';

export default function CompliancePendingMergesScreen(): JSX.Element {
  useComplianceGuard();
  useLayoutOptions({ title: 'Pending Merges', backButton: true, noMaxWidth: true });

  const { isLoggedIn } = useSessionContext();
  const { getPendingMerges } = useCompliance();
  const { navigate } = useNavigation();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [data, setData] = useState<PendingMergeEntry[]>([]);

  const loadData = useCallback(() => {
    if (!isLoggedIn) return;

    setIsLoading(true);
    setError(undefined);

    getPendingMerges()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [isLoggedIn, getPendingMerges]);

  useEffect(() => {
    loadData();
  }, [isLoggedIn]);

  function accountCell(account: PendingMergeAccount): JSX.Element {
    return (
      <button
        type="button"
        className="text-left text-sm text-dfxBlue-800 hover:underline"
        onClick={() => navigate(`compliance/user/${account.userDataId}`)}
      >
        #{account.userDataId}
      </button>
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
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Expires</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Reason</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Master account</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Slave account</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.length > 0 ? (
                data.map((entry) => (
                  <tr key={entry.id} className="border-b border-dfxGray-300">
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {formatSwissDateTime(entry.requestedDate)}
                    </td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {formatSwissDateTime(entry.expiration)}
                    </td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{entry.reason ?? '-'}</td>
                    <td className="px-4 py-3 text-left">{accountCell(entry.master)}</td>
                    <td className="px-4 py-3 text-left">{accountCell(entry.slave)}</td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {entry.isProcessing ? 'Processing' : 'Waiting for confirmation'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-center text-dfxGray-700">
                    No pending merges found
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
