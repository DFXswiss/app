// DFX App 2.0 — connect-wallet bottom sheet.
//
// Markup/classes ported 1:1 from the static preview's #walletSheet /
// #wcSheet (public/app2/index.html, ~line 1144 and ~line 1174) so
// src/app2/styles.css applies unchanged: `.sheet` > `.shead` + `.slist`
// with `.sec` group headers and `.crow` rows for the wallet grid; `.confirm`
// with `.csub` + `.qractions` for the WalletConnect QR pairing view.

import type { Blockchain } from '@dfx.swiss/react';
import { useState, type JSX } from 'react';
import QRCode from 'react-qr-code';
import { LoadingRow, onActivate, Sheet, Spinner, useToast } from '../components/ui';
import { useT } from '../i18n';
import { chainName } from '../screens/trade/blockchain-meta';
import { EVM_NETWORK_COUNT, WALLET_CATALOG, type WalletCatalogEntry } from './catalog';
import { isPlausibleCliAddress } from './cli';
import type { HardwareChain } from './hardware-providers';
import type { ConnectView, PendingCredentials } from './session';

interface ConnectSheetProps {
  open: boolean;
  view: ConnectView;
  onClose: () => void;
  onSelectWallet: (entry: WalletCatalogEntry) => void;
  onSelectHwChain: (entry: WalletCatalogEntry, chain: HardwareChain) => void;
  onSubmitRecommendation: (pending: PendingCredentials, code: string) => void;
  requestSignMessage: (address: string) => Promise<string>;
  onCliConnect: (entry: WalletCatalogEntry, address: string, signature: string, key?: string) => Promise<void>;
  onBackToList: () => void;
}

// CSP-safe broken-icon fallback: a colored initials badge, mirroring the static
// preview's mono() (public/app2/index.html, ~line 1797). Rendered inline as a
// data: URI so no external host is contacted (app2 CSP forbids remote images).
function monoDataUri(label: string, color = '#16456f'): string {
  const text = (label || '?').slice(0, 4);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>` +
    `<circle cx='16' cy='16' r='16' fill='${color}'/>` +
    `<text x='16' y='21' font-family='Inter,Arial' font-size='11' font-weight='700' fill='#fff' text-anchor='middle'>${text}</text>` +
    `</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');
}

const CLOSE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
  </svg>
);
const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={9} y={9} width={11} height={11} rx={2} stroke="currentColor" strokeWidth={1.8} />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);

