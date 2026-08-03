import { useEffect } from 'react';
import { PARTNER_PROGRAM_NAME, PartnerBrand } from 'src/config/partner-dashboard.config';
import { DfxLogo } from 'src/partner-dashboard/logos/dfx-logo';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';
import { PartnerLanguage, PartnerTheme } from 'src/partner-dashboard/util/theme';

export interface PartnerHeaderProps {
  brand: PartnerBrand;
  isFixture: boolean;
  theme: PartnerTheme;
  onThemeChange: (theme: PartnerTheme) => void;
  language: PartnerLanguage;
  onLanguageChange: (lang: PartnerLanguage) => void;
  onLogout?: () => void;
}

/**
 * Header: program kicker (shared for all partners) above the brand row
 * (DFX logo × partner logo + partner display name as h1) and theme/language switchers.
 * `brand.title` remains document title only — not repeated next to the logos.
 * The program name is `PARTNER_PROGRAM_NAME`, not per-partner config.
 *
 * Unknown partners (logoUrl null): DFX logo + plain display name — no empty logo box.
 */
export function PartnerHeader({
  brand,
  isFixture,
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  onLogout,
}: PartnerHeaderProps): JSX.Element {
  const { translate } = usePartnerTranslation();

  useEffect(() => {
    const previous = document.title;
    document.title = brand.title;
    return () => {
      document.title = previous;
    };
  }, [brand.title]);

  return (
    <header className="space-y-3" data-testid="partner-header">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p
          className="text-2xs font-medium uppercase tracking-[0.18em] partner-text-tertiary"
          data-testid="program-name"
        >
          {PARTNER_PROGRAM_NAME}
        </p>
        <div
          className="flex flex-wrap items-center gap-2 ml-auto"
          data-testid="partner-switchers"
        >
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
          <div
            className="partner-switcher"
            role="group"
            aria-label={translate('Language')}
            data-testid="language-switcher"
          >
            <button
              type="button"
              aria-pressed={language === 'de'}
              onClick={() => onLanguageChange('de')}
              data-testid="lang-de"
            >
              DE
            </button>
            <button
              type="button"
              aria-pressed={language === 'en'}
              onClick={() => onLanguageChange('en')}
              data-testid="lang-en"
            >
              EN
            </button>
          </div>
          {onLogout && !isFixture && (
            <button
              type="button"
              className="partner-btn-idle px-3 py-1.5 text-xs font-medium rounded"
              onClick={onLogout}
              data-testid="partner-logout"
            >
              {translate('Log out')}
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <div className="flex items-center gap-2.5 shrink-0" data-testid="brand-marks">
          <DfxLogo className="h-8 w-auto" title="DFX" />
          {brand.logoUrl ? (
            <>
              <span
                className="partner-text-secondary text-xl font-light select-none leading-none"
                aria-hidden="true"
              >
                ×
              </span>
              <span className="flex items-center" data-testid="partner-logo">
                <img
                  src={brand.logoUrl}
                  alt={brand.displayName}
                  className="partner-logo-img h-9 w-auto"
                  data-testid="partner-logo-img"
                />
              </span>
            </>
          ) : (
            <span data-testid="partner-logo-fallback" className="hidden">
              {translate('No partner logo')}
            </span>
          )}
        </div>
        <h1
          className="text-xl sm:text-2xl font-bold min-w-0"
          data-testid="partner-title"
          style={{ color: 'var(--text)' }}
        >
          {brand.displayName}
        </h1>
        {isFixture && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold uppercase tracking-wide partner-fixture-badge"
            data-testid="fixture-badge"
          >
            {translate('Demo data')}
          </span>
        )}
      </div>
    </header>
  );
}
