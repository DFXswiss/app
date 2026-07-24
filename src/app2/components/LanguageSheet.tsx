// DFX App 2.0 — language picker, ported from the static app's `langSheet` /
// `.lopt` rows and `pickLang()` (public/app2/index.html). Two presentations
// share the same pick logic: the anchored top-right dropdown (`.langmenu`,
// `LanguageMenu`) driven by the header pill, and the in-context bottom sheet
// (`langSheet`, `LanguageSheet`) used by the drawer/account language action.

import { useLanguageContext, useUserContext } from '@dfx.swiss/react';
import { useEffect, useRef } from 'react';
import deFlag from '../assets/flags/de.svg';
import frFlag from '../assets/flags/fr.svg';
import gbFlag from '../assets/flags/gb.svg';
import itFlag from '../assets/flags/it.svg';
import { LANGUAGES, useT, type Language } from '../i18n';
import { useWalletSession } from '../wallets/session';
import { Sheet, SheetHeader, useToast } from './ui';

const FLAGS: Record<string, string> = { gb: gbFlag, de: deFlag, it: itFlag, fr: frFlag };

/** Shared `pickLang()` port: set the local language, toast the label, and — when
 * logged in — mirror the choice to the API user, matching the static app. */
function useLanguagePick(onClose: () => void) {
  const { setLanguage, t } = useT();
  const { showToast } = useToast();
  const { languages } = useLanguageContext();
  const { updateLanguage } = useUserContext();
  const { isLoggedIn } = useWalletSession();

  return (code: Language, label: string) => {
    setLanguage(code);
    onClose();
    showToast(label);
    const apiLanguage = languages?.find(({ symbol }) => symbol.toLowerCase() === code);
    if (isLoggedIn && apiLanguage) {
      void updateLanguage(apiLanguage).catch(() => showToast(t('genErr'), { assertive: true }));
    }
  };
}

interface LanguageSheetProps {
  open: boolean;
  onClose: () => void;
}

export function LanguageSheet({ open, onClose }: LanguageSheetProps) {
  const { language, t } = useT();
  const pick = useLanguagePick(onClose);

  return (
    <Sheet open={open} onClose={onClose} titleId="langSheetTitle">
      <SheetHeader titleId="langSheetTitle" title={t('chooseLang')} onClose={onClose} />
      <div className="slist" style={{ paddingBottom: 24 }}>
        {LANGUAGES.map(({ code, label, flag }) => (
          <div
            key={code}
            className={`lopt${language === code ? ' sel' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => pick(code, label)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                pick(code, label);
              }
            }}
          >
            <img src={FLAGS[flag]} alt="" width={22} height={22} />
            <b>{label}</b>
            <svg className="ck" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12l4 4 10-10"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

interface LanguageMenuProps {
  open: boolean;
  onClose: () => void;
  /** The header pill; excluded from the outside-click handler so its own toggle wins. */
  anchorRef: React.RefObject<HTMLElement>;
}

/** Anchored top-right dropdown (`.langmenu`, `role="menu"`) toggled by the header
 * language pill — the static app's `langMenu` / `openLang()` / `closeLang()`
 * (public/app2/index.html), distinct from the in-context bottom sheet. */
export function LanguageMenu({ open, onClose, anchorRef }: LanguageMenuProps) {
  const { language } = useT();
  const pick = useLanguagePick(onClose);
  const menuRef = useRef<HTMLDivElement>(null);

  // Outside-click and Escape close, mirroring the static app's document listener
  // and langMenu keydown handler.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        anchorRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  // Focus the current (or first) option when the menu opens, as openLang() did.
  useEffect(() => {
    if (!open) return;
    const node = menuRef.current;
    const id = requestAnimationFrame(() =>
      (node?.querySelector<HTMLElement>('.lopt.sel') ?? node?.querySelector<HTMLElement>('.lopt'))?.focus(),
    );
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Arrow-key roving focus within the menu, matching the static langMenu keydown.
  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('.lopt') ?? []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  };

  return (
    <div
      className={`langmenu${open ? ' on' : ''}`}
      id="langMenu"
      role="menu"
      aria-label="Language"
      ref={menuRef}
      onKeyDown={onMenuKeyDown}
    >
      {LANGUAGES.map(({ code, label, flag }) => (
        <div
          key={code}
          className={`lopt${language === code ? ' sel' : ''}`}
          role="menuitem"
          tabIndex={-1}
          aria-current={language === code || undefined}
          onClick={() => pick(code, label)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              pick(code, label);
            }
          }}
        >
          <img src={FLAGS[flag]} alt="" width={22} height={22} />
          <b>{label}</b>
          <svg className="ck" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l4 4 10-10"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ))}
    </div>
  );
}
