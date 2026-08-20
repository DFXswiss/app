import { ChangeEvent, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { useSettingsContext } from 'src/contexts/settings.context';
import {
  LimitRequestDecision,
  LimitRequestDecisionStep,
  LimitRequestGrantingDecisions,
  useCompliance,
} from 'src/hooks/compliance.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { toBase64 } from 'src/util/utils';
import { STAFF_NAME_MISSING, staffNameLoadError } from './staff-identity';

interface Props {
  limitRequestId: number;
  userDataId: number;
  requestedLimit: number;
  fundOrigin?: string;
  investmentDate?: string;
  /** The account's annual limit as it stands today — what a rejection leaves in force. */
  currentDepositLimit?: number;
  /**
   * The decision already on the request, if it is final. The API refuses to change one, so the form
   * then drops to filing a note and a document: that is the only way to complete a decision whose
   * report or note failed halfway, and it is how a document arriving later gets into the file.
   */
  decidedAs?: string;
  onDecided: () => void;
}

// Collects the decision and hands it to `useCompliance().decideLimitRequest`, which runs the three
// steps in order (file the report, record the decision — the API raises depositLimit itself behind
// its finality check — then file the note) and reports how far it got. The customer message stays
// where it already lives on this screen.
export function LimitRequestDecisionForm({
  limitRequestId,
  userDataId,
  requestedLimit,
  fundOrigin,
  investmentDate,
  currentDepositLimit,
  decidedAs,
  onDecided,
}: Props): JSX.Element {
  const { translate } = useSettingsContext();
  const { decideLimitRequest, fileLimitRequestNote } = useCompliance();
  const { name: clerk, isLoading: isLoadingClerk, error: clerkError } = useStaffVerifiedName();

  // A decision recorded by this very attempt whose later step failed: the request is final from then
  // on, so the form must stop offering a decision before the clerk retries. Also set on success so the
  // form locks into note-only mode immediately, before the parent reloads via onDecided().
  const [recordedDecision, setRecordedDecision] = useState<string>();
  const isDecided = !!decidedAs || !!recordedDecision;
  const effectiveDecision = decidedAs ?? recordedDecision;

  const [decision, setDecision] = useState<LimitRequestDecision | ''>('');
  // Prefilled with the requested amount: accepting in full is the common case. On ACCEPTED the field
  // is forced back to requestedLimit and disabled; on PARTIALLY_ACCEPTED it is cleared for a new entry.
  const [acceptedLimit, setAcceptedLimit] = useState<string>(String(requestedLimit));
  const [comment, setComment] = useState('');
  // The customer's proof of funds, filed with the note in the same step — in the sheet the clerk had to
  // pull it out of the message thread and file it by hand.
  const [document, setDocument] = useState<File>();
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [doneSteps, setDoneSteps] = useState<LimitRequestDecisionStep[]>([]);
  const [failedStep, setFailedStep] = useState<LimitRequestDecisionStep>();

  const clerkId = `limit-request-${limitRequestId}-clerk`;
  const decisionId = `limit-request-${limitRequestId}-decision`;
  const acceptedLimitId = `limit-request-${limitRequestId}-accepted-limit`;
  const commentId = `limit-request-${limitRequestId}-comment`;
  const documentId = `limit-request-${limitRequestId}-document`;

  const grantsLimit = !isDecided && !!decision && LimitRequestGrantingDecisions.includes(decision);
  const parsedLimit = Number(acceptedLimit);
  // Both target columns are integers (`user_data.depositLimit`, `limit_request.acceptedLimit`) and both
  // DTOs validate with @IsInt, so a decimal would be refused by the API rather than rounded silently.
  // For PARTIALLY_ACCEPTED the amount must also sit strictly between the current limit and the request.
  const isPartialLimitValid =
    acceptedLimit.trim() !== '' &&
    Number.isInteger(parsedLimit) &&
    parsedLimit > 0 &&
    parsedLimit < requestedLimit &&
    (currentDepositLimit == null || parsedLimit > currentDepositLimit);
  const isLimitValid = !grantsLimit || decision === LimitRequestDecision.ACCEPTED || isPartialLimitValid;
  const canSubmit = isDecided
    ? !!clerk?.trim() && (!!comment.trim() || !!document) && !isSaving && !isLoadingClerk
    : !!clerk?.trim() && !!decision && isLimitValid && !isSaving && !isLoadingClerk;

  function handleDecisionChange(e: ChangeEvent<HTMLSelectElement>): void {
    const value = e.target.value as LimitRequestDecision | '';
    setDecision(value);
    if (value === LimitRequestDecision.ACCEPTED) setAcceptedLimit(String(requestedLimit));
    else if (value === LimitRequestDecision.PARTIALLY_ACCEPTED) setAcceptedLimit('');
  }

  function partialLimitHint(): string {
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
      return translate('screens/compliance', 'Enter a positive whole number in CHF.');
    }
    if (parsedLimit >= requestedLimit) {
      return translate('screens/compliance', 'Must be strictly less than the requested amount ({{amount}} CHF).', {
        amount: requestedLimit.toLocaleString(),
      });
    }
    if (currentDepositLimit != null && parsedLimit <= currentDepositLimit) {
      return translate('screens/compliance', 'Must be strictly greater than the current limit ({{amount}} CHF).', {
        amount: currentDepositLimit.toLocaleString(),
      });
    }
    return translate('screens/compliance', 'Enter a valid partial amount.');
  }

  function resetDocument(): void {
    setDocument(undefined);
    if (documentInputRef.current) documentInputRef.current.value = '';
  }

  async function readDocument(): Promise<{ data: string; name: string } | undefined | 'failed'> {
    if (!document) return undefined;
    try {
      // `toBase64` rejects on a FileReader error and resolves undefined on an empty result — both mean
      // the same thing here, and neither may escape and leave the form stuck on "Saving...".
      const data = await toBase64(document);
      return data ? { data, name: document.name } : 'failed';
    } catch {
      return 'failed';
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;

    setIsSaving(true);
    setError(undefined);
    setDoneSteps([]);
    setFailedStep(undefined);

    const attachment = await readDocument();
    if (attachment === 'failed') {
      setIsSaving(false);
      setError(translate('screens/compliance', 'The selected document could not be read'));
      return;
    }

    const signedBy = clerk?.trim() ?? '';
    const result = isDecided
      ? await fileLimitRequestNote(
          { limitRequestId, userDataId },
          { clerk: signedBy, decision: effectiveDecision as string, comment: comment.trim() || undefined, attachment },
        )
      : await decideLimitRequest({ limitRequestId, userDataId }, decision as LimitRequestDecision, {
          clerk: signedBy,
          requestedLimit,
          grantedLimit: grantsLimit ? parsedLimit : undefined,
          currentDepositLimit,
          comment: comment.trim() || undefined,
          fundOrigin,
          investmentDate,
          attachment,
        });

    setIsSaving(false);
    if (result.success) {
      // Lock into note-only mode immediately so a second click cannot re-fire the decision sequence
      // before the parent reloads. Only meaningful in decision mode (note-only already has no decision).
      if (!isDecided && decision) setRecordedDecision(decision);
      setComment('');
      resetDocument();
      onDecided();
    } else {
      // Naming the steps that did land matters: after a failure in between, the operator has to know
      // how far the sequence got before retrying.
      setDoneSteps(result.completedSteps);
      setFailedStep(result.failedStep);
      setError(result.message ?? translate('screens/compliance', 'Unknown error'));
      if (result.completedSteps.includes('limitRequest') && decision) setRecordedDecision(decision);
    }
  }

  return (
    <div className="mt-4 border-t border-dfxGray-300 pt-4">
      <h3 className="text-sm font-semibold text-dfxBlue-800 mb-3">
        {isDecided
          ? translate('screens/compliance', 'File note for this limit request')
          : translate('screens/compliance', 'Decide Limit Request')}
      </h3>

      <div className="flex gap-3 flex-wrap items-end">
        {!isDecided && (
          <div className="flex flex-col gap-1">
            <label htmlFor={decisionId} className="text-xs text-dfxGray-700">
              {translate('screens/compliance', 'Decision')}
            </label>
            <select
              id={decisionId}
              className="px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 min-w-[150px]"
              value={decision}
              onChange={handleDecisionChange}
            >
              <option value="">-</option>
              <option value={LimitRequestDecision.ACCEPTED}>Accepted</option>
              <option value={LimitRequestDecision.PARTIALLY_ACCEPTED}>PartiallyAccepted</option>
              <option value={LimitRequestDecision.REJECTED}>Rejected</option>
            </select>
          </div>
        )}

        {grantsLimit && (
          <div className="flex flex-col gap-1">
            <label htmlFor={acceptedLimitId} className="text-xs text-dfxGray-700">
              {translate('screens/compliance', 'Accepted limit (CHF)')}
            </label>
            <input
              id={acceptedLimitId}
              type="number"
              min={1}
              step={1}
              className="px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 min-w-[130px] disabled:opacity-50"
              value={acceptedLimit}
              disabled={decision === LimitRequestDecision.ACCEPTED}
              onChange={(e) => setAcceptedLimit(e.target.value)}
            />
            {decision === LimitRequestDecision.PARTIALLY_ACCEPTED &&
              acceptedLimit.trim() !== '' &&
              !isPartialLimitValid && (
                <p data-testid="accepted-limit-hint" className="text-xs text-primary-red">
                  {partialLimitHint()}
                </p>
              )}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span id={clerkId} className="text-xs text-dfxGray-700">
            {translate('screens/compliance', 'Clerk')}
          </span>
          <p className="px-2 py-1.5 text-xs text-dfxBlue-800 min-w-[130px]">
            {isLoadingClerk ? '…' : (clerk ?? '—')}
          </p>
          {!isLoadingClerk && !clerk && (
            <ErrorHint message={clerkError ? staffNameLoadError(clerkError) : STAFF_NAME_MISSING} />
          )}
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label htmlFor={commentId} className="text-xs text-dfxGray-700">
            {translate('screens/compliance', 'Internal file note')}
          </label>
          <input
            id={commentId}
            className="px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 w-full"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={documentId} className="text-xs text-dfxGray-700">
            {translate('screens/compliance', 'Customer document (optional)')}
          </label>
          <input
            id={documentId}
            ref={documentInputRef}
            type="file"
            className="px-2 py-1 text-xs text-dfxBlue-800"
            onChange={(e) => setDocument(e.target.files?.[0])}
          />
        </div>

        <button
          className="px-4 py-1.5 bg-dfxBlue-400 text-white rounded text-xs hover:bg-dfxBlue-800 transition-colors disabled:opacity-50"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {isSaving
            ? translate('screens/compliance', 'Saving...')
            : isDecided
              ? translate('screens/compliance', 'Save file note')
              : translate('screens/compliance', 'Save decision')}
        </button>
      </div>

      {document && (
        <p className="mt-2 text-xs text-dfxGray-700">
          {translate('screens/compliance', `"{{name}}" is filed with the note under the customer's documents.`, {
            name: document.name,
          })}
        </p>
      )}

      <p className="mt-2 text-xs text-dfxGray-700">
        {isDecided
          ? translate(
              'screens/compliance',
              'This request is already decided ({{decision}}) and cannot be changed. A note or a document can still be filed.',
              { decision: effectiveDecision as string },
            )
          : grantsLimit
            ? translate(
                'screens/compliance',
                'Sets the annual limit to {{amount}} CHF, records the decision and files the report. The customer is mailed automatically within a few minutes.',
                { amount: isLimitValid ? parsedLimit.toLocaleString() : '-' },
              )
            : decision
              ? currentDepositLimit != null
                ? translate(
                    'screens/compliance',
                    'Keeps the current annual limit of {{limit}} CHF and records the decision.',
                    { limit: currentDepositLimit.toLocaleString() },
                  )
                : translate('screens/compliance', 'Keeps the current annual limit and records the decision.')
              : translate(
                  'screens/compliance',
                  'An accepted request also mails the customer automatically within a few minutes.',
                )}
      </p>

      {error && (
        <div className="mt-3">
          <ErrorHint
            message={`${error}${
              failedStep ? ` ${translate('screens/compliance', '(failed at: {{step}})', { step: failedStep })}` : ''
            }${
              doneSteps.length
                ? ` ${translate('screens/compliance', '(already applied: {{steps}})', { steps: doneSteps.join(', ') })}`
                : ''
            }`}
          />
        </div>
      )}
    </div>
  );
}
