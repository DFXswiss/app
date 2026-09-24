// DFX App 2.0 — order confirmation / payment-details sheet.
//
// Ported from the static app's `#confirmSheet` (public/app2/index.html: `showConfirm()`,
// `loadPaymentInfo()`/`loadCardInfo()`/`loadSellInfo()`/`loadSwapInfo()`, `renderGate()`).
// The trade screen runs the authenticated payment-details request (`receiveFor(...)` → PUT
// .../paymentInfos, see useTradeQuote.ts) when the user taps the CTA and hands the settled
// response — or its account-gate error — in as a frozen snapshot. This sheet only re-reads
// authenticated transaction detail when recovering an existing request; `onRetry` re-runs the
// payment-details request (never the panel's public display quote).

import { useEffect, useState } from 'react';
import { PersonalIbanProvider, TransactionError, useUser } from '@dfx.swiss/react';
import { isVerifiedFrickPersonalIbanResponse } from '../../../util/personal-iban';
import type { ApiException, Blockchain, Buy, DetailTransaction, Fiat, Sell, Swap } from '@dfx.swiss/react';
import { formatAmount, formatFiat, shortAddress } from './amount';
import {
  isApiExceptionLike,
  isEmailGateError,
  mapThrownError,
  mapTransactionError,
  fiatFormatter,
  assetFormatter,
} from './errors';
import { chainName } from './blockchain-meta';
import { QrBill } from './QrBill';
import type { Mode } from './types';
import { Sheet, Spinner, useToast } from '../../components/ui';
import { useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { appUrl } from '../../utils/url';
import { cx } from '../../css';

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ALERT_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={2} />
    <path d="M12 7.5v5.5M12 16.5h.01" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
  </svg>
);
const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={9} y={9} width={11} height={11} rx={2} stroke="currentColor" strokeWidth={1.8} />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);
const ARROW_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M7 17 17 7M9 7h8v8" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function CopyButton({ value, label }: { value: string | undefined; label: string }) {
  const { showToast } = useToast();
  const { t } = useT();
  if (!value || value === '—') return null;
  return (
    <button
      className={cx('copybtn')}
      type="button"
      aria-label={label}
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => showToast(t('copied')))
          .catch(() => showToast(t('genErr')));
      }}
    >
      {COPY_ICON}
    </button>
  );
}

function Row({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className={cx('pbrow')}>
      <span>{label}</span>
      <b className={cx(cls)}>{value}</b>
    </div>
  );
}

interface QuoteValidity {
  isValid: boolean;
  error?: TransactionError;
  minVolume: number;
  maxVolume: number;
}

function invalidityMessage(
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
  quote: QuoteValidity,
  format: (n: number) => string,
): string | undefined {
  if (quote.isValid !== false) return undefined;
  return mapTransactionError(t, quote.error, quote.minVolume, quote.maxVolume, format);
}

export interface PaymentSheetProps {
  open: boolean;
  onClose: (resolved?: boolean) => void;
  onDone: (existingRequest?: boolean) => void;
  mode: Mode;
  loading: boolean;
  rawError: unknown;
  buy: Buy | null;
  sell: Sell | null;
  swap: Swap | null;
  payAssetCode: string;
  receiveAssetCode: string;
  receiveBlockchain?: Blockchain;
  currency?: Fiat;
  amount: number;
  sessionAddress?: string;
  onRetry: () => void;
  onReconnect: () => void;
  personalIbanProvider?: PersonalIbanProvider;
  onContinueWithoutPersonalIban?: () => void;
  requestLocked?: boolean;
  loadExistingRequest?: (uid: string) => Promise<DetailTransaction>;
  existingRequestUid?: string;
  existingRequestStatus?: string;
  onCheckExistingRequest?: () => void;
  retryPreClaimGateError?: boolean;
}

