const mockGetAdminPayouts = jest.fn();
const mockDownloadCsv = jest.fn();
const mockToSemicolonCsv = jest.fn((headers: string[], rows: unknown[]) => `csv:${headers.length}:${rows.length}`);

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', MD: 'md', LG: 'lg' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
  StyledButtonWidth: { MIN: 'min', FULL: 'full' },
  StyledButtonSize: { SMALL: 'small', BIG: 'big' },
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white', BLUE: 'blue' },
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/components/realunit/copyable-address', () => ({
  CopyableAddress: ({ address }: { address?: string }) => <span data-testid="copyable-address">{address}</span>,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/realunit-referral.hook', () => ({
  useRealunitReferral: () => ({
    getAdminPayouts: (...args: unknown[]) => mockGetAdminPayouts(...args),
  }),
}));

jest.mock('src/util/semicolon-csv', () => ({
  downloadCsv: (...args: unknown[]) => mockDownloadCsv(...args),
  toSemicolonCsv: (...args: unknown[]) => mockToSemicolonCsv(...(args as [string[], unknown[]])),
}));

jest.mock('src/util/utils', () => ({
  formatSwissDateTimeWithSeconds: (value: string) => `fmt:${value}`,
}));

import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PayoutsPanel } from 'src/components/realunit/payouts-panel';
import {
  RealUnitCodeKind,
  RealUnitLegalBasis,
  RealUnitPrizePayoutStatus,
} from 'src/dto/realunit-referral.dto';

const PAYOUT = {
  id: 11,
  created: '2026-03-01T12:00:00.000Z',
  kind: RealUnitCodeKind.INVITE,
  legalBasis: RealUnitLegalBasis.REFERRAL_PREMIUM,
  status: RealUnitPrizePayoutStatus.COMPLETE,
  amount: 10,
  chfValue: 12.5,
  txHash: '0xabc',
  customerId: 42,
  customerWallet: '0xcustomer',
  referrerAccountId: 7,
  referrerWallet: '0xref',
  guestAccountId: 9,
  guestWallet: '0xguest',
  code: 'AB-CD',
  qualifyingBuy: { id: 100, created: '2026-02-01T10:00:00.000Z', amount: 50 },
};

