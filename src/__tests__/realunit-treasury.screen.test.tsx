const mockUseRealunitGuard = jest.fn();
const mockGetPrizeWallet = jest.fn();
const mockListPrizeWalletAlerts = jest.fn();
const mockCreatePrizeWalletAlert = jest.fn();
const mockDeletePrizeWalletAlert = jest.fn();

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', MD: 'md', LG: 'lg' },
  IconColor: { GRAY: 'gray' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
  StyledButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
  StyledButtonWidth: { MIN: 'min', FULL: 'full' },
  CopyButton: ({ onCopy }: { onCopy?: () => void }) => (
    <button type="button" data-testid="copy-button" onClick={onCopy}>
      copy
    </button>
  ),
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/components/realunit/buy-limit-panel', () => ({
  RealunitBuyLimitPanel: () => <div data-testid="buy-limit-panel" />,
}));

jest.mock('src/components/realunit/payouts-panel', () => ({
  PayoutsPanel: () => <div data-testid="payouts-panel" />,
}));

jest.mock('src/components/payment/qr-code', () => ({
  QrCopy: ({ data }: { data: string }) => <div data-testid="prize-qr">{data}</div>,
}));

jest.mock('src/hooks/guard.hook', () => ({
  useRealunitGuard: (...args: unknown[]) => mockUseRealunitGuard(...args),
}));

jest.mock('src/hooks/realunit-referral.hook', () => ({
  useRealunitReferral: () => ({
    getPrizeWallet: (...args: unknown[]) => mockGetPrizeWallet(...args),
    listPrizeWalletAlerts: (...args: unknown[]) => mockListPrizeWalletAlerts(...args),
    createPrizeWalletAlert: (...args: unknown[]) => mockCreatePrizeWalletAlert(...args),
    deletePrizeWalletAlert: (...args: unknown[]) => mockDeletePrizeWalletAlert(...args),
  }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/util/utils', () => ({
  blankedAddress: (address: string) => address,
  formatSwissDateTimeWithSeconds: (value: string) => value,
}));

import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import RealunitTreasuryScreen from 'src/screens/realunit-treasury.screen';

async function renderScreen() {
  const view = render(<RealunitTreasuryScreen />);
  await waitFor(() => expect(mockGetPrizeWallet).toHaveBeenCalled());
  let wallet: unknown;
  try {
    wallet = await mockGetPrizeWallet.mock.results[0].value;
  } catch {
    wallet = undefined;
  }
  if (wallet) {
    await waitFor(() => {
      if (!screen.queryByText('Bonus and Referral')) return;
      expect(mockListPrizeWalletAlerts).toHaveBeenCalled();
    });
  } else {
    await waitFor(() => {
      expect(screen.queryByText('Prize wallet is not configured') || screen.queryByTestId('error-hint')).toBeTruthy();
    });
  }
  return view;
}

describe('RealunitTreasuryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPrizeWallet.mockResolvedValue({ address: '0xprizewallet', eth: 0.5, realu: 80 });
    mockListPrizeWalletAlerts.mockResolvedValue([]);
    mockCreatePrizeWalletAlert.mockResolvedValue({
      id: 1,
      asset: 'ETH',
      threshold: 0.1,
      mail: 'ops@example.com',
      created: '2026-09-10T00:00:00.000Z',
    });
    mockDeletePrizeWalletAlert.mockResolvedValue(undefined);
  });

  it('calls the realunit guard on render', async () => {
    await renderScreen();
    expect(mockUseRealunitGuard).toHaveBeenCalledWith();
  });

  it('shows the prize wallet address, QR, ETH and REALU', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('prize-qr')).toHaveTextContent('0xprizewallet'));
    expect(screen.getByText('Bonus and Referral')).toBeInTheDocument();
    expect(screen.getAllByText('0xprizewallet').length).toBeGreaterThan(0);
    expect(screen.getByText(/ETH:/)).toBeInTheDocument();
    expect(screen.getByText(/REALU:/)).toBeInTheDocument();
  });

  it('shows the payouts panel with dashboard content', async () => {
    await renderScreen();
    expect(screen.getByTestId('payouts-panel')).toBeInTheDocument();
  });

  it('shows the buy limit panel with dashboard content', async () => {
    await renderScreen();
    expect(screen.getByTestId('buy-limit-panel')).toBeInTheDocument();
  });

  it('shows the low-balance notify button when the prize wallet loaded', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notify on low balance' })).toBeInTheDocument());
    expect(mockListPrizeWalletAlerts).toHaveBeenCalled();
  });

  it('shows a not-configured hint when the prize wallet is missing', async () => {
    mockGetPrizeWallet.mockRejectedValue(new Error('Prize wallet is not configured'));
    await renderScreen();
    await waitFor(() => expect(screen.getByText('Prize wallet is not configured')).toBeInTheDocument());
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.getByTestId('buy-limit-panel')).toBeInTheDocument();
  });

  it('shows an error hint when the prize wallet resolve is empty', async () => {
    mockGetPrizeWallet.mockResolvedValue(undefined);
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });

  it('shows an error hint when the prize wallet request fails', async () => {
    mockGetPrizeWallet.mockRejectedValue(new Error('boom'));
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('boom'));
  });

  it('falls back to Unknown error when the rejection has no message', async () => {
    mockGetPrizeWallet.mockRejectedValue({ message: undefined });
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });

  it('loads the prize wallet only once when StrictMode re-invokes effects', async () => {
    render(
      <StrictMode>
        <RealunitTreasuryScreen />
      </StrictMode>,
    );
    await waitFor(() => expect(mockGetPrizeWallet).toHaveBeenCalledTimes(1));
  });
});
