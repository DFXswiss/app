import { useEffect } from 'react';
import { PARTNER_PROGRAM_NAME, PartnerBrand } from 'src/config/partner-dashboard.config';
import { DfxLogo } from 'src/partner-dashboard/logos/dfx-logo';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';

export interface PartnerHeaderProps {
  brand: PartnerBrand;
  isFixture: boolean;
}

/**
 * Header: program kicker (shared for all partners) above the brand row
 * (DFX logo × partner logo + partner display name as h1).
 * `brand.title` remains document title only — not repeated next to the logos.
 * The program name is `PARTNER_PROGRAM_NAME`, not per-partner config.
 */
export function PartnerHeader({ brand, isFixture }: PartnerHeaderProps): JSX.Element {
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
      <p
        className="text-2xs font-medium uppercase tracking-[0.18em] text-dfxGray-700"
        data-testid="program-name"
      >
        {PARTNER_PROGRAM_NAME}
      </p>
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <div className="flex items-center gap-2.5 text-white shrink-0" data-testid="brand-marks">
          <DfxLogo className="h-8 w-auto text-white" title="DFX" />
          <span className="text-dfxGray-600 text-xl font-light select-none leading-none" aria-hidden="true">
            ×
          </span>
          <span
            className="text-white flex items-center [&_svg]:h-9 [&_svg]:w-auto"
            data-testid="partner-logo"
          >
            {brand.logo}
          </span>
        </div>
        <h1
          className="text-xl sm:text-2xl font-bold text-white min-w-0"
          data-testid="partner-title"
        >
          {brand.displayName}
        </h1>
        {isFixture && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold uppercase tracking-wide bg-dfxYellow-700 text-white"
            data-testid="fixture-badge"
          >
            {translate('Demo data')}
          </span>
        )}
      </div>
    </header>
  );
}
