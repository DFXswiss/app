// DFX App 2.0 — slide-in menu (`.drawer` / `.scrim` / `.mitem`), ported 1:1
// from the static preview's `MENU` config and `buildMenu()` (public/app2/index.html,
// around line 1609). Icons are the same inline SVG paths as the static app.

import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useT, type TranslationKey } from '../i18n';
import { useWalletSession } from '../wallets/session';
import { useModalDialog, useToast } from './ui';

type MenuAction =
  | { kind: 'route'; path: string; mode?: 'buy' | 'sell' | 'swap' }
  | { kind: 'external'; url: string }
  | { kind: 'todo' } // not wired yet in this milestone — shows a "coming soon" toast
  | { kind: 'logout' };

/** Mirrors the static app's short() helper (public/app2/index.html). */
function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

interface MenuItem {
  key: TranslationKey;
  icon: JSX.Element;
  action: MenuAction;
}

interface MenuGroup {
  key: TranslationKey;
  items: MenuItem[];
}

const ICON_PROPS = { viewBox: '0 0 24 24', fill: 'none' } as const;

const MENU: MenuGroup[] = [
  {
    key: 'mTrade',
    items: [
      {
        key: 'mBuy',
        action: { kind: 'route', path: '/', mode: 'buy' },
        icon: (
          <svg {...ICON_PROPS}>
            <path
              d="M12 5v14M5 12l7-7 7 7"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
      },
      {
        key: 'mSell',
        action: { kind: 'route', path: '/', mode: 'sell' },
        icon: (
          <svg {...ICON_PROPS}>
            <path
              d="M12 19V5M5 12l7 7 7-7"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
      },
      {
        key: 'mSwap',
        action: { kind: 'route', path: '/', mode: 'swap' },
        icon: (
          <svg {...ICON_PROPS}>
            <path
              d="M7 8h12l-3-3M17 16H5l3 3"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
      },
    ],
  },
  {
    key: 'mAccount',
    items: [
      {
        key: 'mAcct',
        action: { kind: 'route', path: '/account' },
        icon: (
          <svg {...ICON_PROPS}>
            <circle cx={12} cy={8} r={4} stroke="currentColor" strokeWidth={1.9} />
            <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" />
          </svg>
        ),
      },
      {
        key: 'mTx',
        action: { kind: 'route', path: '/tx' },
        icon: (
          <svg {...ICON_PROPS}>
            <rect x={4} y={4} width={16} height={16} rx={2.5} stroke="currentColor" strokeWidth={1.8} />
            <path d="M8 9h8M8 13h6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        ),
      },
      {
        key: 'mKyc',
        action: { kind: 'route', path: '/kyc' },
        icon: (
          <svg {...ICON_PROPS}>
            <path d="M12 2 4 5v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V5l-8-3Z" stroke="currentColor" strokeWidth={1.8} />
            <path
              d="M9 12l2 2 4-4"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
      },
      {
        key: 'limitTitle',
        action: { kind: 'todo' },
        icon: (
          <svg {...ICON_PROPS}>
            <path
              d="M3 17l5-5 4 4 8-8"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M16 8h5v5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
    ],
  },
  {
    key: 'mMerchant',
    items: [
      {
        key: 'mOcp',
        action: { kind: 'todo' },
        icon: (
          <svg viewBox="0 0 254 192" fill="none" style={{ width: 17, height: 'auto' }}>
            <path
              d="M179.131 171.762L251.52 99.3729C253.39 97.5036 253.39 94.4693 251.52 92.5729L164.989 6.06858L132.668 38.3892L186.879 92.6C188.748 94.4693 188.748 97.5036 186.879 99.4L146.837 139.442L179.158 171.762H179.131Z"
              fill="currentColor"
            />
            <path
              d="M158.92 192L66.3203 99.4C64.4509 97.5307 64.4509 94.4964 66.3203 92.6L158.92 0H96.2568C94.9835 0 93.7643 0.514745 92.8703 1.40878L1.652 92.6C-0.217335 94.4693 -0.217335 97.5036 1.652 99.4L92.8432 190.591C93.7372 191.485 94.9564 192 96.2297 192H158.92Z"
              fill="currentColor"
            />
          </svg>
        ),
      },
      {
        key: 'payRoutes',
        action: { kind: 'todo' },
        icon: (
          <svg {...ICON_PROPS}>
            <path
              d="M4 8h16M4 8l3-3M4 8l3 3M20 16H4m16 0-3-3m3 3-3 3"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
      },
    ],
  },
  {
    key: 'mMore',
    items: [
      {
        key: 'mWebsite',
        action: { kind: 'external', url: 'https://dfx.swiss' },
        icon: (
          <svg {...ICON_PROPS}>
            <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" stroke="currentColor" strokeWidth={1.8} />
            <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.8} />
          </svg>
        ),
      },
      {
        key: 'mSupport',
        action: { kind: 'route', path: '/support' },
        icon: (
          <svg {...ICON_PROPS}>
            <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.8} />
            <path
              d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 17h.01"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </svg>
        ),
      },
      {
        key: 'mTerms',
        action: { kind: 'external', url: 'https://docs.dfx.swiss/en/tnc.html' },
        icon: (
          <svg {...ICON_PROPS}>
            <path d="M6 3h9l3 3v15H6z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
            <path d="M9 11h6M9 15h6" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
          </svg>
        ),
      },
      {
        key: 'mPrivacy',
        action: { kind: 'external', url: 'https://docs.dfx.swiss/en/privacy.html' },
        icon: (
          <svg {...ICON_PROPS}>
            <rect x={5} y={11} width={14} height={9} rx={2} stroke="currentColor" strokeWidth={1.7} />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth={1.7} />
          </svg>
        ),
      },
      {
        key: 'mImprint',
        action: { kind: 'external', url: 'https://docs.dfx.swiss/en/imprint.html' },
        icon: (
          <svg {...ICON_PROPS}>
            <rect x={4} y={4} width={16} height={16} rx={2} stroke="currentColor" strokeWidth={1.7} />
            <path d="M12 10v6M12 7h.01" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" />
          </svg>
        ),
      },
    ],
  },
];

const EXT_ICON = (
  <svg className="ext" viewBox="0 0 24 24" fill="none">
    <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LOGOUT_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M15 17l5-5-5-5M20 12H9M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  activePath: string;
}

export function Drawer({ open, onClose, activePath }: DrawerProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { address, blockchain, logout } = useWalletSession();
  const scrimRef = useRef<HTMLDivElement>(null);
  const ref = useModalDialog<HTMLElement>(open, onClose, scrimRef);
  const activeMode = new URLSearchParams(location.search).get('mode') ?? 'buy';

  const runAction = (action: MenuAction, label: string) => {
    onClose();
    if (action.kind === 'route') {
      navigate({ pathname: action.path, search: action.mode ? `?mode=${action.mode}` : '' });
      return;
    }
    if (action.kind === 'external') {
      window.open(action.url, '_blank', 'noopener');
      return;
    }
    if (action.kind === 'logout') {
      void logout(); // clears session state + shows its own toast (WalletSessionProvider.logout)
      return;
    }
    // TODO(wire): route to the real screen once it exists (limit, OpenCryptoPay, payment routes, ...).
    showToast(t('comingSoon') || label);
  };

  return (
    <>
      <div ref={scrimRef} className={`scrim${open ? ' on' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside
        ref={ref}
        className={`drawer${open ? ' on' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawerName"
        aria-hidden={!open}
        tabIndex={-1}
      >
        <div className="dhead">
          <div className="who">
            <span className="av">
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }}>
                <circle cx={12} cy={8} r={4} stroke="#fff" strokeWidth={1.9} />
                <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" />
              </svg>
            </span>
            <span className="nm">
              <b id="drawerName">{t('mAcct')}</b>
              <small>
                {address ? shortAddress(address) : '—'}
                {blockchain && (
                  <span className="pill-chip rdy" style={{ marginLeft: 6 }}>
                    {blockchain}
                  </span>
                )}
              </small>
            </span>
          </div>
          <button className="rbtn" aria-label="Close menu" style={{ width: 44, height: 44 }} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="dscroll">
          {MENU.map((group) => (
            <div key={group.key}>
              <div className="dgroup">{t(group.key)}</div>
              {group.items.map((item) => (
                <div
                  key={item.key}
                  className={`mitem${
                    item.action.kind === 'route' &&
                    item.action.path === activePath &&
                    (!item.action.mode || item.action.mode === activeMode)
                      ? ' active'
                      : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => runAction(item.action, t(item.key))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      runAction(item.action, t(item.key));
                    }
                  }}
                >
                  <span className="micon">{item.icon}</span>
                  <span>{t(item.key)}</span>
                  {item.action.kind === 'external' && EXT_ICON}
                </div>
              ))}
            </div>
          ))}
          <div>
            <div className="dgroup" aria-hidden="true">
              &nbsp;
            </div>
            <div
              className="mitem"
              role="button"
              tabIndex={0}
              onClick={() => runAction({ kind: 'logout' }, t('mLogout'))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  runAction({ kind: 'logout' }, t('mLogout'));
                }
              }}
            >
              <span className="micon">{LOGOUT_ICON}</span>
              <span>{t('mLogout')}</span>
            </div>
          </div>
        </div>
        <div className="dfoot">
          <div className="acc">DFX Services AG · Zug</div>
        </div>
      </aside>
    </>
  );
}
