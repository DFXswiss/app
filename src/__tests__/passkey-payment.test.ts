const mockSend = jest.fn();
const mockBitcoinSend = jest.fn((_session: unknown, _keys: unknown) => ({ send: mockSend }));

jest.mock('../components/home/wallet/wallet-client', () => ({
  createWalletClient: () => ({ bitcoinSend: mockBitcoinSend }),
}));

import { PASSKEY_LOCKED, passkeySend, sendPasskeyPayment } from '../components/home/wallet/passkey-payment';
import { setOpenPasskey, type OpenPasskey } from '../components/home/wallet/passkey-session';

const keys = {
  bitcoinAddress: (_account: number, index: number) => ({ address: `bcrt1qown${index}` }),
} as unknown as NonNullable<OpenPasskey['keys']>;

const session: OpenPasskey = { token: 'wallet-token', credentialId: 'cred', keys, bitcoinNetwork: 'regtest' };

describe('passkey payment', () => {
  beforeEach(() => {
    // CRA's Jest config resets mock implementations before each test.
    mockSend.mockReset();
    mockBitcoinSend.mockImplementation(() => ({ send: mockSend }));
    setOpenPasskey(undefined);
  });

  it('refuses without an unlocked passkey wallet', async () => {
    await expect(sendPasskeyPayment('bcrt1qdeposit', 0.001)).rejects.toThrow(PASSKEY_LOCKED);
    setOpenPasskey({ ...session, keys: undefined });
    await expect(passkeySend({ destination: 'x', amount: '1', feeRate: 'fast' }, async () => true)).rejects.toThrow(
      PASSKEY_LOCKED,
    );
    expect(mockBitcoinSend).not.toHaveBeenCalled();
  });

  it('sends the sell quote in sats to the deposit address and accepts the verified summary', async () => {
    setOpenPasskey(session);
    mockSend.mockImplementation(async (_params: unknown, confirm: (prepared: unknown) => Promise<boolean>) => {
      expect(await confirm({ fee: 141 })).toBe(true);
      return { txid: 'txid-1', prepareId: 'p', alreadySubmitted: false };
    });

    await expect(sendPasskeyPayment('bcrt1qdeposit', 0.00012345)).resolves.toBe('txid-1');

    expect(mockBitcoinSend).toHaveBeenCalledWith(session, keys);
    expect(mockSend.mock.calls[0][0]).toEqual({
      blockchain: 'BitcoinRegtest',
      addresses: ['bcrt1qown0', 'bcrt1qown1', 'bcrt1qown2', 'bcrt1qown3', 'bcrt1qown4'],
      changeAddress: 'bcrt1qown0',
      destination: 'bcrt1qdeposit',
      amount: '12345',
      feeRate: 'normal',
    });
  });

  it('uses the discovered receive index and passes the confirm callback through', async () => {
    setOpenPasskey({ ...session, receiveIndex: 2, bitcoinNetwork: 'mainnet' });
    const confirm = jest.fn(async () => false);
    mockSend.mockResolvedValue({ txid: 'txid-2' });

    await expect(passkeySend({ destination: 'bc1qdest', amount: 'max', feeRate: 'slow' }, confirm)).resolves.toEqual({
      txid: 'txid-2',
    });

    expect(mockSend.mock.calls[0][0]).toMatchObject({
      blockchain: 'Bitcoin',
      changeAddress: 'bcrt1qown2',
      amount: 'max',
      feeRate: 'slow',
    });
    expect(mockSend.mock.calls[0][0].addresses).toHaveLength(7);
    expect(mockSend.mock.calls[0][1]).toBe(confirm);
  });
});
