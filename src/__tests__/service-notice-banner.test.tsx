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
  en: 'Due to a security incident affecting DFX deposit addresses, selling is temporarily unavailable. Customer data and customer funds are not affected. All customer data and customer funds are safe and will be processed as quickly as possible. Do not send crypto tokens to deposit addresses you received from DFX before 18 November 2026.',
  de: 'Wegen eines Sicherheitsvorfalls, der DFX-Einzahlungsadressen betrifft, ist Verkaufen vorübergehend nicht möglich. Kundendaten und Kundengelder sind nicht betroffen. Alle Kundendaten und Kundengelder sind sicher und werden schnellstmöglich verarbeitet. Senden Sie keine Crypto Tokens an Einzahlungsadressen, die Sie vor dem 18. November 2026 von DFX erhalten haben.',
  fr: "En raison d'un incident de sécurité concernant les adresses de dépôt DFX, la vente est temporairement indisponible. Les données et les fonds des clients ne sont pas concernés. Toutes les données et tous les fonds des clients sont en sécurité et seront traités dans les meilleurs délais. N'envoyez pas de tokens crypto aux adresses de dépôt que vous avez reçues de DFX avant le 18 novembre 2026.",
  it: 'A causa di un incidente di sicurezza che riguarda gli indirizzi di deposito DFX, la vendita è temporaneamente non disponibile. I dati e i fondi dei clienti non sono interessati. Tutti i dati e i fondi dei clienti sono al sicuro e verranno elaborati il prima possibile. Non inviare token crypto agli indirizzi di deposito ricevuti da DFX prima del 18 novembre 2026.',
};

const PROMINENT = {
  en: 'Due to a security incident affecting DFX deposit addresses, selling and swapping are temporarily unavailable. Customer data and customer funds are not affected. All customer data and customer funds are safe and will be processed as quickly as possible. Do not send crypto tokens to any deposit address you received from DFX before 18 November 2026 — these addresses must no longer be used.',
  de: 'Wegen eines Sicherheitsvorfalls, der DFX-Einzahlungsadressen betrifft, sind Verkaufen und Tauschen vorübergehend nicht möglich. Kundendaten und Kundengelder sind nicht betroffen. Alle Kundendaten und Kundengelder sind sicher und werden schnellstmöglich verarbeitet. Senden Sie keine Crypto Tokens an Einzahlungsadressen, die Sie vor dem 18. November 2026 von DFX erhalten haben — diese Adressen dürfen nicht mehr verwendet werden.',
  fr: "En raison d'un incident de sécurité concernant les adresses de dépôt DFX, la vente et l'échange sont temporairement indisponibles. Les données et les fonds des clients ne sont pas concernés. Toutes les données et tous les fonds des clients sont en sécurité et seront traités dans les meilleurs délais. N'envoyez pas de tokens crypto à une adresse de dépôt que vous avez reçue de DFX avant le 18 novembre 2026 — ces adresses ne doivent plus être utilisées.",
  it: 'A causa di un incidente di sicurezza che riguarda gli indirizzi di deposito DFX, la vendita e lo scambio sono temporaneamente non disponibili. I dati e i fondi dei clienti non sono interessati. Tutti i dati e i fondi dei clienti sono al sicuro e verranno elaborati il prima possibile. Non inviare token crypto a nessun indirizzo di deposito ricevuto da DFX prima del 18 novembre 2026 — questi indirizzi non devono più essere utilizzati.',
};

const BUY = {
  en: 'Buying works as usual; just follow the details below.',
  de: 'Kaufen ist ganz normal möglich, befolgen Sie einfach die Angaben unten.',
  fr: "L'achat fonctionne normalement, suivez simplement les indications ci-dessous.",
  it: "L'acquisto funziona normalmente, segui semplicemente le indicazioni qui sotto.",
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

  it.each(['/', '/account', '/buy/info', '/buying', '/sell/info', '/swap/info', '/selling', '/support/tickets'])(
    'shows the slim notice on %s',
    (path) => {
      renderAt(path);

      const banner = screen.getByTestId('service-notice-banner');
      expect(banner).toHaveAttribute('data-variant', 'slim');
      expect(banner).toHaveAttribute('role', 'note');
      expect(banner.className.split(/\s+/)).toEqual(
        expect.arrayContaining(['w-full', 'rounded-md', 'border', 'border-dfxGray-400', 'bg-dfxGray-300']),
      );
      expect(screen.getByTestId('info-text')).toHaveAttribute('data-icon-color', 'DARK_GRAY');
      expect(screen.getByTestId('info-text')).toHaveAttribute('data-text-size', 'XS');
      expect(banner).toHaveTextContent(SLIM.en);
      expect(banner).not.toHaveTextContent(BUY.en);
      expect(screen.queryByText(PROMINENT.en)).not.toBeInTheDocument();
    },
  );

  it.each(['/buy', '/buy/'])('adds the buy sentence to the slim notice on %s', (path) => {
    renderAt(path);

    const banner = screen.getByTestId('service-notice-banner');
    expect(banner).toHaveAttribute('data-variant', 'slim');
    expect(banner).toHaveAttribute('role', 'note');
    expect(screen.getByTestId('info-text')).toHaveAttribute('data-icon-color', 'DARK_GRAY');
    expect(screen.getByTestId('info-text')).toHaveAttribute('data-text-size', 'XS');
    expect(banner.textContent).toBe(`${SLIM.en} ${BUY.en}${HINT.en}`);
  });

  it.each(['/sell', '/sell/', '/swap', '/swap/'])('shows the prominent notice on %s', (path) => {
    renderAt(path);

    const banner = screen.getByTestId('service-notice-banner');
    expect(banner).toHaveAttribute('data-variant', 'prominent');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['w-full', 'rounded-lg', 'border-2', 'border-dfxRed-100']),
    );
    expect(screen.getByTestId('info-text')).toHaveAttribute('data-icon-color', 'RED');
    expect(screen.getByTestId('info-text')).not.toHaveAttribute('data-text-size');
    expect(banner).toHaveTextContent(PROMINENT.en);
    expect(banner).not.toHaveTextContent(BUY.en);
    expect(screen.queryByText(SLIM.en)).not.toBeInTheDocument();
  });

  it.each(LANGUAGES)('translates every notice into %s', async (language) => {
    await i18n.changeLanguage(language);

    const { unmount } = renderAt('/');
    expect(screen.getByTestId('service-notice-banner').textContent).toBe(`${SLIM[language]}${HINT[language]}`);
    unmount();

    const buy = renderAt('/buy');
    expect(screen.getByTestId('service-notice-banner').textContent).toBe(
      `${SLIM[language]} ${BUY[language]}${HINT[language]}`,
    );
    buy.unmount();

    renderAt('/sell');
    expect(screen.getByTestId('service-notice-banner').textContent).toBe(`${PROMINENT[language]}${HINT[language]}`);
  });

  it.each(['/', '/buy', '/swap'])('uses Swiss spelling and the formal Sie in German on %s', async (path) => {
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
