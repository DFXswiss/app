// DFX App 2.0 — support screen.
//
// Ported from the static preview's `v-support` / `v-ticket` / `v-chat`
// sections (public/app2/index.html, markup ~lines 946-1066; `openTicket()` /
// `submitTicket()` around line 1935, `openChat()` / `chatSend()` around line
// 2032 for behaviour) — the FAQ/knowledge-base search isn't part of this
// milestone's task list, so this screen covers ticket list, create-issue and
// the chat thread only. `SupportChatContextProvider` isn't mounted by
// DfxContextProvider (unlike UserContextProvider), so this screen mounts its
// own instance, scoped to this route.

import {
  ApiException,
  CreateSupportIssue,
  SupportChatContextProvider,
  SupportIssue,
  SupportIssueReason,
  SupportIssueState,
  SupportIssueType,
  SupportMessage,
  SupportMessageStatus,
  useSupportChatContext,
  useUserContext,
} from '@dfx.swiss/react';
import { ChangeEvent, FormEvent, useEffect, useId, useRef, useState } from 'react';
import { LoadingRow, onActivate, Sheet, SheetHeader, useToast } from '../components/ui';
import { useT, type Language, type TranslationKey } from '../i18n';
import { useWalletSession } from '../wallets/session';
import { formatDateTime, shortAddress } from './parts/format';
import { LoggedOutState } from './parts/LoggedOutState';
import {
  findSendCandidate,
  shouldSyncSupportIssue,
  type SendAttempt,
} from './support-delivery';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SEND_SETTLE_TIMEOUT_MS = 30_000;

interface TicketTypeOption {
  key: TranslationKey;
  type: SupportIssueType;
  reason: SupportIssueReason;
}

// Curated topic list — mirrors the static app's `TICKET_TYPES` (a friendlier
// front door than a raw 8-value SupportIssueType dropdown).
const TICKET_TYPES: TicketTypeOption[] = [
  { key: 'tkGeneral', type: SupportIssueType.GENERIC_ISSUE, reason: SupportIssueReason.OTHER },
  { key: 'tkTrade', type: SupportIssueType.GENERIC_ISSUE, reason: SupportIssueReason.FUNDS_NOT_RECEIVED },
  { key: 'tkTxMissing', type: SupportIssueType.TRANSACTION_ISSUE, reason: SupportIssueReason.TRANSACTION_MISSING },
  { key: 'tkTxFunds', type: SupportIssueType.TRANSACTION_ISSUE, reason: SupportIssueReason.FUNDS_NOT_RECEIVED },
  { key: 'tkKyc', type: SupportIssueType.KYC_ISSUE, reason: SupportIssueReason.OTHER },
  { key: 'tkBug', type: SupportIssueType.BUG_REPORT, reason: SupportIssueReason.OTHER },
];

const ISSUE_TYPE_KEY: Record<SupportIssueType, TranslationKey> = {
  [SupportIssueType.GENERIC_ISSUE]: 'itGeneric',
  [SupportIssueType.TRANSACTION_ISSUE]: 'itTransaction',
  [SupportIssueType.VERIFICATION_CALL]: 'itVerification',
  [SupportIssueType.KYC_ISSUE]: 'itKyc',
  [SupportIssueType.LIMIT_REQUEST]: 'itLimit',
  [SupportIssueType.PARTNERSHIP_REQUEST]: 'itPartner',
  [SupportIssueType.NOTIFICATION_OF_CHANGES]: 'itChanges',
  [SupportIssueType.BUG_REPORT]: 'itBug',
};

function issueTypeLabel(t: (key: TranslationKey) => string, type: SupportIssueType): string {
  return t(ISSUE_TYPE_KEY[type] ?? 'itGeneric');
}

function issueStateVariant(state: SupportIssueState): 'act' | 'pend' | 'rdy' | 'ina' {
  if (state === SupportIssueState.COMPLETED) return 'act';
  if (state === SupportIssueState.PENDING) return 'pend';
  if (state === SupportIssueState.CREATED) return 'rdy';
  return 'ina';
}

