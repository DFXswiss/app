const mockUseSessionContext = jest.fn();
jest.mock('@dfx.swiss/react', () => ({
  useSessionContext: () => mockUseSessionContext(),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
  StyledButtonWidth: { MIN: 'min' },
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

const mockGetKundengelderExtract = jest.fn();
const mockGetDfxBanks = jest.fn();
const mockGetKundengelderLines = jest.fn();
jest.mock('src/hooks/dashboard.hook', () => ({
  useDashboard: () => ({
    getKundengelderExtract: mockGetKundengelderExtract,
    getDfxBanks: mockGetDfxBanks,
    getKundengelderLines: mockGetKundengelderLines,
  }),
}));

const mockUseAdminGuard = jest.fn();
jest.mock('src/hooks/guard.hook', () => ({
  useAdminGuard: () => mockUseAdminGuard(),
}));

const mockUseLayoutOptions = jest.fn();
jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: unknown) => mockUseLayoutOptions(options),
}));

const mockDownloadCsv = jest.fn();
jest.mock('src/util/semicolon-csv', () => {
  const actual = jest.requireActual('src/util/semicolon-csv') as typeof import('src/util/semicolon-csv');
  return {
    ...actual,
    downloadCsv: (...args: unknown[]) => mockDownloadCsv(...args),
  };
});

