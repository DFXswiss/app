import { sendReview } from '../components/home/wallet/passkey-send-review';
import type { PreparedBitcoinSend } from '../components/home/wallet/wallet-client';

function prepared(inputs: number[], fee: number, feeRate = 3): PreparedBitcoinSend {
  return {
    prepare: { feeRate },
    summary: {
      network: 'regtest',
      inputs: inputs.map((amount, vout) => ({ txid: 'tx', vout, amount: BigInt(amount), path: `m/84'/1'/0'/0/${vout}` })),
      outputs: [],
      fee: BigInt(fee),
    },
  } as unknown as PreparedBitcoinSend;
}

describe('sendReview', () => {
  it('shows the requested amount and the rest of the PSBT inputs as change', () => {
    expect(sendReview(prepared([10000, 5000], 141), { destination: 'bcrt1qdest', amount: '12000' })).toEqual({
      destination: 'bcrt1qdest',
      amount: '12000',
      fee: '141',
      feeRate: '3',
      change: '2859',
    });
  });

  it('shows everything spendable and no change for max', () => {
    expect(sendReview(prepared([10000, 5000], 141), { destination: 'bcrt1qdest', amount: 'max' })).toEqual({
      destination: 'bcrt1qdest',
      amount: '14859',
      fee: '141',
      feeRate: '3',
      change: '0',
    });
  });

  it('refuses a PSBT that cannot pay the requested amount and an invalid amount', () => {
    expect(() => sendReview(prepared([1000], 141), { destination: 'd', amount: '900' })).toThrow(
      'The prepared payment does not match the request.',
    );
    expect(() => sendReview(prepared([100], 141), { destination: 'd', amount: 'max' })).toThrow(
      'The prepared payment does not match the request.',
    );
    expect(() => sendReview(prepared([1000], 141), { destination: 'd', amount: '1.5' })).toThrow(
      'Invalid amount in sats',
    );
  });
});