function isClosed(issue: SupportIssue | undefined): boolean {
  return issue?.state === SupportIssueState.COMPLETED || issue?.state === SupportIssueState.CANCELED;
}

function isImageFile(name: string | undefined): boolean {
  return !!name && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

function retryFileFrom(message: SupportMessage): File | undefined {
  if (!message.fileName || !message.file?.file) return undefined;
  const encoded = message.file.file.includes(',') ? message.file.file.split(',').pop() : message.file.file;
  if (!encoded) return undefined;
  const binary = window.atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new File([bytes], message.fileName, { type: message.file.type || 'application/octet-stream' });
}

const ATTACH_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M21 12.5 12.5 21a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3l7.5-7.5"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const SEND_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M4 12 20 4l-4 16-4-6-8-2Z"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const FILE_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M14 3v5h5" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
    <path d="M7 3h8l5 5v13H7z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
  </svg>
);
const CHEV_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const MAIL_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={3} y={5.5} width={18} height={13} rx={3} stroke="currentColor" strokeWidth={1.7} />
    <path
      d="M4.5 8 12 13.2 19.5 8"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const DOCS_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M6 3h9l3 3v15H6z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
    <path d="M9 11h6M9 15h6" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
  </svg>
);
const EXT_ICON = (
  <svg className="ext-ic" viewBox="0 0 24 24" fill="none">
    <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function SupportScreen() {
  return (
    <SupportChatContextProvider>
      <SupportScreenBody />
    </SupportChatContextProvider>
  );
}

function SupportScreenBody() {
  const { t, language } = useT();
  const { showToast } = useToast();
  const { isLoggedIn, address } = useWalletSession();
  const { user, updateMail } = useUserContext();
  const support = useSupportChatContext();
  const newIssueTitleId = useId();
  const threadTitleId = useId();

  const [newIssueOpen, setNewIssueOpen] = useState(false);
  const [activeUid, setActiveUid] = useState<string | undefined>();
  const [typeIndex, setTypeIndex] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [composer, setComposer] = useState('');
  const [pendingFile, setPendingFile] = useState<File | undefined>();
  const [sending, setSending] = useState(false);
  const [sendAttempt, setSendAttempt] = useState<SendAttempt | undefined>();
  const [ticketsError, setTicketsError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [retryingMessageId, setRetryingMessageId] = useState<number | undefined>();
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<number>>(() => new Set());
  const [timedOutMessageIds, setTimedOutMessageIds] = useState<Set<number>>(() => new Set());
  const supportIssueRef = useRef(support.supportIssue);
  supportIssueRef.current = support.supportIssue;

  useEffect(() => {
    // `support` intentionally omitted — SupportChatContextProvider returns a
    // new object whenever tickets/supportIssue/isLoading/isError change, so
    // depending on it would re-trigger this on every poll tick.
    if (isLoggedIn) {
      setTicketsError('');
      void support.loadTickets().catch(() => setTicketsError(t('loadFail')));
    }
  }, [isLoggedIn]);

  useEffect(() => {
    // The SDK's sync path reads the last message without guarding an empty thread.
    support.setSync(shouldSyncSupportIssue(activeUid, support.supportIssue));
    return () => support.setSync(false);
  }, [activeUid, support.supportIssue?.uid, support.supportIssue?.messages.length]);

  useEffect(() => {
    if (!sendAttempt) return;
    if (support.supportIssue?.uid !== sendAttempt.issueUid) return;
    const candidate = findSendCandidate(support.supportIssue.messages, sendAttempt);
    if (!candidate || candidate.status === SupportMessageStatus.SENT) return;

    const succeeded = candidate.status !== SupportMessageStatus.FAILED;
    if (succeeded && sendAttempt.clearComposer) {
      setComposer((current) => (current.trim() === (sendAttempt.text?.trim() ?? '') ? '' : current));
      setPendingFile((current) => (current === sendAttempt.file ? undefined : current));
    }
    if (sendAttempt.replacesMessageId != null) {
      const replacedMessageId = sendAttempt.replacesMessageId;
      setHiddenMessageIds((current) => new Set(current).add(replacedMessageId));
    }
    setTimedOutMessageIds((current) => {
      const next = new Set(current);
      next.delete(candidate.id);
      return next;
    });
    if (!succeeded) showToast(t('genErr'), { assertive: true });
    setSending(false);
    setRetryingMessageId(undefined);
    setSendAttempt(undefined);
  }, [sendAttempt, showToast, support.supportIssue, t]);

  useEffect(() => {
    if (!sendAttempt) return undefined;
    const timeout = window.setTimeout(() => {
      const issueAtTimeout = supportIssueRef.current;
      const candidate =
        issueAtTimeout?.uid === sendAttempt.issueUid
          ? findSendCandidate(issueAtTimeout.messages, sendAttempt)
          : undefined;
      if (candidate?.status === SupportMessageStatus.SENT) {
        setTimedOutMessageIds((current) => new Set(current).add(candidate.id));
      }
      if (sendAttempt.replacesMessageId != null) {
        const replacedMessageId = sendAttempt.replacesMessageId;
        setHiddenMessageIds((current) => new Set(current).add(replacedMessageId));
      }
      showToast(t('genErr'), { assertive: true });
      setSending(false);
      setRetryingMessageId(undefined);
      setSendAttempt(undefined);
    }, SEND_SETTLE_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [sendAttempt, showToast, t]);

  useEffect(() => {
    if (!support.supportIssue || timedOutMessageIds.size === 0) return;
    const settledIds = support.supportIssue.messages
      .filter((message) => timedOutMessageIds.has(message.id) && message.status !== SupportMessageStatus.SENT)
      .map((message) => message.id);
    if (!settledIds.length) return;
    setTimedOutMessageIds((current) => {
      const next = new Set(current);
      settledIds.forEach((id) => next.delete(id));
      return next;
    });
  }, [support.supportIssue, timedOutMessageIds]);

  if (!isLoggedIn) return <LoggedOutState title={t('mSupport')} />;

  const openNewIssue = () => {
    setTypeIndex(0);
    setName(user?.mail ?? shortAddress(address));
    setEmail('');
    setMessage('');
    setFormError('');
    setNewIssueOpen(true);
  };

  const openThread = (uid: string) => {
    setActiveUid(uid);
    setThreadError('');
    setHiddenMessageIds(new Set());
    setTimedOutMessageIds(new Set());
    void support.loadSupportIssue(uid).catch(() => setThreadError(t('loadFail')));
  };

  const closeThread = () => setActiveUid(undefined);

  const submitNewIssue = (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const trimmedName = name.trim();
    const trimmedMessage = message.trim();
    if (!trimmedName) return;
    if (!trimmedMessage) {
      setFormError(t('tkNeedMsg'));
      return;
    }
    const needsMail = !user?.mail;
    const trimmedEmail = email.trim();
    if (needsMail && !trimmedEmail.includes('@')) {
      setFormError(t('tkNeedMail'));
      return;
    }
    setSubmitting(true);
    setFormError('');
    const create = () => {
      const option = TICKET_TYPES[typeIndex] ?? TICKET_TYPES[0];
      const request: CreateSupportIssue = {
        type: option.type,
        reason: option.reason,
        name: trimmedName,
        message: trimmedMessage,
      };
      return support.createSupportIssue(request);
    };
    (needsMail ? updateMail(trimmedEmail).then(create) : create())
      .then((uid) => {
        setNewIssueOpen(false);
        showToast(t('tkSentToast'));
        openThread(uid);
      })
      .catch((err: unknown) => {
        setFormError(err instanceof ApiException && err.statusCode === 409 ? t('mailTaken') : t('tkErr'));
      })
      .finally(() => setSubmitting(false));
  };

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      showToast(t('chatFileBig'));
      return;
    }
    setPendingFile(file);
  };

  const issue = support.supportIssue;
  const closed = isClosed(issue);

  const startSend = (text: string | undefined, file: File | undefined, clearComposer: boolean, retryMessageId?: number) => {
    if (sending || (!text && !file) || closed || !issue) return;
    const attempt: SendAttempt = {
      issueUid: issue.uid,
      beforeIds: issue.messages.map((existing) => existing.id),
      text,
      file,
      clearComposer,
      startedAt: Date.now(),
      replacesMessageId: retryMessageId,
    };
    setSending(true);
    setRetryingMessageId(retryMessageId);
    setSendAttempt(attempt);
    void support.submitMessage(text, file ? [file] : undefined).catch(() => {
      showToast(t('genErr'), { assertive: true });
      setSending(false);
      setRetryingMessageId(undefined);
      setSendAttempt(undefined);
    });
  };

  const send = () => startSend(composer.trim() || undefined, pendingFile, true);

  const retryMessage = (failedMessage: SupportMessage) => {
    if (sending) return;
    try {
      const file = failedMessage.fileName ? retryFileFrom(failedMessage) : undefined;
      if (failedMessage.fileName && !file) throw new Error('Missing local attachment');
      startSend(failedMessage.message?.trim() || undefined, file, false, failedMessage.id);
    } catch {
      showToast(t('genErr'), { assertive: true });
    }
  };

  return (
    <div className="account">
      <div className="txhead">
        <h2>{t('mSupport')}</h2>
      </div>
      <p className="tnote" style={{ padding: '0 4px 6px' }}>
        {t('supportLead')}
      </p>

      <div className="sectionlabel">{t('myTickets')}</div>
      {ticketsError ? (
        <div className="glass tkempty" style={{ flexDirection: 'column', gap: 10 }}>
          <span>{ticketsError}</span>
          <button
            className="btn-mini"
            type="button"
            onClick={() => {
              setTicketsError('');
              void support.loadTickets().catch(() => setTicketsError(t('loadFail')));
            }}
          >
            {t('retry')}
          </button>
        </div>
      ) : support.isLoading && support.tickets.length === 0 ? (
        <div className="glass tkempty">
          <LoadingRow label={t('loading')} />
        </div>
      ) : support.tickets.length === 0 ? (
        <div className="glass tkempty">{t('noTickets')}</div>
      ) : (
        [...support.tickets]
          .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
          .map((ticket) => {
            const preview = ticket.messages[ticket.messages.length - 1];
            const previewText = preview?.message ?? (preview?.fileName ? `📎 ${preview.fileName}` : '');
            return (
              <button key={ticket.uid} type="button" className="tkrow glass" onClick={() => openThread(ticket.uid)}>
                <span className="tx">
                  <span className="top">
                    <b>{issueTypeLabel(t, ticket.type)}</b>
                    <span className={`pill-chip ${issueStateVariant(ticket.state)}`}>
                      {t(`is_${ticket.state}` as TranslationKey)}
                    </span>
                  </span>
                  <small>{formatDateTime(ticket.created, language)}</small>
                  {previewText && <small className="prev">{previewText}</small>}
                </span>
                <span className="chev">{CHEV_ICON}</span>
              </button>
            );
          })
      )}

      <div className="sectionlabel">{t('contactTitle')}</div>
      <div
        className="suprow glass"
        role="button"
        tabIndex={0}
        onClick={openNewIssue}
        onKeyDown={onActivate(openNewIssue)}
      >
        <span className="ic">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z"
              stroke="currentColor"
              strokeWidth={1.7}
            />
          </svg>
        </span>
        <span className="tx">
          <b>{t('supTicket')}</b>
          <small>{t('supTicketSub')}</small>
        </span>
        <span className="ext-ic">{CHEV_ICON}</span>
      </div>
      <a className="suprow glass" href="mailto:support@dfx.swiss">
        <span className="ic">{MAIL_ICON}</span>
        <span className="tx">
          <b>{t('supEmail')}</b>
          <small>support@dfx.swiss</small>
        </span>
        {EXT_ICON}
      </a>
      <a className="suprow glass" href="https://docs.dfx.swiss/" target="_blank" rel="noopener noreferrer">
        <span className="ic">{DOCS_ICON}</span>
        <span className="tx">
          <b>{t('supDocs')}</b>
          <small>docs.dfx.swiss</small>
        </span>
        {EXT_ICON}
      </a>
      <div className="supfoot">{t('supFoot')}</div>

      {/* ---- create-issue sheet ---- */}
      <Sheet open={newIssueOpen} onClose={() => setNewIssueOpen(false)} titleId={newIssueTitleId}>
        <SheetHeader titleId={newIssueTitleId} title={t('newTicket')} onClose={() => setNewIssueOpen(false)} />
        <p className="tnote" style={{ padding: '0 4px 8px' }}>
          {t('ticketLead')}
        </p>
        <form className="tform" onSubmit={submitNewIssue}>
          <label className="flabel">{t('ticketTopic')}</label>
          <select
            className="tinput"
            value={typeIndex}
            onChange={(e) => setTypeIndex(Number(e.target.value))}
            aria-label={t('ticketTopic')}
          >
            {TICKET_TYPES.map((opt, i) => (
              <option key={opt.key} value={i}>
                {t(opt.key)}
              </option>
            ))}
          </select>
          {!user?.mail && (
            <>
              <label className="flabel">{t('ticketEmail')}</label>
              <input
                className="tinput"
                type="email"
                placeholder="you@email.com"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label={t('ticketEmail')}
              />
            </>
          )}
          <label className="flabel">{t('ticketName')}</label>
          <input
            className="tinput"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            aria-label={t('ticketName')}
          />
          <label className="flabel">{t('ticketMsg')}</label>
          <textarea
            className="tinput"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label={t('ticketMsg')}
          />
          <button className="btn-primary" type="submit" style={{ marginTop: 8 }} disabled={submitting}>
            {submitting ? <LoadingRow label={t('tkSending')} /> : t('submitTicket')}
          </button>
          {formError && <div className="paybox-note warn">{formError}</div>}
        </form>
      </Sheet>

      {/* ---- chat thread sheet ---- */}
      <Sheet open={!!activeUid} onClose={closeThread} titleId={threadTitleId} showGrab={false}>
        <div className="chatwrap">
          <div className="chathead">
            <button className="rbtn" aria-label="Back" style={{ width: 40, height: 40 }} onClick={closeThread}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h2 id={threadTitleId}>{issue ? issueTypeLabel(t, issue.type) : t('chatTitle')}</h2>
          </div>
          <div className="chatthread" aria-live="polite">
            {support.isError && issue && <div className="paybox-note warn">{t('loadFail')}</div>}
            {threadError ? (
              <div className="chatempty">
                <span>{t('loadFail')}</span>
                {activeUid && (
                  <button
                    className="btn-mini"
                    type="button"
                    style={{ marginTop: 10 }}
                    onClick={() => openThread(activeUid)}
                  >
                    {t('retry')}
                  </button>
                )}
              </div>
            ) : support.isLoading && !issue ? (
              <div className="chatempty">
                <LoadingRow label={t('loading')} />
              </div>
            ) : !issue || issue.messages.length === 0 ? (
              <div className="chatempty">{t('chatEmpty')}</div>
            ) : (
              issue.messages.filter((message) => !hiddenMessageIds.has(message.id)).map((m) => (
                <ChatBubble
                  key={m.id}
                  message={m}
                  language={language}
                  retrying={retryingMessageId === m.id}
                  deliveryTimedOut={timedOutMessageIds.has(m.id)}
                  onRetry={() => retryMessage(m)}
                  onLoadFile={() => support.loadFileData(m.id)}
                />
              ))
            )}
          </div>
          {closed ? (
            <div className="chatclosed">{t('chatClosed')}</div>
          ) : (
            <>
              {pendingFile && (
                <div className="chatattach">
                  <span>{pendingFile.name}</span>
                  <span className="rm" role="button" tabIndex={0} onClick={() => setPendingFile(undefined)}>
                    ✕
                  </span>
                </div>
              )}
              <div className="chatcomposer">
                <input
                  id="chatFileInput"
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={onPickFile}
                />
                <button
                  className="chaticon"
                  aria-label="Attach file"
                  type="button"
                  onClick={() => document.getElementById('chatFileInput')?.click()}
                >
                  {ATTACH_ICON}
                </button>
                <textarea
                  rows={1}
                  aria-label="Message"
                  placeholder={t('chatPlaceholder')}
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button className="chaticon chatsend" aria-label="Send" type="button" disabled={sending} onClick={send}>
                  {SEND_ICON}
                </button>
              </div>
            </>
          )}
        </div>
      </Sheet>
    </div>
  );
}

function ChatBubble({
  message,
  language,
  retrying,
  deliveryTimedOut,
  onRetry,
  onLoadFile,
}: {
  message: SupportMessage;
  language: Language;
  retrying: boolean;
  deliveryTimedOut: boolean;
  onRetry: () => void;
  onLoadFile: () => Promise<void>;
}) {
  const { t } = useT();
  const { showToast } = useToast();
  const [loadedUrl, setLoadedUrl] = useState<string | undefined>(message.file?.url);
  const [loading, setLoading] = useState(false);
  const mine = message.author === 'Customer';
  const failed = message.status === SupportMessageStatus.FAILED || deliveryTimedOut;
  const timestamp = formatDateTime(message.created, language);

  // `onLoadFile` mutates the message inside SupportChatContext and the new
  // `message` prop arrives on the next render — read it here instead of in
  // the `.then()` below, which would otherwise close over the stale prop.
  useEffect(() => {
    if (message.file?.url) setLoadedUrl(message.file.url);
  }, [message.file?.url]);

  const ensureLoaded = () => {
    if (loading || !message.fileName) return;
    const image = isImageFile(message.fileName);
    if (loadedUrl) {
      if (!image) window.open(loadedUrl, '_blank', 'noopener');
      return;
    }
    // Preserve the user gesture for document popups while the authenticated blob loads.
    const pendingWindow = image ? null : window.open('', '_blank');
    if (pendingWindow) pendingWindow.opener = null;
    setLoading(true);
    onLoadFile()
      .then(() => {
        const nextUrl = message.file?.url;
        if (!nextUrl) throw new Error('Attachment data missing');
        setLoadedUrl(nextUrl);
        if (!image) {
          if (pendingWindow) pendingWindow.location.href = nextUrl;
          else window.open(nextUrl, '_blank', 'noopener');
        }
      })
      .catch(() => {
        pendingWindow?.close();
        showToast(t('loadFail'), { assertive: true });
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className={`msg ${mine ? 'msg-cust' : 'msg-supp'}${failed ? ' failed' : ''}`}>
      <div className="msg-bubble">
        {message.message && <div className="msg-tx">{message.message}</div>}
        {message.fileName &&
          (isImageFile(message.fileName) && loadedUrl ? (
            <img className="msg-img" alt={message.fileName} src={loadedUrl} />
          ) : (
            <div
              className="msg-file"
              role="button"
              tabIndex={0}
              onClick={ensureLoaded}
              onKeyDown={onActivate(ensureLoaded)}
            >
              {FILE_ICON}
              <span>{loading ? t('loading') : message.fileName}</span>
            </div>
          ))}
        <div className="msg-meta">
          {timestamp}
          {message.status === SupportMessageStatus.SENT && !deliveryTimedOut && ` · ${t('chatSending')}`}
          {failed && (
            <>
              {' · '}
              <button className="msg-retry" type="button" disabled={retrying} onClick={onRetry}>
                {retrying ? t('chatSending') : t('chatRetry')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
