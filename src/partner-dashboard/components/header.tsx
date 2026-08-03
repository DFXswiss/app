import { Language } from '@dfx.swiss/react';
import { useEffect } from 'react';
import { PARTNER_PROGRAM_NAME } from 'src/config/partner-dashboard.config';
import { useSettingsContext } from 'src/contexts/settings.context';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';
import { PartnerTheme } from 'src/partner-dashboard/util/theme';

export interface PartnerHeaderProps {
  isFixture?: boolean;
  theme: PartnerTheme;
  onThemeChange: (theme: PartnerTheme) => void;
}

/**
 * Header: program kicker + title on the left, secondary controls (theme + language)
 * grouped on the right. Language mutates the main-app settings context so the rest
 * of the app stays in sync. Theme is dashboard-local only.
 */
export function PartnerHeader({ isFixture, theme, onThemeChange }: PartnerHeaderProps): JSX.Element {
  const { translate } = usePartnerTranslation();
  const { language, availableLanguages, changeLanguage } = useSettingsContext();
  const title = translate('Partner Dashboard');

  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  /**
   * Offer every language the app already supports (DE/EN/FR/IT via `availableLanguages`).
   * Restricting to DE/EN would leave FR/IT users without an active segment and force a
   * settings-page detour for languages the rest of the product already ships. Symbols are
   * compact enough for the segmented control; the Auftraggeber named DE/EN as examples,
   * not as a hard filter.
   */
  const languages = availableLanguages;

  function selectLanguage(lang: Language): void {
    changeLanguage(lang);
  }

  return (
    <header className="partner-header" data-testid="partner-header">
      <div className="partner-header-row">
        <div className="partner-header-copy min-w-0">
          <p
            className="text-2xs font-medium uppercase tracking-[0.18em] partner-text-tertiary"
            data-testid="program-name"
          >
            {PARTNER_PROGRAM_NAME}
          </p>
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <h1
              className="text-xl sm:text-2xl font-bold min-w-0 truncate"
              data-testid="partner-title"
              style={{ color: 'var(--text)' }}
            >
              {title}
            </h1>
            {isFixture && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold uppercase tracking-wide partner-fixture-badge shrink-0"
                data-testid="fixture-badge"
              >
                {translate('Demo data')}
              </span>
            )}
          </div>
        </div>

        <div className="partner-header-controls" data-testid="partner-switchers">
          <div
            className="partner-switcher"
            role="group"
            aria-label={translate('Theme')}
            data-testid="theme-switcher"
          >
            <button
              type="button"
              aria-pressed={theme === 'light'}
              onClick={() => onThemeChange('light')}
              data-testid="theme-light"
            >
              {translate('Light')}
            </button>
            <button
              type="button"
              aria-pressed={theme === 'dark'}
              onClick={() => onThemeChange('dark')}
              data-testid="theme-dark"
            >
              {translate('Dark')}
            </button>
          </div>

          {languages.length > 0 && (
            <div
              className="partner-switcher"
              role="group"
              aria-label={translate('Language')}
              data-testid="language-switcher"
            >
              {languages.map((lang) => {
                const active = language?.id === lang.id || language?.symbol === lang.symbol;
                return (
                  <button
                    key={lang.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectLanguage(lang)}
                    data-testid={`lang-${lang.symbol.toLowerCase()}`}
                  >
                    {lang.symbol}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
