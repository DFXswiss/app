import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MainPartner from 'src/Main.partner';
import {
  buildPartnerStatisticFixture,
  buildPartnerTimelineFixture,
} from 'src/partner-dashboard/fixtures/partner-statistic.fixture';
import { AUTH_TOKEN_KEY, writeAuthToken } from 'src/partner-dashboard/util/auth';
import {
  DEFAULT_BRAND_REGISTRY,
  setBrandRegistryForTests,
} from 'src/partner-dashboard/util/brands';

jest.mock('react-apexcharts', () => {
  return function MockChart() {
    return <div data-testid="mock-apex-chart" />;
  };
});

/**
 * Build a minimal JWT (header.payload.sig) with the given payload.
 * Signature is not verified client-side — only exp + decode matter.
 */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${body}.sig`;
}

describe('partner auth gate (no token → login only)', () => {
  const originalFixture = process.env.REACT_APP_PARTNER_FIXTURE;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.REACT_APP_PARTNER_FIXTURE = 'false';
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setBrandRegistryForTests(DEFAULT_BRAND_REGISTRY);
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('partner-brands/brands.json')) {
        return {
          ok: true,
          json: async () => DEFAULT_BRAND_REGISTRY,
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  });

  afterEach(() => {
    cleanup();
    process.env.REACT_APP_PARTNER_FIXTURE = originalFixture;
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setBrandRegistryForTests(null);
    fetchSpy.mockRestore();
  });

  it('shows only the login screen without token — no KPI / metrics markup', async () => {
    const { container } = render(<MainPartner />);

    await waitFor(() => {
      expect(screen.getByTestId('partner-login')).toBeInTheDocument();
    });

    expect(screen.getByTestId('partner-dashboard-root')).toHaveAttribute('data-auth', 'required');
    expect(screen.queryByTestId('kpi-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kpi-volume')).not.toBeInTheDocument();
    expect(screen.queryByTestId('partner-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('referral-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('volume-time-chart')).not.toBeInTheDocument();
    // Neutral DFX branding only — no Cake partner mark on the login screen
    expect(screen.queryByTestId('partner-logo')).not.toBeInTheDocument();
    expect(screen.queryByText('Cake')).not.toBeInTheDocument();

    // Markup size: login shell must stay small (no fixture metrics dumped into HTML).
    // Log the measured size so the acceptance report can cite an exact byte count.
    const html = container.innerHTML;
    // eslint-disable-next-line no-console
    console.log(`HEADLESS_LOGIN_HTML_BYTES=${html.length}`);
    expect(html.length).toBeGreaterThan(200);
    expect(html.length).toBeLessThan(25_000);
    expect(html).not.toMatch(/data-testid="kpi-/);
  });

  it('rejects an expired token and shows the login screen', async () => {
    const expired = fakeJwt({
      user: 42,
      address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      role: 'ClientCompany',
      exp: Math.floor(Date.now() / 1000) - 3600,
    });
    writeAuthToken(expired);

    render(<MainPartner />);

    await waitFor(() => {
      expect(screen.getByTestId('partner-login')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('kpi-grid')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it('requests a challenge then signs in and stores the token', async () => {
    const validToken = fakeJwt({
      user: 99,
      address: '0xabcabcabcabcabcabcabcabcabcabcabcabcabca',
      role: 'ClientCompany',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('partner-brands/brands.json')) {
        return { ok: true, json: async () => DEFAULT_BRAND_REGISTRY } as Response;
      }
      if (url.includes('/v1/auth/challenge')) {
        return { ok: true, json: async () => ({ challenge: 'challenge-uuid-1' }) } as Response;
      }
      if (url.includes('/v1/auth/signIn') && init?.method === 'POST') {
        return { ok: true, json: async () => ({ accessToken: validToken }) } as Response;
      }
      if (url.includes('statistic/partner/timeline') || (url.includes('timeline') && url.includes('partner'))) {
        return {
          ok: true,
          json: async () => buildPartnerTimelineFixture('Day'),
        } as Response;
      }
      if (url.includes('statistic/partner')) {
        return {
          ok: true,
          json: async () => buildPartnerStatisticFixture(),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    render(<MainPartner />);
    await waitFor(() => expect(screen.getByTestId('login-address')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('login-address'), {
      target: { value: '0xabcabcabcabcabcabcabcabcabcabcabcabcabca' },
    });
    fireEvent.click(screen.getByTestId('login-challenge-btn'));

    await waitFor(() => expect(screen.getByTestId('login-challenge')).toBeInTheDocument());
    expect(screen.getByTestId('login-challenge')).toHaveValue('challenge-uuid-1');

    fireEvent.change(screen.getByTestId('login-signature'), {
      target: { value: '0xsig' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-submit'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('partner-dashboard-root')).toHaveAttribute('data-auth', 'ok');
    });
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe(validToken);
    expect(screen.queryByTestId('partner-login')).not.toBeInTheDocument();
  });

  it('logout clears the token and returns to the login screen', async () => {
    const validToken = fakeJwt({
      user: 1,
      address: '0x1111111111111111111111111111111111111111',
      role: 'ClientCompany',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    writeAuthToken(validToken);

    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('partner-brands/brands.json')) {
        return { ok: true, json: async () => DEFAULT_BRAND_REGISTRY } as Response;
      }
      if (url.includes('statistic/partner/timeline') || (url.includes('timeline') && url.includes('partner'))) {
        return {
          ok: true,
          json: async () => buildPartnerTimelineFixture('Day'),
        } as Response;
      }
      if (url.includes('statistic/partner')) {
        return {
          ok: true,
          json: async () => buildPartnerStatisticFixture(),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    render(<MainPartner />);
    await waitFor(() => expect(screen.getByTestId('partner-logout')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('partner-logout'));
    await waitFor(() => expect(screen.getByTestId('partner-login')).toBeInTheDocument());
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(screen.queryByTestId('kpi-grid')).not.toBeInTheDocument();
  });
});
