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
import { MdAccessTime, MdErrorOutline, MdOutlineClose, MdSend } from 'react-icons/md';
import { RiCheckFill } from 'react-icons/ri';
import { useParams } from 'react-router-dom';
import { IssueTypeLabels, toPaymentStateLabel } from 'src/config/labels';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useNavigation } from 'src/hooks/navigation.hook';
import { useSessionStore } from 'src/hooks/session-store.hook';
import { relativeDayKey, shouldShowDateSeparator } from 'src/util/support-helpers';
import { blankedAddress, formatBytes, formatSwissTime } from 'src/util/utils';
import { useLayoutOptions } from '../hooks/layout-config.hook';
import { TxInfo } from './transaction.screen';

export default function ChatScreen(): JSX.Element {
  const { navigate } = useNavigation();
  const { translate } = useSettingsContext();
  const { supportIssue, isLoading, loadSupportIssue, setSync } = useSupportChatContext();
  const { supportIssueUid: supportIssueUidStore } = useSessionStore();
  const { id: issueUidParam } = useParams();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  // First scroll jumps instantly; later message arrivals may animate (unless reduced motion).
  const hasScrolledToEndRef = useRef(false);

  const [sessionUid, setSessionUid] = useState<string>(() => {
    return supportIssueUidStore.get() || '';
  });

  useEffect(() => {
    if (issueUidParam) {
      setSessionUid(issueUidParam);
      supportIssueUidStore.set(issueUidParam);
      navigate('/support/chat', { replace: true });
    } else if (sessionUid) {
      setSync(true);
      loadSupportIssue(sessionUid).catch(() => {
        navigate('/support/issue', { replace: true });
      });
    } else {
      navigate('/support/issue', { replace: true });
    }

    return () => setSync(false);
  }, [issueUidParam, sessionUid]);

  useEffect(() => {
    if (supportIssue?.messages && messagesEndRef.current) {
      const prefersReducedMotion =
        typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const behavior: ScrollBehavior = !hasScrolledToEndRef.current || prefersReducedMotion ? 'auto' : 'smooth';
      messagesEndRef.current.scrollIntoView({ behavior });
      hasScrolledToEndRef.current = true;
    }
  }, [supportIssue?.messages.length]);

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
          <div className="flex flex-col flex-grow gap-1 h-0 overflow-auto p-3.5">
            {!!supportIssue.transaction && <TransactionComponent transactionUid={supportIssue.transaction.uid} />}
            {supportIssue.messages.map((message, index) => {
              const prevSender = index > 0 ? supportIssue.messages[index - 1].author : null;
              const isNewSender = prevSender !== message.author;
              const previousCreated = index > 0 ? supportIssue.messages[index - 1].created : undefined;
              return (
                <div key={message.id}>
                  {shouldShowDateSeparator(message.created, previousCreated) && <DateTag date={message.created} />}
                  <ChatBubble hasHeader={isNewSender} {...message} />
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <InputComponent />
        </div>
      )}
    </>
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

  const relativeKey = relativeDayKey(date);
  const label = relativeKey
    ? translate('screens/support', relativeKey)
    : new Date(date).toLocaleDateString([locale, 'en-US'], {
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
  const [inputValue, setInputValue] = useState<string>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();

  function handleSend() {
    if (!inputValue || error) return;

    submitMessage(inputValue, selectedFiles);

    setInputValue('');
    setSelectedFiles([]);
    return;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files as FileList;

    if (files && files.length > 0) {
      setSelectedFiles((prevFiles) => [...prevFiles, ...files]);
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

  // Same condition handleSend uses to early-return — also drives disabled + styles.
  const canSend = !!inputValue && !error;

  return (
    <div className="flex flex-col gap-2 pt-4 px-4 bg-dfxGray-300 border-t border-dfxGray-500 rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))]">
      {selectedFiles.length > 0 && (
        <div className="flex flex-row flex-wrap gap-2">
          {selectedFiles.map((file, index) => (
            <div
              key={index}
              className="flex flex-row gap-1.5 items-center text-dfxBlue-800 bg-dfxGray-400 rounded-md p-2 pr-3"
            >
              <HiOutlinePaperClip className="text-lg" />
              <p className="text-left text-sm">{blankedAddress(file.name, { displayLength: 20 })}</p>
              <MdOutlineClose
                className="text-dfxGray-300 text-md ml-1 bg-dfxGray-800/40 rounded-full p-0.5 cursor-pointer"
                onClick={() => removeFile(index)}
              />
            </div>
          ))}
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
            accept=".pdf, .jpeg, .jpg, .png"
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

  return (
    <div className={`flex text-left ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex flex-col max-w-xs rounded-lg overflow-clip pb-1.5 gap-1.5 ${
          isUser ? 'bg-dfxBlue-800 text-white rounded-br-none' : 'bg-dfxGray-300 text-dfxBlue-800 rounded-bl-none'
        } ${hasHeader || !hasFile ? 'pt-1.5' : ''} ${failedToSend ? 'opacity-60 pointer-events-none' : ''}`}
      >
        {hasHeader && !isUser && <p className="font-semibold text-sm text-dfxBlue-400 px-3">{author}</p>}
        {hasFile && <ChatBubbleFileEmbed messageId={id} fileName={fileName} file={file} />}
        {message && <p className="leading-snug text-sm px-3 whitespace-pre-wrap">{message}</p>}
        <div className="flex flex-row justify-end items-center px-3 -mt-0.5">
          <div
            className={`flex flex-row items-center justify-center text-xs italic text-end ${
              isUser ? 'text-white/70' : 'text-dfxGray-800'
            }`}
          >
            {formatSwissTime(created)}
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
