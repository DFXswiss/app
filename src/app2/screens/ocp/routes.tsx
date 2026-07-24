// DFX App 2.0 — OpenCryptoPay » Payment routes sub-view.
//
// Ported from the static preview's OCP routes view (public/app2/index.html:
// `routeRow`/`kvRow` 2351-2365, `ocpRoutesHtml` 2367-2388, `wireRoutes`/
// `toggleRoute`/`addSellRoute` 2389-2415). Lists buy/sell/swap payment routes
// grouped by type with an activate/deactivate toggle (PUT /<type>/<id>) and a
// create-route form that adds a Lightning sell route (POST /sell) — the payout
// rail OpenCryptoPay settles through. State + every API call live in `useOcp`
// (passed via the `ocp` prop); demo mode is handled inside those actions.

import { ApiException, type BuyRoute, type PaymentRouteType, type SellRoute, type SwapRoute } from '@dfx.swiss/react';
import { Blockchain, useSell, useUserContext } from '@dfx.swiss/react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useToast } from '../../components/ui';
import { type TranslationKey, useT } from '../../i18n';
import { useWalletSession } from '../../wallets/session';
import { formatChf } from '../parts/format';
import { ibanCheck, ibanErrorMessage } from '../trade/iban';
import type { OcpSubViewProps } from './useOcp';

const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={9} y={9} width={11} height={11} rx={2} stroke="currentColor" strokeWidth={1.7} />
    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth={1.7} />
  </svg>
);

