// DFX App 2.0 — OpenCryptoPay » Settings sub-view.
// Faithful port of the static preview's `ocpConfigHtml` / `wireConfig` /
// `saveConfig` (public/app2/index.html, ~lines 2592-2621): the merchant default
// config form (payment standards / completion status / timeout / QR / cancel).
// Loaded config comes from `ocp.config` (set by ocpProbe GET /paymentLink/config
// in the shell); saved via `ocp.saveConfig` (PUT /paymentLink/config).

import { ApiException, MinCompletionStatus, PaymentStandardType, type UpdatePaymentLinkConfig } from '@dfx.swiss/react';
import { useState } from 'react';
import { useToast } from '../../components/ui';
import { type TranslationKey, useT } from '../../i18n';
import type { OcpSubViewProps } from './useOcp';

// Same option sets the static app offers (order preserved). COMPLETION mirrors
// the preview's three-choice list (TxReceived is intentionally omitted there).
const PAY_STANDARDS: PaymentStandardType[] = [
  PaymentStandardType.OPEN_CRYPTO_PAY,
  PaymentStandardType.LIGHTNING_BOLT11,
  PaymentStandardType.PAY_TO_ADDRESS,
];
const COMPLETION: MinCompletionStatus[] = [
  MinCompletionStatus.TX_MEMPOOL,
  MinCompletionStatus.TX_BLOCKCHAIN,
  MinCompletionStatus.TX_COMPLETED,
];

type Result = { kind: 'sending' } | { kind: 'ok'; text: string } | { kind: 'error'; text: string };

export default function ConfigView({ ocp }: OcpSubViewProps) {
  const { t } = useT();
  const { showToast } = useToast();

  const cfg = ocp.config;

  // Initialised once from the loaded config (single read, like the static app's
  // render). The shell guarantees `active === true` before mounting sub-views,
  // so `config` is present here; defaults mirror the preview's fallbacks.
  const [standards, setStandards] = useState<PaymentStandardType[]>(
    () => cfg?.standards ?? [PaymentStandardType.OPEN_CRYPTO_PAY],
  );
  const [completion, setCompletion] = useState<MinCompletionStatus>(
    () => cfg?.minCompletionStatus ?? MinCompletionStatus.TX_MEMPOOL,
  );
  const [timeout, setTimeoutValue] = useState<string>(() => String(cfg?.paymentTimeout ?? 60));
  const [displayQr, setDisplayQr] = useState<boolean>(() => cfg?.displayQr ?? true);
  const [cancellable, setCancellable] = useState<boolean>(() => cfg?.cancellable !== false);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  function toggleStandard(std: PaymentStandardType, checked: boolean) {
    setStandards((prev) => (checked ? [...prev, std] : prev.filter((s) => s !== std)));
  }

  async function save() {
    const body: UpdatePaymentLinkConfig = {
      standards,
      minCompletionStatus: completion,
      paymentTimeout: Number(timeout) || 60,
      displayQr,
      cancellable,
    };
    setSaving(true);
    setResult({ kind: 'sending' });
    try {
      await ocp.saveConfig(body);
      setResult({ kind: 'ok', text: t('saved') });
      showToast(t('saved'));
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : '';
      setResult({ kind: 'error', text: `${t('genErr')}${msg ? ': ' + msg : ''}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p style={{ color: 'var(--t-muted)', fontSize: 13, lineHeight: 1.5, margin: '2px 4px 14px' }}>
        {t('configLead')}
      </p>
      <div className="tform">
        <label className="flabel">{t('cfgStandards')}</label>
        <div className="chkgrid">
          {PAY_STANDARDS.map((s) => (
            <label className="chk" key={s}>
              <input
                type="checkbox"
                checked={standards.includes(s)}
                onChange={(e) => toggleStandard(s, e.target.checked)}
              />
              <span>{s}</span>
            </label>
          ))}
        </div>

        <label className="flabel">{t('cfgCompletion')}</label>
        <select
          className="tinput"
          value={completion}
          onChange={(e) => setCompletion(e.target.value as MinCompletionStatus)}
        >
          {COMPLETION.map((s) => (
            <option value={s} key={s}>
              {t(`comp_${s}` as TranslationKey)}
            </option>
          ))}
        </select>

        <label className="flabel">{t('cfgTimeout')}</label>
        <input
          className="tinput"
          inputMode="numeric"
          value={timeout}
          onChange={(e) => setTimeoutValue(e.target.value)}
        />

        <label className="flabel">{t('cfgDisplayQr')}</label>
        <select className="tinput" value={displayQr ? '1' : '0'} onChange={(e) => setDisplayQr(e.target.value === '1')}>
          <option value="1">{t('yes')}</option>
          <option value="0">{t('no')}</option>
        </select>

        <label className="flabel">{t('cfgCancellable')}</label>
        <select
          className="tinput"
          value={cancellable ? '1' : '0'}
          onChange={(e) => setCancellable(e.target.value === '1')}
        >
          <option value="1">{t('yes')}</option>
          <option value="0">{t('no')}</option>
        </select>

        <button className="btn-primary" style={{ marginTop: 6 }} disabled={saving} onClick={save}>
          {t('save')}
        </button>

        {result && (
          <div
            className={`paybox-note${result.kind === 'ok' ? ' ok' : result.kind === 'error' ? ' warn' : ''}`}
            style={{ marginTop: 10 }}
          >
            {result.kind === 'sending' ? (
              <>
                <span className="spin" /> {t('tkSending')}
              </>
            ) : (
              result.text
            )}
          </div>
        )}
      </div>
    </>
  );
}
