import { useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { KycStepInfo, useCompliance } from 'src/hooks/compliance.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { buildKycLogMessage } from 'src/util/compliance-helpers';
import { RESET_RECOMMENDATION_STATUS, recommendationResetComment } from 'src/util/recommendation-step.util';
import { STAFF_NAME_MISSING, staffNameLoadError } from './staff-identity';

interface Props {
  userDataId: string;
  step: KycStepInfo;
  onClose: () => void;
  // Called once the API has closed the step. `logWarning` is set when the step was reset but the KYC
  // log entry could not be written, so the caller can show it — the reset itself is done either way.
  onReset: (stepId: number, logWarning?: string) => void;
}

// Closes a pending recommendation request so the customer can enter a code again: the step goes to
// Canceled with the reason as comment, and a KYC log entry records clerk and reason. The clerk is
// shown because the log stores that name; without a verified name the form does not offer to save.
export function RecommendationReset({ userDataId, step, onClose, onReset }: Readonly<Props>): JSX.Element {
  const { updateKycStep, createKycLog } = useCompliance();
  const { name: clerk, isLoading: isLoadingClerk, error: clerkError } = useStaffVerifiedName();

  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();

  // Sync guard: isSaving only disables the button after re-render; a second click in the same tick must
  // not start another update. mountedRef keeps a late answer from touching a form that is gone.
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const canSubmit = !!clerk && !!reason.trim() && !isSaving && !isLoadingClerk;

  // Only reachable through the Save button, which is disabled until canSubmit holds.
  async function handleSubmit(): Promise<void> {
    if (savingRef.current) return;
    savingRef.current = true;

    setIsSaving(true);
    setError(undefined);
    const comment = recommendationResetComment(reason);
    try {
      await updateKycStep(step.id, { status: RESET_RECOMMENDATION_STATUS, comment });
    } catch (e: unknown) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : 'Failed to reset the recommendation');
      savingRef.current = false;
      if (mountedRef.current) setIsSaving(false);
      return;
    }

    // The step is closed at this point; a failing log entry must not make the clerk reset it again.
    let logWarning: string | undefined;
    try {
      await createKycLog(
        +userDataId,
        buildKycLogMessage({
          description: 'Recommendation',
          clerk: clerk as string,
          results: [{ table: 'kycStep', column: 'status', value: RESET_RECOMMENDATION_STATUS }],
          comment,
        }),
      );
    } catch (e: unknown) {
      logWarning = e instanceof Error ? e.message : 'Failed to write the KYC log entry';
    }

    savingRef.current = false;
    if (mountedRef.current) setIsSaving(false);
    onReset(step.id, logWarning);
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-xs text-dfxGray-700">
        Closes the pending request so the customer can enter a Ref-Code again. The reason is stored on the step and in
        the KYC log.
      </p>
      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label htmlFor="recommendation-reset-reason" className="text-xs text-dfxGray-700">
            Reason
          </label>
          <input
            id="recommendation-reset-reason"
            type="text"
            className="px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            disabled={isSaving}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-dfxGray-700">Clerk</span>
          <p className="px-2 py-1.5 text-xs text-dfxBlue-800">{isLoadingClerk ? '…' : (clerk ?? '—')}</p>
        </div>
      </div>
      {!isLoadingClerk && !clerk && (
        <ErrorHint message={clerkError ? staffNameLoadError(clerkError) : STAFF_NAME_MISSING} />
      )}
      {error && <p className="text-xs text-dfxRed-100">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="px-3 py-1 text-xs text-dfxBlue-800 hover:underline"
          onClick={onClose}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="px-3 py-1 text-xs font-medium bg-dfxBlue-800 text-white rounded hover:bg-dfxBlue-800/80 transition-colors disabled:opacity-50"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
