import { SupportIssueInternalState } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FilePreviewPanel } from 'src/components/compliance/file-preview-panel';
import { ErrorHint } from 'src/components/error-hint';
import { InfoPanel, InfoRow, SupportMessageList } from 'src/components/support/info-panel';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { useRealunitSupport } from 'src/hooks/realunit-support.hook';
import { STAFF_NAME_MISSING, staffNameLoadError } from 'src/components/compliance/staff-identity';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { useSplitPane } from 'src/hooks/split-pane.hook';
import {
  ASSIGNABLE_DEPARTMENTS,
  SupportClerk,
  SupportIssueInternalData,
  SupportMessageInfo,
} from 'src/hooks/support-dashboard.hook';
import { formatDateTime, statusBadge } from 'src/util/compliance-helpers';
import { reasonLabel, typeLabel } from 'src/util/support-helpers';
import { toBase64 } from 'src/util/utils';

export default function RealunitSupportIssueScreen(): JSX.Element {
  useRealunitGuard();

  const { id } = useParams();
  const { translate } = useSettingsContext();
  const { getIssueData, updateIssue, createMessage, getIssueMessages, getFile, getClerks } = useRealunitSupport();
  const { navigate } = useNavigation();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [issueData, setIssueData] = useState<SupportIssueInternalData>();
  const [messages, setMessages] = useState<SupportMessageInfo[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const visibleIdsRef = useRef<Set<number>>(new Set());
  const [clerks, setClerks] = useState<SupportClerk[]>([]);

  // Update form state
  const [updateState, setUpdateState] = useState('');
  const [updateDepartment, setUpdateDepartment] = useState('');
  const [updateClerk, setUpdateClerk] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Message form state
  const [messageText, setMessageText] = useState('');
  const { name: messageAuthor, isLoading: isLoadingAuthor, error: authorError } = useStaffVerifiedName();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File preview state
  const [filePreview, setFilePreview] = useState<{ url: string; contentType: string; name: string }>();
  const { containerRef, splitPercent, handleSplitDrag } = useSplitPane();

  useLayoutOptions({
    title: translate('screens/support', 'RealUnit Support Issue'),
    backButton: true,
    noMaxWidth: true,
    textStart: true,
  });

  useEffect(() => {
    getClerks()
      .then((list) => {
        setClerks(list);
      })
      .catch(() => undefined);
  }, [getClerks]);

  const loadIssue = useCallback((): void => {
    if (!id) return;
    setIsLoading(true);
    getIssueData(+id)
      .then((data) => {
        setIssueData(data);
        setUpdateState(data.state);
        setUpdateDepartment(data.department ?? '');
        setUpdateClerk(data.clerkUserDataId != null ? String(data.clerkUserDataId) : '');
      })
      .catch((e: Error) => setLoadError(e.message ?? 'Unknown error'))
      .finally(() => setIsLoading(false));
  }, [id, getIssueData]);

  const loadMessages = useCallback((): void => {
    if (!issueData?.id) return;
    getIssueMessages(issueData.id)
      .then((fetched) => {
        setMessages(fetched);
        setPendingCount(0);
      })
      .catch((e: Error) => setActionError(e.message ?? 'Failed to load messages'));
  }, [issueData?.id, getIssueMessages]);

  const pollForNewMessages = useCallback((): void => {
    if (!issueData?.id) return;
    getIssueMessages(issueData.id)
      .then((fetched) => {
        const newCount = fetched.filter((m) => !visibleIdsRef.current.has(m.id)).length;
        if (newCount > 0) setPendingCount(newCount);
      })
      .catch((e: Error) => setActionError(e.message ?? 'Failed to load messages'));
  }, [issueData?.id, getIssueMessages]);

  useEffect(() => {
    loadIssue();
  }, [loadIssue]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    visibleIdsRef.current = new Set(messages.map((m) => m.id));
  }, [messages]);

  useEffect(() => {
    const interval = setInterval(() => pollForNewMessages(), 15000);
    return () => clearInterval(interval);
  }, [pollForNewMessages]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleUpdate(): Promise<void> {
    if (!id) return;
    setIsUpdating(true);
    setActionError(undefined);
    try {
      await updateIssue(+id, {
        state: updateState || undefined,
        department: updateDepartment || undefined,
        ...(updateClerk !== ''
          ? { clerkUserDataId: +updateClerk }
          : issueData?.clerkUserDataId != null
            ? { clerkUserDataId: null }
            : {}),
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
    if (isLoadingAuthor) return;
    if (!messageAuthor) {
      setActionError(authorError ? staffNameLoadError(authorError) : STAFF_NAME_MISSING);
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
          await createMessage(+id, {
            author,
            message: isLast ? text : undefined,
            file: fileData,
            fileName: selectedFiles[i].name,
          });
        }
      } else {
        await createMessage(+id, { author, message: text });
      }

      setMessageText('');
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadMessages();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setIsSending(false);
    }
  }

  async function openFile(msg: SupportMessageInfo): Promise<void> {
    if (!issueData || !msg.fileName) return;
    try {
      const { data, contentType } = await getFile(issueData.id, msg.id);
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

  if (loadError) return <ErrorHint message={loadError} />;
  if (isLoading || !issueData) return <StyledLoadingSpinner size={SpinnerSize.LG} />;

  return (
    <div ref={containerRef} className="w-full flex text-left">
      <div style={{ width: `${splitPercent}%` }} className="flex flex-col gap-6 min-w-0 pr-2">
        {actionError && <ErrorHint message={actionError} />}

        {/* Info Panels */}
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
              label="Customer ID"
              value={
                <button
                  className="text-dfxBlue-400 underline hover:text-dfxBlue-800"
                  onClick={() => navigate(`/realunit/compliance/user/${issueData.account.id}`)}
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
            <InfoRow label="Country" value={issueData.account.country?.name ?? '-'} />
            <InfoRow
              label="Language"
              value={
                issueData.account.language?.name
                  ? `${issueData.account.language.name}${issueData.account.language.symbol ? ` (${issueData.account.language.symbol})` : ''}`
                  : '-'
              }
            />
          </InfoPanel>
        </div>

        {/* Update Controls */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-dfxGray-700 mb-3">{translate('screens/support', 'Update Issue')}</h2>
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
                <option value="">-</option>
                {updateClerk && !clerks.some((c) => String(c.userDataId) === updateClerk) && (
                  <option key={updateClerk} value={updateClerk}>
                    {issueData?.clerk ?? updateClerk}
                  </option>
                )}
                {clerks.map((c) => (
                  <option key={c.userDataId} value={String(c.userDataId)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="px-4 py-1.5 bg-dfxBlue-400 text-white rounded text-xs hover:bg-dfxBlue-800 transition-colors disabled:opacity-50"
              onClick={handleUpdate}
              disabled={isUpdating}
            >
              {isUpdating ? 'Updating...' : 'Update'}
            </button>
          </div>
        </div>

        {/* Messages / Chat */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-dfxGray-700">
              {translate('screens/support', 'Messages')} ({messages.length})
            </h2>
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
            <SupportMessageList messages={messages} onOpenFile={(msg) => openFile(msg as SupportMessageInfo)} />
          </div>

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
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
          {!isLoadingAuthor && !messageAuthor && (
            <ErrorHint message={authorError ? staffNameLoadError(authorError) : STAFF_NAME_MISSING} />
          )}
          <div className="flex gap-2 items-start">
            <input
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
            <textarea
              className="flex-1 px-3 py-2 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800 resize-y min-h-[40px] max-h-[300px]"
              value={messageText}
              rows={Math.min(8, Math.max(1, messageText.split('\n').length))}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={translate('screens/support', 'Type a message...')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <span className="px-2 py-2 text-xs text-dfxBlue-800 whitespace-nowrap" title="Author">
              {isLoadingAuthor ? '…' : (messageAuthor ?? '—')}
            </span>
            <button
              className="px-4 py-2 bg-dfxBlue-400 text-white rounded text-sm hover:bg-dfxBlue-800 transition-colors disabled:opacity-50"
              onClick={() => handleSendMessage()}
              disabled={
                isSending ||
                isLoadingAuthor ||
                !messageAuthor ||
                (!messageText.trim() && selectedFiles.length === 0)
              }
            >
              {isSending ? '...' : 'Send'}
            </button>
          </div>
          <div className="text-xs text-dfxGray-700 mt-1">
            {translate('screens/support', 'Customer will be notified by email when you send a message.')}
          </div>
        </div>
      </div>

      {/* Draggable Splitter */}
      <div className="w-1.5 cursor-col-resize flex-shrink-0 group flex items-stretch" onMouseDown={handleSplitDrag}>
        <div className="w-0.5 mx-auto bg-dfxGray-400 group-hover:bg-dfxBlue-400 transition-colors rounded-full" />
      </div>

      {/* File Preview */}
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
    </div>
  );
}
