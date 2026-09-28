import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useEffect, useMemo, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { RealunitPromoPanel } from 'src/components/realunit/promo-panel';
import { useSettingsContext } from 'src/contexts/settings.context';
import { RealUnitManualReviewStatus, RealUnitReferralRelation } from 'src/dto/realunit-referral.dto';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { useRealunitReferral } from 'src/hooks/realunit-referral.hook';
import { formatSwissDateTimeWithSeconds } from 'src/util/utils';

export default function RealunitReferralScreen(): JSX.Element {
  useRealunitGuard();

  const { translate } = useSettingsContext();
  const { getRelations } = useRealunitReferral();
  const { navigate } = useNavigation();

  const [relations, setRelations] = useState<RealUnitReferralRelation[]>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  // presentation-only default filter; the loaded list always stays complete
  const [reviewOnly, setReviewOnly] = useState(false);

  useLayoutOptions({
    title: translate('screens/referral', 'RealUnit Referral'),
    backButton: true,
    noMaxWidth: true,
  });

  useEffect(() => loadRelations(), []);

  function loadRelations(): void {
    setIsLoading(true);
    setError(undefined);
    setRelations(undefined);
    getRelations()
      .then((res) => setRelations(res))
      .catch((e: Error) => setError(e.message ?? 'Unknown error'))
      .finally(() => setIsLoading(false));
  }

  const pendingCount = useMemo(
    () => (relations ?? []).filter((r) => r.reviewStatus === RealUnitManualReviewStatus.PENDING).length,
    [relations],
  );

  const displayed = useMemo(
    () =>
      relations && (reviewOnly ? relations.filter((r) => r.reviewStatus === RealUnitManualReviewStatus.PENDING) : relations),
    [relations, reviewOnly],
  );

  return (
    <div className="w-full flex flex-col gap-3 text-left">
      <RealunitPromoPanel translate={translate} />
      <div className="bg-white rounded-lg shadow-sm p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-dfxBlue-800">
        <span className="font-semibold">
          {translate('screens/referral', 'Relations')}: {relations ? relations.length : '…'}
        </span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
          {translate('screens/referral', 'Held for review only')} ({pendingCount})
        </label>
        {error && <ErrorHint message={error} />}
      </div>

      {isLoading && <StyledLoadingSpinner size={SpinnerSize.LG} />}

      {displayed && !isLoading && (
        <div className="bg-white rounded-lg shadow-sm overflow-auto scroll-shadow">
          {displayed.length === 0 ? (
            <p className="p-4 text-sm text-dfxGray-700">{translate('screens/referral', 'No entries found')}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="bg-dfxGray-300">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/referral', 'Kind')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/referral', 'Code')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/referral', 'Review Status')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/referral', 'Credited')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/referral', 'Created')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-dfxGray-300 transition-colors hover:bg-dfxBlue-400 cursor-pointer group"
                    onClick={() => navigate(`/realunit/referral/${r.id}`)}
                  >
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{r.id}</td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{r.kind}</td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white break-all">{r.code}</td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{r.reviewStatus ?? '-'}</td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">
                      {r.credited ? translate('general/actions', 'Yes') : translate('general/actions', 'No')}
                    </td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">
                      {formatSwissDateTimeWithSeconds(r.created)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
