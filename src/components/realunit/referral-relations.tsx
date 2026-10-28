import { SpinnerSize, StyledLoadingSpinner, StyledSearchInput } from '@dfx.swiss/react-components';
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

// Case-insensitive substring match on the columns staff search by: guest name, guest account id and
// the remittance info of the qualifying buy. An empty or blank query matches every row.
export function matchesRelationSearch(relation: RealUnitReferralRelation, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [relation.guestName, relation.guestAccountId?.toString(), relation.qualifyingBuyReference];
  return haystack.some((value) => value != null && value.toLowerCase().includes(needle));
}

// A redemption whose guest has no name has not finished the process (the account was never identified).
// The table hides these rows by default and shows them on request.
export function isIncompleteRelation(relation: RealUnitReferralRelation): boolean {
  return !relation.guestName?.trim();
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
  // presentation-only filter: redemptions whose reward has already been credited
  const [creditedOnly, setCreditedOnly] = useState(false);
  // presentation-only filter, off by default: redemptions whose guest never finished the process
  const [showIncomplete, setShowIncomplete] = useState(false);
  // presentation-only search over the loaded list; the API is not queried again
  const [search, setSearch] = useState('');

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

  const creditedCount = useMemo(() => (ofKind ?? []).filter((r) => r.credited).length, [ofKind]);

  const incompleteCount = useMemo(() => (ofKind ?? []).filter(isIncompleteRelation).length, [ofKind]);

  const displayed = useMemo(
    () =>
      ofKind
        ?.filter((r) => showIncomplete || !isIncompleteRelation(r))
        .filter((r) => !reviewOnly || r.reviewStatus === RealUnitManualReviewStatus.PENDING)
        .filter((r) => !creditedOnly || r.credited)
        .filter((r) => matchesRelationSearch(r, search)),
    [ofKind, showIncomplete, reviewOnly, creditedOnly, search],
  );

  const isFiltered = Boolean(ofKind && displayed && displayed.length !== ofKind.length);

  return (
    <div className="w-full flex flex-col gap-3 text-left">
      <div className="bg-white rounded-lg shadow-sm p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-dfxBlue-800">
        <span className="font-semibold">
          {title}: {ofKind ? ofKind.length : '…'}
        </span>
        {withReview && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
            {translate('screens/referral', 'Held for review only')} ({pendingCount})
          </label>
        )}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={creditedOnly} onChange={(e) => setCreditedOnly(e.target.checked)} />
          {translate('screens/referral', 'Credited only')} ({creditedCount})
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showIncomplete} onChange={(e) => setShowIncomplete(e.target.checked)} />
          {translate('screens/referral', 'Show incomplete')} ({incompleteCount})
        </label>
        <div className="w-full sm:w-[30rem]">
          <StyledSearchInput
            placeholder={translate('screens/referral', 'Search name, guest account or remittance info')}
            onChange={setSearch}
          />
        </div>
        {isFiltered && (
          <span>
            {displayed?.length} {translate('screens/referral', 'of')} {ofKind?.length}{' '}
            {translate('screens/referral', 'shown')}
          </span>
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
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/referral', 'Guest account')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/referral', 'Name')}
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
                    {translate('screens/referral', 'Remittance info')}
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
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{r.guestAccountId ?? '-'}</td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{r.guestName ?? '-'}</td>
                    {withReview && (
                      <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">
                        {r.reviewStatus ? translate('screens/referral', REVIEW_STATUS_LABEL[r.reviewStatus]) : '-'}
                      </td>
                    )}
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">
                      {r.credited ? translate('general/actions', 'Yes') : translate('general/actions', 'No')}
                    </td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white break-all">
                      {r.qualifyingBuyReference ?? '-'}
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
