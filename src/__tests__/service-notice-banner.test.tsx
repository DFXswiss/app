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
  en: 'Selling is temporarily unavailable. Do not send funds to deposit addresses you received from DFX before 18 November 2026.',
  de: 'Verkaufen ist vorübergehend nicht möglich. Sende keine Gelder an Einzahlungsadressen, die Du vor dem 18. November 2026 von DFX erhalten hast.',
  fr: "La vente est temporairement indisponible. N'envoyez pas de fonds aux adresses de dépôt que vous avez reçues de DFX avant le 18 novembre 2026.",
  it: 'La vendita è temporaneamente non disponibile. Non inviare fondi agli indirizzi di deposito ricevuti da DFX prima del 18 novembre 2026.',
};

const PROMINENT = {
  en: 'Selling and swapping are temporarily unavailable. Do not send funds to any deposit address you received from DFX before 18 November 2026 — these addresses must no longer be used.',
  de: 'Verkaufen und Tauschen sind vorübergehend nicht möglich. Sende keine Gelder an Einzahlungsadressen, die Du vor dem 18. November 2026 von DFX erhalten hast — diese Adressen dürfen nicht mehr verwendet werden.',
  fr: "La vente et l'échange sont temporairement indisponibles. N'envoyez pas de fonds à une adresse de dépôt que vous avez reçue de DFX avant le 18 novembre 2026 — ces adresses ne doivent plus être utilisées.",
  it: 'La vendita e lo scambio sono temporaneamente non disponibili. Non inviare fondi a nessun indirizzo di deposito ricevuto da DFX prima del 18 novembre 2026 — questi indirizzi non devono più essere utilizzati.',
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

  it.each(['/', '/buy', '/account', '/sell/info', '/swap/info', '/selling', '/support/tickets'])(
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
      expect(screen.queryByText(PROMINENT.en)).not.toBeInTheDocument();
    },
  );

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
    expect(screen.queryByText(SLIM.en)).not.toBeInTheDocument();
  });

  it.each(LANGUAGES)('translates both notices into %s', async (language) => {
    await i18n.changeLanguage(language);

    const { unmount } = renderAt('/');
    expect(screen.getByTestId('service-notice-banner')).toHaveTextContent(SLIM[language]);
    unmount();

    renderAt('/sell');
    expect(screen.getByTestId('service-notice-banner')).toHaveTextContent(PROMINENT[language]);
  });

  it('uses Swiss spelling in German', async () => {
    await i18n.changeLanguage('de');
    renderAt('/swap');
    expect(screen.getByTestId('service-notice-banner').textContent).not.toContain('ß');
  });
});
