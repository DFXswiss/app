const mockCheckAddress = jest.fn();
let mockSession: { address?: string; blockchains?: string[] } | undefined;

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum', BITCOIN: 'Bitcoin' },
  SellAddressCheckResult: { OK: 'Ok', LIKELY_RETURN: 'LikelyReturn', UNKNOWN: 'Unknown' },
  useAuthContext: () => ({ session: mockSession }),
  useSell: () => ({ checkAddress: mockCheckAddress }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  IconColor: { RED: 'Red' },
  StyledInfoText: ({ children, iconColor }: any) => (
    <div data-testid="info-text" data-icon-color={iconColor}>
      {children}
    </div>
  ),
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { Blockchain, SellAddressCheckResult } from '@dfx.swiss/react';
import { SellAddressCheckHint } from '../components/sell-address-check-hint';

const BANNER =
  'Warning: According to our blockchain analysis, cryptocurrencies sent from this wallet address will most likely not be processed but returned to you.';

function renderHint(blockchain?: Blockchain) {
  return render(<SellAddressCheckHint blockchain={blockchain} />);
}

describe('SellAddressCheckHint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = { address: '0x1234', blockchains: [Blockchain.ETHEREUM, Blockchain.BITCOIN] };
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the banner when the address is likely to be returned', async () => {
    mockCheckAddress.mockResolvedValue({ result: SellAddressCheckResult.LIKELY_RETURN });

    renderHint(Blockchain.ETHEREUM);

    const hint = await screen.findByTestId('info-text');
    expect(hint).toHaveTextContent(BANNER);
    expect(hint).toHaveAttribute('data-icon-color', 'Red');
    expect(screen.getByTestId('sell-address-check-banner')).toBeInTheDocument();
    expect(mockCheckAddress).toHaveBeenCalledTimes(1);
    expect(mockCheckAddress).toHaveBeenCalledWith(Blockchain.ETHEREUM);
  });

  it('shows no banner when the address check returns Ok', async () => {
    mockCheckAddress.mockResolvedValue({ result: SellAddressCheckResult.OK });

    renderHint(Blockchain.ETHEREUM);

    await waitFor(() => expect(mockCheckAddress).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('info-text')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sell-address-check-banner')).toBeNull();
  });

  it('shows no banner when the address check returns Unknown', async () => {
    mockCheckAddress.mockResolvedValue({ result: SellAddressCheckResult.UNKNOWN });

    renderHint(Blockchain.ETHEREUM);

    await waitFor(() => expect(mockCheckAddress).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('info-text')).not.toBeInTheDocument();
  });

  it('shows no banner when the address check rejects', async () => {
    mockCheckAddress.mockRejectedValue(new Error('request failed'));

    renderHint(Blockchain.ETHEREUM);

    await waitFor(() => expect(mockCheckAddress).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('info-text')).not.toBeInTheDocument();
  });

  it('does not check the address when the session has no address', () => {
    mockSession = undefined;

    renderHint(Blockchain.ETHEREUM);

    expect(mockCheckAddress).not.toHaveBeenCalled();
    expect(screen.queryByTestId('info-text')).not.toBeInTheDocument();
  });

  it('does not check the address when no blockchain is given', () => {
    renderHint(undefined);

    expect(mockCheckAddress).not.toHaveBeenCalled();
    expect(screen.queryByTestId('info-text')).not.toBeInTheDocument();
  });

  it('does not check the address when the blockchain is not part of the session', () => {
    mockSession = { address: '0x1234', blockchains: [Blockchain.BITCOIN] };

    renderHint(Blockchain.ETHEREUM);

    expect(mockCheckAddress).not.toHaveBeenCalled();
    expect(screen.queryByTestId('info-text')).not.toBeInTheDocument();
  });

  it('does not check the address when the session has no blockchains', () => {
    mockSession = { address: '0x1234' };

    renderHint(Blockchain.ETHEREUM);

    expect(mockCheckAddress).not.toHaveBeenCalled();
    expect(screen.queryByTestId('info-text')).not.toBeInTheDocument();
  });

  it('ignores a pending answer that resolves after unmount', async () => {
    let resolveCheck: ((value: { result: string }) => void) | undefined;
    mockCheckAddress.mockReturnValue(
      new Promise<{ result: string }>((resolve) => {
        resolveCheck = resolve;
      }),
    );

    const { unmount } = renderHint(Blockchain.ETHEREUM);
    expect(mockCheckAddress).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      resolveCheck?.({ result: SellAddressCheckResult.LIKELY_RETURN });
      await Promise.resolve();
    });

    expect(screen.queryByTestId('info-text')).not.toBeInTheDocument();
  });

  it('hides the banner when switching to a blockchain whose address check returns Ok', async () => {
    mockCheckAddress.mockImplementation((blockchain: Blockchain) =>
      Promise.resolve({
        result: blockchain === Blockchain.ETHEREUM ? SellAddressCheckResult.LIKELY_RETURN : SellAddressCheckResult.OK,
      }),
    );

    const { rerender } = renderHint(Blockchain.ETHEREUM);
    expect(await screen.findByTestId('info-text')).toHaveTextContent(BANNER);

    rerender(<SellAddressCheckHint blockchain={Blockchain.BITCOIN} />);

    await waitFor(() => expect(screen.queryByTestId('info-text')).not.toBeInTheDocument());
    expect(mockCheckAddress).toHaveBeenLastCalledWith(Blockchain.BITCOIN);
  });
});
