import {
  ApiError,
  DataFile,
  SupportMessage,
  SupportMessageStatus,
  Transaction,
  TransactionState,
  TransactionType,
  useSupportChatContext,
  useTransaction,
} from '@dfx.swiss/react';
import {
  AssetIconVariant,
  DfxAssetIcon,
  DfxIcon,
  IconSize,
  IconVariant,
  SpinnerSize,
  SpinnerVariant,
  StyledCollapsible,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useRef, useState } from 'react';
import { HiOutlineDownload, HiOutlinePaperClip } from 'react-icons/hi';
import { MdAccessTime, MdErrorOutline, MdKeyboardArrowDown, MdOutlineClose, MdSend } from 'react-icons/md';
import { RiCheckFill } from 'react-icons/ri';
import { useLocation, useParams } from 'react-router-dom';
import { IssueTypeLabels, toPaymentStateLabel } from 'src/config/labels';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useNavigation } from 'src/hooks/navigation.hook';
import { useSessionStore } from 'src/hooks/session-store.hook';
import { reportClientError } from 'src/util/client-error';
import { relativeDayKey, shouldShowDateSeparator } from 'src/util/support-helpers';
import { blankedAddress, formatBytes, formatSwissTime } from 'src/util/utils';
import { useLayoutOptions } from '../hooks/layout-config.hook';
import { TxInfo } from './transaction.screen';

/** Single source for the file picker accept list and paste/drop validation. */
const ACCEPTED_FILE_EXTENSIONS = ['.pdf', '.jpeg', '.jpg', '.png'] as const;
const ACCEPTED_FILE_ACCEPT = ACCEPTED_FILE_EXTENSIONS.join(', ');
const ACCEPTED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);

function isAcceptedAttachment(file: File): boolean {
  if (file.type && ACCEPTED_MIME_TYPES.has(file.type.toLowerCase())) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_FILE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Preview chips use MIME only — never the filename — so a user-controlled name cannot gate img src. */
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * Only object-URLs may become an <img src>. Values that reach this helper can be
 * traced from clipboard/drop File objects (CodeQL js/xss-through-dom); createObjectURL
 * always yields `blob:…`, so this is an explicit sink guard, not a behaviour change.
 */
function asBlobPreviewUrl(url: string | undefined): string | undefined {
  return url && url.startsWith('blob:') ? url : undefined;
}

/** Bubble timestamps only — leave global formatSwissTime alone (many other call sites). */
function formatMessageTime(value: Date | string | number | undefined): string {
  if (value == null) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatSwissTime(date);
}

/** Pixels from the bottom that still count as “at the end of the thread”. */
const SCROLL_BOTTOM_THRESHOLD_PX = 48;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isScrollNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX;
}

