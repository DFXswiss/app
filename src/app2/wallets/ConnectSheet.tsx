// DFX App 2.0 — connect-wallet bottom sheet.
//
// Markup/classes ported 1:1 from the static preview's #walletSheet /
// #wcSheet (public/app2/index.html, ~line 1144 and ~line 1174) so
// src/app2/styles.css applies unchanged: `.sheet` > `.shead` + `.slist`
// with `.sec` group headers and `.crow` rows for the wallet grid; `.confirm`
// with `.csub` + `.qractions` for the WalletConnect QR pairing view.

import { useState, type JSX } from 'react';
import QRCode from 'react-qr-code';
import { LoadingRow, Sheet, SheetHeader, Spinner, useToast } from '../components/ui';
import { useT } from '../i18n';
import { WALLET_CATALOG, type WalletCatalogEntry } from './catalog';
import type { ConnectView, PendingCredentials } from './session';

interface ConnectSheetProps {
  open: boolean;
  view: ConnectView;
  onClose: () => void;
  onSelectWallet: (entry: WalletCatalogEntry) => void;
  onSubmitRecommendation: (pending: PendingCredentials, code: string) => void;
  onBackToList: () => void;
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
  onSubmitRecommendation,
  onBackToList,
}: ConnectSheetProps): JSX.Element {
  const { t } = useT();
  const { showToast } = useToast();

  const title = view.kind === 'wallet-connect' ? 'WalletConnect' : t('connect');

  return (
    <Sheet open={open} onClose={onClose} titleId="connectSheetTitle">
      <SheetHeader titleId="connectSheetTitle" title={title} onClose={onClose} />
      {view.kind === 'list' && <WalletList onSelectWallet={onSelectWallet} />}
      {view.kind === 'connecting' && (
        <div className="slist" style={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
          <LoadingRow label={`${t('connecting')} ${view.label}…`} />
        </div>
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

function WalletList({ onSelectWallet }: { onSelectWallet: (entry: WalletCatalogEntry) => void }): JSX.Element {
  const { t } = useT();
  return (
    <div className="slist" id="walletList">
      <p className="tnote" style={{ padding: '0 2px 8px' }}>
        {t('walletNote')}
      </p>
      {WALLET_CATALOG.map((group) => (
        <div key={group.key}>
          <div className="sec">{t(group.key)}</div>
          {group.items.map((entry) => (
            <WalletRow key={entry.id} entry={entry} onSelect={onSelectWallet} />
          ))}
        </div>
      ))}
    </div>
  );
}

function WalletRow({ entry, onSelect }: { entry: WalletCatalogEntry; onSelect: (entry: WalletCatalogEntry) => void }) {
  const { t } = useT();
  const soon = entry.connector === 'soon';
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
        <img className="coin" width={38} height={38} src={entry.icon} alt="" />
      </span>
      <div className="ci">
        <b>{entry.name}</b>
        <div className="net">{entry.hint}</div>
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
