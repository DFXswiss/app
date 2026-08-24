import { useAuthContext } from '@dfx.swiss/react';
import { StyledButton, StyledButtonWidth } from '@dfx.swiss/react-components';
import { useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { useSettingsContext } from 'src/contexts/settings.context';
import {
  AmlAction,
  CallOutcome,
  CallOutcomeContext,
  CallOutcomeResult,
  needsExplicitAmlReset,
  useCompliance,
} from 'src/hooks/compliance.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { canManuallySetAmlPass } from 'src/util/aml-pass.util';
import { STAFF_NAME_MISSING, staffNameLoadError } from '../staff-identity';

// These outcomes leave nothing to decide: the save itself already determines the transaction — the API
// passes it on the check date a completed call writes, fails it on a failed one (`UserDataFailedCall`),
// and on Repeat releases this one transaction while the account stays in the queue. Offering an AML
// action on top would only invite the combination that cannot work: a plain reset re-runs the very
// check the missing check date is still failing.
const OutcomesImplyingAmlAction: (CallOutcome | '')[] = [
  CallOutcome.COMPLETED,
  CallOutcome.FAILED,
  CallOutcome.REPEAT,
];

interface Props {
  context: CallOutcomeContext;
  availableOutcomes: CallOutcome[];
  onSaved: () => void;
  title: string;
}

export function CallQueueOutcomeForm({
  context,
  availableOutcomes,
  onSaved,
  title,
}: Props): JSX.Element {
  const { translate } = useSettingsContext();
  const { saveCallOutcome } = useCompliance();
  const { session } = useAuthContext();
  const { name: signature, isLoading: isLoadingSignature, error: signatureError } = useStaffVerifiedName();
  const allowPass = canManuallySetAmlPass(session?.role);

  const [comment, setComment] = useState<string>('');
  const [outcome, setOutcome] = useState<CallOutcome | ''>('');
  const [amlAction, setAmlAction] = useState<AmlAction | ''>('');
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<CallOutcomeResult>();

  const hasTx = context.txId != null && context.sourceType != null;
  const buyCryptoResetUnavailable = context.sourceType === 'BuyCrypto' && !context.buyCryptoResetEligible;
  // The clerk is not asked for an AML action on those outcomes; every other one is open-ended and
  // keeps the selector.
  const outcomeImpliesAmlAction = OutcomesImplyingAmlAction.includes(outcome);
  const showAmlCheck = hasTx && !outcomeImpliesAmlAction;
  // Blocks the save: without the reset the transaction stays Pending forever on a recheck-blocked
  // queue, while the form would still report success and navigate away.
  const impliedResetUnavailable =
    hasTx && outcomeImpliesAmlAction && needsExplicitAmlReset(context.queue) && buyCryptoResetUnavailable;
  const canSubmit =
    !!signature && !!outcome && !!comment.trim() && !isSaving && !isLoadingSignature && !impliedResetUnavailable;

  // What the save sends for an outcome that implies its action. Only the queues whose AML reason the
  // API excludes from the recheck cron need an explicit action: their transaction would otherwise stay
  // Pending forever. Reset (never Pass/Fail) clears amlCheck + amlReason so the cron re-runs the FULL
  // AML check on the state the call just produced — the API decides the outcome, not the tool. On
  // Repeat the release is written before this reset, so the re-run no longer sees the call-queue error.
  function impliedAmlAction(): AmlAction | undefined {
    if (!needsExplicitAmlReset(context.queue) || buyCryptoResetUnavailable) return undefined;
    return 'Reset';
  }

  function handleOutcomeChange(value: CallOutcome | '') {
    setOutcome(value);
    // Drop a selection made before the outcome was known; it is not submitted for the outcomes that
    // imply their action and must not reappear when the clerk switches back to another outcome.
    setAmlAction('');
  }

  async function handleSubmit() {
    if (!signature || !outcome) return;
    setIsSaving(true);
    setResult(undefined);
    const res = await saveCallOutcome(context, outcome, {
      signature,
      comment,
      amlAction: hasTx ? (outcomeImpliesAmlAction ? impliedAmlAction() : amlAction || undefined) : undefined,
    });
    setIsSaving(false);
    setResult(res);
    if (res.success) onSaved();
  }

  return (
    <div className="w-full bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-base font-semibold text-dfxBlue-800 mb-3">{title}</h3>
      {!isLoadingSignature && !signature && (
        <div className="mb-4">
          <ErrorHint message={signatureError ? staffNameLoadError(signatureError) : STAFF_NAME_MISSING} />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-dfxBlue-800 mb-1">Signature</label>
          <p className="w-full px-3 py-2 text-sm text-dfxBlue-800">
            {isLoadingSignature ? '…' : (signature ?? '—')}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-dfxBlue-800 mb-1">Outcome</label>
          <select
            className="w-full px-3 py-2 text-sm bg-white border border-dfxGray-300 rounded text-dfxBlue-800"
            value={outcome}
            onChange={(e) => handleOutcomeChange(e.target.value as CallOutcome | '')}
          >
            <option value="">—</option>
            {availableOutcomes.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>
      {showAmlCheck && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-dfxBlue-800 mb-1">
            {translate('screens/compliance', 'AmlCheck')}
          </label>
          <select
            className="w-full px-3 py-2 text-sm bg-white border border-dfxGray-300 rounded text-dfxBlue-800"
            value={amlAction}
            onChange={(e) => setAmlAction(e.target.value as AmlAction | '')}
          >
            <option value="">— {translate('screens/compliance', 'No change')}</option>
            {allowPass && <option value="Pass">Pass</option>}
            <option value="Fail">Fail</option>
            {!buyCryptoResetUnavailable && <option value="Reset">Reset</option>}
          </select>
          {!allowPass && (
            <p className="mt-1 text-xs text-dfxGray-700">
              Pass is Admin-only; use Fail or Reset so the automatic AML check can decide.
            </p>
          )}
          {buyCryptoResetUnavailable && (
            <p className="mt-1 text-xs text-dfxGray-700">
              Reset is unavailable for this BuyCrypto (completed, stopped, batch, chargeback, or payout/refund in
              progress). Reload Compliance review if the transaction state has changed.
            </p>
          )}
        </div>
      )}
      {impliedResetUnavailable && (
        <p className="mt-4 text-xs text-primary-red">
          Saving is disabled: this queue is excluded from the AML recheck and automatic reset is unavailable for this
          BuyCrypto, so the transaction would stay pending. Reload after the BuyCrypto is eligible for reset, then
          save the outcome.
        </p>
      )}
      <div className="mt-4">
        <label className="block text-sm font-medium text-dfxBlue-800 mb-1">
          {translate('screens/kyc', 'Comment')} *
        </label>
        <textarea
          className="w-full px-3 py-2 text-sm bg-white border border-dfxGray-300 rounded text-dfxBlue-800"
          rows={4}
          maxLength={500}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Notes from the call"
          required
        />
      </div>
      {result && !result.success && (
        <div className="mt-3">
          <ErrorHint message={renderFailureMessage(result)} />
        </div>
      )}
      <div className="mt-4">
        <StyledButton
          label="Save Outcome"
          onClick={handleSubmit}
          disabled={!canSubmit}
          isLoading={isSaving}
          width={StyledButtonWidth.FULL}
        />
      </div>
    </div>
  );
}

function renderFailureMessage(result: CallOutcomeResult): string {
  const reason = `Failed at step '${result.failedStep ?? 'unknown'}': ${result.message ?? 'Unknown error'}`;
  if (result.completedSteps.length === 0) return reason;
  const done = result.completedSteps.join(', ');
  return `${reason}. Previously completed: ${done}. Please verify state manually before retry.`;
}
