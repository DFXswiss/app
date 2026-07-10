// DFX App 2.0 — language picker, ported from the static app's `langSheet` /
// `.lopt` rows and `pickLang()` (public/app2/index.html).

import deFlag from '../assets/flags/de.svg';
import frFlag from '../assets/flags/fr.svg';
import gbFlag from '../assets/flags/gb.svg';
import itFlag from '../assets/flags/it.svg';
import { LANGUAGES, useT, type Language } from '../i18n';
import { Sheet, SheetHeader, useToast } from './ui';

const FLAGS: Record<string, string> = { gb: gbFlag, de: deFlag, it: itFlag, fr: frFlag };

interface LanguageSheetProps {
  open: boolean;
  onClose: () => void;
}

export function LanguageSheet({ open, onClose }: LanguageSheetProps) {
  const { language, setLanguage, t } = useT();
  const { showToast } = useToast();

  const pick = (code: Language, label: string) => {
    setLanguage(code);
    onClose();
    showToast(label);
  };

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