export function ConnectSheet({
  open,
  view,
  onClose,
  onSelectWallet,
  onSelectHwChain,
  onSubmitRecommendation,
  requestSignMessage,
  onCliConnect,
  onBackToList,
}: ConnectSheetProps): JSX.Element {
  const { t } = useT();
  const { showToast } = useToast();

  // Chain the sheet was opened for (openConnect(code, filterChain)): filters the wallet list to
  // wallets that can receive on that chain and swaps the title/note copy — mirrors the original's
  // openWalletSheet(filterChain) (public/app2/index.html:3095-3106). Only the list view carries it.
  const filterChain = view.kind === 'list' ? view.filterChain : undefined;

  const title =
    view.kind === 'wallet-connect'
      ? 'WalletConnect'
      : view.kind === 'cli'
        ? t('cliTitle')
        : view.kind === 'hw-chain' || view.kind === 'hw-pairing'
          ? view.kind === 'hw-chain'
            ? view.entry.name
            : view.label
          : filterChain
            ? t('connectFor', { c: chainName(filterChain) })
            : t('connect');

  return (
    <Sheet open={open} onClose={onClose} titleId="connectSheetTitle">
      <div className="shead">
        <div className="r1">
          <h3 id="connectSheetTitle">{title}</h3>
          <button className="rbtn" aria-label="Close" style={{ width: 44, height: 44 }} onClick={onClose}>
            {CLOSE_ICON}
          </button>
        </div>
        {/* Wallet note lives inside .shead (below the title), matching orig line 1147 placement. */}
        {view.kind === 'list' && (
          <p className="tnote" style={{ padding: '8px 0 0' }}>
            {filterChain ? t('walletNoteChain', { c: chainName(filterChain) }) : t('walletNote')}
          </p>
        )}
      </div>
      {view.kind === 'list' && <WalletList onSelectWallet={onSelectWallet} filterChain={filterChain} />}
      {view.kind === 'connecting' && (
        <div className="slist" style={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
          <LoadingRow label={view.label} />
        </div>
      )}
      {view.kind === 'hw-chain' && <HwChainChooser entry={view.entry} onSelect={onSelectHwChain} />}
      {view.kind === 'hw-pairing' && <HwPairing code={view.code} />}
      {view.kind === 'cli' && (
        <CliConnectForm
          entry={view.entry}
          requestSignMessage={requestSignMessage}
          onConnect={onCliConnect}
          onCancel={onBackToList}
          showToast={showToast}
        />
      )}
      {view.kind === 'wallet-connect' && (
        <WalletConnectQr uri={view.uri} onCancel={onBackToList} showToast={showToast} />
      )}
      {view.kind === 'recommend' && (
        <RecommendationForm
          pending={view.pending}
          invalidCode={view.invalidCode}
          onSubmit={onSubmitRecommendation}
          onCancel={onBackToList}
        />
      )}
    </Sheet>
  );
}

function HwChainChooser({
  entry,
  onSelect,
}: {
  entry: WalletCatalogEntry;
  onSelect: (entry: WalletCatalogEntry, chain: HardwareChain) => void;
}): JSX.Element {
  const { t } = useT();
  const chains: { chain: HardwareChain; label: string; hint: string }[] = [
    { chain: 'btc', label: t('bitcoin'), hint: 'Native SegWit' },
    { chain: 'eth', label: t('ethereum'), hint: 'EVM' },
  ];
  return (
    <div className="slist">
      <p className="tnote" style={{ padding: '0 2px 8px' }}>
        {t('hwChoose')}
      </p>
      {chains.map(({ chain, label, hint }) => (
        <div
          key={chain}
          className="crow"
          role="button"
          tabIndex={0}
          onClick={() => onSelect(entry, chain)}
          onKeyDown={onActivate(() => onSelect(entry, chain))}
        >
          <div className="ci">
            <b>{label}</b>
            <div className="net">{hint}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HwPairing({ code }: { code?: string }): JSX.Element {
  const { t } = useT();
  return (
    <div className="confirm">
      <p className="csub">{code ? t('hwPairCode') : t('hwUnlock')}</p>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          margin: '18px 0',
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '0.12em',
        }}
      >
        {code ?? <Spinner />}
      </div>
    </div>
  );
}

function WalletList({
  onSelectWallet,
  filterChain,
}: {
  onSelectWallet: (entry: WalletCatalogEntry) => void;
  filterChain?: Blockchain;
}): JSX.Element {
  const { t } = useT();
  return (
    <div className="slist" id="walletList">
      {WALLET_CATALOG.map((group) => {
        // When opened for a specific chain, keep only wallets that can receive on it, and drop
        // groups that end up empty — mirrors the original buildWallets() filter (index.html:3106).
        const items = filterChain ? group.items.filter((w) => w.chains?.includes(filterChain)) : group.items;
        if (!items.length) return null;
        return (
          <div key={group.key}>
            <div className="sec">{t(group.key)}</div>
            {items.map((entry) => (
              <WalletRow key={entry.id} entry={entry} onSelect={onSelectWallet} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function WalletRow({ entry, onSelect }: { entry: WalletCatalogEntry; onSelect: (entry: WalletCatalogEntry) => void }) {
  const { t } = useT();
  const soon = entry.connector === 'soon';
  // EVM browser wallets carry no static hint — localize "EVM · N networks" at render time so the
  // word "networks" follows the language (orig: "EVM · "+EVM_CH.length+" "+t("networks")).
  const hint = entry.hint ?? (entry.evm ? `EVM · ${EVM_NETWORK_COUNT} ${t('networks')}` : '');
  return (
    <div
      className={`crow${soon ? ' soon' : ''}`}
      role="button"
      tabIndex={soon ? -1 : 0}
      aria-disabled={soon || undefined}
      style={soon ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
      onClick={() => !soon && onSelect(entry)}
      onKeyDown={(e) => {
        if (!soon && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect(entry);
        }
      }}
    >
      <span className="glyph">
        <img
          className="coin"
          width={38}
          height={38}
          src={entry.icon}
          alt=""
          onError={(e) => {
            const img = e.currentTarget;
            if (img.dataset.fbApplied) return;
            img.dataset.fbApplied = '1';
            img.src = monoDataUri(entry.id);
          }}
        />
      </span>
      <div className="ci">
        <b>{entry.name}</b>
        <div className="net">{hint}</div>
      </div>
      {soon && (
        <span className="pill-chip ina" style={{ marginLeft: 'auto' }}>
          {t('comingSoon')}
        </span>
      )}
    </div>
  );
}

function WalletConnectQr({
  uri,
  onCancel,
  showToast,
}: {
  uri: string | undefined;
  onCancel: () => void;
  showToast: (message: string, options?: { assertive?: boolean }) => void;
}): JSX.Element {
  const { t } = useT();

  const copyUri = async () => {
    if (!uri) return;
    try {
      await navigator.clipboard.writeText(uri);
      showToast(t('copied'));
    } catch {
      showToast(t('copyFail'), { assertive: true });
    }
  };

  return (
    <div className="confirm">
      <p className="csub">{uri ? t('wcScan') : t('wcStarting')}</p>
      <div id="wcQr" style={{ display: 'flex', justifyContent: 'center', margin: '14px 0' }}>
        {uri ? <QRCode value={uri} size={200} bgColor="#ffffff" fgColor="#0a2a4a" /> : <Spinner />}
      </div>
      <div className="qractions">
        <button className="btn-mini" onClick={copyUri} disabled={!uri}>
          {COPY_ICON}
          <span>{t('wcCopyUri')}</span>
        </button>
        <button className="btn-mini" onClick={onCancel}>
          {CLOSE_ICON}
          <span>{t('wcCancel')}</span>
        </button>
      </div>
    </div>
  );
}

// CLI / manual-signing paste form. No wallet is reached in the browser: the user
// pastes an address, we fetch + show the DFX sign-message, they sign it externally
// and paste the signature back (plus a public key for Cardano/Arweave/ICP). Ported
// from the static preview's CLI branch of the #xmrSheet (public/app2/index.html).
function CliConnectForm({
  entry,
  requestSignMessage,
  onConnect,
  onCancel,
  showToast,
}: {
  entry: WalletCatalogEntry;
  requestSignMessage: (address: string) => Promise<string>;
  onConnect: (entry: WalletCatalogEntry, address: string, signature: string, key?: string) => Promise<void>;
  onCancel: () => void;
  showToast: (message: string, options?: { assertive?: boolean }) => void;
}): JSX.Element {
  const { t } = useT();
  const [address, setAddress] = useState('');
  const [signMessage, setSignMessage] = useState<string>();
  const [signature, setSignature] = useState('');
  const [pubKey, setPubKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [addrError, setAddrError] = useState<string>();

  const trimmedAddr = address.trim();

  const fetchMessage = async () => {
    if (loading) return;
    if (!isPlausibleCliAddress(trimmedAddr)) {
      setAddrError(t('cliBadAddr'));
      return;
    }
    setAddrError(undefined);
    setLoading(true);
    try {
      setSignMessage(await requestSignMessage(trimmedAddr));
    } catch {
      showToast(t('authMsgErr'), { assertive: true });
    } finally {
      setLoading(false);
    }
  };

  const copyMessage = async () => {
    if (!signMessage) return;
    try {
      await navigator.clipboard.writeText(signMessage);
      showToast(t('copied'));
    } catch {
      showToast(t('copyFail'), { assertive: true });
    }
  };

  const submit = async () => {
    if (loading || !signature.trim()) return;
    setLoading(true);
    try {
      await onConnect(entry, trimmedAddr, signature, pubKey);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="confirm tform" style={{ textAlign: 'left' }}>
      <p className="csub">{t('cliIntro')}</p>

      <label className="flabel" htmlFor="cliAddress">
        {t('walletAddr')}
      </label>
      <input
        id="cliAddress"
        className="tinput"
        placeholder={t('cliAddrPh')}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={address}
        disabled={loading}
        onChange={(e) => {
          setAddress(e.target.value);
          setAddrError(undefined);
          if (signMessage) setSignMessage(undefined); // address changed — the old challenge no longer applies
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !signMessage) {
            e.preventDefault();
            void fetchMessage();
          }
        }}
      />
      {addrError && (
        <p className="csub" style={{ color: 'var(--warning, #FBBF24)' }}>
          {addrError}
        </p>
      )}

      {!signMessage && (
        <div className="qractions">
          <button className="btn-mini" onClick={onCancel} disabled={loading}>
            {CLOSE_ICON}
            <span>{t('cancel')}</span>
          </button>
          <button className="btn-mini" onClick={() => void fetchMessage()} disabled={loading || !trimmedAddr}>
            {loading ? <Spinner /> : <span>{t('routeContinue')}</span>}
          </button>
        </div>
      )}

      {signMessage && (
        <>
          <p className="csub">{t('cliSignHint')}</p>
          <label className="flabel">{t('cliMsg')}</label>
          <div
            className="glass"
            style={{ borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span style={{ font: '600 12px ui-monospace, monospace', wordBreak: 'break-all', flex: 1 }}>
              {signMessage}
            </span>
            <button className="cpy" aria-label={t('copied')} onClick={copyMessage}>
              {COPY_ICON}
            </button>
          </div>

          <label className="flabel" htmlFor="cliSignature">
            {t('cliSig')}
          </label>
          <textarea
            id="cliSignature"
            className="tinput"
            rows={2}
            placeholder={t('xmrNeedSig')}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={signature}
            disabled={loading}
            onChange={(e) => setSignature(e.target.value)}
            style={{ resize: 'vertical' }}
          />

          <label className="flabel" htmlFor="cliKey">
            {t('cliKey')}
          </label>
          <input
            id="cliKey"
            className="tinput"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={pubKey}
            disabled={loading}
            onChange={(e) => setPubKey(e.target.value)}
          />

          <div className="qractions">
            <button className="btn-mini" onClick={onCancel} disabled={loading}>
              {CLOSE_ICON}
              <span>{t('cancel')}</span>
            </button>
            <button className="btn-mini" onClick={() => void submit()} disabled={loading || !signature.trim()}>
              {loading ? <Spinner /> : <span>{t('connect')}</span>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RecommendationForm({
  pending,
  invalidCode,
  onSubmit,
  onCancel,
}: {
  pending: PendingCredentials;
  invalidCode?: boolean;
  onSubmit: (pending: PendingCredentials, code: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const { t } = useT();
  const [code, setCode] = useState('');

  return (
    <div className="confirm tform" style={{ textAlign: 'left' }}>
      <h3 style={{ textAlign: 'center' }}>{t('inviteGateTitle')}</h3>
      <p className="csub">{t('inviteGateNote')}</p>
      <label className="flabel" htmlFor="recommendationCode">
        {t('kycRecPlaceholder')}
      </label>
      <input
        id="recommendationCode"
        className="tinput"
        placeholder={t('kycRecPlaceholder')}
        autoComplete="off"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {invalidCode && (
        <p className="csub" style={{ color: 'var(--warning, #FBBF24)' }}>
          {t('inviteInvalidKey')}
        </p>
      )}
      <div className="qractions">
        <button className="btn-mini" onClick={onCancel}>
          {CLOSE_ICON}
          <span>{t('cancel')}</span>
        </button>
        <button className="btn-mini" disabled={!code.trim()} onClick={() => onSubmit(pending, code)}>
          <span>{t('routeContinue')}</span>
        </button>
      </div>
    </div>
  );
}
