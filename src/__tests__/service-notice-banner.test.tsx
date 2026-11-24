jest.mock('@dfx.swiss/react-components', () => ({
  IconColor: { DARK_GRAY: 'DARK_GRAY' },
  StyledInfoTextSize: { XS: 'XS' },
  StyledInfoText: ({
    children,
    iconColor,
    textSize,
  }: {
    children: React.ReactNode;
    iconColor?: string;
    textSize?: string;
  }) => (
    <div data-testid="info-text" data-icon-color={iconColor} data-text-size={textSize}>
      {children}
    </div>
  ),
}));

jest.mock('src/contexts/settings.context', () => {
  const { t } = jest.requireActual('i18next') as typeof import('i18next');
  return {
    // Same lookup as the real settings context, so the test resolves the shipped translation files.
    useSettingsContext: () => ({
      translate: (key: string, defaultValue: string) => t([key, defaultValue].join('.'), defaultValue),
    }),
  };
});

import { render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { MemoryRouter } from 'react-router-dom';
import { SECURITY_INCIDENT_URL, ServiceNoticeBanner } from 'src/components/service-notice-banner';
import { FeatureFlags } from 'src/config/feature-flags';
import { setupLanguages } from 'src/translations';

const TEXT = {
  en: 'All DFX core features are available again. Do not send crypto tokens to deposit addresses you received from DFX before 18 November 2026.',
  de: 'Alle DFX-Core-Funktionen sind wieder verfügbar. Senden Sie keine Crypto Tokens an Einzahlungsadressen, die Sie vor dem 18. November 2026 von DFX erhalten haben.',
  fr: "Toutes les fonctionnalités principales de DFX sont de nouveau disponibles. N'envoyez pas de tokens crypto aux adresses de dépôt que vous avez reçues de DFX avant le 18 novembre 2026.",
  it: 'Tutte le funzionalità principali di DFX sono di nuovo disponibili. Non inviare token crypto agli indirizzi di deposito ricevuti da DFX prima del 18 novembre 2026.',
};

const MORE = {
  en: 'More',
  de: 'Mehr',
  fr: 'En savoir plus',
  it: 'Scopri di più',
};

const LANGUAGES = ['en', 'de', 'fr', 'it'] as const;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ServiceNoticeBanner />
    </MemoryRouter>,
  );
}

describe('ServiceNoticeBanner', () => {
  beforeAll(() => {
    setupLanguages();
  });

  beforeEach(async () => {
    FeatureFlags.serviceNotice = true;
    await i18n.changeLanguage('en');
  });

  afterAll(() => {
    FeatureFlags.serviceNotice = true;
  });

  it('ships with the service notice switched on', () => {
    expect(FeatureFlags).toEqual({ serviceNotice: true });
  });

  it.each(['/', '/buy', '/account', '/sell', '/sell/', '/swap', '/swap/', '/sell/info', '/support/tickets'])(
    'renders nothing on %s when the service notice flag is off',
    (path) => {
      FeatureFlags.serviceNotice = false;
      const { container } = renderAt(path);

      expect(screen.queryByTestId('service-notice-banner')).not.toBeInTheDocument();
      expect(container).toBeEmptyDOMElement();
    },
  );

  it.each([
    '/',
    '/account',
    '/buy',
    '/buy/',
    '/buy/info',
    '/buying',
    '/sell/info',
    '/swap/info',
    '/selling',
    '/swapping',
    '/sell//',
    '/support',
    '/support/tickets',
  ])('renders nothing on %s', (path) => {
    const { container } = renderAt(path);

    expect(screen.queryByTestId('service-notice-banner')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['/sell', '/sell/', '/swap', '/swap/'])('shows the slim notice on %s', (path) => {
    renderAt(path);

    const banner = screen.getByTestId('service-notice-banner');
    expect(banner).toHaveAttribute('role', 'note');
    expect(banner).not.toHaveAttribute('data-variant');
    expect(banner.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['w-full', 'rounded-md', 'border', 'border-dfxGray-400', 'bg-dfxGray-300']),
    );
    expect(screen.getByTestId('info-text')).toHaveAttribute('data-icon-color', 'DARK_GRAY');
    expect(screen.getByTestId('info-text')).toHaveAttribute('data-text-size', 'XS');
    expect(banner.textContent).toBe(`${TEXT.en} ${MORE.en}`);
  });

  it.each(LANGUAGES)('translates the notice and the link into %s', async (language) => {
    await i18n.changeLanguage(language);

    const { unmount } = renderAt('/sell');
    expect(screen.getByTestId('service-notice-banner').textContent).toBe(`${TEXT[language]} ${MORE[language]}`);
    unmount();

    renderAt('/swap');
    expect(screen.getByTestId('service-notice-banner').textContent).toBe(`${TEXT[language]} ${MORE[language]}`);
  });

  it.each(['/sell', '/swap'])('uses Swiss spelling and the formal Sie in German on %s', async (path) => {
    await i18n.changeLanguage('de');
    renderAt(path);
    const text = screen.getByTestId('service-notice-banner').textContent ?? '';
    expect(text).not.toContain('ß');
    expect(text).not.toMatch(/\b(Du|Dein|Deine|Dir|Dich|Sende|hast)\b/i);
  });

  it.each(['/sell', '/swap'])(
    'links More to the security incident page in a new tab and names no email address on %s',
    (path) => {
      renderAt(path);

      const banner = screen.getByTestId('service-notice-banner');
      const link = screen.getByRole('link', { name: 'More' });
      expect(banner).toContainElement(link);
      expect(link).toHaveAttribute('href', 'https://dfx.swiss/security-incident.html');
      expect(link).toHaveAttribute('href', SECURITY_INCIDENT_URL);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.getAllByRole('link')).toHaveLength(1);
      expect(banner.textContent).not.toContain('@');
    },
  );
});
