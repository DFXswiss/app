jest.mock('@dfx.swiss/react-components', () => ({
  IconColor: { RED: 'RED', DARK_GRAY: 'DARK_GRAY' },
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
import { ServiceNoticeBanner } from 'src/components/service-notice-banner';
import { FeatureFlags } from 'src/config/feature-flags';
import { setupLanguages } from 'src/translations';

const SLIM = {
  en: 'All DFX core features are available again. Buying and selling on the most popular blockchains is fully operational again. Do not send crypto tokens to deposit addresses you received from DFX before 18 November 2026. Customer data was not affected by this incident.',
  de: 'Alle DFX-Core-Funktionen sind wieder verfügbar. Kaufen und Verkaufen der beliebtesten Blockchains ist wieder vollständig in Betrieb. Senden Sie keine Crypto Tokens an Einzahlungsadressen, die Sie vor dem 18. November 2026 von DFX erhalten haben. Kundendaten waren bei diesem Zwischenfall nicht betroffen.',
  fr: "Toutes les fonctionnalités principales de DFX sont de nouveau disponibles. L'achat et la vente sur les blockchains les plus populaires fonctionnent de nouveau pleinement. N'envoyez pas de tokens crypto aux adresses de dépôt que vous avez reçues de DFX avant le 18 novembre 2026. Les données des clients n'ont pas été touchées par cet incident.",
  it: "Tutte le funzionalità principali di DFX sono di nuovo disponibili. L'acquisto e la vendita sulle blockchain più popolari sono di nuovo pienamente operativi. Non inviare token crypto agli indirizzi di deposito ricevuti da DFX prima del 18 novembre 2026. I dati dei clienti non sono stati coinvolti in questo incidente.",
};

const PROMINENT = {
  en: 'Swapping is not yet available again. Do not send crypto tokens to any deposit address you received from DFX before 18 November 2026 — these addresses must no longer be used. Buying and selling on the most popular blockchains is fully operational again. Customer data was not affected by this incident.',
  de: 'Tauschen ist noch nicht wieder verfügbar. Senden Sie keine Crypto Tokens an Einzahlungsadressen, die Sie vor dem 18. November 2026 von DFX erhalten haben — diese Adressen dürfen nicht mehr verwendet werden. Kaufen und Verkaufen der beliebtesten Blockchains ist wieder vollständig in Betrieb. Kundendaten waren bei diesem Zwischenfall nicht betroffen.',
  fr: "L'échange n'est pas encore rétabli. N'envoyez pas de tokens crypto à une adresse de dépôt que vous avez reçue de DFX avant le 18 novembre 2026 — ces adresses ne doivent plus être utilisées. L'achat et la vente sur les blockchains les plus populaires fonctionnent de nouveau pleinement. Les données des clients n'ont pas été touchées par cet incident.",
  it: "Lo scambio non è ancora stato ripristinato. Non inviare token crypto a nessun indirizzo di deposito ricevuto da DFX prima del 18 novembre 2026 — questi indirizzi non devono più essere utilizzati. L'acquisto e la vendita sulle blockchain più popolari sono di nuovo pienamente operativi. I dati dei clienti non sono stati coinvolti in questo incidente.",
};

// Appended to every notice: questions go to the support tickets, never to an email address.
const HINT = {
  en: ' Questions: Open a support ticket',
  de: ' Fragen: Support-Ticket erstellen',
  fr: ' Questions : Ouvrir un ticket de support',
  it: ' Domande: Apri un ticket di supporto',
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
    '/sell',
    '/sell/',
    '/sell/info',
    '/swap/info',
    '/selling',
    '/support/tickets',
  ])('shows the slim notice on %s', (path) => {
    renderAt(path);

    const banner = screen.getByTestId('service-notice-banner');
    expect(banner).toHaveAttribute('data-variant', 'slim');
    expect(banner).toHaveAttribute('role', 'note');
    expect(banner.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['w-full', 'rounded-md', 'border', 'border-dfxGray-400', 'bg-dfxGray-300']),
    );
    expect(screen.getByTestId('info-text')).toHaveAttribute('data-icon-color', 'DARK_GRAY');
    expect(screen.getByTestId('info-text')).toHaveAttribute('data-text-size', 'XS');
    expect(banner.textContent).toBe(`${SLIM.en}${HINT.en}`);
    expect(screen.queryByText(PROMINENT.en)).not.toBeInTheDocument();
  });

  it.each(['/swap', '/swap/'])('shows the prominent notice on %s', (path) => {
    renderAt(path);

    const banner = screen.getByTestId('service-notice-banner');
    expect(banner).toHaveAttribute('data-variant', 'prominent');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['w-full', 'rounded-lg', 'border-2', 'border-dfxRed-100']),
    );
    expect(screen.getByTestId('info-text')).toHaveAttribute('data-icon-color', 'RED');
    expect(screen.getByTestId('info-text')).not.toHaveAttribute('data-text-size');
    expect(banner.textContent).toBe(`${PROMINENT.en}${HINT.en}`);
    expect(screen.queryByText(SLIM.en)).not.toBeInTheDocument();
  });

  it.each(LANGUAGES)('translates every notice into %s', async (language) => {
    await i18n.changeLanguage(language);

    const { unmount } = renderAt('/');
    expect(screen.getByTestId('service-notice-banner').textContent).toBe(`${SLIM[language]}${HINT[language]}`);
    unmount();

    const sell = renderAt('/sell');
    expect(screen.getByTestId('service-notice-banner').textContent).toBe(`${SLIM[language]}${HINT[language]}`);
    sell.unmount();

    renderAt('/swap');
    expect(screen.getByTestId('service-notice-banner').textContent).toBe(`${PROMINENT[language]}${HINT[language]}`);
  });

  it.each(['/', '/sell', '/swap'])('uses Swiss spelling and the formal Sie in German on %s', async (path) => {
    await i18n.changeLanguage('de');
    renderAt(path);
    const text = screen.getByTestId('service-notice-banner').textContent ?? '';
    expect(text).not.toContain('ß');
    expect(text).not.toMatch(/\b(Du|Dein|Deine|Dir|Dich|Sende|hast)\b/i);
  });

  it.each(['/', '/buy', '/sell', '/swap'])(
    'links questions to the support tickets and names no email address on %s',
    (path) => {
      renderAt(path);

      const banner = screen.getByTestId('service-notice-banner');
      const link = screen.getByRole('link', { name: 'Open a support ticket' });
      expect(banner).toContainElement(link);
      expect(link).toHaveAttribute('href', '/support/tickets');
      expect(banner.textContent).not.toContain('@');
    },
  );
});
