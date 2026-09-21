import { useAuthContext } from '@dfx.swiss/react';
import { useEffect, useState } from 'react';
import { NavigateFunction } from 'react-router-dom';
import { KycStepInfo, useCompliance, UserInfo } from 'src/hooks/compliance.hook';
import { formatDate, statusBadge } from 'src/util/compliance-helpers';
import {
  canResetRecommendation,
  isPendingRecommendation,
  recommenderLabel,
  RESET_RECOMMENDATION_STATUS,
} from 'src/util/recommendation-step.util';
import { canEditUsedRef, usedRefGroups } from 'src/util/used-ref.util';
import { RecommendationReset } from './recommendation-reset';
import { UsedRefEditor } from './used-ref-editor';

interface RecommendationPanelProps {
  kycSteps: KycStepInfo[];
  users: UserInfo[];
  userDataId: string;
  navigate: NavigateFunction;
}

export function RecommendationPanel(props: RecommendationPanelProps): JSX.Element {
  return <RecommendationPanelBody key={props.userDataId} {...props} />;
}

function RecommendationPanelBody({ kycSteps, userDataId, navigate }: RecommendationPanelProps): JSX.Element {
  const recommendations = kycSteps?.filter((s) => s.name === 'Recommendation') || [];
  const { session } = useAuthContext();
  const canEditRef = canEditUsedRef(session?.role);
  const canReset = canResetRecommendation(session?.role);
  const { getUserData } = useCompliance();

  const [fetched, setFetched] = useState<{ id: string; users: UserInfo[] } | undefined>(undefined);
  const [saved, setSaved] = useState<{ id: string; users: UserInfo[] } | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const displayWallets =
    saved?.id === userDataId ? saved.users : fetched?.id === userDataId ? fetched.users : undefined;
  const wallets = displayWallets ?? [];

  // The step being reset (form below the table) and the steps reset in this view: the parent keeps the
  // steps as loaded, so a reset row shows its new status here until the account is loaded again.
  const [resetStep, setResetStep] = useState<KycStepInfo>();
  const [resetIds, setResetIds] = useState<number[]>([]);
  const [logWarning, setLogWarning] = useState<string>();

  // The account's referrers by Ref-Code; a pending request to somebody else is a typo of the code.
  const referrerIds = usedRefGroups(wallets)
    .filter((g) => g.usedRef && g.refUserDataId)
    .map((g) => g.refUserDataId as number);

  useEffect(() => {
    let live = true;
    setSaved(undefined);
    setFetched(undefined);
    setLoadError(false);
    getUserData(+userDataId)
      .then((data) => {
        if (!live) return;
        setLoadError(false);
        setFetched({ id: userDataId, users: data.users });
      })
      .catch(() => {
        if (!live) return;
        setLoadError(true);
      });
    return () => {
      live = false;
    };
  }, [userDataId, getUserData]);

  function stepStatus(step: KycStepInfo): string {
    return resetIds.includes(step.id) ? RESET_RECOMMENDATION_STATUS : step.status;
  }

  function isPending(step: KycStepInfo): boolean {
    return isPendingRecommendation(step) && !resetIds.includes(step.id);
  }

  function handleReset(stepId: number, warning?: string): void {
    setResetIds((ids) => [...ids, stepId]);
    setResetStep(undefined);
    setLogWarning(warning);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-dfxGray-700">Recommendation ({recommendations.length})</h2>
        <button
          className="text-xs text-dfxBlue-800 hover:underline"
          onClick={() => navigate(`/compliance/recommendations/${userDataId}`)}
        >
          View Network
        </button>
      </div>
      {loadError && (
        <div className="bg-white rounded-lg shadow-sm mb-2 p-3 text-sm">
          <div className="text-dfxGray-700 mb-1">Referrer (Ref-Code)</div>
          <p className="text-xs text-dfxRed-100">Could not load the referrer.</p>
        </div>
      )}
      {!loadError && wallets.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm mb-2 p-3 text-sm">
          <div className="text-dfxGray-700 mb-1">Referrer (Ref-Code)</div>
          <UsedRefEditor
            key={userDataId}
            userDataId={userDataId}
            users={wallets}
            canEdit={canEditRef}
            navigate={navigate}
            onSaved={(users) => setSaved({ id: userDataId, users })}
          />
        </div>
      )}
      <div className="bg-white rounded-lg shadow-sm max-h-[35vh] overflow-auto scroll-shadow">
        {recommendations.length > 0 ? (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-dfxGray-300">
              <tr>
                <th className="px-3 py-2 text-center text-sm font-semibold text-dfxBlue-800">Status</th>
                <th className="px-3 py-2 text-left text-sm font-semibold text-dfxBlue-800">Recommender</th>
                <th className="px-3 py-2 text-center text-sm font-semibold text-dfxBlue-800">Created</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((step) => (
                <tr
                  key={step.id}
                  className="border-b border-dfxGray-300 transition-colors hover:bg-dfxBlue-400 cursor-pointer group"
                  onClick={() => navigate(`/compliance/user/${userDataId}/kyc-step/${step.id}`, { state: { step } })}
                >
                  <td className="px-3 py-2 text-sm text-center">{statusBadge(stepStatus(step))}</td>
                  <td className="px-3 py-2 text-sm text-dfxBlue-800 group-hover:text-white">
                    {step.recommender ? (
                      <button
                        type="button"
                        className="hover:underline text-left"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/compliance/user/${step.recommender?.id}`);
                        }}
                      >
                        {recommenderLabel(step)}
                      </button>
                    ) : (
                      '-'
                    )}
                    {isPending(step) &&
                      step.recommender &&
                      referrerIds.length > 0 &&
                      !referrerIds.includes(step.recommender.id) && (
                        <span className="block text-xs text-dfxRed-100 group-hover:text-white">not the referrer</span>
                      )}
                    {isPending(step) && canReset && (
                      <button
                        type="button"
                        className="block text-xs text-dfxBlue-800 hover:underline group-hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          setResetStep(step);
                        }}
                      >
                        Reset
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-dfxBlue-800 text-center group-hover:text-white">
                    {formatDate(step.created)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4 text-dfxGray-700 text-sm">No recommendation</div>
        )}
      </div>
      {resetStep && (
        <div className="bg-white rounded-lg shadow-sm mt-2 p-3 text-sm">
          <RecommendationReset
            key={resetStep.id}
            userDataId={userDataId}
            step={resetStep}
            onClose={() => setResetStep(undefined)}
            onReset={handleReset}
          />
        </div>
      )}
      {resetIds.length > 0 && (
        <p className="mt-2 text-xs text-dfxGray-700">
          The request was reset. The customer gets a new Recommendation step the next time they open the KYC.
        </p>
      )}
      {logWarning && (
        <p className="mt-1 text-xs text-dfxRed-100">The KYC log entry could not be written: {logWarning}</p>
      )}
    </div>
  );
}
