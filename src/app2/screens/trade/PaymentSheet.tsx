// DFX App 2.0 — order confirmation / payment-details sheet.
//
// Ported from the static app's `#confirmSheet` (public/app2/index.html: `showConfirm()`,
// `loadPaymentInfo()`/`loadCardInfo()`/`loadSellInfo()`/`loadSwapInfo()`, `renderGate()`).
// One real difference from the static app: `receiveFor(...)` (useBuy/useSell/useSwap) already
// *is* the payment-info response — there's no separate paymentInfos fetch once this sheet
// opens, it just renders the quote object the trade screen already holds (see
// useTradeQuote.ts). The bank/deposit/card boxes below read straight off that object.

import { useEffect, useState } from 'react';
import { TransactionError, useUser } from '@dfx.swiss/react';
import type { Blockchain, Buy, Fiat, Sell, Swap } from '@dfx.swiss/react';
import { formatAmount, formatFiat, shortAddress } from './amount';
import { mapThrownError, mapTransactionError, fiatFormatter, assetFormatter } from './errors';
import { chainName } from './blockchain-meta';
import { QrBill } from './QrBill';
import type { Mode } from './types';
import { Sheet, Spinner, useToast } from '../../components/ui';
import { useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { appUrl } from '../../utils/url';

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
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
      className="copybtn"
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
    <div className="pbrow">
      <span>{label}</span>
      <b className={cls}>{value}</b>
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
  onClose: () => void;
  onDone: () => void;
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
}: PaymentSheetProps) {
  const { t, language } = useT();
  const setupUrl = appUrl('/');
  const { showToast } = useToast();
  const { updateMail } = useUser();
  const [tab, setTab] = useState<'details' | 'qr'>('details');
  const [mailInput, setMailInput] = useState('');
  const [mailSending, setMailSending] = useState(false);
  const [mailSent, setMailSent] = useState(false);

  useEffect(() => {
    if (open) {
      setTab('details');
      setMailSent(false);
      setMailInput('');
    }
  }, [open]);

  const titleId = 'confirmTitle';
  const currencyCode = currency?.name ?? '';

  const title = mode === 'buy' ? t('confBuyTitle') : mode === 'swap' ? t('confSwapTitle') : t('confSellTitle');
  const sub = mode === 'buy' ? t('confBuySub') : mode === 'swap' ? t('confSwapSub') : t('confSellSub');

  const thrownError = rawError ? mapThrownError(t, rawError) : null;

  const rows: { label: string; value: string; cls?: string }[] = [];
  if (mode === 'buy' && buy) {
    rows.push({ label: t('fPay'), value: formatFiat(amount, currencyCode, language) });
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
  const validityError = mode === 'buy' ? buy?.error : mode === 'sell' ? sell?.error : swap?.error;
  const isAmountGate =
    validityError === TransactionError.AMOUNT_TOO_LOW || validityError === TransactionError.AMOUNT_TOO_HIGH;
  const gateKind =
    thrownError?.kind ??
    (validityMessage ? (validityError === TransactionError.EMAIL_REQUIRED ? 'email' : isAmountGate ? 'amount' : 'setup') : undefined);

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

  const showGate = !loading && (thrownError || validityMessage);

  return (
    <Sheet open={open} onClose={onClose} titleId={titleId}>
      <div className="confirm">
        <div className="confirm-ic">{CHECK_ICON}</div>
        <h3 id={titleId}>{title}</h3>
        <p className="csub">{sub}</p>

        {rows.length > 0 && (
          <div className="glass rowlist" style={{ margin: '16px 0 4px' }}>
            {rows.map((row) => (
              <Row key={row.label} label={row.label} value={row.value} cls={row.cls} />
            ))}
          </div>
        )}

        {loading && (
          <div className="paybox">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Spinner /> {t('loading')}
            </span>
          </div>
        )}

        {!loading && !showGate && mode === 'buy' && buy && (
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
            amount={`${formatAmount(amount, 8, language)} ${payAssetCode}`}
            network={chainName(swap.sourceAsset.blockchain)}
            qrPayload={swap.paymentRequest || swap.depositAddress}
          />
        )}

        {showGate && (
          <div className="emailgate">
            <div className="paybox-title">
              {gateKind === 'email' ? t('verifyEmailTitle') : gateKind === 'amount' ? t('amount') : t('setupTitle')}
            </div>
            <p className="paybox-note" style={{ margin: '6px 0 12px' }}>
              {thrownError?.message ?? validityMessage}
            </p>
            {gateKind === 'email' && !mailSent && (
              <div className="efield">
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
                className="btn-glass"
                style={{
                  height: 48,
                  justifyContent: 'center',
                  color: 'var(--primary)',
                  fontWeight: 650,
                  marginTop: 10,
                }}
                onClick={onRetry}
              >
                <span>{t('iConfirmed')}</span>
              </button>
            )}
            {gateKind === 'session' && (
              <button
                className="btn-primary"
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
              <button className="btn-glass" style={{ marginTop: 10 }} type="button" onClick={onRetry}>
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
                  className="btn-glass"
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
          </div>
        )}

        <button className="btn-primary" style={{ marginTop: 16 }} onClick={onDone}>
          <span>{t('done')}</span>
        </button>
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
    <div className="paybox">
      <div className="paybox-title">{`${t('payInstr')} ${payAmountLabel}`}</div>
      {hasQr && (
        <div className="payseg" role="tablist">
          <button
            type="button"
            className={tab === 'details' ? 'on' : ''}
            role="tab"
            aria-selected={tab === 'details'}
            onClick={() => setTab('details')}
          >
            {t('payDetails')}
          </button>
          <button
            type="button"
            className={tab === 'qr' ? 'on' : ''}
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
          <div className="pbrow" style={{ alignItems: 'flex-start' }}>
            <span>{t('beneficiary')}</span>
            <b style={{ whiteSpace: 'pre-line', textAlign: 'right', lineHeight: 1.45 }}>{beneficiary || '—'}</b>
            <CopyButton value={beneficiary} label={t('beneficiary')} />
          </div>
          <div className="pbrow">
            <span>{t('iban')}</span>
            <b>{buy.iban || '—'}</b>
            <CopyButton value={buy.iban} label={t('iban')} />
          </div>
          <div className="pbrow">
            <span>{t('bic')}</span>
            <b>{buy.bic || '—'}</b>
            <CopyButton value={buy.bic} label={t('bic')} />
          </div>
          {ref && (
            <div className="pbrow">
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
        <div className="paybox-note" style={{ textAlign: 'center' }}>
          {t('scanToPay')}
        </div>
      )}
      <div className="paybox-note">{ref ? t('payNote') : t('noRefNeeded')}</div>
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
    <div className="paybox">
      <div className="paybox-title">{t('depositInstr')}</div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 10px' }}>
        <QrBill payload={qrPayload} />
      </div>
      <div className="pbrow" style={{ alignItems: 'flex-start' }}>
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
      <div className="depwarn">{t('depositWarn')}</div>
    </div>
  );
}
