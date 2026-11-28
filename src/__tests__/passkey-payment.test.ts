const mockSend = jest.fn();
const mockBitcoinSend = jest.fn((_session: unknown, _keys: unknown) => ({ send: mockSend }));

jest.mock('../components/home/wallet/wallet-client', () => ({
  createWalletClient: () => ({ bitcoinSend: mockBitcoinSend }),
}));

import { PASSKEY_LOCKED, passkeySend, sendAmount, sendPasskeyPayment } from '../components/home/wallet/passkey-payment';
import { FEE_RATE_TOO_HIGH, FEE_TOO_HIGH } from '../components/home/wallet/passkey-send-review';
import { setOpenPasskey, type OpenPasskey } from '../components/home/wallet/passkey-session';

// What BitcoinSend hands to confirm(): the prepare response (fee rate) and the verified PSBT summary.
function prepared(inputs: number[], fee: number, feeRate: number): unknown {
  return {
    prepare: { feeRate },
    summary: { inputs: inputs.map((amount) => ({ amount: BigInt(amount) })), outputs: [], fee: BigInt(fee) },
  };
}

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
    const loadFees = jest.fn();
    await expect(sendPasskeyPayment('bcrt1qdeposit', 0.001, loadFees)).rejects.toThrow(PASSKEY_LOCKED);
    setOpenPasskey({ ...session, keys: undefined });
    await expect(sendPasskeyPayment('bcrt1qdeposit', 0.001, loadFees)).rejects.toThrow(PASSKEY_LOCKED);
    await expect(passkeySend({ destination: 'x', amount: '1', feeRate: 'fast' }, async () => true)).rejects.toThrow(
      PASSKEY_LOCKED,
    );
    expect(loadFees).not.toHaveBeenCalled();
    expect(mockBitcoinSend).not.toHaveBeenCalled();
  });

  it('sends the sell quote in sats to the deposit address and accepts a fee inside the fast rate', async () => {
    setOpenPasskey(session);
    const loadFees = jest.fn(async () => ({ rates: { fast: 5, normal: 3, slow: 1 } }));
    mockSend.mockImplementation(async (_params: unknown, confirm: (prepared: unknown) => Promise<boolean>) => {
      expect(await confirm(prepared([20000], 141, 3))).toBe(true);
      return { txid: 'txid-1', prepareId: 'p', alreadySubmitted: false };
    });

    await expect(sendPasskeyPayment('bcrt1qdeposit', 0.00012345, loadFees)).resolves.toBe('txid-1');

    expect(loadFees).toHaveBeenCalledWith('BitcoinRegtest');
    expect(mockBitcoinSend).toHaveBeenCalledWith(session, keys);
    expect(mockSend.mock.calls[0][0]).toEqual({
      addresses: ['bcrt1qown0', 'bcrt1qown1', 'bcrt1qown2', 'bcrt1qown3', 'bcrt1qown4'],
      changeAddress: 'bcrt1qown0',
      destination: 'bcrt1qdeposit',
      amount: BigInt(12345),
      feeRate: 'normal',
    });
  });

  it('refuses a sell payment whose fee rate is above the fast rate or whose fee is out of proportion', async () => {
    setOpenPasskey(session);
    const loadFees = jest.fn(async () => ({ rates: { fast: 5, normal: 3, slow: 1 } }));
    let sample = prepared([20000], 141, 50);
    mockSend.mockImplementation(async (_params: unknown, confirm: (p: unknown) => Promise<boolean>) => {
      await confirm(sample);
      return { txid: 'never' };
    });

    await expect(sendPasskeyPayment('bcrt1qdeposit', 0.00012345, loadFees)).rejects.toThrow(FEE_RATE_TOO_HIGH);

    // 2000 sats fee on 12345 sats is above MAX_FEE_SHARE even at a normal rate.
    sample = prepared([20000], 2000, 3);
    await expect(sendPasskeyPayment('bcrt1qdeposit', 0.00012345, loadFees)).rejects.toThrow(FEE_TOO_HIGH);
  });

  it('uses the discovered receive index and passes the confirm callback through', async () => {
    setOpenPasskey({ ...session, receiveIndex: 2, bitcoinNetwork: 'mainnet' });
    const confirm = jest.fn(async () => false);
    mockSend.mockResolvedValue({ txid: 'txid-2' });

    await expect(passkeySend({ destination: 'bc1qdest', amount: 'max', feeRate: 'slow' }, confirm)).resolves.toEqual({
      txid: 'txid-2',
    });

    expect(mockSend.mock.calls[0][0]).toMatchObject({
      changeAddress: 'bcrt1qown2',
      amount: 'max',
      feeRate: 'slow',
    });
    // BitcoinSend derives the blockchain from the ring; the request carries none.
    expect(mockSend.mock.calls[0][0]).not.toHaveProperty('blockchain');
    expect(mockSend.mock.calls[0][0].addresses).toHaveLength(7);
    expect(mockSend.mock.calls[0][1]).toBe(confirm);
  });

  it('converts the sats string to bigint, keeps max and rejects anything else', async () => {
    expect(sendAmount('max')).toBe('max');
    expect(sendAmount('0')).toBe(BigInt(0));
    expect(sendAmount('12345')).toBe(BigInt(12345));
    expect(sendAmount('2100000000000000000')).toBe(BigInt('2100000000000000000'));
    for (const bad of ['', ' 1', '1.5', '-1', '0x10', '1e3', 'MAX']) {
      expect(() => sendAmount(bad)).toThrow('Invalid amount in sats');
    }

    setOpenPasskey(session);
    await expect(passkeySend({ destination: 'x', amount: '1.5', feeRate: 'fast' }, async () => true)).rejects.toThrow(
      'Invalid amount in sats',
    );
    expect(mockSend).not.toHaveBeenCalled();
  });
});