const CHEV_ICON = (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BUY_ICON = (
  <path d="M12 5v14M5 12l7-7 7 7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
);
const SELL_ICON = (
  <path d="M12 19V5M5 12l7 7 7-7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
);
const SWAP_ICON = (
  <path
    d="M7 8h12l-3-3M17 16H5l3 3"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const ROUTE_ICON: Record<PaymentRouteType, ReactNode> = { buy: BUY_ICON, sell: SELL_ICON, swap: SWAP_ICON };

interface KvItem {
  k: string;
  v: string;
  copy?: boolean;
}

interface RowModel {
  type: PaymentRouteType;
  id: string | number;
  active: boolean;
  subtitle: string;
  kvs: KvItem[];
}

export default function RoutesView({ ocp }: OcpSubViewProps) {
  const { t, language } = useT();
  const { showToast } = useToast();
  const { currencies } = useSell();
  const { user } = useUserContext();
  const { blockchains } = useWalletSession();

  const [busyId, setBusyId] = useState<string | number | null>(null);

  // create-route form
  const [iban, setIban] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [chain, setChain] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ variant: '' | 'ok' | 'warn'; node: ReactNode } | null>(null);

  // Load routes on first mount (mirrors the static app's `ocpLoadRoutes`).
  useEffect(() => {
    if (ocp.routes === null) void ocp.loadRoutes();
  }, [ocp.routes, ocp.loadRoutes]);

  const fmtChf = (v: number | undefined | null): string => formatChf(v, language);

  const sellableCurrencies = useMemo(() => (currencies ?? []).filter((f) => f.sellable !== false), [currencies]);
  const chainList = useMemo(() => (blockchains ?? []).slice(), [blockchains]);

  // Preselect payout currency = the user's display currency, else the first
  // sellable one (mirrors the static app's `f.code===S.fiat` default).
  useEffect(() => {
    if (currencyId || !sellableCurrencies.length) return;
    const match = sellableCurrencies.find((f) => f.name === user?.currency?.name);
    setCurrencyId(String((match ?? sellableCurrencies[0]).id ?? ''));
  }, [currencyId, sellableCurrencies, user?.currency?.name]);

  // Preselect Lightning (the OpenCryptoPay rail) when the session has it.
  useEffect(() => {
    if (chain || !chainList.length) return;
    setChain(chainList.includes(Blockchain.LIGHTNING) ? Blockchain.LIGHTNING : chainList[0]);
  }, [chain, chainList]);

  const buy = ocp.routes?.buy ?? [];
  const sell = ocp.routes?.sell ?? [];
  const swap = ocp.routes?.swap ?? [];
  const total = buy.length + sell.length + swap.length;

  async function onToggle(type: PaymentRouteType, id: string | number, to: boolean) {
    setBusyId(id);
    try {
      await ocp.toggleRoute(type, id, to);
      showToast(t('saved'));
    } catch {
      showToast(t('genErr'));
    } finally {
      setBusyId(null);
    }
  }

  async function submit() {
    if (submitting) return;
    const clean = iban.trim().replace(/\s+/g, '');
    const check = ibanCheck(clean);
    if (!check.ok) {
      setResult({ variant: 'warn', node: ibanErrorMessage(t, check) });
      return;
    }
    setSubmitting(true);
    setResult({
      variant: '',
      node: (
        <>
          <span className="spin" /> {t('tkSending')}
        </>
      ),
    });
    try {
      await ocp.createRoute({ iban: clean, currencyId: currencyId || undefined, blockchain: chain });
      setResult(null);
      setIban('');
      showToast(t('routeCreated'));
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : '';
      setResult({ variant: 'warn', node: `${t('genErr')}${msg ? `: ${msg}` : ''}` });
    } finally {
      setSubmitting(false);
    }
  }

  const kycWarn = user?.kyc?.level != null && user.kyc.level < 30;

  return (
    <>
      <p style={{ color: 'var(--t-muted)', fontSize: 13, lineHeight: 1.5, margin: '2px 4px 14px' }}>
        {t('routesLead')}
      </p>

      {!total &&
        (ocp.routesError ? (
          <div className="ocp-empty" style={{ flexDirection: 'column', gap: 12, textAlign: 'center' }}>
            <span>{t('loadFail')}</span>
            <button type="button" className="btn-mini" style={{ width: 'auto' }} onClick={() => void ocp.loadRoutes()}>
              {t('retry')}
            </button>
          </div>
        ) : (
          <div className="ocp-empty">{t('routesEmpty')}</div>
        ))}

      {sell.length > 0 && (
        <>
          <div className="sectionlabel tight">{t('sellRoutes')}</div>
          {sell.map((r) => (
            <RouteRow
              key={`sell-${r.id}`}
              model={sellModel(r, t, fmtChf)}
              ocp={ocp}
              busyId={busyId}
              onToggle={onToggle}
            />
          ))}
        </>
      )}

      {buy.length > 0 && (
        <>
          <div className="sectionlabel tight">{t('buyRoutes')}</div>
          {buy.map((r) => (
            <RouteRow
              key={`buy-${r.id}`}
              model={buyModel(r, t, fmtChf)}
              ocp={ocp}
              busyId={busyId}
              onToggle={onToggle}
            />
          ))}
        </>
      )}

      {swap.length > 0 && (
        <>
          <div className="sectionlabel tight">{t('swapRoutes')}</div>
          {swap.map((r) => (
            <RouteRow
              key={`swap-${r.id}`}
              model={swapModel(r, t, fmtChf)}
              ocp={ocp}
              busyId={busyId}
              onToggle={onToggle}
            />
          ))}
        </>
      )}

      {/* Add a Lightning sell route (the OpenCryptoPay payout rail). */}
      <div className="sectionlabel tight">{t('addSellRoute')}</div>
      <div className="glass" style={{ borderRadius: 18, padding: 14 }}>
        <div className="tform">
          <p style={{ color: 'var(--t-muted)', fontSize: 12.5, lineHeight: 1.45, margin: '0 2px 4px' }}>
            {t('addSellLead')}
          </p>

          {kycWarn && (
            <div className="paybox-note warn" style={{ margin: '2px 0' }}>
              {t('kycNeeded')}
            </div>
          )}

          <label className="flabel" htmlFor="srIban">
            {t('payoutIban')}
          </label>
          <input
            id="srIban"
            className="tinput"
            placeholder="CH.. / DE.."
            autoComplete="off"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
          />

          <label className="flabel" htmlFor="srCur">
            {t('payoutCur')}
          </label>
          <select id="srCur" className="tinput" value={currencyId} onChange={(e) => setCurrencyId(e.target.value)}>
            {sellableCurrencies.map((f) => (
              <option key={f.id} value={String(f.id)}>
                {f.name}
              </option>
            ))}
          </select>

          <label className="flabel" htmlFor="srChain">
            {t('payoutChain')}
          </label>
          <select id="srChain" className="tinput" value={chain} onChange={(e) => setChain(e.target.value)}>
            {chainList.length ? (
              chainList.map((c) => (
                <option key={c} value={c}>
                  {c}
                  {c === Blockchain.LIGHTNING ? ' — OpenCryptoPay' : ''}
                </option>
              ))
            ) : (
              <option value="">—</option>
            )}
          </select>

          {!ocp.lightningReady && (
            <div className="paybox-note" style={{ marginTop: 8 }}>
              {t('ocpLnHint')}
            </div>
          )}

          <button type="button" className="btn-primary" style={{ marginTop: 8 }} disabled={submitting} onClick={submit}>
            {t('createRoute')}
          </button>

          {result && (
            <div className={`paybox-note ${result.variant}`.trim()} style={{ marginTop: 10 }}>
              {result.node}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;
type ChfFn = (v: number | undefined | null) => string;

function buyModel(r: BuyRoute, t: TFn, fmtChf: ChfFn): RowModel {
  const asset = r.asset?.name;
  const kvs: KvItem[] = [{ k: 'ID', v: `#${r.id}` }];
  if (asset) kvs.push({ k: t('asset'), v: asset });
  if (r.bankUsage) kvs.push({ k: t('reference'), v: r.bankUsage, copy: true });
  if (r.iban) kvs.push({ k: t('iban'), v: r.iban, copy: true });
  kvs.push({ k: t('volume'), v: fmtChf(r.volume) });
  if (r.fee != null) kvs.push({ k: t('fee'), v: `${r.fee}%` });
  return { type: 'buy', id: r.id, active: !!r.active, subtitle: `${asset ?? ''} · ${t('mBuy')}`, kvs };
}

function sellModel(r: SellRoute, t: TFn, fmtChf: ChfFn): RowModel {
  const cur = r.currency?.name;
  const dep = r.deposit?.address;
  const bcs = (r.deposit?.blockchains ?? []).join(', ');
  const kvs: KvItem[] = [{ k: 'ID', v: `#${r.id}` }];
  if (cur) kvs.push({ k: t('currency'), v: cur });
  if (r.iban) kvs.push({ k: t('iban'), v: r.iban, copy: true });
  if (dep) kvs.push({ k: t('depositAddr'), v: dep, copy: true });
  if (bcs) kvs.push({ k: t('networks'), v: bcs });
  kvs.push({ k: t('volume'), v: fmtChf(r.volume) });
  if (r.fee != null) kvs.push({ k: t('fee'), v: `${r.fee}%` });
  return { type: 'sell', id: r.id, active: !!r.active, subtitle: `${cur ?? ''} → IBAN`, kvs };
}

function swapModel(r: SwapRoute, t: TFn, fmtChf: ChfFn): RowModel {
  const asset = r.asset?.name;
  const dep = r.deposit?.address;
  const bcs = (r.deposit?.blockchains ?? []).join(', ');
  const kvs: KvItem[] = [{ k: 'ID', v: `#${r.id}` }];
  if (asset) kvs.push({ k: t('asset'), v: asset });
  if (dep) kvs.push({ k: t('depositAddr'), v: dep, copy: true });
  if (bcs) kvs.push({ k: t('networks'), v: bcs });
  kvs.push({ k: t('volume'), v: fmtChf(r.volume) });
  if (r.fee != null) kvs.push({ k: t('fee'), v: `${r.fee}%` });
  return { type: 'swap', id: r.id, active: !!r.active, subtitle: `${asset ?? ''} · ${t('mSwap')}`, kvs };
}

interface RouteRowProps {
  model: RowModel;
  ocp: OcpSubViewProps['ocp'];
  busyId: string | number | null;
  onToggle: (type: PaymentRouteType, id: string | number, to: boolean) => void;
}

function RouteRow({ model, ocp, busyId, onToggle }: RouteRowProps) {
  const { t } = useT();
  const { type, id, active, subtitle, kvs } = model;
  return (
    <details className="rcol">
      <summary>
        <span className="rci">
          <svg viewBox="0 0 24 24" fill="none">
            {ROUTE_ICON[type]}
          </svg>
        </span>
        <span className="rtt">
          <b>
            {t('route')} {id}
          </b>
          <small>{subtitle}</small>
        </span>
        <span className={`pill-chip ${active ? 'act' : 'ina'}`}>{active ? t('active') : t('inactive')}</span>
        <span className="chev">{CHEV_ICON}</span>
      </summary>
      <div className="rbody">
        {kvs.map((kv, i) => (
          <div className="kv" key={i}>
            <span className="kk">{kv.k}</span>
            <span className="vv">{kv.v}</span>
            {kv.copy && (
              <button type="button" className="cpy" aria-label={t('copied')} onClick={() => ocp.copy(kv.v)}>
                {COPY_ICON}
              </button>
            )}
          </div>
        ))}
        <div style={{ padding: '10px 12px 4px' }}>
          <button
            type="button"
            className={`btn-mini${active ? ' danger' : ''}`}
            disabled={busyId === id}
            onClick={() => onToggle(type, id, !active)}
          >
            {active ? t('deactivate') : t('activate')}
          </button>
        </div>
      </div>
    </details>
  );
}
