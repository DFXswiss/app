import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PartnerDashboardView from 'src/partner-dashboard/App';
import { PartnerHeader } from 'src/partner-dashboard/components/header';
import {
  PARTNER_THEME_STORAGE_KEY,
  resolveInitialTheme,
} from 'src/partner-dashboard/util/theme';
import {
  mockChangeLanguage,
  mockSettingsState,
  PARTNER_TEST_LANGUAGES,
  resetMockSettings,
} from './helpers/mock-settings-context';

jest.mock('src/contexts/settings.context', () => ({
  // jest allows out-of-scope vars prefixed with `mock` inside the factory
  useSettingsContext: () => mockSettingsState,
}));

jest.mock('react-apexcharts', () => {
  return function MockChart() {
    return <div data-testid="mock-apex-chart" />;
  };
});

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: jest.fn() }),
}));

describe('partner header theme switcher', () => {
  const originalFixture = process.env.REACT_APP_PARTNER_FIXTURE;

  beforeEach(() => {
    process.env.REACT_APP_PARTNER_FIXTURE = 'true';
    window.localStorage.removeItem(PARTNER_THEME_STORAGE_KEY);
    resetMockSettings();
  });

  afterEach(() => {
    process.env.REACT_APP_PARTNER_FIXTURE = originalFixture;
    window.localStorage.removeItem(PARTNER_THEME_STORAGE_KEY);
  });

  it('changes the theme class on the partner root when Dark is pressed', async () => {
    render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('partner-dashboard-root')).toHaveAttribute('data-theme', 'light');
    });

    await userEvent.click(screen.getByTestId('theme-dark'));

    const root = screen.getByTestId('partner-dashboard-root');
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root.className).toContain('theme-dark');
    expect(root.className).not.toContain('theme-light');
    expect(screen.getByTestId('theme-dark')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('theme-light')).toHaveAttribute('aria-pressed', 'false');
  });

  it('persists the choice so a remount restores dark theme', async () => {
    const { unmount } = render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('theme-dark')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId('theme-dark'));
    expect(window.localStorage.getItem(PARTNER_THEME_STORAGE_KEY)).toBe('dark');
    expect(resolveInitialTheme()).toBe('dark');

    unmount();

    render(<PartnerDashboardView />);
    await waitFor(() => {
      const root = screen.getByTestId('partner-dashboard-root');
      expect(root).toHaveAttribute('data-theme', 'dark');
      expect(root.className).toContain('theme-dark');
    });
  });
});

describe('partner header language switcher', () => {
  beforeEach(() => {
    resetMockSettings();
  });

  it('calls the app changeLanguage with the selected Language object (not a local copy)', async () => {
    const onThemeChange = jest.fn();
    render(<PartnerHeader theme="light" onThemeChange={onThemeChange} />);

    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
    // All app languages are offered (DE/EN/FR/IT)
    expect(screen.getByTestId('lang-de')).toBeInTheDocument();
    expect(screen.getByTestId('lang-en')).toBeInTheDocument();
    expect(screen.getByTestId('lang-fr')).toBeInTheDocument();
    expect(screen.getByTestId('lang-it')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('lang-de'));

    expect(mockChangeLanguage).toHaveBeenCalledTimes(1);
    expect(mockChangeLanguage).toHaveBeenCalledWith(PARTNER_TEST_LANGUAGES[0]);
    // Same object identity the settings context holds — proves we did not invent a parallel language state
    expect(mockChangeLanguage.mock.calls[0][0]).toBe(PARTNER_TEST_LANGUAGES[0]);
  });

  it('marks the active language via aria-pressed from settings context state', async () => {
    const onThemeChange = jest.fn();
    const { rerender } = render(<PartnerHeader theme="light" onThemeChange={onThemeChange} />);

    expect(screen.getByTestId('lang-en')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('lang-de')).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByTestId('lang-de'));
    // mock updates mockSettingsState.language; re-render as a real context consumer would
    expect(mockSettingsState.language?.symbol).toBe('DE');
    rerender(<PartnerHeader theme="light" onThemeChange={onThemeChange} />);

    expect(screen.getByTestId('lang-de')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('lang-en')).toHaveAttribute('aria-pressed', 'false');
  });
});
