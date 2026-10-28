import {
  CopyButton,
  IconColor,
  SpinnerSize,
  StyledButton,
  StyledButtonWidth,
  StyledLoadingSpinner,
} from '@dfx.swiss/react-components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsContext } from 'src/contexts/settings.context';
import { AdminHolder, HolderRegistration, PageInfo, PaginationDirection } from 'src/dto/realunit.dto';
import { useClipboard } from 'src/hooks/clipboard.hook';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { useRealunitApi } from 'src/hooks/realunit-api.hook';
import { blankedAddress } from 'src/util/utils';

const emptyPageInfo: PageInfo = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: '',
  endCursor: '',
};

export default function RealunitHoldersScreen(): JSX.Element {
  useRealunitGuard();

  const { translate } = useSettingsContext();
  const { navigate } = useNavigation();
  const { copy } = useClipboard();
  const { getAdminHolders } = useRealunitApi();

  const [holders, setHolders] = useState<AdminHolder[]>([]);
  const [totalCount, setTotalCount] = useState<number | undefined>();
  const [pageInfo, setPageInfo] = useState<PageInfo>(emptyPageInfo);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [registration, setRegistration] = useState<HolderRegistration>('all');
  const requestSeq = useRef(0);

  useLayoutOptions({ title: translate('screens/realunit', 'All Holders'), backButton: true });

  const loadHolders = useCallback(
    (cursor?: string, direction?: PaginationDirection) => {
      const requestId = requestSeq.current + 1;
      requestSeq.current = requestId;
      setIsLoading(true);
      setLoadFailed(false);
      if (cursor === undefined) setPageInfo(emptyPageInfo);
      getAdminHolders(cursor, direction, registration)
        .then((data) => {
          if (requestSeq.current !== requestId) return;
          setHolders(data.holders);
          setPageInfo(data.pageInfo);
          setTotalCount(data.totalCount);
        })
        .catch(() => {
          if (requestSeq.current !== requestId) return;
          setHolders([]);
          setPageInfo(emptyPageInfo);
          setTotalCount(undefined);
          setLoadFailed(true);
        })
        .finally(() => {
          if (requestSeq.current !== requestId) return;
          setIsLoading(false);
        });
    },
    [getAdminHolders, registration],
  );

  useEffect(() => {
    loadHolders();
  }, [loadHolders]);

  const handleAddressClick = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    navigate(`/realunit/user/${encodedAddress}`);
  };

  const changePage = (dir: PaginationDirection) =>
    loadHolders(dir === PaginationDirection.NEXT ? pageInfo.endCursor : pageInfo.startCursor, dir);

  const headingCount = totalCount != null ? totalCount.toLocaleString() : '0';

  return (
    <>
      <select
        className="px-2 py-1 border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
        value={registration}
        onChange={(event) => setRegistration(event.target.value as HolderRegistration)}
      >
        <option value="all">{translate('screens/realunit', 'All')}</option>
        <option value="registered">{translate('screens/realunit', 'Registered')}</option>
        <option value="unregistered">{translate('screens/realunit', 'Not registered')}</option>
      </select>
      {isLoading && !holders.length ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : (
        <div className="w-full">
          <div className="w-full overflow-x-auto mb-4">
            <h2 className="text-dfxGray-700 mb-4">
              {translate('screens/realunit', 'All Holders')} ({headingCount})
            </h2>
            {loadFailed ? (
              <p className="text-sm text-dfxGray-800 mb-4">
                {translate('screens/realunit', 'Failed to load holders.')}
              </p>
            ) : null}
            <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
              <thead>
                <tr className="bg-dfxGray-300">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Address')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Balance')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Percentage')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'E-mail')}
                  </th>
                </tr>
              </thead>

              <tbody>
                {holders.map((holder) => (
                  <tr
                    key={holder.address}
                    className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300"
                  >
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-left text-sm text-dfxBlue-800 cursor-pointer hover:text-dfxBlue-600 hover:underline break-all bg-transparent border-0 p-0"
                          onClick={() => handleAddressClick(holder.address)}
                        >
                          {blankedAddress(holder.address, { displayLength: 18 })}
                        </button>
                        <CopyButton color={IconColor.GRAY} onCopy={() => copy(holder.address)} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{holder.balance}</td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{holder.percentage.toFixed(2)}%</td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {holder.mail === null ? '' : holder.mail.trim()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-2 mt-4">
            <div className="flex items-center gap-2">
              <StyledButton
                label={translate('general/actions', 'Previous')}
                onClick={() => changePage(PaginationDirection.PREV)}
                disabled={loadFailed || !pageInfo.hasPreviousPage}
                width={StyledButtonWidth.MIN}
              />
            </div>

            <div className="flex items-center gap-2">
              <StyledButton
                label={translate('general/actions', 'Next')}
                onClick={() => changePage(PaginationDirection.NEXT)}
                disabled={loadFailed || !pageInfo.hasNextPage}
                width={StyledButtonWidth.MIN}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
