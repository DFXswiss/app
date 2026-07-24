// DFX App 2.0 — switch-wallet sheet.
//
// Lists every wallet the user has connected (account-linked addresses + wallets remembered on
// this device) and switches between them on a single tap. Ports the static preview's #switchSheet
// (public/app2/index.html) onto the React session — the `.swrow` / `.swlogo` / `.swtx` styling in
// styles.css is reused unchanged.

import { useState, type JSX } from 'react';
import { Sheet, SheetHeader } from '../components/ui';
import { useT } from '../i18n';
import { chainName } from '../screens/trade/blockchain-meta';
import { useWalletSession, type WalletSwitchEntry } from './session';

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const GO_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const PLUS_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
  </svg>
);

export function WalletSwitcher(): JSX.Element {
  const { t } = useT();
  const { switcher } = useWalletSession();

  return (
    <Sheet open={switcher.open} onClose={switcher.onClose} titleId="switchSheetTitle">
      <SheetHeader titleId="switchSheetTitle" title={t('switchWallet')} onClose={switcher.onClose} />
      <div className="slist">
        <p className="tnote" style={{ padding: '0 2px 8px' }}>
          {t('switchNote')}
        </p>
        {switcher.entries.length === 0 && (
          <p className="tnote" style={{ padding: 14, textAlign: 'center' }}>
            {t('noWallets')}
          </p>
        )}
        {switcher.entries.map((entry) => (
          <SwitchRow key={entry.address} entry={entry} onSwitch={switcher.onSwitch} />
        ))}
        <button className="swrow add" onClick={switcher.onConnectAnother}>
          <span className="swlogo plus">{PLUS_ICON}</span>
          <span className="swtx">
            <b>{t('connectAnother')}</b>
          </span>
        </button>
      </div>
    </Sheet>
  );
}

function SwitchRow({
  entry,
  onSwitch,
}: {
  entry: WalletSwitchEntry;
  onSwitch: (entry: WalletSwitchEntry) => void;
}): JSX.Element {
  const { t } = useT();
  // A broken logo URL flips to the monogram (ports the static preview's data-fb="hide" fallback).
  const [logoFailed, setLogoFailed] = useState(false);
  const chips = entry.blockchains
    .map((b) => chainName(b))
    .slice(0, 2)
    .join(' · ');
  return (
    <button
      className={`swrow${entry.active ? ' active' : ''}`}
      onClick={() => onSwitch(entry)}
      aria-current={entry.active || undefined}
    >
      <span className="swlogo">
        {entry.icon && !logoFailed ? (
          <img
            src={entry.icon}
            alt=""
            onError={() => setLogoFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <b style={{ font: '700 15px/1 Inter, sans-serif', color: '#16456f' }}>
            {(entry.name || entry.walletType || 'W').slice(0, 1).toUpperCase()}
          </b>
        )}
      </span>
      <span className="swtx">
        <b>{entry.name}</b>
        <small>
          {short(entry.address)}
          {chips ? ` · ${chips}` : ''}
        </small>
      </span>
      {entry.active ? (
        <span className="pill-chip act">{t('walletActive')}</span>
      ) : (
        <span className="swgo">{GO_ICON}</span>
      )}
    </button>
  );
}
