import { useEffect } from 'react';
import { PARTNER_PROGRAM_NAME } from 'src/config/partner-dashboard.config';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';

export interface PartnerHeaderProps {
  isFixture?: boolean;
}

/**
 * Header inside the main app: program name + title only.
 * Theme/language switchers live on the main app; partner white-label branding is retired.
 */
export function PartnerHeader({ isFixture }: PartnerHeaderProps): JSX.Element {
  const { translate } = usePartnerTranslation();
  const title = translate('Partner Dashboard');

  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <header className="space-y-3" data-testid="partner-header">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p
          className="text-2xs font-medium uppercase tracking-[0.18em] partner-text-tertiary"
          data-testid="program-name"
        >
          {PARTNER_PROGRAM_NAME}
        </p>
        {isFixture && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold uppercase tracking-wide partner-fixture-badge"
            data-testid="fixture-badge"
          >
            {translate('Demo data')}
          </span>
        )}
      </div>
      <h1
        className="text-xl sm:text-2xl font-bold min-w-0"
        data-testid="partner-title"
        style={{ color: 'var(--text)' }}
      >
        {title}
      </h1>
    </header>
  );
}