export default function ChatScreen(): JSX.Element {
  const { navigate } = useNavigation();
  const { translate } = useSettingsContext();
  const { supportIssue, isLoading, isError, loadSupportIssue, setSync } = useSupportChatContext();
  const { supportIssueUid: supportIssueUidStore } = useSessionStore();
  const { id: issueUidParam } = useParams();
  // Same route source as error.screen — memory-router safe in widget/library builds.
  const { pathname } = useLocation();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  // First scroll jumps instantly; later arrivals animate only when the user was already at the bottom.
  const hasScrolledToEndRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  /** Tracks the first unread id without re-running the message-length effect. */
  const firstUnreadMessageIdRef = useRef<number | undefined>();

  const [sessionUid, setSessionUid] = useState<string>(() => {
    return supportIssueUidStore.get() || '';
  });
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  /** Id of the first message that arrived while the user was scrolled up — drives the “New” line. */
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<number | undefined>();

  useEffect(() => {
    if (issueUidParam) {
      setSessionUid(issueUidParam);
      supportIssueUidStore.set(issueUidParam);
      navigate('/support/chat', { replace: true });
    } else if (sessionUid) {
      setSync(true);
      loadSupportIssue(sessionUid).catch((error: unknown) => {
        reportClientError(error, pathname);
        navigate('/support/issue', { replace: true });
      });
    } else {
      navigate('/support/issue', { replace: true });
    }

    return () => setSync(false);
  }, [issueUidParam, sessionUid]);

  // Sync failure is silent in the context (isError set, never shown). Report what the customer
  // is about to see as the connection banner; dedup lives inside reportClientError.
  useEffect(() => {
    if (!isError) return;
    reportClientError(Object.assign(new Error(isError), { name: 'SupportSyncError' }), pathname);
  }, [isError, pathname]);

  useEffect(() => {
    if (!supportIssue?.messages) return;

    const messages = supportIssue.messages;
    const length = messages.length;
    const previousLength = prevMessageCountRef.current;
    const added = length - previousLength;
    const end = messagesEndRef.current;
    if (!end) {
      prevMessageCountRef.current = length;
      return;
    }

    const reduced = prefersReducedMotion();

    if (!hasScrolledToEndRef.current) {
      // Initial open: jump to the latest message without animation.
      end.scrollIntoView({ behavior: 'auto' });
      hasScrolledToEndRef.current = true;
      isNearBottomRef.current = true;
      setIsNearBottom(true);
    } else if (added > 0) {
      if (isNearBottomRef.current) {
        end.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      } else {
        // User is reading older messages — keep position, mark what is new.
        if (firstUnreadMessageIdRef.current === undefined && previousLength > 0) {
          const firstNewId = messages[previousLength].id;
          firstUnreadMessageIdRef.current = firstNewId;
          setFirstUnreadMessageId(firstNewId);
        }
        setUnreadCount((count) => count + added);
      }
    }

    prevMessageCountRef.current = length;
  }, [supportIssue?.messages.length]);

  function clearUnreadMarkers() {
    firstUnreadMessageIdRef.current = undefined;
    setFirstUnreadMessageId(undefined);
    setUnreadCount(0);
  }

  function handleThreadScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    const near = isScrollNearBottom(el);
    isNearBottomRef.current = near;
    setIsNearBottom(near);
    if (near) clearUnreadMarkers();
  }

  function scrollToBottom() {
    const end = messagesEndRef.current;
    if (!end) return;
    end.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    isNearBottomRef.current = true;
    setIsNearBottom(true);
    clearUnreadMarkers();
  }

  useLayoutOptions({
    title: supportIssue && translate('screens/support', IssueTypeLabels[supportIssue?.type]),
    onBack: () => navigate('/support/tickets'),
    noPadding: true,
  });

  return (
    <>
      {isLoading || !supportIssue ? (
        <div className="mt-4">
          <StyledLoadingSpinner size={SpinnerSize.LG} />
        </div>
      ) : (
        <div className="flex flex-col gap-2 w-full h-full">
          <div className="relative flex flex-col flex-grow h-0 min-h-0">
            <div
              ref={scrollContainerRef}
              onScroll={handleThreadScroll}
              className="flex flex-col flex-grow gap-1 h-full overflow-auto p-3.5"
              data-testid="chat-scroll"
            >
              {isError && (
                <div
                  className="flex flex-wrap justify-center py-2"
                  data-testid="chat-sync-error"
                  role="status"
                >
                  <p className="text-xs text-dfxGray-700 text-center px-2">
                    {translate(
                      'screens/support',
                      'Connection interrupted. New messages cannot be received right now.',
                    )}
                  </p>
                </div>
              )}
              {!!supportIssue.transaction && <TransactionComponent transactionUid={supportIssue.transaction.uid} />}
              {supportIssue.messages.map((message, index) => {
                const prevSender = index > 0 ? supportIssue.messages[index - 1].author : null;
                const isNewSender = prevSender !== message.author;
                const previousCreated = index > 0 ? supportIssue.messages[index - 1].created : undefined;
                return (
                  <div key={message.id}>
                    {shouldShowDateSeparator(message.created, previousCreated) && <DateTag date={message.created} />}
                    {firstUnreadMessageId !== undefined && message.id === firstUnreadMessageId && (
                      <NewMessagesDivider />
                    )}
                    <ChatBubble hasHeader={isNewSender} {...message} />
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {!isNearBottom && (
              <button
                type="button"
                onClick={scrollToBottom}
                aria-label={translate(
                  'screens/support',
                  unreadCount > 0 ? 'Scroll to new messages' : 'Scroll to bottom',
                )}
                className="absolute bottom-3 right-3 z-10 flex items-center justify-center h-11 min-w-[2.75rem] px-2 rounded-full bg-dfxBlue-800 text-white shadow-dfx outline-none focus-visible:ring-2 focus-visible:ring-dfxBlue-400 focus-visible:ring-offset-2 cursor-pointer"
                data-testid="scroll-to-bottom"
              >
                <MdKeyboardArrowDown className="text-2xl" aria-hidden />
                {unreadCount > 0 && (
                  <span className="ml-1 text-sm font-semibold tabular-nums" data-testid="unread-count">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}
          </div>
          <InputComponent />
        </div>
      )}
    </>
  );
}

function NewMessagesDivider(): JSX.Element {
  const { translate } = useSettingsContext();
  return (
    <div className="flex items-center gap-2 py-3" data-testid="new-messages-divider">
      <div className="flex-grow h-px bg-dfxBlue-400" />
      <span className="text-xs font-semibold text-dfxBlue-400 shrink-0">{translate('screens/support', 'New')}</span>
      <div className="flex-grow h-px bg-dfxBlue-400" />
    </div>
  );
}

interface TransactionComponentProps {
  transactionUid: string;
}

function TransactionComponent({ transactionUid }: TransactionComponentProps): JSX.Element {
  const { getTransactionByUid } = useTransaction();
  const { translate } = useSettingsContext();

  const [tx, setTx] = useState<Transaction>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    getTransactionByUid(transactionUid)
      .then(setTx)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsLoading(false));
  }, [transactionUid]);

  const isUnassigned = tx?.state === TransactionState.UNASSIGNED;
  const icon =
    tx &&
    !isUnassigned &&
    (tx.type === TransactionType.SELL ? [tx.inputAsset, tx.outputAsset] : [tx.outputAsset, tx.inputAsset])
      .map((a) => a?.replace(/^d/, '') as AssetIconVariant)
      .find((a) => Object.values(AssetIconVariant).includes(a));

  return (
    <div className="flex w-full justify-center mb-2">
      {!tx || isLoading ? (
        <div className="flex flex-row gap-2 justify-center bg-dfxGray-300/50 w-full rounded-md p-4">
          {!error && <StyledLoadingSpinner size={SpinnerSize.MD} variant={SpinnerVariant.LIGHT_MODE} />}
          <span className={`text-sm ${error ? 'text-dfxRed-100' : 'text-dfxBlue-600'}`}>
            {error ?? translate('screens/payment', 'Loading transaction...')}
          </span>
        </div>
      ) : (
        <StyledCollapsible
          full
          titleContent={
            <div className="flex flex-row gap-2 items-center">
              {icon ? (
                <DfxAssetIcon asset={icon as AssetIconVariant} />
              ) : (
                <DfxIcon icon={IconVariant.HELP} size={IconSize.LG} />
              )}
              <div className="flex flex-col items-start text-left">
                <div className="font-bold leading-none">{translate('screens/payment', tx.type)}</div>
                <div className={`leading-none ${isUnassigned && 'text-dfxRed-100'}`}>
                  {translate('screens/payment', toPaymentStateLabel(tx.state))}
                </div>
              </div>
              <div className="ml-auto">
                {tx.inputAsset ? `${tx.inputAmount ?? ''} ${tx.inputAsset}` : ''}
                {tx.inputAsset && tx.outputAsset ? ' → ' : ''}
                {tx.outputAsset ? `${tx.outputAmount ?? ''} ${tx.outputAsset}` : ''}
              </div>
            </div>
          }
        >
          <StyledVerticalStack full gap={4}>
            <TxInfo tx={tx} showUserDetails={false} />
          </StyledVerticalStack>
        </StyledCollapsible>
      )}
    </div>
  );
}

interface DateTagProps {
  date: Date;
}

function DateTag({ date }: DateTagProps): JSX.Element {
  const { locale, translate } = useSettingsContext();
  const parsed = date instanceof Date ? date : new Date(date);
  // Same rule as the bubble clock: never render the browser's "Invalid Date" string.
  if (Number.isNaN(parsed.getTime())) return <></>;

  const relativeKey = relativeDayKey(parsed);
  const label = relativeKey
    ? translate('screens/support', relativeKey)
    : parsed.toLocaleDateString([locale, 'en-US'], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

  return (
    <div className="flex flex-wrap justify-center py-8">
      <div className=" text-xs font-semibold py-1 px-3 bg-dfxGray-300 text-dfxGray-700 rounded-full">{label}</div>
    </div>
  );
}

function InputComponent(): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { submitMessage } = useSupportChatContext();
  const { pathname } = useLocation();
  const [inputValue, setInputValue] = useState<string>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<(string | undefined)[]>([]);

  // Object URLs for image chips — revoke on change/unmount (same pattern as compliance previews).
  useEffect(() => {
    const urls = selectedFiles.map((file) => (isImageFile(file) ? URL.createObjectURL(file) : undefined));
    setPreviewUrls(urls);
    return () => {
      urls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [selectedFiles]);

  function handleSend() {
    const hasText = !!(inputValue && inputValue.trim() !== '');
    const hasFiles = selectedFiles.length > 0;
    // Match the SDK guard: text and/or files, never neither — and never with a validation error.
    if ((!hasText && !hasFiles) || error) return;

    // Customer already sees a failed bubble from the context on reject — report what they saw.
    // reportClientError is fire-and-forget (never throws into the UI).
    void submitMessage(inputValue, selectedFiles).catch((err: unknown) => {
      reportClientError(err, pathname);
    });

    setInputValue('');
    setSelectedFiles([]);
    return;
  }

  function addFiles(files: File[]) {
    if (files.length === 0) return;

    const accepted = files.filter(isAcceptedAttachment);
    const hasRejected = accepted.length < files.length;
    const fileTypeError = translateError('file_type');

    if (hasRejected) {
      setError(fileTypeError);
      // No Error from the browser for a type reject — still a failure the user reads in the field.
      reportClientError(
        Object.assign(new Error('Rejected support chat attachment type'), { name: 'SupportAttachmentTypeError' }),
        pathname,
      );
    } else if (accepted.length > 0 && (inputValue?.length ?? 0) <= 4000) {
      // Clear a prior file-type error once a valid batch is added (keep length errors).
      setError((prev) => (prev === fileTypeError ? undefined : prev));
    }

    if (accepted.length > 0) {
      setSelectedFiles((prevFiles) => [...prevFiles, ...accepted]);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files as FileList;

    if (files && files.length > 0) {
      addFiles(Array.from(files));
      setTimeout(() => (e.target.value = ''), 100);
    }
  }

  function removeFile(index: number) {
    setSelectedFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        setInputValue((prevValue) => (prevValue ? `${prevValue}\n` : ''));
      } else {
        handleSend();
      }
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;

    if (value.length > 4000) {
      setError(translateError('message_length'));
    } else if (error) {
      setError(undefined);
    }

    setInputValue(value);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    // Text-only paste keeps the default behaviour.
    if (files.length === 0) return;

    e.preventDefault();
    addFiles(files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    addFiles(files);
  }

  // Same condition handleSend uses to early-return — also drives disabled + styles.
  const hasText = !!(inputValue && inputValue.trim() !== '');
  const hasFiles = selectedFiles.length > 0;
  const canSend = (hasText || hasFiles) && !error;

  return (
    <div
      className={`flex flex-col gap-2 pt-4 px-4 bg-dfxGray-300 border-t border-dfxGray-500 rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))] ${
        isDragging ? 'ring-2 ring-inset ring-dfxBlue-400' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid="composer-drop-zone"
    >
      {selectedFiles.length > 0 && (
        <div className="flex flex-row flex-wrap gap-2">
          {selectedFiles.map((file, index) => {
            const previewSrc = asBlobPreviewUrl(previewUrls[index]);
            return (
              <div
                key={`${file.name}-${index}`}
                className="flex flex-row gap-1.5 items-center text-dfxBlue-800 bg-dfxGray-400 rounded-md p-2 pr-3"
              >
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt=""
                    className="w-8 h-8 rounded-sm object-cover shrink-0"
                    data-testid="attachment-preview"
                  />
                ) : (
                  <HiOutlinePaperClip className="text-lg" />
                )}
                <p className="text-left text-sm">{blankedAddress(file.name, { displayLength: 20 })}</p>
                <MdOutlineClose
                  className="text-dfxGray-300 text-md ml-1 bg-dfxGray-800/40 rounded-full p-0.5 cursor-pointer"
                  onClick={() => removeFile(index)}
                />
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-row items-center gap-2">
        <label
          className="relative flex items-center justify-center w-11 h-11 shrink-0 rounded-full cursor-pointer text-dfxGray-800 hover:bg-dfxGray-500 focus-within:ring-2 focus-within:ring-dfxBlue-400"
          aria-label={translate('screens/support', 'Attach file')}
        >
          <HiOutlinePaperClip className="text-2xl" aria-hidden />
          <input
            className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0"
            type="file"
            multiple
            accept={ACCEPTED_FILE_ACCEPT}
            onChange={handleFileChange}
          />
        </label>

        <div
          className="
          grid
          w-full
          min-w-0
          text-sm
          bg-white
          border
          border-dfxGray-500
          rounded-full
          after:px-3.5
          after:py-2.5
          [&>textarea]:text-inherit
          after:text-inherit
          [&>textarea]:resize-none
          [&>textarea]:overflow-hidden
          [&>textarea]:[grid-area:1/1/2/2]
          after:[grid-area:1/1/2/2]
          after:whitespace-pre-wrap
          after:invisible
          after:content-[attr(data-cloned-val)_'_']
          after:border
          after:border-transparent
          text-dfxGray-800
          overflow-auto
          max-h-40"
          data-cloned-val={inputValue}
        >
          <textarea
            className="
            w-full
            bg-transparent
            appearance-none
            rounded-full
            px-3.5
            py-2.5
            outline-none
            focus:ring-2
            focus:ring-inset
            focus:ring-dfxBlue-400"
            name="message"
            id="message"
            rows={1}
            value={inputValue}
            onKeyDown={handleKeyDown}
            onChange={handleChange}
            onPaste={handlePaste}
            placeholder={translate('screens/support', 'Write a message...')}
            required
          />
          {error && <p className="text-dfxRed-150 text-xs px-3.5 pb-2 text-left">{error}</p>}
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label={translate('screens/support', 'Send message')}
          className={`flex items-center justify-center w-11 h-11 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-dfxBlue-400 focus-visible:ring-offset-2 ${
            canSend ? 'bg-dfxBlue-800 text-white cursor-pointer' : 'bg-dfxGray-500 text-dfxGray-700 cursor-not-allowed'
          }`}
        >
          <MdSend className="text-2xl" aria-hidden />
        </button>
      </div>
    </div>
  );
}

interface ChatBubbleProps extends SupportMessage {
  hasHeader: boolean;
}

function ChatBubble({ id, message, fileName, file, created, author, status, hasHeader }: ChatBubbleProps): JSX.Element {
  const isUser = !author || author === 'Customer';
  const hasFile = !!fileName;
  const failedToSend = status === SupportMessageStatus.FAILED;

  // Failed own messages stay visually loud (error border) so the user notices them.
  // No in-app resend until the published SDK exposes it — do not promise a tap action.
  const bubbleTone = failedToSend
    ? 'bg-dfxRed-100/15 border-2 border-dfxRed-100 text-dfxBlue-800 rounded-br-none'
    : isUser
      ? 'bg-dfxBlue-800 text-white rounded-br-none'
      : 'bg-dfxGray-300 text-dfxBlue-800 rounded-bl-none';

  return (
    <div className={`flex text-left ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex flex-col max-w-xs rounded-lg overflow-clip pb-1.5 gap-1.5 text-left ${
          hasHeader || !hasFile ? 'pt-1.5' : ''
        } ${bubbleTone}`}
        data-testid={failedToSend ? 'msg-failed' : undefined}
      >
        {hasHeader && !isUser && <p className="font-semibold text-sm text-dfxBlue-400 px-3">{author}</p>}
        {hasFile && <ChatBubbleFileEmbed messageId={id} fileName={fileName} file={file} />}
        {message && <p className="leading-snug text-sm px-3 whitespace-pre-wrap">{message}</p>}
        <div className="flex flex-row justify-end items-center px-3 -mt-0.5">
          <div
            className={`flex flex-row items-center justify-center text-xs italic text-end ${
              failedToSend ? 'text-dfxRed-100' : isUser ? 'text-white/70' : 'text-dfxGray-800'
            }`}
          >
            {formatMessageTime(created)}
            {isUser &&
              (failedToSend ? (
                <MdErrorOutline className="inline-block text-base ml-1 mb-0.5" data-testid="msg-status-failed" />
              ) : status === SupportMessageStatus.SENT ? (
                <MdAccessTime className="inline-block text-base ml-1 mb-0.5" data-testid="msg-status-sent" />
              ) : (
                <RiCheckFill className="inline-block text-base ml-1 mb-0.5" data-testid="msg-status-received" />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChatBubbleFileEmbedProps {
  messageId: number;
  fileName: string;
  file?: DataFile;
}

enum FileType {
  IMAGE = 'Image',
  DOCUMENT = 'Document',
}

const FileTypeMap: { [key: string]: FileType } = {
  application: FileType.DOCUMENT,
  image: FileType.IMAGE,
};

function ChatBubbleFileEmbed({ messageId, fileName, file }: ChatBubbleFileEmbedProps): JSX.Element {
  const { translate } = useSettingsContext();
  const { loadFileData } = useSupportChatContext();

  const [showPreview, setShowPreview] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [error, setError] = useState<string>();

  const loadedFile = file;
  const isLoaded = !!loadedFile;
  const fileType = (loadedFile && FileTypeMap[loadedFile.type.split('/')[0]]) || FileType.DOCUMENT;

  function onClick(e: React.MouseEvent<any>) {
    e.stopPropagation();

    if (loadedFile) {
      fileType === FileType.DOCUMENT ? window.open(loadedFile.url, '_blank') : setShowPreview(true);
    } else {
      setError(undefined);
      setIsLoadingFile(true);
      loadFileData(messageId)
        .catch(() => setError('Download failed'))
        .finally(() => setIsLoadingFile(false));
    }
  }

  const icon = isLoadingFile ? (
    <StyledLoadingSpinner size={SpinnerSize.MD} variant={SpinnerVariant.LIGHT_MODE} />
  ) : !isLoaded ? (
    <HiOutlineDownload />
  ) : (
    <HiOutlinePaperClip />
  );

  const description = isLoadingFile
    ? translate('screens/support', 'Downloading...')
    : !loadedFile
      ? translate('general/actions', 'Download')
      : `${translate('screens/support', fileType)} · ${formatBytes(loadedFile.size)}`;

  return (
    <>
      {loadedFile && fileType === FileType.IMAGE ? (
        <img
          src={loadedFile.url}
          alt={fileName}
          className="rounded-sm mb-1 max-h-40 object-cover cursor-pointer"
          style={{ maxWidth: '100%', width: 'auto', height: 'auto' }}
          onClick={onClick}
        />
      ) : (
        <div className="flex items-center mb-1 p-2 cursor-pointer" onClick={onClick}>
          <div className="flex justify-center items-center w-12 h-12 bg-white text-dfxGray-700 text-2xl rounded-md">
            {icon}
          </div>
          <div className="flex flex-col mx-2">
            <span className="text-sm font-semibold">{blankedAddress(fileName, { displayLength: 20 })}</span>
            <span className="text-xs font-medium opacity-60">{error ?? description}</span>
          </div>
        </div>
      )}
      {showPreview && loadedFile && fileType === FileType.IMAGE && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="absolute top-3 right-3 text-white pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation();
              setShowPreview(false);
            }}
          >
            <MdOutlineClose className="text-2xl" />
          </button>
          <div className="relative m-4 pointer-events-auto">
            <div className="rounded-sm overflow-clip">
              <img src={loadedFile.url} alt={fileName} className="max-h-96" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
