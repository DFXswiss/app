import { fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider, useT } from '../i18n';

const originalLocation = window.location;

function Probe() {
  const { t, language, setLanguage } = useT();
  return (
    <div>
      <span data-testid="lang">{language}</span>
      <span data-testid="missing">{t('notARealKey' as 'retry')}</span>
      <span data-testid="retry">{t('retry')}</span>
      <button type="button" onClick={() => setLanguage('de')}>
        de
      </button>
    </div>
  );
}

function mockSearch(search: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, search },
  });
}

describe('i18n detectLanguage / useT', () => {
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    window.localStorage.removeItem('dfx_lang');
  });

  it('throws when useT is used outside the provider', () => {
    expect(() => render(<Probe />)).toThrow('useT must be used within a LanguageProvider');
  });

  it('prefers a valid ?lang= query over storage', () => {
    window.localStorage.setItem('dfx_lang', 'fr');
    mockSearch('?lang=de');
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId('lang')).toHaveTextContent('de');
  });

  it('falls back to stored language, then persists setLanguage', () => {
    mockSearch('?lang=zz');
    window.localStorage.setItem('dfx_lang', 'it');
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId('lang')).toHaveTextContent('it');
    fireEvent.click(screen.getByRole('button', { name: 'de' }));
    expect(screen.getByTestId('lang')).toHaveTextContent('de');
    expect(window.localStorage.getItem('dfx_lang')).toBe('de');
  });

  it('falls back to the navigator language and then to English', () => {
    mockSearch('');
    window.localStorage.removeItem('dfx_lang');
    const languageDesc = Object.getOwnPropertyDescriptor(window.navigator, 'language');
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'fr-FR' });
    const { unmount } = render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId('lang')).toHaveTextContent('fr');
    unmount();

    Object.defineProperty(window.navigator, 'language', { configurable: true, value: '' });
    const empty = render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(empty.getByTestId('lang')).toHaveTextContent('en');
    empty.unmount();

    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'xx-XX' });
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    if (languageDesc) Object.defineProperty(window.navigator, 'language', languageDesc);
  });

  it('ignores a throwing location search and a throwing storage read', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        get search() {
          throw new Error('bad search');
        },
      },
    });
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId('lang').textContent).toMatch(/en|de|it|fr/);
    getItem.mockRestore();
  });

  it('returns the raw key when no translation exists and swallows a storage write failure', () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId('missing')).toHaveTextContent('notARealKey');
    expect(screen.getByTestId('retry').textContent).toBeTruthy();

    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    fireEvent.click(screen.getByRole('button', { name: 'de' }));
    expect(screen.getByTestId('lang')).toHaveTextContent('de');
    setItem.mockRestore();
  });
});
