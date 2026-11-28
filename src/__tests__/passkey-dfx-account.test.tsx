const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockSign = jest.fn();
let mockActiveWallet: string | undefined;
let mockLoggedIn = false;
let mockSessionAddress: string | undefined;

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { BITCOIN: 'Bitcoin' },
  useAuthContext: () => ({ session: mockSessionAddress ? { address: mockSessionAddress } : undefined }),
  useSessionContext: () => ({ isLoggedIn: mockLoggedIn, logout: mockLogout }),
}));

jest.mock('@dfx.swiss/wallet', () => ({
  signBitcoinMessage: (...args: unknown[]) => mockSign(...args),
}));

jest.mock('../contexts/wallet.context', () => ({
  WalletType: { PASSKEY: 'Passkey', META_MASK: 'MetaMask' },
  useWalletContext: () => ({ login: mockLogin, activeWallet: mockActiveWallet }),
}));

import { renderHook } from '@testing-library/react';
import { DFX_LOGIN_INDEX, usePasskeyDfxAccount } from '../components/home/wallet/passkey-dfx-account';

const keys = { bitcoinAddress: (_account: number, index: number) => ({ address: `bcrt1qlogin${index}` }) } as never;

describe('usePasskeyDfxAccount', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockLogout.mockReset();
    mockSign.mockReset();
    mockActiveWallet = undefined;
    mockLoggedIn = false;
    mockSessionAddress = undefined;
  });

  it('signs in to DFX with receive address 0 and signs the message on the device', async () => {
    mockSign.mockResolvedValue('bip322-signature');
    mockLogin.mockImplementation(
      async (_wallet: string, address: string, _chain: string, sign: (a: string, m: string) => Promise<string>) => {
        expect(await sign(address, 'message to sign')).toBe('bip322-signature');
      },
    );
    const { result } = renderHook(() => usePasskeyDfxAccount());

    await result.current.connect(keys);

    expect(mockLogin).toHaveBeenCalledWith('Passkey', 'bcrt1qlogin0', 'Bitcoin', expect.any(Function));
    expect(mockSign).toHaveBeenCalledWith(keys, DFX_LOGIN_INDEX, 'message to sign');
  });

  it('keeps an open DFX session of the same passkey address', async () => {
    mockLoggedIn = true;
    mockActiveWallet = 'Passkey';
    mockSessionAddress = 'bcrt1qlogin0';
    const { result } = renderHook(() => usePasskeyDfxAccount());

    await result.current.connect(keys);

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it.each([
    ['another wallet', true, 'MetaMask', 'bcrt1qlogin0'],
    ['another address', true, 'Passkey', 'bcrt1qother'],
    ['no session', false, 'Passkey', 'bcrt1qlogin0'],
  ])('signs in again with %s', async (_name, loggedIn, wallet, address) => {
    mockLoggedIn = loggedIn;
    mockActiveWallet = wallet;
    mockSessionAddress = address;
    const { result } = renderHook(() => usePasskeyDfxAccount());

    await result.current.connect(keys);

    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  it('ends only the DFX session of the passkey wallet', async () => {
    const { result, rerender } = renderHook(() => usePasskeyDfxAccount());
    mockActiveWallet = 'MetaMask';
    rerender();
    await result.current.disconnect();
    expect(mockLogout).not.toHaveBeenCalled();

    mockActiveWallet = 'Passkey';
    rerender();
    await result.current.disconnect();
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
