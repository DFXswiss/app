// DFX App 2.0 — app shell (`.app > .layer > .topbar + .body`), ported 1:1
// from the static preview's outer markup (public/app2/index.html, `<div
// class="app" id="app">…`). Screens render into `.body` via <Outlet/>.

import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import logoWhite from '../assets/brand/logo-white.svg';
import { useT } from '../i18n';
import { ConnectSheet } from '../wallets/ConnectSheet';
import { useWalletSession } from '../wallets/session';
import { WalletSwitcher } from '../wallets/WalletSwitcher';
import { Drawer } from './Drawer';
import { LanguageMenu } from './LanguageSheet';

/** Mirrors the static app's initials() for the address case: strip a `0x`
 * prefix, take the first two characters, uppercase. */
function addressInitials(address: string): string {
  const raw = address.startsWith('0x') ? address.slice(2) : address;
  return (raw.slice(0, 2) || '·').toUpperCase();
}

export function Shell() {
  const { language } = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, address, closeConnect, connectSheet } = useWalletSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.title = 'DFX';
  }, []);

  // Close any open overlay on navigation, same as the static app's go() — including the
  // connect sheet (finding #4: it used to survive a route change since it was owned by an
  // ancestor of the router and never saw location updates).
  useEffect(() => {
    setDrawerOpen(false);
    setLangOpen(false);
    closeConnect();
  }, [location.pathname, closeConnect]);

  return (
    <div className="app" id="app">
      <div className="layer" id="layer">
        <div className="topbar" id="topbar">
          <button
            className="rbtn avatar-btn"
            id="leftBtn"
            aria-label="account"
            style={{ visibility: isLoggedIn ? 'visible' : 'hidden' }}
            onClick={() => navigate('/account')}
          >
            <span className="initials">{address ? addressInitials(address) : '·'}</span>
          </button>
          <img className="brand-logo" src={logoWhite} alt="DFX" />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* The static app hides the language pill once logged in (`langBtn`
                display:none in the view-change handler, public/app2/index.html) —
                post-login the topbar is avatar + logo + burger, and the in-context
                language action lives in the account view instead. */}
            {!isLoggedIn && (
              <button
                ref={langBtnRef}
                className="langpill"
                aria-label="Change language"
                aria-haspopup="menu"
                aria-expanded={langOpen}
                aria-controls="langMenu"
                onClick={() => setLangOpen((v) => !v)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx={12} cy={12} r={9} />
                  <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" strokeLinecap="round" />
                </svg>
                <span>{language.toUpperCase()}</span>
                <svg className="car" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                  <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {/* Matches the static app's burgerBtn (public/app2/index.html, `style="display:none"`
                by default, only shown post-login — line ~1873's view-change handler flips it to
                `display:grid`). There's no logged-out replacement there: the hero's own
                "Connect wallet" CTA is the entry point, so this slot renders nothing pre-login. */}
            {isLoggedIn && (
              <button className="rbtn" aria-label="menu" onClick={() => setDrawerOpen(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                  <line x1={4} y1={7} x2={20} y2={7} />
                  <line x1={4} y1={12} x2={20} y2={12} />
                  <line x1={4} y1={17} x2={20} y2={17} />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="body">
          {/* Mirrors the static app's per-screen `<section class="view on">` wrapper (public/app2/
              index.html) — without it, `.login`/`.buy`'s `min-height:100%` resolves against
              `.body`'s own definite (flex-resolved) height instead of falling back to `auto`
              against a non-flex, content-sized ancestor, which is what actually makes
              `.login .hero`'s `margin:auto` vertical-centering produce the reference's tight
              ~18px gap under the language pill instead of ~190px (finding #8) — a pure CSS
              percentage-resolution difference from the missing wrapper, not a spacing value to
              tune. */}
          <div className="view on">
            <Outlet />
          </div>
        </div>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} activePath={location.pathname} />
      <LanguageMenu open={langOpen} onClose={() => setLangOpen(false)} anchorRef={langBtnRef} />
      <ConnectSheet
        open={connectSheet.open}
        view={connectSheet.view}
        onClose={closeConnect}
        onSelectWallet={connectSheet.onSelectWallet}
        onSelectHwChain={connectSheet.onSelectHwChain}
        onSubmitRecommendation={connectSheet.onSubmitRecommendation}
        requestSignMessage={connectSheet.requestSignMessage}
        onCliConnect={connectSheet.onCliConnect}
        onBackToList={connectSheet.onBackToList}
      />
      <WalletSwitcher />
    </div>
  );
}
