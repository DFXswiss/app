const mockUseSessionContext = jest.fn();
jest.mock('@dfx.swiss/react', () => ({
  useSessionContext: () => mockUseSessionContext(),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
  StyledButtonWidth: { MIN: 'min' },
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButton: ({
    label,
    onClick,
    disabled,
  }: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

const mockGetKundengelderExtract = jest.fn();
const mockGetKundengelderLines = jest.fn();
jest.mock('src/hooks/dashboard.hook', () => ({
  useDashboard: () => ({
    getKundengelderExtract: mockGetKundengelderExtract,
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

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { KundengelderExtract, KundengelderTx, KundengelderTxList } from 'src/dto/dashboard.dto';
import DashboardFinancialKundengelderScreen from 'src/screens/dashboard-financial-kundengelder.screen';

const chf = (value: number): string => `${value.toLocaleString('de-CH')} CHF`;

const YEAR = new Date().getUTCFullYear();

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
    mockGetKundengelderLines.mockResolvedValue({ year: YEAR, accountKey: EXTRACT.accounts[0].key, line: '', rows: [] });
  });

  it('guards the screen for admins and keeps the spinner while logged out', () => {
    mockUseSessionContext.mockReturnValue({ isLoggedIn: false });

    render(<DashboardFinancialKundengelderScreen />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(mockUseAdminGuard).toHaveBeenCalled();
    expect(mockUseLayoutOptions).toHaveBeenCalledWith({ title: 'Kundengelder', noMaxWidth: true });
    expect(mockGetKundengelderExtract).not.toHaveBeenCalled();
  });

  it('loads the current UTC year extract, line amounts and a visible non-zero diff', async () => {
    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    expect(mockGetKundengelderExtract).toHaveBeenCalledWith(YEAR);
    expect(screen.getByRole('heading', { name: 'Checkout Ltd EUR' })).toBeInTheDocument();
    expect(screen.getAllByText(chf(1234.5)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(chf(10)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(chf(50)).length).toBeGreaterThan(0);

    expect(screen.getByRole('heading', { name: 'Live vs booked' })).toBeInTheDocument();
    const diffRow = screen.getByText('CH9300762011623852957|BuyCrypto after Fee').closest('tr');
    if (!diffRow) throw new Error('expected diff row');
    expect(within(diffRow).getByText('100')).toBeInTheDocument();
    expect(within(diffRow).getByText('90')).toBeInTheDocument();
    expect(within(diffRow).getByText('10')).toBeInTheDocument();
  });

  it('refetches extract when the year changes and closes opened lines', async () => {
    mockGetKundengelderLines.mockResolvedValue({
      year: YEAR,
      accountKey: EXTRACT.accounts[0].key,
      line: EXTRACT.accounts[0].lines[0].key,
      rows: [{ id: 99, type: 'BuyCrypto', amount: 1 }],
    });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('BuyCrypto after Fee'));
    expect(await screen.findByText('99')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2022' } });

    await waitFor(() => expect(mockGetKundengelderExtract).toHaveBeenCalledWith(2022));
    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('loads line transactions on row click and shows No transactions when rows are empty', async () => {
    mockGetKundengelderLines
      .mockResolvedValueOnce({
        year: YEAR,
        accountKey: EXTRACT.accounts[0].key,
        line: EXTRACT.accounts[0].lines[0].key,
        rows: [{ id: 99, type: 'BuyCrypto', amount: 1 }],
      })
      .mockResolvedValueOnce({
        year: YEAR,
        accountKey: EXTRACT.accounts[0].key,
        line: EXTRACT.accounts[0].lines[1].key,
        rows: [],
      });

    render(<DashboardFinancialKundengelderScreen />);

    const chfAccount = EXTRACT.accounts[0];
    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('BuyCrypto after Fee'));

    expect(await screen.findByText('99')).toBeInTheDocument();
    expect(mockGetKundengelderLines).toHaveBeenCalledWith(YEAR, chfAccount.key, chfAccount.lines[0].key);

    fireEvent.click(screen.getByText('SellFiat'));
    expect(await screen.findByText('No transactions')).toBeInTheDocument();
    expect(mockGetKundengelderLines).toHaveBeenCalledWith(YEAR, chfAccount.key, chfAccount.lines[1].key);
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
    expect(screen.getByLabelText('Year')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('shows ErrorHint after a rejected getKundengelderLines path', async () => {
    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    mockGetKundengelderLines.mockRejectedValueOnce(new Error('line boom'));
    fireEvent.click(screen.getByText('BuyCrypto after Fee'));
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('line boom');
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

  it('closes an opened empty line on a second click and hides No transactions', async () => {
    mockGetKundengelderLines.mockResolvedValueOnce({
      year: YEAR,
      accountKey: EXTRACT.accounts[0].key,
      line: EXTRACT.accounts[0].lines[0].key,
      rows: [],
    });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('BuyCrypto after Fee'));
    expect(await screen.findByText('No transactions')).toBeInTheDocument();

    fireEvent.click(screen.getByText('BuyCrypto after Fee'));
    expect(screen.queryByText('No transactions')).not.toBeInTheDocument();
  });

  it('ignores a line response that resolves after the row is closed', async () => {
    let resolveLines: (value: KundengelderTxList) => void = () => undefined;
    mockGetKundengelderLines.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLines = resolve;
        }),
    );

    render(<DashboardFinancialKundengelderScreen />);
    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('BuyCrypto after Fee'));
    fireEvent.click(screen.getByText('BuyCrypto after Fee'));

    await act(async () => {
      resolveLines({
        year: YEAR,
        accountKey: EXTRACT.accounts[0].key,
        line: EXTRACT.accounts[0].lines[0].key,
        rows: [{ id: 99, type: 'BuyCrypto' }],
      });
    });

    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('ignores a line reject that arrives after the row is closed', async () => {
    let rejectLines: (reason: Error) => void = () => undefined;
    mockGetKundengelderLines.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectLines = reject;
        }),
    );

    render(<DashboardFinancialKundengelderScreen />);
    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('BuyCrypto after Fee'));
    fireEvent.click(screen.getByText('BuyCrypto after Fee'));

    await act(async () => {
      rejectLines(new Error('late line boom'));
    });

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('opens a line on the second account without treating it as a toggle', async () => {
    render(<DashboardFinancialKundengelderScreen />);
    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('BuyCrypto after Fee'));
    expect(await screen.findByText('No transactions')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Checkout'));
    await waitFor(() =>
      expect(mockGetKundengelderLines).toHaveBeenLastCalledWith(YEAR, 'CheckoutLtdEUR', 'Checkout'),
    );
  });

  it('does not download CSV when Export is clicked after an extract error', async () => {
    mockGetKundengelderExtract.mockRejectedValue(new Error('extract failed'));

    render(<DashboardFinancialKundengelderScreen />);
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('extract failed');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(mockDownloadCsv).not.toHaveBeenCalled();
  });

  it('does not refetch extract when the year select changes to nope', async () => {
    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    expect(mockGetKundengelderExtract).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Year'), { target: { value: 'nope' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: String(YEAR) } });

    expect(mockGetKundengelderExtract).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2021' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: `${YEAR + 1}` } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '' } });

    expect(mockGetKundengelderExtract).toHaveBeenCalledTimes(1);
  });

  it('renders Live vs booked when a diff has a zero delta', async () => {
    mockGetKundengelderExtract.mockResolvedValue({
      ...EXTRACT,
      diffs: [{ key: 'CH9300762011623852957|BuyCrypto after Fee', live: 50, booked: 50, delta: 0 }],
    });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Live vs booked' })).toBeInTheDocument();
    expect(screen.getByText('CH9300762011623852957|BuyCrypto after Fee')).toBeInTheDocument();
  });

  it('year select options include 2022 and the current UTC year', async () => {
    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();

    const yearSelect = screen.getByLabelText('Year');
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

  it('renders optional TxTable cells for a full row and an id-and-type-only row', async () => {
    const rows: KundengelderTx[] = [
      { id: 101, type: 'BuyCrypto', bookingDate: '2026-01-15', amount: 12.5, afterFee: 11, instructionId: 'instr-101' },
      { id: 102, type: 'SellFiat' },
    ];
    mockGetKundengelderLines.mockResolvedValue({
      year: YEAR,
      accountKey: EXTRACT.accounts[0].key,
      line: EXTRACT.accounts[0].lines[0].key,
      rows,
    });

    render(<DashboardFinancialKundengelderScreen />);

    expect(await screen.findByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('BuyCrypto after Fee'));

    expect(await screen.findByText('instr-101')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();
    expect(screen.getByText('2026-01-15')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Test CHF Account' })).toBeInTheDocument();
  });
});

