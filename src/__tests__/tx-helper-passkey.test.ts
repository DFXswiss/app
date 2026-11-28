const mockSendPasskeyPayment = jest.fn();
let mockActiveWallet: string | undefined = 'Passkey';

jest.mock('@dfx.swiss/react', () => ({
  useAuthContext: () => ({ session: { address: 'bcrt1qlogin0' } }),
  useSell: () => ({ confirmSell: jest.fn() }),
  useSwap: () => ({ confirmSwap: jest.fn() }),
}));
jest.mock('../components/home/wallet/passkey-payment', () => ({
  sendPasskeyPayment: (...args: unknown[]) => mockSendPasskeyPayment(...args),
}));
jest.mock('../contexts/app-handling.context', () => ({ useAppHandlingContext: () => ({ canClose: false }) }));
jest.mock('../contexts/balance.context', () => ({ useBalanceContext: () => ({ getBalances: jest.fn() }) }));
jest.mock('../contexts/wallet.context', () => ({
  WalletType: {
    META_MASK: 'MetaMask',
    ALBY: 'Alby',
    WALLET_CONNECT: 'WalletConnect',
    PHANTOM_SOL: 'PhantomSol',
    TRUST_SOL: 'TrustSol',
    TRUST_TRX: 'TrustTrx',
    TRONLINK_TRX: 'TronLinkTrx',
    LEDGER_ETH: 'LedgerEth',
    TREZOR_ETH: 'TrezorEth',
    BITBOX_ETH: 'BitBoxEth',
    CLI_ETH: 'CliEth',
    CLI_SOL: 'CliSol',
    CLI_TRX: 'CliTrx',
    PASSKEY: 'Passkey',
  },
  useWalletContext: () => ({ activeWallet: mockActiveWallet }),
}));
jest.mock('../hooks/blockchain-balance.hook', () => ({ useBlockchainBalance: () => ({ getAddressBalances: jest.fn() }) }));
jest.mock('../hooks/wallets/alby.hook', () => ({ useAlby: () => ({ sendPayment: jest.fn() }) }));
jest.mock('../hooks/wallets/metamask.hook', () => ({
  useMetaMask: () => ({
    createTransaction: jest.fn(),
    requestChangeToBlockchain: jest.fn(),
    sendCallsWithPaymaster: jest.fn(),
    signEip7702Authorization: jest.fn(),
  }),
}));
jest.mock('../hooks/wallets/phantom.hook', () => ({ usePhantom: () => ({ createTransaction: jest.fn() }) }));
jest.mock('../hooks/wallets/tronlink-trx.hook', () => ({ useTronLinkTrx: () => ({ createTransaction: jest.fn() }) }));
jest.mock('../hooks/wallets/trust-sol.hook', () => ({ useTrustSol: () => ({ createTransaction: jest.fn() }) }));
jest.mock('../hooks/wallets/trust-trx.hook', () => ({ useTrustTrx: () => ({ createTransaction: jest.fn() }) }));
jest.mock('../hooks/wallets/wallet-connect.hook', () => ({
  useWalletConnect: () => ({ createTransaction: jest.fn(), requestChangeToBlockchain: jest.fn() }),
}));

import { renderHook } from '@testing-library/react';
import { useTxHelper } from '../hooks/tx-helper.hook';

describe('useTxHelper with the passkey wallet', () => {
  beforeEach(() => {
    mockActiveWallet = 'Passkey';
  });

  it('can send and pays the sell deposit address from the passkey wallet', async () => {
    mockSendPasskeyPayment.mockResolvedValue('txid-1');
    const { result } = renderHook(() => useTxHelper());

    expect(result.current.canSendTransaction()).toBe(true);
    await expect(
      result.current.sendTransaction({
        id: 1,
        routeId: 2,
        amount: 0.001,
        depositAddress: 'bcrt1qdeposit',
        asset: { blockchain: 'BitcoinRegtest' },
      } as never),
    ).resolves.toBe('txid-1');
    expect(mockSendPasskeyPayment).toHaveBeenCalledWith('bcrt1qdeposit', 0.001);
  });

  it('has no balance source for the passkey wallet', async () => {
    const { result } = renderHook(() => useTxHelper());
    await expect(result.current.getBalances([], 'bcrt1qlogin0', 'BitcoinRegtest' as never)).resolves.toBeUndefined();
  });
});
