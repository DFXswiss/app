import { Department, SupportIssueInternalState, useAuthContext, UserRole } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FilePreviewPanel } from 'src/components/compliance/file-preview-panel';
import { LimitRequestDecisionForm } from 'src/components/compliance/limit-request-decision-form';
import { ErrorHint } from 'src/components/error-hint';
import { InfoPanel, InfoRow, SupportMessageList } from 'src/components/support/info-panel';
import { ReplySuggestionPanel } from 'src/components/support/reply-suggestion-panel';
import { TemplateArrayPickerModal } from 'src/components/support-templates/template-array-picker-modal';
import { TemplatePickerModal } from 'src/components/support-templates/template-picker-modal';
import { useSettingsContext } from 'src/contexts/settings.context';
import { LimitRequestFinalDecisions, TransactionInfo, UserDataDetail, useCompliance } from 'src/hooks/compliance.hook';
import { useSupportDashboardGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { useSplitPane } from 'src/hooks/split-pane.hook';
import {
  ASSIGNABLE_DEPARTMENTS,
  SupportIssueInternalData,
  SupportMessageInfo,
  SupportReplySuggestion,
  useSupportDashboard,
} from 'src/hooks/support-dashboard.hook';
import { formatDateTime, statusBadge } from 'src/util/compliance-helpers';
import { reasonLabel, typeLabel } from 'src/util/support-helpers';
import { detectPlaceholders, requiresArraySelection, resolvePlaceholders } from 'src/util/template-placeholders';
import { toBase64 } from 'src/util/utils';

export default function SupportDashboardIssueScreen(): JSX.Element {
  useSupportDashboardGuard();

  const { id } = useParams();
  const { translate } = useSettingsContext();
  const { session } = useAuthContext();
  const canAccessCompliance = session?.role === UserRole.ADMIN || session?.role === UserRole.COMPLIANCE;
  const {
    getIssueData,
    updateIssue,
    sendMessage,
    getIssueMessages,
    getMessageFile,
    getClerks,
    getReplySuggestion,
    acceptReplySuggestion,
    rejectReplySuggestion,
  } = useSupportDashboard();
  const { getUserData } = useCompliance();
  const { navigate } = useNavigation();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [issueData, setIssueData] = useState<SupportIssueInternalData>();
  const [messages, setMessages] = useState<SupportMessageInfo[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const visibleIdsRef = useRef<Set<number>>(new Set());
  const [clerks, setClerks] = useState<string[]>([]);

  // Update form state
  const [updateState, setUpdateState] = useState('');
  const [updateDepartment, setUpdateDepartment] = useState('');
  const [updateClerk, setUpdateClerk] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Reply suggestion state: only the newest suggestion awaiting a decision is offered
  const [suggestion, setSuggestion] = useState<SupportReplySuggestion>();
  const [isSuggestionBusy, setIsSuggestionBusy] = useState(false);
  // the same state twice, on purpose: the buttons render from the state, the poll reads the ref.
  // As a dependency of the poll effect it would tear the interval down and set it up again on every
  // decision, which delays the message poll the interval also carries.
  const isSuggestionBusyRef = useRef(false);
  // Answers to a request the screen has moved past must not be applied: a decision taken or another
  // ticket opened while a fetch was in flight would otherwise put the suggestion back on screen. The
  // counter is raised on both, and a response whose token no longer matches is dropped — a check of
  // the busy flag alone cannot do this, because that flag is false again by the time such an answer
  // arrives.
  const suggestionEpochRef = useRef(0);

  function setSuggestionBusy(value: boolean): void {
    isSuggestionBusyRef.current = value;
    setIsSuggestionBusy(value);
  }

  // Message form state
  const [messageText, setMessageText] = useState('');
  const [messageAuthor, setMessageAuthor] = useState<string>('');
  // a ref, not state: the effect below may already be scheduled when the clerk picks an author, and
  // would then run with the state of the render it was scheduled in and overwrite the pick
  const isAuthorPickedRef = useRef(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Clearing the selection remounts the input rather than writing to the DOM node: the ref is only
  // ever null before the first render, so a guard around that write can never be false in practice.
  const [fileInputKey, setFileInputKey] = useState(0);

  // Template state
  const [userDataDetail, setUserDataDetail] = useState<UserDataDetail>();
  const [userTransactions, setUserTransactions] = useState<TransactionInfo[]>([]);
  const [isUserDataLoading, setIsUserDataLoading] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [pendingTemplateContent, setPendingTemplateContent] = useState<string>();

  // File preview state
  const [filePreview, setFilePreview] = useState<{ url: string; contentType: string; name: string }>();
  const { containerRef, splitPercent, handleSplitDrag } = useSplitPane();

  const isComplianceDept = issueData?.department === Department.COMPLIANCE;

  useLayoutOptions({
    title: translate('screens/support', 'Support Issue'),
    backButton: true,
    noMaxWidth: true,
    textStart: true,
  });

  useEffect(() => {
    getClerks().then(setClerks).catch(() => undefined);
  }, [getClerks]);

  const loadIssue = useCallback((): void => {
    if (!id) return;
    setIsLoading(true);
    getIssueData(+id)
      .then((data) => {
        setIssueData(data);
        setUpdateState(data.state);
        setUpdateDepartment(data.department ?? '');
        setUpdateClerk(data.clerk ?? '');
      })
      .catch((e: Error) => setLoadError(e.message ?? 'Unknown error'))
      .finally(() => setIsLoading(false));
  }, [id, getIssueData]);

  // The clerk who last answered is the default author, otherwise the first of the list. Resolved in
  // its own effect rather than inside the load: as part of the load it made `loadIssue` depend on the
  // clerk list, so the list arriving a moment later reloaded the whole ticket and put the screen back
  // behind its loading spinner — a second request and a visible flash on every ticket that was opened.
  // Once the clerk has picked an author themselves, the default stops applying: ticket and clerk list
  // arrive independently, so a late arrival would otherwise overwrite a selection already made.
  useEffect(() => {
    if (isAuthorPickedRef.current) return;
    setMessageAuthor((prev) =>
      issueData?.clerk && clerks.includes(issueData.clerk) ? issueData.clerk : prev || clerks[0] || '',
    );
  }, [issueData?.clerk, clerks]);

  const loadMessages = useCallback((): void => {
    if (!issueData?.uid) return;
    getIssueMessages(issueData.uid)
      .then((fetched) => {
        setMessages(fetched);
        setPendingCount(0);
      })
      .catch((e: Error) => setActionError(e.message ?? 'Failed to load messages'));
  }, [issueData?.uid, getIssueMessages]);

  const pollForNewMessages = useCallback((): void => {
    if (!issueData?.uid) return;
    getIssueMessages(issueData.uid)
      .then((fetched) => {
        const newCount = fetched.filter((m) => !visibleIdsRef.current.has(m.id)).length;
        if (newCount > 0) setPendingCount(newCount);
      })
      .catch((e: Error) => setActionError(e.message ?? 'Failed to load messages'));
  }, [issueData?.uid, getIssueMessages]);

  const loadSuggestion = useCallback(async (): Promise<void> => {
    if (!id) return;
    const epoch = suggestionEpochRef.current;
    return getReplySuggestion(+id)
      .then((loaded) => {
        if (suggestionEpochRef.current === epoch) setSuggestion(loaded);
      })
      .catch((e: Error) => {
        if (suggestionEpochRef.current === epoch)
          setActionError(e.message ?? 'Failed to load reply suggestion');
      });
  }, [id, getReplySuggestion]);

  // Everything tied to one ticket is dropped when another one is opened: react-router keeps this
  // component mounted across a change of the route parameter, so a suggestion of the previous
  // ticket would stay on screen, and the author picked there would keep the default from ever
  // applying again. Declared before the loading effects, so that raising the token happens ahead of
  // the fetch it is meant to qualify rather than invalidating it.
  useEffect(() => {
    suggestionEpochRef.current++;
    setSuggestion(undefined);
    // the busy state belongs to the decision of the ticket that was left; carried over it would
    // disable this ticket's buttons and pause its poll until that request finally settles
    setSuggestionBusy(false);
    isAuthorPickedRef.current = false;
  }, [id]);

  useEffect(() => {
    loadIssue();
  }, [loadIssue]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    loadSuggestion();
  }, [loadSuggestion]);

  // Reset cached UserData when the issue (and thus the account) changes
  useEffect(() => {
    setUserDataDetail(undefined);
    setUserTransactions([]);
  }, [issueData?.account.id]);

  async function openTemplatePicker(accountId: number): Promise<void> {
    if (userDataDetail) {
      setTemplatePickerOpen(true);
      return;
    }
    setIsUserDataLoading(true);
    try {
      const data = await getUserData(accountId);
      setUserDataDetail(data.userData);
      setUserTransactions(data.transactions ?? []);
      setTemplatePickerOpen(true);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to load user data for templates');
    } finally {
      setIsUserDataLoading(false);
    }
  }

  // Track visible message IDs for polling delta
  useEffect(() => {
    visibleIdsRef.current = new Set(messages.map((m) => m.id));
  }, [messages]);

  // Polling for new messages (non-intrusive, sets pendingCount) and for a suggestion that arrived
  // while the ticket was open — a clerk sitting on the screen must not have to reload to see one.
  // The suggestion is skipped while a decision is in flight: the answer would carry the state from
  // before that decision, and putting it back on screen invites a second click, which the API then
  // refuses as a conflict.
  useEffect(() => {
    const interval = setInterval(() => {
      pollForNewMessages();
      if (!isSuggestionBusyRef.current) loadSuggestion();
    }, 15000);
    return () => clearInterval(interval);
  }, [pollForNewMessages, loadSuggestion]);

  // Scroll messages container to bottom when messages change (initial load, send, manual reload)
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleUpdate(issueId: number): Promise<void> {
    setIsUpdating(true);
    setActionError(undefined);
    try {
      await updateIssue(issueId, {
        state: updateState || undefined,
        department: updateDepartment || undefined,
        clerk: updateClerk || undefined,
      });
      loadIssue();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleSendMessage(): Promise<void> {
    if (!id || (!messageText.trim() && selectedFiles.length === 0)) return;
    const remainingPlaceholders = detectPlaceholders(messageText);
    if (remainingPlaceholders.length > 0) {
      const keys = remainingPlaceholders.map((t) => `$${t.fullKey}`).join(', ');
      setActionError(
        `Senden nicht möglich – der Text enthält noch unausgefüllte Platzhalter: ${keys}. Bitte manuell korrigieren.`,
      );
      return;
    }
    setIsSending(true);
    setActionError(undefined);
    try {
      const author = messageAuthor;
      const text = messageText.trim() || undefined;

      if (selectedFiles.length > 0) {
        for (let i = 0; i < selectedFiles.length; i++) {
          const fileData = await toBase64(selectedFiles[i]);
          const isLast = i === selectedFiles.length - 1;
          await sendMessage(+id, {
            author,
            message: isLast ? text : undefined,
            file: fileData,
            fileName: selectedFiles[i].name,
          });
        }
      } else {
        await sendMessage(+id, { author, message: text });
      }

      setMessageText('');
      setSelectedFiles([]);
      setFileInputKey((key) => key + 1);
      loadMessages();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setIsSending(false);
    }
  }

  /**
   * Accepting turns the suggestion into the clerk's own draft: the text lands in the composer,
   * where it is edited and sent like any other message. Discarding only records the decision.
   * Either way the suggestion stops being offered, and stays on record on the server. A refused
   * decision is reconciled with the server rather than left standing.
   */
  async function decideSuggestion(issueId: number, item: SupportReplySuggestion, accept: boolean): Promise<void> {
    // The decision qualifies itself the same way a fetch does. Opening another ticket while it is
    // still running raises the token, and what comes back then belongs to a ticket that is no longer
    // on screen: its text must not land in the composer of the new one, its clearing must not remove
    // the new one's suggestion, and its error is not about the ticket the clerk is looking at.
    const epoch = ++suggestionEpochRef.current;
    const isCurrent = (): boolean => suggestionEpochRef.current === epoch;

    setSuggestionBusy(true);
    setActionError(undefined);
    try {
      if (accept) {
        await acceptReplySuggestion(issueId, item.messageId);
        if (isCurrent()) setMessageText((prev) => (prev ? `${prev}\n${item.text}` : item.text));
      } else {
        await rejectReplySuggestion(issueId, item.messageId);
      }
      if (isCurrent()) setSuggestion(undefined);
    } catch (e: unknown) {
      // The server refuses a decision it has already taken — by another clerk, or in another tab.
      // Leaving the panel as it stands would offer that same decision again, and it would be refused
      // again, so the buttons stay disabled until what the server actually holds is on screen. The
      // error is set after that, because the reload reports its own failures the same way and the
      // refusal is the one the clerk needs to read.
      if (isCurrent()) await loadSuggestion();
      if (isCurrent()) setActionError(e instanceof Error ? e.message : 'Suggestion update failed');
    } finally {
      // only the decision the screen is still on may clear the flag: a late answer from the ticket
      // that was left would otherwise unblock the buttons while this ticket's decision is running
      if (isCurrent()) setSuggestionBusy(false);
    }
  }

  function handleTemplateInsert(content: string): void {
    const ctx = { userData: userDataDetail, transactions: userTransactions, issue: issueData };
    if (requiresArraySelection(content, ctx)) {
      setPendingTemplateContent(content);
      return;
    }
    insertTemplate(content, {});
  }

  function insertTemplate(content: string, selections: { transactionId?: number }): void {
    setPendingTemplateContent(undefined);
    const ctx = { userData: userDataDetail, transactions: userTransactions, issue: issueData };
    const resolved = resolvePlaceholders(content, ctx, selections);
    setMessageText((prev) => (prev ? `${prev}\n${resolved}` : resolved));
  }

  async function openFile(uid: string, msg: SupportMessageInfo & { fileName: string }): Promise<void> {
    try {
      const { data, contentType } = await getMessageFile(uid, msg.id);
      if (!data || data.type !== 'Buffer' || !Array.isArray(data.data)) {
        setActionError('Invalid file type');
        return;
      }
      if (filePreview) URL.revokeObjectURL(filePreview.url);
      const blob = new Blob([new Uint8Array(data.data)], { type: contentType });
      const url = URL.createObjectURL(blob);
      setFilePreview({ url, contentType, name: msg.fileName });
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Error loading file');
    }
  }

  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview.url);
    };
  }, [filePreview]);

  const unresolvedInMessage = useMemo(() => detectPlaceholders(messageText), [messageText]);

  if (loadError) return <ErrorHint message={loadError} />;
  if (isLoading || !issueData) return <StyledLoadingSpinner size={SpinnerSize.LG} />;

  return (
    <div ref={containerRef} className="w-full flex text-left">
      <div style={{ width: `${splitPercent}%` }} className="flex flex-col gap-6 min-w-0 pr-2">
        {actionError && <ErrorHint message={actionError} />}
        {/* Info Panels - Row 1: Issue + Account */}
        <div className="flex gap-4 flex-wrap">
          <InfoPanel title="Issue Details">
            <InfoRow label="ID" value={String(issueData.id)} mono />
            <InfoRow label="UID" value={issueData.uid} mono />
            <InfoRow label="Name" value={issueData.name} />
            <InfoRow label="Type" value={translate('screens/support', typeLabel(issueData.type))} />
            <InfoRow label="Reason" value={translate('screens/support', reasonLabel(issueData.reason))} />
            <InfoRow label="State" value={statusBadge(issueData.state)} />
            <InfoRow label="Department" value={issueData.department ?? '-'} />
            <InfoRow label="Created" value={formatDateTime(issueData.created)} />
          </InfoPanel>

          <InfoPanel title="Account Data">
            <InfoRow
              label="UserData ID"
              value={
                <button
                  className="text-dfxBlue-400 underline hover:text-dfxBlue-800"
                  onClick={() =>
                    navigate(`${canAccessCompliance ? '/compliance' : '/support'}/user/${issueData.account.id}`)
                  }
                >
                  {issueData.account.id}
                </button>
              }
            />
            <InfoRow label="Status" value={statusBadge(issueData.account.status)} />
            <InfoRow label="Verified Name" value={issueData.account.verifiedName ?? '-'} />
            <InfoRow label="DFX Name" value={issueData.account.completeName ?? '-'} />
            <InfoRow label="Account Type" value={issueData.account.accountType ?? '-'} />
            <InfoRow label="KYC Level" value={String(issueData.account.kycLevel)} />
            <InfoRow
              label="Deposit Limit"
              value={
                issueData.account.depositLimit != null ? `${issueData.account.depositLimit.toLocaleString()} CHF` : '-'
              }
            />
            <InfoRow label="Annual Volume" value={`${issueData.account.annualVolume.toLocaleString()} CHF`} />
            <InfoRow label="KYC Hash" value={issueData.account.kycHash} mono />
            <InfoRow label="Country" value={issueData.account.country?.name ?? '-'} />
            <InfoRow
              label="Language"
              value={
                issueData.account.language?.name
                  ? `${issueData.account.language.name}${issueData.account.language.symbol ? ` (${issueData.account.language.symbol})` : ''}`
                  : '-'
              }
            />
            {isComplianceDept && (
              <tr>
                <td className="pr-4 py-1 font-medium whitespace-nowrap text-sm">Compliance:</td>
                <td className="py-1">
                  <button
                    className="text-xs text-dfxBlue-400 underline hover:text-dfxBlue-800"
                    onClick={() => navigate(`/compliance/user/${issueData.account.id}`)}
                  >
                    Open User
                  </button>
                </td>
              </tr>
            )}
          </InfoPanel>
        </div>

        {/* Info Panels - Row 2: Transaction + Missing + Limit */}
        {(issueData.transaction || issueData.transactionMissing || issueData.limitRequest) && (
          <div className="flex gap-4 flex-wrap">
            {issueData.transaction && (
              <InfoPanel title="Transaction">
                <InfoRow label="ID" value={String(issueData.transaction.id)} />
                <InfoRow label="Source Type" value={issueData.transaction.sourceType} />
                <InfoRow label="Type" value={issueData.transaction.type} />
                {issueData.transaction.amlCheck && (
                  <InfoRow label="AML Check" value={statusBadge(issueData.transaction.amlCheck)} />
                )}
                {issueData.transaction.amlReason && (
                  <InfoRow label="AML Reason" value={issueData.transaction.amlReason} />
                )}
                {issueData.transaction.comment && <InfoRow label="Comment" value={issueData.transaction.comment} />}
                {issueData.transaction.inputAmount != null && (
                  <InfoRow
                    label="Input"
                    value={`${issueData.transaction.inputAmount} ${issueData.transaction.inputAsset ?? ''}`}
                  />
                )}
                {issueData.transaction.outputAmount != null && (
                  <InfoRow
                    label="Output"
                    value={`${issueData.transaction.outputAmount} ${issueData.transaction.outputAsset ?? ''}`}
                  />
                )}
                {issueData.transaction.wallet && <InfoRow label="Wallet" value={issueData.transaction.wallet.name} />}
                {issueData.transaction.isComplete != null && (
                  <InfoRow label="Complete" value={issueData.transaction.isComplete ? 'Yes' : 'No'} />
                )}
              </InfoPanel>
            )}

            {issueData.transactionMissing && (
              <InfoPanel title="Transaction Missing">
                {issueData.transactionMissing.senderIban && (
                  <InfoRow label="Sender IBAN" value={issueData.transactionMissing.senderIban} mono />
                )}
                {issueData.transactionMissing.receiverIban && (
                  <InfoRow label="Receiver IBAN" value={issueData.transactionMissing.receiverIban} mono />
                )}
                {issueData.transactionMissing.date && (
                  <InfoRow label="Date" value={formatDateTime(issueData.transactionMissing.date)} />
                )}
              </InfoPanel>
            )}

            {issueData.limitRequest && (
              <InfoPanel title="Limit Request">
                <InfoRow label="Requested" value={`${issueData.limitRequest.limit.toLocaleString()} CHF`} />
                {issueData.limitRequest.acceptedLimit != null && (
                  <InfoRow label="Accepted" value={`${issueData.limitRequest.acceptedLimit.toLocaleString()} CHF`} />
                )}
                <InfoRow label="Fund Origin" value={issueData.limitRequest.fundOrigin} />
                <InfoRow label="Investment Date" value={issueData.limitRequest.investmentDate} />
                {issueData.limitRequest.decision && (
                  <InfoRow label="Decision" value={statusBadge(issueData.limitRequest.decision)} />
                )}
              </InfoPanel>
            )}
          </div>
        )}

        {/* Limit Request decision — the compliance endpoints behind it (userData, limitRequest) are
            Compliance-gated, so a Support-role clerk would only earn a 403 from the buttons. Once the
            decision is final the API refuses to change it, and the form drops to filing a note or a
            document: that is how a decision whose report or note failed halfway gets completed, and how
            a document arriving later still reaches the file. */}
        {issueData.limitRequest && canAccessCompliance && (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <LimitRequestDecisionForm
              limitRequestId={issueData.limitRequest.id}
              userDataId={issueData.account.id}
              requestedLimit={issueData.limitRequest.limit}
              fundOrigin={issueData.limitRequest.fundOrigin}
              investmentDate={issueData.limitRequest.investmentDate}
              currentDepositLimit={issueData.account.depositLimit}
              decidedAs={
                (LimitRequestFinalDecisions as readonly string[]).includes(issueData.limitRequest.decision ?? '')
                  ? issueData.limitRequest.decision
                  : undefined
              }
              clerks={clerks}
              defaultClerk={updateClerk || undefined}
              onDecided={loadIssue}
            />
          </div>
        )}

        {/* Update Controls */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-dfxGray-700 mb-3">Update Issue</h2>
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-dfxGray-700">State</label>
              <select
                className="px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 min-w-[130px]"
                value={updateState}
                onChange={(e) => setUpdateState(e.target.value)}
              >
                {Object.values(SupportIssueInternalState).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-dfxGray-700">Department</label>
              <select
                className="px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 min-w-[130px]"
                value={updateDepartment}
                onChange={(e) => setUpdateDepartment(e.target.value)}
              >
                {!issueData?.department && <option value="">-</option>}
                {ASSIGNABLE_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-dfxGray-700">Clerk</label>
              <select
                className="px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 min-w-[130px]"
                value={updateClerk}
                onChange={(e) => setUpdateClerk(e.target.value)}
              >
                {!issueData?.clerk && <option value="">-</option>}
                {clerks.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="px-4 py-1.5 bg-dfxBlue-400 text-white rounded text-xs hover:bg-dfxBlue-800 transition-colors disabled:opacity-50"
              onClick={() => handleUpdate(issueData.id)}
              disabled={isUpdating}
            >
              {isUpdating ? 'Updating...' : 'Update'}
            </button>
          </div>
        </div>

        {/* Messages / Chat */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-dfxGray-700">Messages ({messages.length})</h2>
            {pendingCount > 0 && (
              <button
                className="px-3 py-1 text-xs text-white bg-dfxRed-100 rounded-full hover:bg-dfxRed-150 transition-colors"
                onClick={() => loadMessages()}
              >
                {pendingCount} new {pendingCount === 1 ? 'message' : 'messages'} — load
              </button>
            )}
          </div>
          <div
            ref={messagesContainerRef}
            className="flex flex-col gap-2 max-h-[40vh] overflow-auto mb-4 p-2 scroll-shadow"
          >
            <SupportMessageList messages={messages} onOpenFile={(msg) => openFile(issueData.uid, msg)} />
          </div>

          {/* Reply suggestion — offered above the composer, decided before the reply is written */}
          {suggestion && (
            <ReplySuggestionPanel
              suggestion={suggestion}
              isBusy={isSuggestionBusy}
              onAccept={() => decideSuggestion(issueData.id, suggestion, true)}
              onDiscard={() => decideSuggestion(issueData.id, suggestion, false)}
            />
          )}

          {/* Message Input */}
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 px-2 py-1 bg-dfxGray-300 rounded text-xs text-dfxBlue-800"
                >
                  <span className="truncate max-w-[150px]">{file.name}</span>
                  <button
                    className="text-dfxGray-700 hover:text-dfxRed-100"
                    onClick={() => {
                      setSelectedFiles((prev) => prev.filter((_, idx) => idx !== i));
                      setFileInputKey((key) => key + 1);
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-start">
            <input
              key={fileInputKey}
              type="file"
              multiple
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => setSelectedFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
            />
            <button
              className="px-2 py-2 text-dfxGray-700 hover:text-dfxBlue-800 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
            >
              &#128206;
            </button>
            <button
              className="px-2 py-2 text-dfxGray-700 hover:text-dfxBlue-800 transition-colors disabled:opacity-30"
              onClick={() => void openTemplatePicker(issueData.account.id)}
              disabled={isUserDataLoading || issueData.account.id == null}
              title={isUserDataLoading ? 'Lade Userdaten...' : 'Vorlage einfügen'}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="7" x="3" y="3" rx="1" />
                <rect width="9" height="7" x="3" y="14" rx="1" />
                <rect width="5" height="7" x="16" y="14" rx="1" />
              </svg>
            </button>
            <textarea
              className="flex-1 px-3 py-2 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800 resize-y min-h-[40px] max-h-[300px]"
              value={messageText}
              rows={Math.min(8, Math.max(1, messageText.split('\n').length))}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type a message... (Shift+Enter = neue Zeile, Enter = senden)"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <select
              className="px-2 py-2 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
              value={messageAuthor}
              onChange={(e) => {
                isAuthorPickedRef.current = true;
                setMessageAuthor(e.target.value);
              }}
              title="Author"
            >
              {clerks.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              className="px-4 py-2 bg-dfxBlue-400 text-white rounded text-sm hover:bg-dfxBlue-800 transition-colors disabled:opacity-50"
              onClick={() => handleSendMessage()}
              disabled={
                isSending || (!messageText.trim() && selectedFiles.length === 0) || unresolvedInMessage.length > 0
              }
              title={
                unresolvedInMessage.length > 0
                  ? `Text enthält noch Platzhalter: ${unresolvedInMessage.map((t) => `$${t.fullKey}`).join(', ')} – bitte manuell korrigieren.`
                  : undefined
              }
            >
              {isSending ? '...' : 'Send'}
            </button>
          </div>
          {unresolvedInMessage.length > 0 ? (
            <div className="text-xs text-dfxRed-150 mt-1">
              Der Text enthält noch Platzhalter:{' '}
              {unresolvedInMessage.map((t) => (
                <span key={t.fullKey} className="font-mono">
                  ${t.fullKey}{' '}
                </span>
              ))}
              – bitte mit konkreten Werten ersetzen, bevor du sendest.
            </div>
          ) : (
            <div className="text-xs text-dfxGray-700 mt-1">
              Customer will be notified by email when you send a message.
            </div>
          )}
        </div>
      </div>

      {/* Draggable Splitter */}
      <div className="w-1.5 cursor-col-resize flex-shrink-0 group flex items-stretch" onMouseDown={handleSplitDrag}>
        <div className="w-0.5 mx-auto bg-dfxGray-400 group-hover:bg-dfxBlue-400 transition-colors rounded-full" />
      </div>

      {/* File Preview - always visible, sticky right */}
      <div style={{ width: `${100 - splitPercent}%` }} className="min-w-0 sticky top-4 self-start pl-2">
        <FilePreviewPanel
          preview={filePreview}
          label="File Preview"
          onClose={() => {
            if (filePreview) URL.revokeObjectURL(filePreview.url);
            setFilePreview(undefined);
          }}
        />
      </div>

      <TemplatePickerModal
        isOpen={templatePickerOpen}
        context={{ userData: userDataDetail, transactions: userTransactions, issue: issueData }}
        onClose={() => setTemplatePickerOpen(false)}
        onInsert={handleTemplateInsert}
      />

      <TemplateArrayPickerModal
        isOpen={pendingTemplateContent != null}
        transactions={userTransactions}
        onSelect={(transactionId) =>
          pendingTemplateContent != null && insertTemplate(pendingTemplateContent, { transactionId })
        }
        onCancel={() => setPendingTemplateContent(undefined)}
      />
    </div>
  );
}