describe('PayoutsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAdminPayouts.mockResolvedValue([PAYOUT]);
    mockToSemicolonCsv.mockImplementation(
      (headers: string[], rows: unknown[]) => `csv:${headers.length}:${rows.length}`,
    );
  });

  it('loads and renders the payout list', async () => {
    render(<PayoutsPanel />);
    await waitFor(() => expect(screen.getByText('fmt:2026-03-01T12:00:00.000Z')).toBeInTheDocument());
    expect(screen.getByText('Prize payouts')).toBeInTheDocument();
    expect(screen.getByText('Referral premium')).toBeInTheDocument();
    expect(screen.getByText(RealUnitPrizePayoutStatus.COMPLETE)).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    const addresses = screen.getAllByTestId('copyable-address').map((el) => el.textContent);
    expect(addresses).toContain('0xcustomer');
    expect(addresses).toContain('0xref');
    expect(addresses).toContain('0xguest');
    expect(addresses).toContain('0xabc');
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('AB-CD')).toBeInTheDocument();
    expect(screen.getByText('100 (50)')).toBeInTheDocument();
    expect(mockGetAdminPayouts).toHaveBeenCalledTimes(1);
    expect(mockGetAdminPayouts).toHaveBeenCalledWith();
  });

  it('lists every payout and shows referrer and guest only when each side is present', async () => {
    mockGetAdminPayouts.mockResolvedValue([
      PAYOUT,
      {
        ...PAYOUT,
        id: 12,
        legalBasis: RealUnitLegalBasis.PROMO_GRANT,
        status: RealUnitPrizePayoutStatus.PENDING,
        customerId: 43,
        customerWallet: '0xother',
        referrerAccountId: undefined,
        referrerWallet: undefined,
        guestAccountId: undefined,
        guestWallet: undefined,
      },
      {
        ...PAYOUT,
        id: 13,
        customerId: 44,
        customerWallet: '0xreferreronly',
        referrerAccountId: 70,
        referrerWallet: undefined,
        guestAccountId: undefined,
        guestWallet: undefined,
      },
      {
        ...PAYOUT,
        id: 14,
        customerId: 45,
        customerWallet: '0xguestonly',
        referrerAccountId: undefined,
        referrerWallet: undefined,
        guestAccountId: 80,
        guestWallet: undefined,
      },
    ]);
    render(<PayoutsPanel />);
    await waitFor(() => expect(screen.getByText('Promo grant')).toBeInTheDocument());
    expect(screen.getByText('Referral premium')).toBeInTheDocument();
    expect(screen.getByText(RealUnitPrizePayoutStatus.PENDING)).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    const addresses = screen.getAllByTestId('copyable-address').map((el) => el.textContent);
    expect(addresses).not.toContain('0xabc000');
    expect(addresses).toContain('0xref');
    expect(addresses).toContain('0xguest');
    const rows = screen.getAllByRole('row');
    const referrerOnly = rows.find((row) => row.textContent?.includes('70'));
    const guestOnly = rows.find((row) => row.textContent?.includes('80'));
    const neither = rows.find((row) => row.textContent?.includes('43'));
    expect(referrerOnly).toHaveTextContent('-');
    expect(guestOnly).toHaveTextContent('-');
    expect(neither).toHaveTextContent('-');
    expect(mockGetAdminPayouts).toHaveBeenCalledWith();
  });

  it('shows the empty state when there are no payouts', async () => {
    mockGetAdminPayouts.mockResolvedValue([]);
    render(<PayoutsPanel />);
    await waitFor(() => expect(screen.getByText('No prize payouts found')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });

  it('shows an error hint when loading fails', async () => {
    mockGetAdminPayouts.mockRejectedValue(new Error('boom'));
    render(<PayoutsPanel />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('boom'));
  });

  it('falls back to Unknown error when loading rejects without a message', async () => {
    mockGetAdminPayouts.mockRejectedValue({});
    render(<PayoutsPanel />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });

  it('shows an unknown legalBasis as-is in the table and CSV', async () => {
    mockGetAdminPayouts.mockResolvedValue([
      {
        ...PAYOUT,
        legalBasis: 'Other' as RealUnitLegalBasis,
      },
    ]);
    render(<PayoutsPanel />);
    await waitFor(() => expect(screen.getByText('Other')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    const rows = mockToSemicolonCsv.mock.calls[0][1] as Array<Array<string | number | undefined>>;
    expect(rows[0][1]).toBe('Other');
  });

  it('exports CSV with German headers and mapped rows', async () => {
    render(<PayoutsPanel />);
    await waitFor(() => expect(screen.getByText('fmt:2026-03-01T12:00:00.000Z')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(mockToSemicolonCsv).toHaveBeenCalledTimes(1);
    const [headers, rows] = mockToSemicolonCsv.mock.calls[0];
    expect(headers).toEqual([
      'Datum',
      'Rechtsgrund',
      'Status',
      'Kunde-ID',
      'Wallet',
      'Anzahl',
      'Frankenwert',
      'Tx-Hash',
      'Empfehler-ID',
      'Empfehler-Wallet',
      'Eingeladene-ID',
      'Eingeladene-Wallet',
      'Code',
      'Erstkauf-ID',
      'Erstkauf-Datum',
      'Erstkauf-Anzahl',
    ]);
    expect(rows).toEqual([
      [
        '2026-03-01T12:00:00.000Z',
        'Empfehlungsprämie',
        RealUnitPrizePayoutStatus.COMPLETE,
        42,
        '0xcustomer',
        10,
        12.5,
        '0xabc',
        7,
        '0xref',
        9,
        '0xguest',
        'AB-CD',
        100,
        '2026-02-01T10:00:00.000Z',
        50,
      ],
    ]);

    const filename = mockDownloadCsv.mock.calls[0][0] as string;
    expect(filename).toMatch(/^realunit-payouts-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(mockDownloadCsv.mock.calls[0][1]).toBe('csv:16:1');
  });

  it('maps PromoGrant to Promo-Zugabe in the CSV and shows Promo grant in the table', async () => {
    mockGetAdminPayouts.mockResolvedValue([
      {
        ...PAYOUT,
        legalBasis: RealUnitLegalBasis.PROMO_GRANT,
        txHash: undefined,
        code: undefined,
        referrerAccountId: undefined,
        referrerWallet: undefined,
        guestAccountId: undefined,
        guestWallet: undefined,
        qualifyingBuy: undefined,
      },
    ]);
    render(<PayoutsPanel />);
    await waitFor(() => expect(screen.getByText('Promo grant')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    const rows = mockToSemicolonCsv.mock.calls[0][1] as Array<Array<string | number | undefined>>;
    expect(rows[0][1]).toBe('Promo-Zugabe');
    expect(rows[0][7]).toBeUndefined();
    expect(rows[0][8]).toBeUndefined();
    expect(rows[0][9]).toBeUndefined();
    expect(rows[0][10]).toBeUndefined();
    expect(rows[0][11]).toBeUndefined();
    expect(rows[0][12]).toBeUndefined();
    expect(rows[0][13]).toBeUndefined();
  });

  it('disables export while loading', () => {
    mockGetAdminPayouts.mockReturnValue(new Promise(() => undefined));
    render(<PayoutsPanel />);
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'md');
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });

  it('fetches admin payouts only once under StrictMode', async () => {
    render(
      <StrictMode>
        <PayoutsPanel />
      </StrictMode>,
    );
    await waitFor(() => expect(mockGetAdminPayouts).toHaveBeenCalledTimes(1));
  });
});
