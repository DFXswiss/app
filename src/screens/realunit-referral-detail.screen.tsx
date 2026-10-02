import { SpinnerSize, StyledButton, StyledButtonWidth, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { ErrorHint } from 'src/components/error-hint';
import { ConfirmationOverlay } from 'src/components/overlay/confirmation-overlay';
import { useSettingsContext } from 'src/contexts/settings.context';
import { RealUnitCodeKind, RealUnitManualReviewStatus, RealUnitReferralRelation } from 'src/dto/realunit-referral.dto';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { useRealunitReferral } from 'src/hooks/realunit-referral.hook';
import { CODE_KIND_LABEL, REVIEW_STATUS_LABEL } from 'src/util/referral-labels';
import { formatSwissDateTimeWithSeconds } from 'src/util/utils';

type ReferralAction = 'approve' | 'reject' | 'manualPrize';

export default function RealunitReferralDetailScreen(): JSX.Element {
  useRealunitGuard();

  const { translate } = useSettingsContext();
  const { navigate } = useNavigation();
  const { id } = useParams<{ id: string }>();
  const { getRelations, approveRelation, rejectRelation, createManualPrize } = useRealunitReferral();

  const [relation, setRelation] = useState<RealUnitReferralRelation>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [notFound, setNotFound] = useState(false);
  const [pendingAction, setPendingAction] = useState<ReferralAction | undefined>();
  const [actionInFlight, setActionInFlight] = useState(false);
  const [reason, setReason] = useState('');

  // The route decides the context (promo or referral), so title and back target are right before the
  // relation has loaded.
  const isPromo = useLocation().pathname.startsWith('/realunit/promo/');
  const detailTitle = translate('screens/referral', isPromo ? 'Promo redemption' : 'Referral Detail');

  useLayoutOptions({ title: detailTitle, backButton: true });

  useEffect(() => {
    setIsLoading(true);
    setError(undefined);
    setNotFound(false);
    setRelation(undefined); // drop any stale record so the loading/not-found guards work on an id change
    // No single-relation GET exists api-side; source the detail from the admin list.
    getRelations()
      .then((res) => {
        const found = res.find((r) => r.id === Number(id));
        if (found) setRelation(found);
        else setNotFound(true);
      })
      .catch((e: Error) => setError(e.message ?? 'Unknown error'))
      .finally(() => setIsLoading(false));
  }, [id, getRelations]);

  if (isLoading && !relation) return <StyledLoadingSpinner size={SpinnerSize.LG} />;
  if (error && !relation) return <ErrorHint message={error} />;
  if (notFound && !relation)
    return <p className="text-dfxGray-700">{translate('screens/referral', 'Relation not found')}</p>;
  if (!relation) return <StyledLoadingSpinner size={SpinnerSize.LG} />;

  const canReview = relation.reviewStatus === RealUnitManualReviewStatus.PENDING && !relation.credited;
  const canManualPrize = relation.reviewStatus === RealUnitManualReviewStatus.APPROVED && !relation.credited;

  const rows: [string, string][] = [
    [translate('screens/referral', 'Kind'), translate('screens/referral', CODE_KIND_LABEL[relation.kind])],
    [translate('screens/referral', 'Code'), relation.code],
    ['ID', String(relation.id)],
    [translate('screens/referral', 'User ID'), String(relation.userId)],
    [translate('screens/referral', 'Guest account'), relation.guestAccountId != null ? String(relation.guestAccountId) : '-'],
    // A promo code has no referrer, so the row would always be empty there.
    ...(relation.kind === RealUnitCodeKind.PROMO
      ? []
      : ([
          [
            translate('screens/referral', 'Referrer account'),
            relation.referrerAccountId != null ? String(relation.referrerAccountId) : '-',
          ],
        ] as [string, string][])),
    [
      translate('screens/referral', 'Review Status'),
      relation.reviewStatus ? translate('screens/referral', REVIEW_STATUS_LABEL[relation.reviewStatus]) : '-',
    ],
    [
      translate('screens/referral', 'Credited'),
      relation.credited ? translate('general/actions', 'Yes') : translate('general/actions', 'No'),
    ],
    [translate('screens/referral', 'Consumed at'), relation.consumedAt ? formatSwissDateTimeWithSeconds(relation.consumedAt) : '-'],
    [translate('screens/referral', 'Created'), formatSwissDateTimeWithSeconds(relation.created)],
  ];

  const historyRows: [string, string][] = [
    [translate('screens/referral', 'Reviewed by'), relation.reviewedBy ?? '-'],
    [translate('screens/referral', 'Reviewed at'), relation.reviewedAt ? formatSwissDateTimeWithSeconds(relation.reviewedAt) : '-'],
    [translate('screens/referral', 'Review reason'), relation.reviewReason ?? '-'],
    [translate('screens/referral', 'Manually rewarded by'), relation.manualRewardedBy ?? '-'],
    [
      translate('screens/referral', 'Manually rewarded at'),
      relation.manualRewardedAt ? formatSwissDateTimeWithSeconds(relation.manualRewardedAt) : '-',
    ],
    [translate('screens/referral', 'Manual reward reason'), relation.manualRewardReason ?? '-'],
  ];

  function renderTable(title: string, entries: [string, string][]): JSX.Element {
    return (
      <>
        <h2 className="text-dfxGray-700 mb-2 mt-4">{title}</h2>
        <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key} className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
                <td className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800 w-1/3">{key}</td>
                <td className="px-4 py-3 text-left text-sm text-dfxBlue-800 break-all">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  const actionLabel = (action: ReferralAction): string =>
    action === 'approve'
      ? translate('screens/referral', 'Approve')
      : action === 'reject'
      ? translate('screens/referral', 'Reject')
      : translate('screens/referral', 'Award manual prize');

  // An arrow function keeps the narrowing of `relation` from the early returns above (TS 5.4+), so
  // no unreachable guard is needed: the overlay that calls this only renders with a loaded relation.
  const runAction = async (action: ReferralAction): Promise<void> => {
    const trimmed = reason.trim();
    if (!trimmed) throw new Error(translate('screens/referral', 'Enter a reason'));
    setActionInFlight(true);
    try {
      const updated =
        action === 'approve'
          ? await approveRelation(relation.id, trimmed)
          : action === 'reject'
          ? await rejectRelation(relation.id, trimmed)
          : await createManualPrize(relation.id, trimmed);
      setRelation(updated);
      setPendingAction(undefined);
      setReason('');
    } finally {
      setActionInFlight(false);
    }
  };

  return (
    <div className="w-full">
      {renderTable(detailTitle, rows)}
      {renderTable(translate('screens/referral', 'Review history'), historyRows)}

      {canReview && (
        <div className="mt-6 flex flex-col gap-3">
          <StyledButton
            label={translate('screens/referral', 'Approve')}
            onClick={() => {
              setReason('');
              setPendingAction('approve');
            }}
            disabled={!!pendingAction || actionInFlight}
            width={StyledButtonWidth.FULL}
          />
          <StyledButton
            label={translate('screens/referral', 'Reject')}
            onClick={() => {
              setReason('');
              setPendingAction('reject');
            }}
            disabled={!!pendingAction || actionInFlight}
            width={StyledButtonWidth.FULL}
          />
        </div>
      )}

      {canManualPrize && (
        <div className="mt-6">
          <StyledButton
            label={translate('screens/referral', 'Award manual prize')}
            onClick={() => {
              setReason('');
              setPendingAction('manualPrize');
            }}
            disabled={!!pendingAction || actionInFlight}
            width={StyledButtonWidth.FULL}
          />
        </div>
      )}

      {pendingAction && (
        <div className="mt-6">
          <ConfirmationOverlay
            message={translate('screens/referral', 'Enter a reason for this action.')}
            messageContent={
              <textarea
                className="px-3 py-2 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800 w-full"
                rows={3}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={translate('screens/referral', 'Enter a reason')}
              />
            }
            cancelLabel={translate('general/actions', 'Cancel')}
            confirmLabel={actionLabel(pendingAction)}
            onCancel={() => {
              if (!actionInFlight) {
                setPendingAction(undefined);
                setReason('');
              }
            }}
            onConfirm={() => runAction(pendingAction)}
          />
        </div>
      )}

      <div className="mt-6">
        <StyledButton
          label={translate('general/actions', 'Back')}
          onClick={() => navigate(isPromo ? '/realunit/promo' : '/realunit/referral')}
          disabled={actionInFlight}
          width={StyledButtonWidth.FULL}
        />
      </div>
    </div>
  );
}
