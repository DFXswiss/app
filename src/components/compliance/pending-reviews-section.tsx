import { PendingReviewItem, PendingReviewStatus, PendingReviewSummaryEntry, PendingReviewType } from '@dfx.swiss/react';
import { Fragment, useState } from 'react';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useCompliance } from 'src/hooks/compliance.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { formatSwissDate } from 'src/util/utils';
import { CollapsibleSection } from './collapsible-section';
import { reviewTabs } from './compliance-review-configs';

// Steps without an own review tab — inserted between the last KYC-flow step
// and DfxApproval in the overview order. AdditionalDocuments is not listed: that step is retired
// (documents reach the KYC file through the support ticket) and can no longer be pending.
const EXTRA_STEPS_BEFORE_APPROVAL = ['NameChange', 'AddressChange'];

// Canonical ordered list of pending-review rows, each with the review-screen tab its items open.
// Derived from `reviewTabs` so the dashboard overview and the review-screen tabs stay in sync. All
// rows are always shown (even with count 0) in this stable order.
interface ReviewRow {
  type: PendingReviewType;
  name: string;
  tabKey: string;
}

const ORDERED_REVIEW_ROWS: ReviewRow[] = [
  { type: PendingReviewType.BANK_DATA, name: 'BankData', tabKey: 'bankDataReview' },
  ...reviewTabs
    .filter((t) => t.group === 'kyc' && t.stepName && t.stepName !== 'DfxApproval')
    .map((t) => ({ type: PendingReviewType.KYC_STEP, name: t.stepName, tabKey: t.key })),
  ...EXTRA_STEPS_BEFORE_APPROVAL.map((name) => ({ type: PendingReviewType.KYC_STEP, name, tabKey: 'stammdaten' })),
  { type: PendingReviewType.KYC_STEP, name: 'DfxApproval', tabKey: 'freigabe' },
];

interface Props {
  entries: PendingReviewSummaryEntry[];
}

type ExpandState = { state: 'loading' } | { state: 'loaded'; items: PendingReviewItem[] };

export function PendingReviewsSection({ entries }: Props): JSX.Element | null {
  const { translate } = useSettingsContext();
  const { navigate } = useNavigation();
  const { getPendingReviewItems } = useCompliance();

  const [expanded, setExpanded] = useState<Record<string, ExpandState>>({});

  const entriesByKey = new Map(entries.map((e) => [`${e.type}:${e.name}`, e]));
  const rows: (ReviewRow & PendingReviewSummaryEntry)[] = ORDERED_REVIEW_ROWS.map((row) => ({
    ...row,
    ...(entriesByKey.get(`${row.type}:${row.name}`) ?? { manualReview: 0, internalReview: 0 }),
  }));

  const totalCount = rows.reduce((sum, r) => sum + r.manualReview, 0);

  async function toggleExpansion(type: PendingReviewType, name: string, status: PendingReviewStatus) {
    const key = `${type}-${name}-${status}`;
    if (expanded[key]) {
      setExpanded(({ [key]: _removed, ...rest }) => rest);
      return;
    }
    setExpanded((prev) => ({ ...prev, [key]: { state: 'loading' } }));
    const queryName = type === PendingReviewType.KYC_STEP ? name : undefined;
    try {
      const items = await getPendingReviewItems(type, status, queryName);
      setExpanded((prev) => ({ ...prev, [key]: { state: 'loaded', items } }));
    } catch {
      setExpanded(({ [key]: _removed, ...rest }) => rest);
    }
  }

  return (
    <CollapsibleSection title={translate('screens/compliance', 'Pending Reviews')} count={totalCount}>
      <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
        <thead>
          <tr className="bg-dfxGray-300">
            <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
              {translate('screens/compliance', 'Type')}
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
              {translate('screens/kyc', 'Name')}
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-dfxBlue-800">
              {translate('screens/compliance', 'Internal Review')}
            </th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-dfxBlue-800">
              {translate('screens/compliance', 'Manual Review')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = `${r.type}-${r.name}-${PendingReviewStatus.MANUAL_REVIEW}`;
            const expandState = expanded[key];
            const canExpand = r.manualReview > 0;
            return (
              <Fragment key={`${r.type}-${r.name}`}>
                <tr
                  className={`border-b border-dfxGray-300 transition-colors ${
                    canExpand ? 'hover:bg-dfxGray-300 cursor-pointer' : ''
                  }`}
                  onClick={
                    canExpand ? () => toggleExpansion(r.type, r.name, PendingReviewStatus.MANUAL_REVIEW) : undefined
                  }
                >
                  <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{r.type}</td>
                  <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{r.name}</td>
                  <td className="px-4 py-3 text-right text-sm text-dfxGray-600">{r.internalReview}</td>
                  <td className="px-4 py-3 text-right text-sm text-dfxBlue-800 font-semibold">{r.manualReview}</td>
                </tr>
                {expandState && (
                  <tr className="border-b border-dfxGray-300 bg-dfxGray-100">
                    <td colSpan={4} className="px-4 py-3">
                      {expandState.state === 'loading' ? (
                        <div className="text-sm text-dfxGray-700">{translate('general/actions', 'Loading')}…</div>
                      ) : expandState.items.length === 0 ? (
                        <div className="text-sm text-dfxGray-700">
                          {translate('screens/compliance', 'No entries found')}
                        </div>
                      ) : (
                        <ReviewItemsTable
                          items={expandState.items}
                          tabKey={r.tabKey}
                          navigate={navigate}
                          translate={translate}
                        />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </CollapsibleSection>
  );
}

function ReviewItemsTable({
  items,
  tabKey,
  navigate,
  translate,
}: {
  items: PendingReviewItem[];
  tabKey: string;
  navigate: (to: string) => void;
  translate: (namespace: string, key: string) => string;
}): JSX.Element {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-dfxGray-300">
          <th className="px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800">
            {translate('screens/compliance', 'ID')}
          </th>
          <th className="px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800">
            {translate('screens/kyc', 'Account Type')}
          </th>
          <th className="px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800">
            {translate('screens/kyc', 'Name')}
          </th>
          <th className="px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800">
            {translate('screens/compliance', 'Kyc Level')}
          </th>
          <th className="px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800">
            {translate('screens/compliance', 'Date')}
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr
            key={item.id}
            className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300 cursor-pointer"
            onClick={() => navigate(`compliance/user/${item.userDataId}/kyc?tab=${tabKey}`)}
          >
            <td className="px-3 py-2 text-left text-xs text-dfxBlue-800">{item.userDataId}</td>
            <td className="px-3 py-2 text-left text-xs text-dfxBlue-800">{item.accountType ?? '-'}</td>
            <td className="px-3 py-2 text-left text-xs text-dfxBlue-800">{item.userName ?? '-'}</td>
            <td className="px-3 py-2 text-left text-xs text-dfxBlue-800">{item.kycLevel ?? '-'}</td>
            <td className="px-3 py-2 text-left text-xs text-dfxBlue-800">{formatSwissDate(item.date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
