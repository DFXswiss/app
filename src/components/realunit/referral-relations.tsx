import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useEffect, useMemo, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { RealUnitCodeKind, RealUnitManualReviewStatus, RealUnitReferralRelation } from 'src/dto/realunit-referral.dto';
import { useNavigation } from 'src/hooks/navigation.hook';
import { useRealunitReferral } from 'src/hooks/realunit-referral.hook';
import { REVIEW_STATUS_LABEL } from 'src/util/referral-labels';
import { formatSwissDateTimeWithSeconds } from 'src/util/utils';

interface ReferralRelationsProps {
  kind: RealUnitCodeKind;
  title: string;
  // Only referral invites can be held for manual review; promo redemptions never are.
  withReview: boolean;
  translate: (ns: string, key: string) => string;
}

// Redemptions of one code kind (promo codes or referral invites). Both screens load the same
// relation list; the kind only decides which rows are shown here.
export function RealunitReferralRelations({ kind, title, withReview, translate }: ReferralRelationsProps): JSX.Element {
  const { getRelations } = useRealunitReferral();
  const { navigate } = useNavigation();

  const [relations, setRelations] = useState<RealUnitReferralRelation[]>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  // presentation-only default filter; the loaded list always stays complete
  const [reviewOnly, setReviewOnly] = useState(false);

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

  const ofKind = useMemo(() => relations?.filter((r) => r.kind === kind), [relations, kind]);

  const pendingCount = useMemo(
    () => (ofKind ?? []).filter((r) => r.reviewStatus === RealUnitManualReviewStatus.PENDING).length,
    [ofKind],
  );

  const displayed = useMemo(
    () => ofKind && (reviewOnly ? ofKind.filter((r) => r.reviewStatus === RealUnitManualReviewStatus.PENDING) : ofKind),
    [ofKind, reviewOnly],
  );

  return (
    <div className="w-full flex flex-col gap-3 text-left">
      <div className="bg-white rounded-lg shadow-sm p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-dfxBlue-800">
        <span className="font-semibold">
          {title}: {ofKind ? ofKind.length : '…'}
        </span>
        {withReview && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
            {translate('screens/referral', 'Held for review only')} ({pendingCount})
          </label>
        )}
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
                    {translate('screens/referral', 'Code')}
                  </th>
                  {withReview && (
                    <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                      {translate('screens/referral', 'Review Status')}
                    </th>
                  )}
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
                    onClick={() =>
                      navigate(`${kind === RealUnitCodeKind.PROMO ? '/realunit/promo' : '/realunit/referral'}/${r.id}`)
                    }
                  >
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{r.id}</td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white break-all">{r.code}</td>
                    {withReview && (
                      <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">
                        {r.reviewStatus ? translate('screens/referral', REVIEW_STATUS_LABEL[r.reviewStatus]) : '-'}
                      </td>
                    )}
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
