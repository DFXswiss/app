import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import MainPartner from 'src/Main.partner';
import { timelineXAnnotations } from 'src/partner-dashboard/components/partial-marker';
import {
  PARTNER_LANG_STORAGE_KEY,
  PARTNER_THEME_STORAGE_KEY,
  resolveInitialTheme,
  SERIES_COLORS_BY_THEME,
} from 'src/partner-dashboard/util/theme';
import { PartnerTimelineBucket } from 'src/dto/partner-statistic.dto';

jest.mock('react-apexcharts', () => {
  return function MockChart() {
    return <div data-testid="mock-apex-chart" />;
  };
});

describe('partner theme + language switchers', () => {
  const originalFixture = process.env.REACT_APP_PARTNER_FIXTURE;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.REACT_APP_PARTNER_FIXTURE = 'true';
    window.localStorage.removeItem(PARTNER_THEME_STORAGE_KEY);
    window.localStorage.removeItem(PARTNER_LANG_STORAGE_KEY);
    void i18n.changeLanguage('en');
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('fetch must not be called in fixture mode');
    });
  });

  afterEach(() => {
    cleanup();
    process.env.REACT_APP_PARTNER_FIXTURE = originalFixture;
    window.localStorage.removeItem(PARTNER_THEME_STORAGE_KEY);
    window.localStorage.removeItem(PARTNER_LANG_STORAGE_KEY);
    fetchSpy.mockRestore();
  });

  it('renders theme and language switchers in the header', async () => {
    render(<MainPartner />);
    await waitFor(() => {
      expect(screen.getByTestId('theme-switcher')).toBeInTheDocument();
      expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
    });
  });

  it('defaults to English when nothing is stored (ignores active i18n language)', async () => {
    window.localStorage.removeItem(PARTNER_LANG_STORAGE_KEY);
    await i18n.changeLanguage('de');
    render(<MainPartner />);
    await waitFor(() => expect(screen.getByTestId('kpi-volume')).toBeInTheDocument());
    expect(screen.getByTestId('kpi-volume')).toHaveTextContent('Total volume');
    expect(screen.getByTestId('lang-en')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('lang-de')).toHaveAttribute('aria-pressed', 'false');
  });

  it('defaults to light theme when nothing is stored (ignores prefers-color-scheme)', async () => {
    window.localStorage.removeItem(PARTNER_THEME_STORAGE_KEY);
    const matchMedia = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark'),
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    try {
      expect(resolveInitialTheme()).toBe('light');
      render(<MainPartner />);
      await waitFor(() => expect(screen.getByTestId('partner-dashboard-root')).toBeInTheDocument());
      expect(screen.getByTestId('partner-dashboard-root')).toHaveAttribute('data-theme', 'light');
      expect(screen.getByTestId('partner-dashboard-root').className).toContain('theme-light');
    } finally {
      window.matchMedia = matchMedia;
    }
  });

  it('restores stored language after reload', async () => {
    window.localStorage.setItem(PARTNER_LANG_STORAGE_KEY, 'de');
    render(<MainPartner />);
    await waitFor(() => expect(screen.getByTestId('kpi-volume')).toBeInTheDocument());
    expect(screen.getByTestId('kpi-volume')).toHaveTextContent('Gesamtvolumen');
    expect(screen.getByTestId('lang-de')).toHaveAttribute('aria-pressed', 'true');
  });

  it('restores stored theme after reload', async () => {
    window.localStorage.setItem(PARTNER_THEME_STORAGE_KEY, 'dark');
    render(<MainPartner />);
    await waitFor(() => expect(screen.getByTestId('partner-dashboard-root')).toBeInTheDocument());
    expect(screen.getByTestId('partner-dashboard-root')).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByTestId('partner-dashboard-root').className).toContain('theme-dark');
  });

  it('persists theme choice to localStorage', async () => {
    render(<MainPartner />);
    await waitFor(() => expect(screen.getByTestId('theme-dark')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('theme-dark'));
    expect(window.localStorage.getItem(PARTNER_THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByTestId('partner-dashboard-root')).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByTestId('partner-dashboard-root').className).toContain('theme-dark');
  });

  it('switches language to German and shows translated KPI label', async () => {
    render(<MainPartner />);
    await waitFor(() => expect(screen.getByTestId('kpi-volume')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('lang-de'));
    await waitFor(() => {
      expect(screen.getByTestId('kpi-volume')).toHaveTextContent('Gesamtvolumen');
    });
    expect(window.localStorage.getItem(PARTNER_LANG_STORAGE_KEY)).toBe('de');
  });

  it('resolveInitialTheme is light when nothing is stored', () => {
    window.localStorage.removeItem(PARTNER_THEME_STORAGE_KEY);
    expect(resolveInitialTheme()).toBe('light');
  });

  it('uses the validated series palette per theme', () => {
    expect(SERIES_COLORS_BY_THEME.light).toEqual({
      buy: '#1e6ef7',
      sell: '#0f9b8e',
      swap: '#8b5cf6',
    });
    expect(SERIES_COLORS_BY_THEME.dark).toEqual({
      buy: '#3f86fb',
      sell: '#19a08f',
      swap: '#9a7bf2',
    });
  });

  it('suppresses hatching only for suppressed buckets, not real zero', () => {
    const buckets: PartnerTimelineBucket[] = [
      {
        date: '2026-06-01T00:00:00.000Z',
        volume: { buy: 10, sell: 0, swap: 0 },
        transactions: { buy: 1, sell: 0, swap: 0 },
        suppressed: false,
        partial: false,
      },
      {
        date: '2026-06-02T00:00:00.000Z',
        volume: null,
        transactions: null,
        suppressed: true,
        partial: false,
      },
      {
        date: '2026-06-03T00:00:00.000Z',
        volume: { buy: 0, sell: 0, swap: 0 },
        transactions: { buy: 0, sell: 0, swap: 0 },
        suppressed: false,
        partial: false,
      },
    ];
    const anns = timelineXAnnotations(buckets);
    expect(anns).toHaveLength(1);
    expect(anns[0].hatch).toBe(true);
    expect(anns[0].x).toBe(new Date(buckets[1].date).getTime());
    // Real zero day is not annotated
    expect(anns[0].x).not.toBe(new Date(buckets[2].date).getTime());
  });
});