export function PaymentSheet({
  open,
  onClose,
  onDone,
  mode,
  loading,
  rawError,
  buy,
  sell,
  swap,
  payAssetCode,
  receiveAssetCode,
  receiveBlockchain,
  currency,
  amount,
  sessionAddress,
  onRetry,
  onReconnect,
  personalIbanProvider,
  onContinueWithoutPersonalIban,
  requestLocked = false,
  loadExistingRequest,
  existingRequestUid,
  existingRequestStatus,
  onCheckExistingRequest,
  retryPreClaimGateError = false,
}: PaymentSheetProps) {
  const { t, language } = useT();
  const setupUrl = appUrl('/');
  const { showToast } = useToast();
  const { updateMail } = useUser();
  const [tab, setTab] = useState<'details' | 'qr'>('details');
  const [mailInput, setMailInput] = useState('');
  const [mailSending, setMailSending] = useState(false);
  const [mailSent, setMailSent] = useState(false);
  const [existingRequest, setExistingRequest] = useState<DetailTransaction | null>(null);
  const [existingRequestLoading, setExistingRequestLoading] = useState(false);
  const [existingRequestLookupFailed, setExistingRequestLookupFailed] = useState(false);
  const [existingRequestLookupRetry, setExistingRequestLookupRetry] = useState(0);

  useEffect(() => {
    if (open) {
      setTab('details');
      setMailSent(false);
      setMailInput('');
    }
  }, [open]);

  const titleId = 'confirmTitle';
  const currencyCode = currency?.name ?? '';

  const paymentInfoConflict =
    isApiExceptionLike(rawError) && rawError.statusCode === 409 && 'paymentInfoConflict' in rawError
      ? (rawError as ApiException).paymentInfoConflict
      : undefined;
  const requestUid = paymentInfoConflict?.existingUid ?? existingRequestUid;
  useEffect(() => {
    let current = true;
    setExistingRequest(null);
    setExistingRequestLookupFailed(false);
    if (!open || !requestUid || !loadExistingRequest) {
      setExistingRequestLoading(false);
      return () => {
        current = false;
      };
    }

    setExistingRequestLoading(true);
    void loadExistingRequest(requestUid)
      .then((detail) => {
        if (current) setExistingRequest(detail);
      })
      .catch(() => {
        if (current) setExistingRequestLookupFailed(true);
      })
      .finally(() => {
        if (current) setExistingRequestLoading(false);
      });
    return () => {
      current = false;
    };
  }, [open, requestUid, loadExistingRequest, existingRequestLookupRetry]);

  const title = mode === 'buy' ? t('confBuyTitle') : mode === 'swap' ? t('confSwapTitle') : t('confSellTitle');
  const sub = mode === 'buy' ? t('confBuySub') : mode === 'swap' ? t('confSwapSub') : t('confSellSub');

  const thrownError = rawError
    ? paymentInfoConflict
      ? { kind: 'generic' as const, message: t('existingPaymentRetry') }
      : mapThrownError(t, rawError)
    : null;
  const hasExistingRequest = Boolean(paymentInfoConflict || existingRequestUid || existingRequestStatus);
  // A claim UID/status is only evidence that a request exists. Do not present
  // it as a completed payment until the authenticated detail read confirms a
  // terminal completed transaction.
  const requestResolved = hasExistingRequest
    ? existingRequest?.state === 'Completed'
    : Boolean(buy || sell || swap);
  const checkExistingRequest = () => {
    onCheckExistingRequest?.();
    if (requestUid && loadExistingRequest && !existingRequestLoading) {
      setExistingRequestLookupRetry((retry) => retry + 1);
    }
  };
  const retryAction = requestLocked && !retryPreClaimGateError && onCheckExistingRequest ? checkExistingRequest : onRetry;

  const rows: { label: string; value: string; cls?: string }[] = [];
  if (mode === 'buy' && buy) {
    rows.push({ label: t('fPay'), value: formatFiat(buy.amount ?? amount, currencyCode, language) });
    rows.push({
      label: t('fRecv'),
      value: `${formatAmount(buy.estimatedAmount, 8, language)} ${receiveAssetCode}`,
      cls: 'pos',
    });
    if (receiveBlockchain) rows.push({ label: t('network'), value: chainName(receiveBlockchain) });
    rows.push({ label: t('totalFee'), value: formatFiat(buy.fees?.total ?? 0, currencyCode, language) });
    if (sessionAddress) rows.push({ label: t('toWallet'), value: shortAddress(sessionAddress) });
  } else if (mode === 'sell' && sell) {
    rows.push({ label: t('fPay'), value: `${formatAmount(amount, 8, language)} ${payAssetCode}` });
    rows.push({ label: t('fRecv'), value: formatFiat(sell.estimatedAmount, currencyCode, language), cls: 'pos' });
    rows.push({ label: t('totalFee'), value: formatFiat(sell.feesTarget?.total ?? 0, currencyCode, language) });
    if (sessionAddress) rows.push({ label: t('fromWallet'), value: shortAddress(sessionAddress) });
  } else if (mode === 'swap' && swap) {
    rows.push({ label: t('fPay'), value: `${formatAmount(amount, 8, language)} ${payAssetCode}` });
    rows.push({
      label: t('fRecv'),
      value: `${formatAmount(swap.estimatedAmount, 6, language)} ${receiveAssetCode}`,
      cls: 'pos',
    });
    if (receiveBlockchain) rows.push({ label: t('network'), value: chainName(receiveBlockchain) });
    rows.push({ label: t('totalFee'), value: `${formatAmount(swap.fees?.total ?? 0, 6, language)} ${payAssetCode}` });
    if (sessionAddress) rows.push({ label: t('toWallet'), value: shortAddress(sessionAddress) });
  }

  const validityMessage =
    mode === 'buy' && buy
      ? invalidityMessage(t, buy, fiatFormatter(currencyCode, language))
      : mode === 'sell' && sell
        ? invalidityMessage(t, sell, assetFormatter(payAssetCode, language))
        : mode === 'swap' && swap
          ? invalidityMessage(t, swap, assetFormatter(payAssetCode, language))
          : undefined;
  const quote = mode === 'buy' ? buy : mode === 'sell' ? sell : swap;
  const validityError = quote?.error;
  /** Fail closed: a quote the API marked invalid must never get payment details rendered, even
   * if it arrives without the `error` field the message mapping needs (the API always sets one
   * today — this is the guard, not the diagnosis). */
  const isInvalidQuote = quote?.isValid === false;
  const isAmountGate =
    validityError === TransactionError.AMOUNT_TOO_LOW || validityError === TransactionError.AMOUNT_TOO_HIGH;
  // Fail closed: a 200 that claims validity but carries no deposit/payment target must not
  // render an empty DepositBox (address "—", QR over empty payload). Own gateKind — not
  // account setup — and only after real validity/email/amount gates have had their say.
  const missingDepositDetails =
    !isInvalidQuote &&
    ((mode === 'sell' && !!sell && !sell.depositAddress && !sell.paymentRequest) ||
      (mode === 'swap' && !!swap && !swap.depositAddress && !swap.paymentRequest) ||
      (mode === 'buy' && !!buy && !buy.iban?.trim() && !buy.paymentRequest?.trim()));
  const gateKind =
    thrownError?.kind ??
    (validityMessage || isInvalidQuote
      ? isEmailGateError(validityError)
        ? 'email'
        : isAmountGate
          ? 'amount'
          : 'setup'
      : missingDepositDetails
        ? 'missingDeposit'
        : undefined);

  const sendMail = async () => {
    if (!mailInput.includes('@')) return;
    setMailSending(true);
    try {
      await updateMail(mailInput);
      setMailSending(false);
      setMailSent(true);
      showToast(`${t('checkLink')} ${mailInput}`);
    } catch {
      setMailSending(false);
      showToast(t('mailErr'), { assertive: true });
    }
  };

  const frickUnverified =
    mode === 'buy' &&
    personalIbanProvider === PersonalIbanProvider.FRICK &&
    !!buy &&
    !isVerifiedFrickPersonalIbanResponse(buy);
  const showGate = !loading && (thrownError || validityMessage || isInvalidQuote || missingDepositDetails);

  return (
    <Sheet
      open={open}
      onClose={() => onClose(requestResolved)}
      titleId={titleId}
    >
      <div className={cx('confirm')}>
        <button
          className={cx('rbtn')}
          type="button"
          aria-label="Close"
          style={{ position: 'absolute', top: 12, right: 16, zIndex: 1 }}
          onClick={() => onClose(requestResolved)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
        {/* The header must not promise a payment the sheet isn't showing: with a gate up
            (e-mail/KYC/amount) there is no "amount below" to transfer, and the green tick reads
            as confirmation. The gate box carries its own title + instruction. */}
        <div className={cx('confirm-ic', showGate && 'gate')}>{showGate ? ALERT_ICON : CHECK_ICON}</div>
        <h3 id={titleId}>{hasExistingRequest ? t('existingPaymentTitle') : title}</h3>
        {!showGate && <p className={cx('csub')}>{sub}</p>}

        {rows.length > 0 && (
          <div className={cx('glass', 'rowlist')} style={{ margin: '16px 0 4px' }}>
            {rows.map((row) => (
              <Row key={row.label} label={row.label} value={row.value} cls={row.cls} />
            ))}
          </div>
        )}

        {loading && (
          <div className={cx('paybox')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Spinner /> {t('loading')}
            </span>
          </div>
        )}

        {hasExistingRequest && (
          <div className={cx('glass')} data-testid="payment-existing-request" style={{ marginTop: 16, padding: 14 }}>
            <div className={cx('paybox-title')}>{t('existingPaymentTitle')}</div>
            {requestUid && (
              <Row label={t('existingPaymentUid')} value={requestUid} />
            )}
            <Row
              label={t('existingPaymentStatus')}
              value={existingRequest?.state ?? existingRequestStatus ?? paymentInfoConflict?.requestStatus ?? 'Unknown'}
            />
            {existingRequestLoading && <p className={cx('paybox-note')}>{t('loading')}</p>}
            {existingRequestLookupFailed && <p className={cx('paybox-note')}>{t('existingPaymentLookupFailed')}</p>}
            {existingRequest?.inputAmount != null && existingRequest.inputAsset && (
              <Row
                label={t('existingPaymentAmount')}
                value={`${formatAmount(existingRequest.inputAmount, 8, language)} ${existingRequest.inputAsset}`}
              />
            )}
            {existingRequest?.outputAmount != null && existingRequest.outputAsset && (
              <Row
                label={t('existingPaymentOutput')}
                value={`${formatAmount(existingRequest.outputAmount, 8, language)} ${existingRequest.outputAsset}`}
              />
            )}
            {!requestUid && onCheckExistingRequest && (
              <button className={cx('btn-glass')} type="button" onClick={checkExistingRequest}>
                {t('checkRequestStatus')}
              </button>
            )}
            {requestUid && !existingRequest && onCheckExistingRequest && (
              <button
                className={cx('btn-glass')}
                type="button"
                disabled={existingRequestLoading}
                onClick={checkExistingRequest}
              >
                {t('checkRequestStatus')}
              </button>
            )}
          </div>
        )}

        {!loading && !showGate && frickUnverified && (
          <div className={cx('paybox')}>
            <div className={cx('paybox-note', 'warn')} style={{ margin: '0 0 12px' }}>
              {t('personalIbanUnverified')}
            </div>
            {onContinueWithoutPersonalIban && !requestLocked && (
              <button className={cx('btn-primary')} type="button" onClick={onContinueWithoutPersonalIban}>
                {t('personalIbanContinue')}
              </button>
            )}
            {requestLocked && onCheckExistingRequest && (
              <button className={cx('btn-glass')} type="button" onClick={checkExistingRequest}>
                {t('checkRequestStatus')}
              </button>
            )}
          </div>
        )}

        {!loading && !showGate && !frickUnverified && mode === 'buy' && buy && (
          <BuyPaymentBox
            buy={buy}
            tab={tab}
            setTab={setTab}
            payAmountLabel={formatFiat(buy.amount ?? amount, currencyCode, language)}
          />
        )}

        {!loading && !showGate && mode === 'sell' && sell && (
          <DepositBox
            address={sell.depositAddress}
            amount={`${formatAmount(sell.amount ?? amount, 8, language)} ${payAssetCode}`}
            network={chainName(sell.blockchain)}
            iban={sell.beneficiary?.iban}
            qrPayload={sell.paymentRequest || sell.depositAddress}
          />
        )}

        {!loading && !showGate && mode === 'swap' && swap && (
          <DepositBox
            address={swap.depositAddress}
            amount={`${formatAmount(swap.amount ?? amount, 8, language)} ${payAssetCode}`}
            network={chainName(swap.sourceAsset.blockchain)}
            qrPayload={swap.paymentRequest || swap.depositAddress}
          />
        )}

        {showGate && (
          <div className={cx('emailgate')}>
            <div className={cx('paybox-title')}>
              {gateKind === 'email'
                ? t('verifyEmailTitle')
                : gateKind === 'amount'
                  ? t('amount')
                  : gateKind === 'missingDeposit'
                    ? t('needPaymentDetails')
                    : t('setupTitle')}
            </div>
            {/* Missing-deposit uses the title alone (one i18n key). Other gates keep a note. */}
            {gateKind !== 'missingDeposit' && (
              <p className={cx('paybox-note')} style={{ margin: '6px 0 12px' }}>
                {/* `needSetup` is the fallback for an invalid quote with no mappable reason. */}
                {thrownError?.message ?? validityMessage ?? t('needSetup')}
              </p>
            )}
            {gateKind === 'email' && !mailSent && (
              <div className={cx('efield')}>
                <input
                  type="email"
                  value={mailInput}
                  onChange={(e) => setMailInput(e.target.value)}
                  placeholder="you@email.com"
                  autoComplete="email"
                  aria-label="Email address"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void sendMail();
                  }}
                />
                <button aria-label="Send link" disabled={mailSending} onClick={() => void sendMail()}>
                  {mailSending ? <Spinner /> : ARROW_ICON}
                </button>
              </div>
            )}
            {gateKind === 'email' && mailSent && (
              <button
                className={cx('btn-glass')}
                style={{
                  height: 48,
                  justifyContent: 'center',
                  color: 'var(--primary)',
                  fontWeight: 650,
                  marginTop: 10,
                }}
                onClick={retryAction}
              >
                <span>{t('iConfirmed')}</span>
              </button>
            )}
            {gateKind === 'session' && (
              <button
                className={cx('btn-primary')}
                style={{ marginTop: 10 }}
                onClick={() => {
                  onReconnect();
                  onClose();
                }}
              >
                <span>{t('connect')}</span>
              </button>
            )}
            {gateKind === 'generic' && (
              <button className={cx('btn-glass')} style={{ marginTop: 10 }} type="button" onClick={retryAction}>
                <span>{t('retry')}</span>
              </button>
            )}
            {gateKind === 'setup' && setupUrl && (
              <a
                href={setupUrl}
                target="_blank"
                rel="noopener"
                style={{ display: 'block', marginTop: 10, textDecoration: 'none' }}
              >
                <span
                  className={cx('btn-glass')}
                  style={{
                    height: 48,
                    justifyContent: 'center',
                    color: 'var(--primary)',
                    fontWeight: 650,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>{t('finishOnDfx')}</span>
                  {ARROW_ICON}
                </span>
              </a>
            )}
            {gateKind === 'setup' && requestLocked && retryPreClaimGateError && (
              <button className={cx('btn-glass')} style={{ marginTop: 10 }} type="button" onClick={retryAction}>
                <span>{t('retry')}</span>
              </button>
            )}
            {gateKind === 'setup' && requestLocked && !retryPreClaimGateError && !hasExistingRequest && onCheckExistingRequest && (
              <button className={cx('btn-glass')} style={{ marginTop: 10 }} type="button" onClick={onCheckExistingRequest}>
                <span>{t('checkRequestStatus')}</span>
              </button>
            )}
          </div>
        )}

        {((!requestLocked && !hasExistingRequest) || requestResolved) && (
          <button className={cx('btn-primary')} style={{ marginTop: 16 }} onClick={() => onDone(hasExistingRequest)}>
            <span>{t('done')}</span>
          </button>
        )}
      </div>
    </Sheet>
  );
}

function BuyPaymentBox({
  buy,
  tab,
  setTab,
  payAmountLabel,
}: {
  buy: Buy;
  tab: 'details' | 'qr';
  setTab: (tab: 'details' | 'qr') => void;
  payAmountLabel: string;
}) {
  const { t } = useT();
  const ref = buy.remittanceInfo || '';
  const hasQr = !!buy.paymentRequest;
  const beneficiary = [
    buy.name,
    [buy.street, buy.number].filter(Boolean).join(' '),
    [buy.zip, buy.city].filter(Boolean).join(' '),
    buy.country,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className={cx('paybox')}>
      <div className={cx('paybox-title')}>{`${t('payInstr')} ${payAmountLabel}`}</div>
      {hasQr && (
        <div className={cx('payseg')} role="tablist">
          <button
            type="button"
            className={tab === 'details' ? cx('on') : undefined}
            role="tab"
            aria-selected={tab === 'details'}
            onClick={() => setTab('details')}
          >
            {t('payDetails')}
          </button>
          <button
            type="button"
            className={tab === 'qr' ? cx('on') : undefined}
            role="tab"
            aria-selected={tab === 'qr'}
            onClick={() => setTab('qr')}
          >
            {t('payQrTab')}
          </button>
        </div>
      )}
      {tab === 'details' || !hasQr ? (
        <>
          <div className={cx('pbrow')} style={{ alignItems: 'flex-start' }}>
            <span>{t('beneficiary')}</span>
            <b style={{ whiteSpace: 'pre-line', textAlign: 'right', lineHeight: 1.45 }}>{beneficiary || '—'}</b>
            <CopyButton value={beneficiary} label={t('beneficiary')} />
          </div>
          <div className={cx('pbrow')}>
            <span>{t('iban')}</span>
            <b>{buy.iban || '—'}</b>
            <CopyButton value={buy.iban} label={t('iban')} />
          </div>
          <div className={cx('pbrow')}>
            <span>{t('bic')}</span>
            <b>{buy.bic || '—'}</b>
            <CopyButton value={buy.bic} label={t('bic')} />
          </div>
          {ref && (
            <div className={cx('pbrow')}>
              <span>{t('reference')}</span>
              <b>{ref}</b>
              <CopyButton value={ref} label={t('reference')} />
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <QrBill payload={buy.paymentRequest as string} />
        </div>
      )}
      {tab === 'qr' && hasQr && (
        <div className={cx('paybox-note')} style={{ textAlign: 'center' }}>
          {t('scanToPay')}
        </div>
      )}
      <div className={cx('paybox-note')}>{ref ? t('payNote') : t('noRefNeeded')}</div>
    </div>
  );
}

function DepositBox({
  address,
  amount,
  network,
  iban,
  qrPayload,
}: {
  address: string;
  amount: string;
  network: string;
  iban?: string;
  qrPayload: string;
}) {
  const { t } = useT();
  return (
    <div className={cx('paybox')}>
      <div className={cx('paybox-title')}>{t('depositInstr')}</div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 10px' }}>
        <QrBill payload={qrPayload} />
      </div>
      <div className={cx('pbrow')} style={{ alignItems: 'flex-start' }}>
        <span>{t('depositAddr')}</span>
        <b
          style={{
            wordBreak: 'break-all',
            whiteSpace: 'normal',
            textAlign: 'right',
            fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          {address || '—'}
        </b>
        <CopyButton value={address} label={t('depositAddr')} />
      </div>
      <Row label={t('fPay')} value={amount} />
      {network && <Row label={t('network')} value={network} />}
      {iban && <Row label={t('payoutIban')} value={iban} />}
      <div className={cx('depwarn')}>{t('depositWarn')}</div>
    </div>
  );
}