import { act, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { ReactElement } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { KundengelderExtract, KundengelderSheet, KundengelderTx, KundengelderTxList } from 'src/dto/dashboard.dto';
import DashboardFinancialKundengelderScreen, {
  DashboardFinancialKundengelderLinesScreen,
} from 'src/screens/dashboard-financial-kundengelder.screen';

function LocationProbe(): ReactElement {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function render(ui: ReactElement, path = '/'): ReturnType<typeof rtlRender> {
  return rtlRender(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      {ui}
    </MemoryRouter>,
  );
}

function currentLocation(): string {
  const raw = screen.getByTestId('location').textContent ?? '';
  return decodeURIComponent(raw.replace(/\+/g, ' '));
}

const chf = (value: number): string => `${value.toLocaleString('de-CH')} CHF`;
const money = (value: number): string =>
  value.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function cardByHeading(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  const card = heading.closest('[data-sheet]');
  if (card instanceof HTMLElement) return card;
  const parent = heading.parentElement;
  if (!parent) throw new Error(`missing card for ${name}`);
  return parent;
}

function clickLine(accountName: string, label: string): void {
  fireEvent.click(within(cardByHeading(accountName)).getByText(label));
}

const YEAR = new Date().getUTCFullYear();

function linesPath(account: string, line: string, label = line, year = YEAR, sheet = account): string {
  const params = new URLSearchParams();
  params.set('year', String(year));
  params.set('sheet', sheet);
  params.set('account', account);
  params.set('line', line);
  params.set('label', label);
  return `/dashboard/financial/kundengelder/lines?${params.toString()}`;
}

const EXTRACT: KundengelderExtract = {
  year: YEAR,
  eurRate: 1,
  accounts: [
    {
      key: 'CH9300762011623852957',
      name: 'Test CHF Account',
      iban: 'CH9300762011623852957',
      currency: 'CHF',
      lines: [
        {
          key: 'BuyCrypto after Fee',
          label: 'BuyCrypto after Fee',
          currency: 'CHF',
          amount: 1234.5,
          amountChf: 1234.5,
          count: 3,
        },
        { key: 'SellFiat', label: 'SellFiat', currency: 'CHF', amount: 10, amountChf: 10, count: 1 },
      ],
    },
    {
      key: 'CheckoutLtdEUR',
      name: 'Checkout Ltd EUR',
      currency: 'EUR',
      lines: [{ key: 'Checkout', label: 'Checkout', currency: 'EUR', amount: 50, amountChf: 50, count: 2 }],
    },
  ],
  diffs: [{ key: 'CH9300762011623852957|BuyCrypto after Fee', live: 100, booked: 90, delta: 10 }],
};

describe('DashboardFinancialKundengelderScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSessionContext.mockReturnValue({ isLoggedIn: true });
    mockGetKundengelderExtract.mockResolvedValue(EXTRACT);
    mockGetDfxBanks.mockResolvedValue([]);
    mockGetKundengelderLines.mockResolvedValue({ year: YEAR, accountKey: EXTRACT.accounts[0].key, line: '', rows: [] });
  });

  it('guards the screen for admins and keeps the spinner while logged out', () => {
    mockUseSessionContext.mockReturnValue({ isLoggedIn: false });

    render(<DashboardFinancialKundengelderScreen />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(mockUseAdminGuard).toHaveBeenCalled();
    expect(mockUseLayoutOptions).toHaveBeenCalledWith({ title: 'Kundengelder', noMaxWidth: true });
    expect(mockGetKundengelderExtract).not.toHaveBeenCalled();
    expect(mockGetDfxBanks).not.toHaveBeenCalled();
  });

  it('shows every bank account, including one with no movements', async () => {
    mockGetDfxBanks.mockResolvedValue([{ name: 'Ledger Bank', iban: 'CH2100000000000000003', currency: 'CHF' }]);

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Ledger Bank CHF' })).toBeInTheDocument();
    expect(screen.getByText('Keine Bewegungen')).toBeInTheDocument();
    expect(screen.getByText('CH2100000000000000003')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
  });

  it('loads the current UTC year extract, line amounts and a visible non-zero diff', async () => {
    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    expect(mockGetKundengelderExtract).toHaveBeenCalledWith(YEAR);
    expect(screen.getByRole('heading', { name: 'Checkout Ltd EUR' })).toBeInTheDocument();
    expect(screen.getAllByText(chf(1234.5)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(chf(10)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(chf(50)).length).toBeGreaterThan(0);

    expect(screen.getByRole('heading', { name: 'Abweichung zur Buchhaltung' })).toBeInTheDocument();
    const diffRow = screen.getByText(money(100)).closest('tr');
    if (!diffRow) throw new Error('expected diff row');
    expect(within(diffRow).getByText('Test CHF Account')).toBeInTheDocument();
    expect(within(diffRow).getByText('BuyCrypto after Fee')).toBeInTheDocument();
    expect(within(diffRow).getByText(money(90))).toBeInTheDocument();
    expect(within(diffRow).getByText(money(10))).toBeInTheDocument();
  });

  it('refetches extract when the year changes and opens bookings for that year', async () => {
    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '2022' } });

    await waitFor(() => expect(mockGetKundengelderExtract).toHaveBeenCalledWith(2022));
    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    clickLine('Test CHF Account', 'BuyCrypto after Fee');

    expect(currentLocation()).toContain('/dashboard/financial/kundengelder/lines?');
    expect(currentLocation()).toContain('year=2022');
    expect(currentLocation()).toContain('line=BuyCrypto after Fee');
    expect(screen.queryByText('Keine Buchungen')).not.toBeInTheDocument();
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();
  });

  it('navigates to the bookings subpage for the clicked line', async () => {
    render(<DashboardFinancialKundengelderScreen />);

    const chfAccount = EXTRACT.accounts[0];
    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    clickLine('Test CHF Account', 'BuyCrypto after Fee');

    expect(currentLocation()).toContain('/dashboard/financial/kundengelder/lines?');
    expect(currentLocation()).toContain(`year=${YEAR}`);
    expect(currentLocation()).toContain(`sheet=${chfAccount.key}`);
    expect(currentLocation()).toContain(`account=${chfAccount.key}`);
    expect(currentLocation()).toContain(`line=${chfAccount.lines[0].key}`);
    expect(currentLocation()).toContain('label=BuyCrypto after Fee');
    expect(screen.getByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    expect(screen.queryByText('Keine Buchungen')).not.toBeInTheDocument();
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('SellFiat'));
    expect(currentLocation()).toContain('line=SellFiat');
    expect(currentLocation()).toContain('label=SellFiat');
  });

  it('keeps the session on the bookings address', async () => {
    render(<DashboardFinancialKundengelderScreen />, '/dashboard/financial/kundengelder?session=abc&lang=de');

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    clickLine('Test CHF Account', 'BuyCrypto after Fee');

    expect(currentLocation()).toContain('/dashboard/financial/kundengelder/lines?');
    expect(currentLocation()).toContain('session=abc');
    expect(currentLocation()).toContain('lang=de');
    expect(currentLocation()).toContain('line=BuyCrypto after Fee');
  });

  it('exports CSV with the selected year in the filename', async () => {
    render(<DashboardFinancialKundengelderScreen />);

    const button = await screen.findByRole('button', { name: 'Export CSV' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    expect(mockDownloadCsv).toHaveBeenCalledWith(`kundengelder-${YEAR}.csv`, expect.stringContaining('Account'));
    expect(mockDownloadCsv).toHaveBeenCalledWith(
      `kundengelder-${YEAR}.csv`,
      expect.stringContaining('Test CHF Account'),
    );
  });

  it('shows ErrorHint after a rejected extract and still renders the heading', async () => {
    mockGetKundengelderExtract.mockRejectedValue(new Error('extract failed'));

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('extract failed');
    expect(screen.getByRole('heading', { name: 'Kundengelder' })).toBeInTheDocument();
    expect(screen.getByLabelText('Jahr')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('does not show a line error on the sheet when a row is clicked', async () => {
    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    mockGetKundengelderLines.mockRejectedValueOnce(new Error('line boom'));
    clickLine('Test CHF Account', 'BuyCrypto after Fee');
    expect(currentLocation()).toContain('line=BuyCrypto after Fee');
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();
  });

  it('disables Export CSV when the extract has no accounts', async () => {
    mockGetKundengelderExtract.mockResolvedValue({ year: YEAR, eurRate: 1, accounts: [], diffs: [] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Kundengelder' })).toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });

  it('shows ErrorHint Unknown error after a non-Error extract reject and still renders the heading', async () => {
    mockGetKundengelderExtract.mockRejectedValueOnce('not-an-error');

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
    expect(screen.getByRole('heading', { name: 'Kundengelder' })).toBeInTheDocument();
  });

  it('leaves the booking list off the sheet after a line click', async () => {
    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    clickLine('Test CHF Account', 'BuyCrypto after Fee');
    expect(currentLocation()).toContain('/dashboard/financial/kundengelder/lines?');
    expect(screen.queryByText('Keine Buchungen')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
  });

  it('navigates to the bookings of the clicked account', async () => {
    render(<DashboardFinancialKundengelderScreen />);
    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    clickLine('Test CHF Account', 'BuyCrypto after Fee');
    fireEvent.click(screen.getByText('Checkout'));
    expect(currentLocation()).toContain('sheet=CheckoutLtdEUR');
    expect(currentLocation()).toContain('account=CheckoutLtdEUR');
    expect(currentLocation()).toContain('line=Checkout');
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();
  });

  it('does not download CSV when Export is clicked after an extract error', async () => {
    mockGetKundengelderExtract.mockRejectedValue(new Error('extract failed'));

    render(<DashboardFinancialKundengelderScreen />);
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('extract failed');
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
    expect(mockDownloadCsv).not.toHaveBeenCalled();
  });

  it('does not refetch extract when the year select changes to nope', async () => {
    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    expect(mockGetKundengelderExtract).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: 'nope' } });
    fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: String(YEAR) } });

    expect(mockGetKundengelderExtract).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '2019' } });
    fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: `${YEAR + 1}` } });
    fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '' } });

    expect(mockGetKundengelderExtract).toHaveBeenCalledTimes(1);
  });

  it('renders the booked comparison when a diff has a zero delta', async () => {
    mockGetKundengelderExtract.mockResolvedValue({
      ...EXTRACT,
      diffs: [{ key: 'CH9300762011623852957|BuyCrypto after Fee', live: 50, booked: 50, delta: 0 }],
    });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Abweichung zur Buchhaltung' })).toBeInTheDocument();
    const diffRow = screen.getAllByText(money(50))[0].closest('tr');
    if (!diffRow) throw new Error('expected diff row');
    expect(within(diffRow).getByText('Test CHF Account')).toBeInTheDocument();
    expect(within(diffRow).getByText('BuyCrypto after Fee')).toBeInTheDocument();
    expect(screen.queryByText('CH9300762011623852957|BuyCrypto after Fee')).not.toBeInTheDocument();
  });

  it('year select options include 2022 and the current UTC year', async () => {
    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();

    const yearSelect = screen.getByLabelText('Jahr');
    expect(within(yearSelect).getByRole('option', { name: '2020' })).toHaveAttribute('value', '2020');
    expect(within(yearSelect).getByRole('option', { name: '2022' })).toHaveAttribute('value', '2022');
    expect(within(yearSelect).getByRole('option', { name: `${YEAR}` })).toHaveAttribute('value', `${YEAR}`);
  });

  it('does not show extract after unmount while the extract request is pending', async () => {
    let resolveExtract: (value: KundengelderExtract) => void = () => undefined;
    mockGetKundengelderExtract.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExtract = resolve;
        }),
    );

    const { unmount } = render(<DashboardFinancialKundengelderScreen />);
    expect(mockGetKundengelderExtract).toHaveBeenCalledWith(YEAR);
    expect(() => unmount()).not.toThrow();

    await act(async () => {
      resolveExtract(EXTRACT);
    });

    expect(screen.queryByRole('heading', { name: 'Test CHF Account' })).not.toBeInTheDocument();
  });

  it('does not show ErrorHint after unmount while the extract request rejects', async () => {
    let rejectExtract: (reason: Error) => void = () => undefined;
    mockGetKundengelderExtract.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectExtract = reject;
        }),
    );

    const { unmount } = render(<DashboardFinancialKundengelderScreen />);
    expect(() => unmount()).not.toThrow();

    await act(async () => {
      rejectExtract(new Error('late boom'));
    });

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('does not render booking rows on the sheet', async () => {
    mockGetKundengelderLines.mockResolvedValue({
      year: YEAR,
      accountKey: EXTRACT.accounts[0].key,
      line: EXTRACT.accounts[0].lines[0].key,
      rows: [
        {
          id: 101,
          type: 'BuyCrypto',
          bookingDate: '2026-01-15',
          amount: 12.5,
          afterFee: 11,
          instructionId: 'instr-101',
        },
      ],
    });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    clickLine('Test CHF Account', 'BuyCrypto after Fee');
    expect(screen.queryByText('instr-101')).not.toBeInTheDocument();
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();
  });

  it('renders a Kontenblatt for every sheet and exports that sheet', async () => {
    const ledger: KundengelderSheet = {
      key: '90001',
      accountNo: '90001',
      name: 'Sample Ledger CHF',
      iban: 'CH2100000000000000003',
      currency: 'CHF',
      soll: [
        { label: 'Anfangsbestand', amount: 0 },
        { label: 'Intern', amount: 10000, date: '2024-08-16' },
        { label: 'Intern', amount: 0, date: '2024-09-24' },
      ],
      haben: [{ label: 'Saldo', amount: 10000 }],
      sollSum: 10000,
      habenSum: 10000,
      control: 0,
      openingCheck: 'unchecked',
    };
    const buy: KundengelderSheet = {
      key: 'CH9300762011623852957|CHF',
      name: 'Sample Bank CHF',
      iban: 'CH9300762011623852957',
      currency: 'CHF',
      soll: [
        { label: 'BuyCrypto Fee', amount: 11, lineKey: 'BuyCrypto Fee' },
        { label: 'BuyCrypto after Fee', amount: 90, lineKey: 'BuyCrypto after Fee' },
      ],
      haben: [
        { label: 'Charge', amount: 1 },
        { label: 'Saldo', amount: 100 },
      ],
      sollSum: 101,
      habenSum: 101,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [ledger, buy] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Sample Ledger CHF' })).toBeInTheDocument();
    expect(screen.getByText('90001')).toBeInTheDocument();
    expect(screen.getAllByText('Intern')).toHaveLength(2);
    expect(screen.queryByText('2024-08-16')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sample Bank CHF' })).not.toBeInTheDocument();
    expect(screen.getByText(/kein Anfangsbestand des Folgejahres/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Konto'), { target: { value: buy.key } });

    expect(screen.getByRole('heading', { name: 'Sample Bank CHF' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sample Ledger CHF' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Soll').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Haben').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Summe').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Kontrolle/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Keine Bewegungen')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Test CHF Account' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Abweichung zur Buchhaltung' })).toBeInTheDocument();

    clickLine('Sample Bank CHF', 'BuyCrypto after Fee');
    expect(currentLocation()).toContain('account=CH9300762011623852957');
    expect(currentLocation()).toContain('line=BuyCrypto after Fee');
    expect(screen.queryByText('Keine Buchungen')).not.toBeInTheDocument();
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(mockDownloadCsv).toHaveBeenCalledWith(`kundengelder-${YEAR}.csv`, expect.stringContaining('Kontrolle'));
    expect(mockDownloadCsv).toHaveBeenCalledWith(
      `kundengelder-${YEAR}.csv`,
      expect.stringContaining('Sample Ledger CHF'),
    );
    expect(mockDownloadCsv).toHaveBeenCalledWith(`kundengelder-${YEAR}.csv`, expect.stringContaining('2024-08-16'));
    expect(mockDownloadCsv).toHaveBeenCalledWith(`kundengelder-${YEAR}.csv`, expect.stringContaining('90001'));
    const csv = String(mockDownloadCsv.mock.calls[0][1]);
    expect(csv).toContain('Summe;10000.00;CHF');
    expect(csv).toContain('Summe;101.00;CHF');
    expect(csv).toContain('Kontrolle;;;;CHF;0.00');
    expect(csv).toContain('Intern;10000;CHF');
    expect(csv).not.toContain('Intern;10000.00');
    expect(csv).toContain('BuyCrypto Fee;11;CHF');
  });

  it('shows every PDF row and the three opening checks', async () => {
    const verified: KundengelderSheet = {
      key: 'CH2100000000000000005|CHF',
      name: 'Sample Bank CHF',
      iban: 'CH2100000000000000005',
      currency: 'CHF',
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      soll: [],
      haben: [],
      rows: [
        { sollLabel: 'Anfangsbestand', sollAmount: 100 },
        { sollLabel: 'BuyCrypto after Fee', sollAmount: 0 },
        { habenLabel: 'Saldo', habenAmount: 100 },
      ],
      sollSum: 100,
      habenSum: 100,
      control: 0,
      closingBalance: 100,
      openingBalance: 100,
      nextOpeningBalance: 100,
      openingCheck: 'verified',
    };
    const mismatch: KundengelderSheet = {
      ...verified,
      key: 'CH2100000000000000006|EUR',
      name: 'Sample Bank EUR',
      iban: 'CH2100000000000000006',
      currency: 'EUR',
      rows: [{ sollLabel: 'Anfangsbestand' }, { habenLabel: 'Saldo', habenAmount: 40 }],
      closingBalance: 40,
      nextOpeningBalance: 10,
      openingCheck: 'mismatch',
    };
    const unnamed: KundengelderSheet = {
      ...verified,
      key: 'CH2100000000000000007|EUR',
      name: 'CH2100000000000000007 EUR',
      iban: 'CH2100000000000000007',
      currency: 'EUR',
      openingCheck: 'unchecked',
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [verified, mismatch, unnamed] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Sample Bank CHF' })).toBeInTheDocument();
    expect(within(cardByHeading('Sample Bank CHF')).getByText('BuyCrypto after Fee')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sample Bank CHF · CH2100000000000000005' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sample Bank EUR · CH2100000000000000006' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Alle' })).not.toBeInTheDocument();
    expect(screen.getByText(/Verifiziert/)).toBeInTheDocument();
    expect(screen.queryByText(/stimmt nicht/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Konto'), { target: { value: mismatch.key } });

    expect(screen.getByText(/stimmt nicht/)).toBeInTheDocument();
    expect(screen.getByText('nicht abgelegt')).toBeInTheDocument();
    expect(screen.queryByText(/Verifiziert/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Bankkonto').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Startdatum').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2024-01-01').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Enddatum').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2024-12-31').length).toBeGreaterThan(0);
    expect(screen.getByRole('option', { name: 'CH2100000000000000007 EUR' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'CH2100000000000000007 EUR · CH2100000000000000007' }),
    ).not.toBeInTheDocument();
  });

  it('requests the bare IBAN when the sheet key is the bank pair', async () => {
    const iban = 'CH2100000000000000008';
    const sheet: KundengelderSheet = {
      key: `${iban}|CHF`,
      name: 'Sample Pair CHF',
      currency: 'CHF',
      soll: [{ label: 'BuyCrypto after Fee', amount: 1, lineKey: 'buy-after-fee' }],
      haben: [],
      sollSum: 1,
      habenSum: 1,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });
    mockGetDfxBanks.mockResolvedValue([{ name: 'Sample Pair', iban, currency: 'CHF' }]);

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Sample Pair CHF' })).toBeInTheDocument();
    clickLine('Sample Pair CHF', 'BuyCrypto after Fee');
    expect(currentLocation()).toContain(`account=${iban}&`);
    expect(currentLocation()).not.toContain(`account=${iban}|`);
  });

  it('uses the pair key itself when it is not a single bare IBAN', async () => {
    const cases = [
      { key: 'CH2100000000000000008|CHF', currency: 'CHF', label: 'Pair CHF', account: 'CH2100000000000000008' },
      { key: 'CheckoutLtdCHF', currency: 'CHF', label: 'Checkout CHF', account: 'CheckoutLtdCHF' },
      { key: '|CHF', currency: 'CHF', label: 'Empty Head CHF', account: '|CHF' },
      { key: 'A|B|CHF', currency: 'CHF', label: 'Nested CHF', account: 'A|B|CHF' },
      { key: 'NoCurrency', currency: ' ', label: 'No Currency', account: 'NoCurrency' },
    ];
    for (const item of cases) {
      const sheet: KundengelderSheet = {
        key: item.key,
        name: item.label,
        currency: item.currency,
        soll: [{ label: 'BuyCrypto after Fee', amount: 1, lineKey: 'buy-after-fee' }],
        haben: [],
        sollSum: 1,
        habenSum: 1,
        control: 0,
      };
      mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });
      mockGetDfxBanks.mockResolvedValue([]);
      const view = render(<DashboardFinancialKundengelderScreen />);
      expect(await screen.findByRole('heading', { name: item.label })).toBeInTheDocument();
      clickLine(item.label, 'BuyCrypto after Fee');
      expect(currentLocation()).toContain(`account=${item.account}&`);
      view.unmount();
    }
  });

  it('paints internal rows and a haben line that has no soll entry', async () => {
    const sheet: KundengelderSheet = {
      key: 'CH2100000000000000002|CHF',
      name: 'Quiet Bank CHF',
      iban: 'CH2100000000000000002',
      currency: 'CHF',
      soll: [
        { label: 'Internal', amount: 0 },
        { label: 'Internal von CH2100000000000000002', amount: 0 },
      ],
      haben: [
        { label: 'Saldo', amount: 0 },
        { label: 'BuyFiat after Fee', amount: 0 },
        { label: 'Internal an CH2100000000000000002', amount: 0 },
      ],
      rows: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Quiet Bank CHF' })).toBeInTheDocument();
    const row = (label: string): HTMLElement => {
      const cell = within(cardByHeading('Quiet Bank CHF')).getByText(label, { exact: true });
      const line = cell.closest('tr');
      if (!(line instanceof HTMLElement)) throw new Error(`missing row for ${label}`);
      return line;
    };
    const internal = 'rgb(255, 242, 204)';
    expect(row('Internal').style.backgroundColor).toBe(internal);
    expect(row('Internal von CH2100000000000000002').style.backgroundColor).toBe(internal);
    expect(row('Internal an CH2100000000000000002').style.backgroundColor).toBe(internal);
  });

  it('names a difference after the currency of that sheet', async () => {
    const exchangeChf: KundengelderSheet = {
      key: 'GB00SAMP00000000000001|CHF',
      name: 'Sample Exchange CHF',
      iban: 'GB00SAMP00000000000001',
      currency: 'CHF',
      soll: [],
      haben: [],
      rows: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    const exchangeEur: KundengelderSheet = {
      ...exchangeChf,
      key: 'GB00SAMP00000000000001|EUR',
      name: 'Sample Exchange EUR',
      currency: 'EUR',
    };
    mockGetKundengelderExtract.mockResolvedValue({
      ...EXTRACT,
      sheets: [exchangeChf, exchangeEur],
      diffs: [{ key: 'GB00SAMP00000000000001|BuyCrypto after Fee|CHF', live: 2227.5, booked: 2227.5, delta: 0 }],
    });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Abweichung zur Buchhaltung' })).toBeInTheDocument();
    const diffRow = screen.getAllByText(money(2227.5))[0].closest('tr');
    if (!diffRow) throw new Error('expected diff row');
    expect(within(diffRow).getByText('Sample Exchange CHF')).toBeInTheDocument();
    expect(within(diffRow).getByText('BuyCrypto after Fee')).toBeInTheDocument();
    expect(within(diffRow).queryByText('Sample Exchange EUR')).not.toBeInTheDocument();
  });

  it('shows one sheet and switches the heading when Konto changes', async () => {
    const ledger: KundengelderSheet = {
      key: '90001',
      name: 'Sample Ledger CHF',
      iban: 'CH2100000000000000003',
      currency: 'CHF',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    const sampleSheet: KundengelderSheet = {
      key: 'CH9300762011623852957|CHF',
      name: 'Sample Bank CHF',
      iban: 'CH9300762011623852957',
      currency: 'CHF',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [ledger, sampleSheet] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Sample Ledger CHF' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sample Bank CHF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Alle' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Konto'), { target: { value: sampleSheet.key } });

    expect(screen.getByRole('heading', { name: 'Sample Bank CHF' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sample Ledger CHF' })).not.toBeInTheDocument();
  });

  it('shows a sheet without iban as the name alone in the Konto options', async () => {
    const checkout: KundengelderSheet = {
      key: 'CheckoutLtdCHF',
      name: 'Checkout Ltd CHF',
      currency: 'CHF',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [checkout] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('option', { name: 'Checkout Ltd CHF' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Checkout Ltd CHF ·' })).not.toBeInTheDocument();
  });

  it('shows a bank without a sheet as a card and a Konto option', async () => {
    const existing: KundengelderSheet = {
      key: 'CH9300762011623852957|CHF',
      name: 'Sample Bank CHF',
      iban: 'CH9300762011623852957',
      currency: 'CHF',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [existing] });
    mockGetDfxBanks.mockResolvedValue([{ name: 'Ledger Bank', iban: 'CH2100000000000000003', currency: 'CHF' }]);

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Sample Bank CHF' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ledger Bank CHF' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ledger Bank CHF · CH2100000000000000003' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Konto'), { target: { value: 'CH2100000000000000003|CHF' } });

    expect(screen.getByRole('heading', { name: 'Ledger Bank CHF' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sample Bank CHF' })).not.toBeInTheDocument();
  });

  it('shows the second currency of the same IBAN as its own card and option', async () => {
    const exchangeChf: KundengelderSheet = {
      key: 'GB00SAMP00000000000001|CHF',
      name: 'Sample Exchange CHF',
      iban: 'GB00SAMP00000000000001',
      currency: 'CHF',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [exchangeChf] });
    mockGetDfxBanks.mockResolvedValue([
      { name: 'Sample Exchange', iban: 'GB00SAMP00000000000001', currency: 'CHF' },
      { name: 'Sample Exchange', iban: 'GB00SAMP00000000000001', currency: 'EUR' },
    ]);

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Sample Exchange CHF' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Sample Exchange CHF' })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Sample Exchange EUR' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sample Exchange CHF · GB00SAMP00000000000001' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sample Exchange EUR · GB00SAMP00000000000001' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Konto'), { target: { value: 'GB00SAMP00000000000001|EUR' } });

    expect(screen.getByRole('heading', { name: 'Sample Exchange EUR' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sample Exchange CHF' })).not.toBeInTheDocument();
  });

  it('does not duplicate a sheet that already matches the bank IBAN and currency', async () => {
    const ledger: KundengelderSheet = {
      key: '90001',
      name: 'Sample Ledger CHF',
      iban: 'CH2100000000000000003',
      currency: 'CHF',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [ledger] });
    mockGetDfxBanks.mockResolvedValue([{ name: 'Ledger Bank', iban: 'CH2100000000000000003', currency: 'CHF' }]);

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findAllByRole('heading', { name: 'Sample Ledger CHF' })).toHaveLength(1);
    expect(screen.getAllByRole('option', { name: 'Sample Ledger CHF · CH2100000000000000003' })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Ledger Bank CHF' })).not.toBeInTheDocument();
  });

  it('renders Haben for a negative opening-check balance and omits Soll or Haben at zero', async () => {
    const sheet: KundengelderSheet = {
      key: 'CH2100000000000000005|CHF',
      name: 'Sample Bank CHF',
      iban: 'CH2100000000000000005',
      currency: 'CHF',
      periodEnd: '2024-12-31',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
      closingBalance: -12.5,
      nextOpeningBalance: 0,
      openingCheck: 'verified',
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    const check = await screen.findByText(/Verifiziert/);
    expect(check).toHaveTextContent(`Haben ${money(12.5)} CHF`);
    expect(check).toHaveTextContent(`(${money(0)} CHF)`);
    expect(check).not.toHaveTextContent('Soll');
  });

  it('names Checkout and CryptoCrypto booked diffs and keeps CryptoCrypto off the sheet list', async () => {
    const checkoutChf: KundengelderSheet = {
      key: 'CheckoutLtdCHF',
      name: 'Checkout Ltd CHF',
      currency: 'CHF',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    const checkoutEur: KundengelderSheet = {
      key: 'CheckoutLtdEUR',
      name: 'Checkout Ltd EUR',
      currency: 'EUR',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({
      ...EXTRACT,
      accounts: [
        ...EXTRACT.accounts,
        { key: 'CheckoutLtdCHF', name: 'Checkout Ltd CHF', currency: 'CHF', lines: [] },
        { key: 'CryptoCrypto', name: 'CryptoCrypto', currency: 'CHF', lines: [] },
      ],
      sheets: [checkoutChf, checkoutEur],
      diffs: [
        { key: 'CheckoutLtdCHF|BuyCrypto after Fee', live: 1, booked: 1, delta: 0 },
        { key: 'CheckoutLtdEUR|BuyCrypto Fee', live: 2, booked: 2, delta: 0 },
        { key: 'CryptoCrypto|BuyCrypto after Fee', live: 3, booked: 3, delta: 0 },
      ],
    });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Abweichung zur Buchhaltung' })).toBeInTheDocument();
    const comparison = cardByHeading('Abweichung zur Buchhaltung');
    expect(within(comparison).getByText('Checkout Ltd CHF')).toBeInTheDocument();
    expect(within(comparison).getByText('Checkout Ltd EUR')).toBeInTheDocument();
    expect(within(comparison).getByText('CryptoCrypto')).toBeInTheDocument();
    expect(within(comparison).getAllByText('BuyCrypto after Fee')).toHaveLength(2);
    expect(within(comparison).getByText('BuyCrypto Fee')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'CryptoCrypto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'CryptoCrypto' })).not.toBeInTheDocument();
  });

  it('exports a zero row for an extract with no sheets and one empty account', async () => {
    mockGetKundengelderExtract.mockResolvedValue({
      year: YEAR,
      eurRate: 1,
      accounts: [
        {
          key: 'CH2100000000000000003',
          name: 'Ledger Bank CHF',
          iban: 'CH2100000000000000003',
          currency: 'CHF',
          lines: [],
        },
      ],
      diffs: [],
    });

    render(<DashboardFinancialKundengelderScreen />);

    const button = await screen.findByRole('button', { name: 'Export CSV' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    expect(mockDownloadCsv).toHaveBeenCalledWith(
      `kundengelder-${YEAR}.csv`,
      expect.stringContaining('Ledger Bank CHF'),
    );
    expect(mockDownloadCsv).toHaveBeenCalledWith(`kundengelder-${YEAR}.csv`, expect.stringContaining('0'));
  });

  it('requests a sheet row line from sollLineKey and from habenLineKey', async () => {
    const sheet: KundengelderSheet = {
      key: 'CH9300762011623852957|CHF',
      name: 'Sample Bank CHF',
      iban: 'CH9300762011623852957',
      currency: 'CHF',
      soll: [{ label: 'BuyCrypto after Fee', amount: 90, lineKey: 'BuyCrypto after Fee', date: '2024-12-31' }],
      haben: [{ label: 'Charge', amount: 1, lineKey: 'Charge', date: '2024-12-31' }],
      rows: [
        { sollLabel: 'BuyCrypto after Fee', sollAmount: 90, sollLineKey: 'BuyCrypto after Fee' },
        { habenLabel: 'Charge', habenAmount: 1, habenLineKey: 'Charge' },
      ],
      sollSum: 90,
      habenSum: 1,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Sample Bank CHF' })).toBeInTheDocument();
    clickLine('Sample Bank CHF', 'BuyCrypto after Fee');
    expect(currentLocation()).toContain('account=CH9300762011623852957');
    expect(currentLocation()).toContain('line=BuyCrypto after Fee');

    clickLine('Sample Bank CHF', 'Charge');
    expect(currentLocation()).toContain('line=Charge');
    expect(currentLocation()).toContain('label=Charge');
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(mockDownloadCsv).toHaveBeenCalledWith(
      `kundengelder-${YEAR}.csv`,
      expect.stringContaining('BuyCrypto after Fee'),
    );
    expect(mockDownloadCsv).toHaveBeenCalledWith(`kundengelder-${YEAR}.csv`, expect.stringContaining('Charge'));
    expect(mockDownloadCsv).toHaveBeenCalledWith(`kundengelder-${YEAR}.csv`, expect.stringContaining('2024-12-31'));
  });

  it('renders Kontrolle with a non-zero control amount', async () => {
    const sheet: KundengelderSheet = {
      key: '90001',
      name: 'Sample Ledger CHF',
      iban: 'CH2100000000000000003',
      currency: 'CHF',
      soll: [],
      haben: [],
      sollSum: 10,
      habenSum: 7,
      control: 3,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Sample Ledger CHF' })).toBeInTheDocument();
    const card = cardByHeading('Sample Ledger CHF');
    expect(within(card).getByText('Kontrolle')).toBeInTheDocument();
    expect(within(card).getByText(money(3))).toHaveClass('text-dfxRed-100');
    expect(within(card).getByText('nicht abgelegt')).toBeInTheDocument();
    expect(within(card).queryByText('Datum')).not.toBeInTheDocument();
  });

  it('draws an omitted current bank as the same T-account', async () => {
    const iban = 'CH9300762011623852957';
    const present: KundengelderSheet = {
      key: `${iban}|CHF`,
      name: 'Sample Bank CHF',
      iban,
      currency: 'CHF',
      periodStart: `${YEAR}-01-01`,
      periodEnd: `${YEAR}-12-31`,
      soll: [],
      haben: [],
      rows: [
        { sollLabel: 'Anfangsbestand', sollAmount: 1 },
        { habenLabel: 'Saldo', habenAmount: 1 },
      ],
      sollSum: 1,
      habenSum: 1,
      control: 0,
    };
    mockGetDfxBanks.mockResolvedValue([
      { name: 'Sample Bank', iban, currency: 'CHF' },
      { name: 'Quiet Bank', iban, currency: 'EUR' },
    ]);
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [present] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Sample Bank CHF' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Konto'), { target: { value: `${iban}|EUR` } });

    const card = cardByHeading('Quiet Bank EUR');
    expect(within(card).getByText('Anfangsbestand')).toBeInTheDocument();
    expect(within(card).getByText('nicht abgelegt')).toBeInTheDocument();
    expect(within(card).getByText('Saldo')).toBeInTheDocument();
    expect(within(card).getAllByText(money(0)).length).toBeGreaterThan(0);
    expect(within(card).getByText(`${YEAR}-01-01`)).toBeInTheDocument();
    expect(within(card).getByText(`${YEAR}-12-31`)).toBeInTheDocument();
    expect(within(card).getByText(/Nicht überprüft/)).toBeInTheDocument();
    expect(within(card).queryByText('Datum')).not.toBeInTheDocument();
    expect(within(card).queryByText('Keine Bewegungen')).not.toBeInTheDocument();
  });

  it('shows verified opening check without a period-end year', async () => {
    const sheet: KundengelderSheet = {
      key: 'verified-no-period',
      name: 'Verified CHF',
      currency: 'CHF',
      soll: [],
      haben: [],
      rows: [{ sollLabel: 'Saldo', sollAmount: 0 }],
      sollSum: 0,
      habenSum: 0,
      control: 0,
      openingCheck: 'verified',
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    const check = await screen.findByText(/Verifiziert/);
    expect(check).toHaveTextContent('Anfangsbestand (');
    expect(check).not.toHaveTextContent(/Anfangsbestand \d/);
  });

  it('labels unmatched diff keys from prefix, plain key, currency suffix and iban fallback', async () => {
    const sample: KundengelderSheet = {
      key: 'CH1|EUR',
      name: 'Sample EUR',
      iban: 'CH1',
      currency: 'EUR',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({
      ...EXTRACT,
      sheets: [sample],
      diffs: [
        { key: 'CheckoutLtdCHF|Fee', live: 1, booked: 1, delta: 0 },
        { key: 'PLAIN', live: 2, booked: 2, delta: 0 },
        { key: 'UNKNOWN|Buy|CHF', live: 3, booked: 3, delta: 0 },
        { key: 'CH1|Line|CHF', live: 4, booked: 4, delta: 0 },
      ],
    });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Sample EUR' })).toBeInTheDocument();
    const comparison = cardByHeading('Abweichung zur Buchhaltung');

    const feeRow = within(comparison).getByText('Fee').closest('tr');
    if (!feeRow) throw new Error('expected fee row');
    expect(within(feeRow).getByText('CheckoutLtdCHF')).toBeInTheDocument();

    const plainRow = within(comparison).getAllByText('PLAIN')[0].closest('tr');
    if (!plainRow) throw new Error('expected plain row');
    expect(within(plainRow).getAllByText('PLAIN')).toHaveLength(2);

    const unknownRow = within(comparison).getByText('UNKNOWN CHF').closest('tr');
    if (!unknownRow) throw new Error('expected unknown row');
    expect(within(unknownRow).getByText('Buy')).toBeInTheDocument();

    const lineRow = within(comparison).getByText('Line').closest('tr');
    if (!lineRow) throw new Error('expected line row');
    expect(within(lineRow).getByText('Sample EUR')).toBeInTheDocument();
  });

  it('exports sparse sheet rows without a movement date', async () => {
    const sheet: KundengelderSheet = {
      key: 'sparse',
      name: 'Sparse CHF',
      currency: 'CHF',
      soll: [],
      haben: [],
      rows: [
        { sollLabel: 'Anfangsbestand', sollAmount: 1 },
        { sollAmount: 2 },
        { sollLabel: 'NurLabel' },
        { habenAmount: 3 },
        { habenLabel: 'NurHaben' },
        { sollLabel: 'MissingKey', sollAmount: 4, sollLineKey: 'nope' },
      ],
      sollSum: 0,
      habenSum: 0,
      control: 0,
      openingCheck: 'unchecked',
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Sparse CHF' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(mockDownloadCsv).toHaveBeenCalled();
    const csv = String(mockDownloadCsv.mock.calls[0]?.[1] ?? '');
    expect(csv).toContain('Anfangsbestand');
    expect(csv).toContain('NurLabel');
    expect(csv).toContain('NurHaben');
    expect(csv).toContain('MissingKey');
    expect(csv).toContain('Prüfung');
    expect(csv).toContain('Nicht überprüft');
    expect(csv).not.toContain('2024-12-31');
  });

  it('renders a section row with both labels', async () => {
    const sheet: KundengelderSheet = {
      key: 'section',
      name: 'Section CHF',
      currency: 'CHF',
      soll: [],
      haben: [],
      rows: [
        { sollLabel: 'Eingänge', habenLabel: 'Ausgänge', section: true },
        { sollLabel: 'Saldo', sollAmount: 1 },
      ],
      sollSum: 1,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Section CHF' })).toBeInTheDocument();
    expect(within(cardByHeading('Section CHF')).getByText('Eingänge')).toBeInTheDocument();
    expect(within(cardByHeading('Section CHF')).getByText('Ausgänge')).toBeInTheDocument();
  });

  it('requests a sheet row line from the amount cell when the sheet has no iban', async () => {
    const sheet: KundengelderSheet = {
      key: 'CheckoutLtdCHF',
      name: 'Checkout CHF',
      currency: 'CHF',
      soll: [],
      haben: [],
      rows: [{ sollLabel: 'Nach Gebühr', sollAmount: 5, sollLineKey: 'after' }],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Checkout CHF' })).toBeInTheDocument();
    fireEvent.click(within(cardByHeading('Checkout CHF')).getByText(money(5)));
    expect(currentLocation()).toContain('sheet=CheckoutLtdCHF');
    expect(currentLocation()).toContain('account=CheckoutLtdCHF');
    expect(currentLocation()).toContain('line=after');
    expect(currentLocation()).toContain('label=Nach Gebühr');
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();
  });

  it('requests sheet row lines from empty amount and haben-only cells', async () => {
    const sheet: KundengelderSheet = {
      key: 'line-cells',
      name: 'Line Cells CHF',
      currency: 'CHF',
      soll: [],
      haben: [],
      rows: [{ sollLabel: 'Ohne', sollLineKey: 'ohne' }, { habenLineKey: 'haben-only' }],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Line Cells CHF' })).toBeInTheDocument();
    clickLine('Line Cells CHF', 'Ohne');
    expect(currentLocation()).toContain('account=line-cells');
    expect(currentLocation()).toContain('line=ohne');

    const table = within(cardByHeading('Line Cells CHF')).getByRole('table', { name: 'Kontenblatt' });
    const emptyRow = within(table)
      .getAllByRole('row')
      .find((row) => {
        const cells = within(row).queryAllByRole('cell');
        return cells.length === 4 && cells.every((cell) => cell.textContent === '');
      });
    if (!emptyRow) throw new Error('missing haben-only row');
    fireEvent.click(within(emptyRow).getAllByRole('cell')[2]);
    expect(currentLocation()).toContain('line=haben-only');
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();
  });

  it('navigates from a sheet row without showing the line error on the sheet', async () => {
    const sheet: KundengelderSheet = {
      key: 'row-err',
      name: 'Row Error CHF',
      iban: 'CH-ROW',
      currency: 'CHF',
      soll: [],
      haben: [],
      rows: [{ sollLabel: 'Buy', sollAmount: 1, sollLineKey: 'Buy' }],
      sollSum: 1,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Row Error CHF' })).toBeInTheDocument();
    mockGetKundengelderLines.mockRejectedValueOnce(new Error('row boom'));
    clickLine('Row Error CHF', 'Buy');
    expect(currentLocation()).toContain('account=CH-ROW');
    expect(currentLocation()).toContain('line=Buy');
    expect(screen.queryByText('row boom')).not.toBeInTheDocument();
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();
  });

  it('keeps loaded booking rows off the Kontenblatt', async () => {
    const sheet: KundengelderSheet = {
      key: 'row-list',
      name: 'Row List CHF',
      iban: 'CH-LIST',
      currency: 'CHF',
      soll: [],
      haben: [],
      rows: [{ sollLabel: 'Buy', sollAmount: 1, sollLineKey: 'Buy' }],
      sollSum: 1,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });
    mockGetKundengelderLines.mockResolvedValue({
      year: YEAR,
      accountKey: 'CH-LIST',
      line: 'Buy',
      rows: [{ id: 501, type: 'BuyCrypto', amount: 1, bookingDate: '2024-08-16' }],
    });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Row List CHF' })).toBeInTheDocument();
    clickLine('Row List CHF', 'Buy');
    expect(currentLocation()).toContain('account=CH-LIST');
    expect(currentLocation()).toContain('line=Buy');
    const ledger = within(cardByHeading('Row List CHF')).getByRole('table', { name: 'Kontenblatt' });
    expect(within(ledger).queryByText('501')).not.toBeInTheDocument();
    expect(screen.queryByText('501')).not.toBeInTheDocument();
  });

  it('navigates from a sheet side without showing the line error on the sheet', async () => {
    const sheet: KundengelderSheet = {
      key: 'side-err',
      name: 'Side Error CHF',
      iban: 'CH-SIDE',
      currency: 'CHF',
      soll: [{ label: 'Buy', amount: 1, lineKey: 'Buy' }],
      haben: [],
      sollSum: 1,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Side Error CHF' })).toBeInTheDocument();
    mockGetKundengelderLines.mockRejectedValueOnce(new Error('side boom'));
    clickLine('Side Error CHF', 'Buy');
    expect(currentLocation()).toContain('account=CH-SIDE');
    expect(currentLocation()).toContain('line=Buy');
    expect(screen.queryByText('side boom')).not.toBeInTheDocument();
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();
  });

  it('does not show missing-opening text for a non-opening label without amount', async () => {
    const sheet: KundengelderSheet = {
      key: 'intern-empty',
      name: 'Intern Sheet CHF',
      currency: 'CHF',
      soll: [],
      haben: [],
      rows: [{ sollLabel: 'Intern' }],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Intern Sheet CHF' })).toBeInTheDocument();
    const card = cardByHeading('Intern Sheet CHF');
    expect(within(card).getByText('Intern')).toBeInTheDocument();
    expect(within(card).queryByText('nicht abgelegt')).not.toBeInTheDocument();
  });

  it('names an exact CheckoutLtdCHF diff key as account and position', async () => {
    mockGetKundengelderExtract.mockResolvedValue({
      ...EXTRACT,
      diffs: [{ key: 'CheckoutLtdCHF', live: 6, booked: 6, delta: 0 }],
    });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Abweichung zur Buchhaltung' })).toBeInTheDocument();
    const comparison = cardByHeading('Abweichung zur Buchhaltung');
    const diffRow = within(comparison).getAllByText('CheckoutLtdCHF')[0].closest('tr');
    if (!diffRow) throw new Error('expected CheckoutLtdCHF row');
    expect(within(diffRow).getAllByText('CheckoutLtdCHF')).toHaveLength(2);
  });

  it('requests a sheet row line from a soll amount without a label', async () => {
    const sheet: KundengelderSheet = {
      key: 'bare-amount',
      name: 'Bare Amount CHF',
      currency: 'CHF',
      soll: [],
      haben: [],
      rows: [{ sollAmount: 1, sollLineKey: 'bare' }],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Bare Amount CHF' })).toBeInTheDocument();
    const table = within(cardByHeading('Bare Amount CHF')).getByRole('table', { name: 'Kontenblatt' });
    const dataRow = within(table)
      .getAllByRole('row')
      .find((row) => within(row).queryAllByRole('cell').length === 4);
    if (!dataRow) throw new Error('missing bare row');
    fireEvent.click(within(dataRow).getAllByRole('cell')[1]);
    expect(currentLocation()).toContain('account=bare-amount');
    expect(currentLocation()).toContain('line=bare');
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();
  });

  it('does not request lines when a sheet side row has no lineKey', async () => {
    const sheet: KundengelderSheet = {
      key: 'side-no-key',
      name: 'Side No Key CHF',
      currency: 'CHF',
      soll: [{ label: 'Anfangsbestand', amount: 0 }],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [sheet] });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Side No Key CHF' })).toBeInTheDocument();
    clickLine('Side No Key CHF', 'Anfangsbestand');
    expect(currentLocation()).toBe('/');
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();
  });

  it('restores the year and the selected sheet from the address', async () => {
    const ledger: KundengelderSheet = {
      key: '90001',
      name: 'Sample Ledger CHF',
      currency: 'CHF',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    const buy: KundengelderSheet = {
      key: 'CH9300762011623852957|CHF',
      name: 'Sample Bank CHF',
      iban: 'CH9300762011623852957',
      currency: 'CHF',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    mockGetKundengelderExtract.mockResolvedValue({ ...EXTRACT, sheets: [ledger, buy] });

    render(
      <DashboardFinancialKundengelderScreen />,
      `/dashboard/financial/kundengelder?year=2022&sheet=${encodeURIComponent(buy.key)}`,
    );

    expect(await screen.findByRole('heading', { name: 'Sample Bank CHF' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sample Ledger CHF' })).not.toBeInTheDocument();
    expect(mockGetKundengelderExtract).toHaveBeenCalledWith(2022);
  });
});

describe('DashboardFinancialKundengelderLinesScreen', () => {
  const account = 'CH9300762011623852957';
  const line = 'BuyCrypto after Fee';

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSessionContext.mockReturnValue({ isLoggedIn: true });
    mockGetKundengelderLines.mockResolvedValue({ year: YEAR, accountKey: account, line, rows: [] });
  });

  function layoutOnBack(): () => void {
    const calls = mockUseLayoutOptions.mock.calls as Array<[{ onBack?: () => void }]>;
    const onBack = calls[calls.length - 1]?.[0]?.onBack;
    if (!onBack) throw new Error('missing back handler');
    return onBack;
  }

  it('guards the page and keeps the spinner while logged out', () => {
    mockUseSessionContext.mockReturnValue({ isLoggedIn: false });

    render(<DashboardFinancialKundengelderLinesScreen />, linesPath(account, line));

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(mockUseAdminGuard).toHaveBeenCalled();
    expect(mockUseLayoutOptions).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Kundengelder', backButton: true, noMaxWidth: true }),
    );
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();
  });

  it('shows an empty booking list for the requested line', async () => {
    render(<DashboardFinancialKundengelderLinesScreen />, linesPath(account, line));

    expect(await screen.findByRole('heading', { name: 'Buchungen · BuyCrypto after Fee' })).toBeInTheDocument();
    expect(screen.getByText('Keine Buchungen')).toBeInTheDocument();
    expect(mockGetKundengelderLines).toHaveBeenCalledWith(YEAR, account, line);
    expect(screen.queryByRole('heading', { name: 'Abweichung zur Buchhaltung' })).not.toBeInTheDocument();
  });

  it('renders optional booking cells for a full row and an id-and-type-only row', async () => {
    const rows: KundengelderTx[] = [
      { id: 101, type: 'BuyCrypto', bookingDate: '2026-01-15', amount: 12.5, afterFee: 11, instructionId: 'instr-101' },
      { id: 102, type: 'SellFiat' },
    ];
    mockGetKundengelderLines.mockResolvedValue({ year: YEAR, accountKey: account, line, rows });

    render(<DashboardFinancialKundengelderLinesScreen />, linesPath(account, line));

    expect(await screen.findByText('instr-101')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();
    expect(screen.getByText('2026-01-15')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Instruktion' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Test CHF Account' })).not.toBeInTheDocument();
  });

  it('shows ErrorHint when the booking request fails', async () => {
    mockGetKundengelderLines.mockRejectedValueOnce(new Error('line boom'));

    render(<DashboardFinancialKundengelderLinesScreen />, linesPath(account, line));

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('line boom');
    expect(screen.getByRole('heading', { name: 'Buchungen · BuyCrypto after Fee' })).toBeInTheDocument();
    expect(screen.queryByText('Keine Buchungen')).not.toBeInTheDocument();
  });

  it('shows Unknown error when the booking request rejects with a non-Error', async () => {
    mockGetKundengelderLines.mockRejectedValueOnce('not-an-error');

    render(<DashboardFinancialKundengelderLinesScreen />, linesPath(account, line));

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('shows a booking from the line response', async () => {
    mockGetKundengelderLines.mockResolvedValue({
      year: YEAR,
      accountKey: 'CH-LIST',
      line: 'Buy',
      rows: [{ id: 501, type: 'BuyCrypto', amount: 1, bookingDate: '2024-08-16' }],
    });

    render(<DashboardFinancialKundengelderLinesScreen />, linesPath('CH-LIST', 'Buy', 'Buy'));

    expect(await screen.findByText('501')).toBeInTheDocument();
    expect(screen.getByText('2024-08-16')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Buchungen · Buy' })).toBeInTheDocument();
  });

  it('says the booking is missing when the address has no line', async () => {
    render(<DashboardFinancialKundengelderLinesScreen />, '/dashboard/financial/kundengelder/lines');

    expect(await screen.findByText('Die Buchung fehlt.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Buchungen' })).toBeInTheDocument();
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();
  });

  it('says the booking is missing when the year is outside the open range', async () => {
    render(
      <DashboardFinancialKundengelderLinesScreen />,
      '/dashboard/financial/kundengelder/lines?year=2019&account=a&line=b',
    );

    expect(await screen.findByText('Die Buchung fehlt.')).toBeInTheDocument();
    expect(mockGetKundengelderLines).not.toHaveBeenCalled();
  });

  it('uses the line key as the title when the label is empty', async () => {
    render(<DashboardFinancialKundengelderLinesScreen />, linesPath(account, 'haben-only', ''));

    expect(await screen.findByRole('heading', { name: 'Buchungen · haben-only' })).toBeInTheDocument();
    expect(mockGetKundengelderLines).toHaveBeenCalledWith(YEAR, account, 'haben-only');
  });

  it('returns to the same year and sheet', async () => {
    render(
      <DashboardFinancialKundengelderLinesScreen />,
      linesPath('CheckoutLtdEUR', 'Checkout', 'Checkout', 2022, 'CheckoutLtdEUR'),
    );

    expect(await screen.findByText('Keine Buchungen')).toBeInTheDocument();
    act(() => layoutOnBack()());

    expect(currentLocation()).toBe('/dashboard/financial/kundengelder?year=2022&sheet=CheckoutLtdEUR');
  });

  it('uses the account as the sheet when the booking address has none', async () => {
    const params = new URLSearchParams();
    params.set('year', String(YEAR));
    params.set('account', account);
    params.set('line', line);
    render(
      <DashboardFinancialKundengelderLinesScreen />,
      `/dashboard/financial/kundengelder/lines?${params.toString()}`,
    );

    expect(await screen.findByText('Keine Buchungen')).toBeInTheDocument();
    act(() => layoutOnBack()());

    expect(currentLocation()).toBe(`/dashboard/financial/kundengelder?year=${YEAR}&sheet=${account}`);
  });

  it('keeps the session when returning to the sheet', async () => {
    render(
      <DashboardFinancialKundengelderLinesScreen />,
      `${linesPath('CheckoutLtdEUR', 'Checkout', 'Checkout', 2022, 'CheckoutLtdEUR')}&session=abc&lang=de`,
    );

    expect(await screen.findByText('Keine Buchungen')).toBeInTheDocument();
    act(() => layoutOnBack()());

    expect(currentLocation()).toContain('year=2022');
    expect(currentLocation()).toContain('sheet=CheckoutLtdEUR');
    expect(currentLocation()).toContain('session=abc');
    expect(currentLocation()).toContain('lang=de');
    expect(currentLocation()).not.toContain('line=');
    expect(currentLocation()).not.toContain('account=');
    expect(currentLocation()).not.toContain('label=');
  });

  it('returns to the sheet when the booking address is incomplete', async () => {
    render(<DashboardFinancialKundengelderLinesScreen />, '/dashboard/financial/kundengelder/lines');

    expect(await screen.findByText('Die Buchung fehlt.')).toBeInTheDocument();
    act(() => layoutOnBack()());

    expect(currentLocation()).toBe('/dashboard/financial/kundengelder');
  });

  it('ignores a booking response that resolves after the page is left', async () => {
    let resolveLines: (value: KundengelderTxList) => void = () => undefined;
    mockGetKundengelderLines.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLines = resolve;
        }),
    );

    const { unmount } = render(<DashboardFinancialKundengelderLinesScreen />, linesPath(account, line));
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    unmount();

    await act(async () => {
      resolveLines({
        year: YEAR,
        accountKey: account,
        line,
        rows: [{ id: 99, type: 'BuyCrypto' }],
      });
    });

    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('ignores a booking rejection that arrives after the page is left', async () => {
    let rejectLines: (reason: Error) => void = () => undefined;
    mockGetKundengelderLines.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectLines = reject;
        }),
    );

    const { unmount } = render(<DashboardFinancialKundengelderLinesScreen />, linesPath(account, line));
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    unmount();

    await act(async () => {
      rejectLines(new Error('late line boom'));
    });

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });
});
