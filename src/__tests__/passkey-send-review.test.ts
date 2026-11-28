import {
  FEE_RATE_TOO_HIGH,
  FEE_TOO_HIGH,
  MAX_FEE_SHARE,
  checkPaymentFee,
  sendReview,
} from '../components/home/wallet/passkey-send-review';
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

describe('checkPaymentFee', () => {
  const fees = { rates: { fast: 5, normal: 3, slow: 1 } };
  const review = { destination: 'd', amount: '10000', fee: '141', feeRate: '3', change: '0' };

  it('accepts a fee rate up to the fast rate and a fee up to the share of the amount', () => {
    expect(() => checkPaymentFee(review, fees)).not.toThrow();
    expect(() => checkPaymentFee({ ...review, feeRate: '5', fee: String(10000 * MAX_FEE_SHARE) }, fees)).not.toThrow();
  });

  it('refuses a fee rate above the fast rate or without a usable rate', () => {
    expect(() => checkPaymentFee({ ...review, feeRate: '5.1' }, fees)).toThrow(FEE_RATE_TOO_HIGH);
    expect(() => checkPaymentFee({ ...review, feeRate: 'n/a' }, fees)).toThrow(FEE_RATE_TOO_HIGH);
    expect(() => checkPaymentFee(review, { rates: { ...fees.rates, fast: Number.NaN } })).toThrow(FEE_RATE_TOO_HIGH);
  });

  it('refuses a fee above the share of the amount', () => {
    expect(() => checkPaymentFee({ ...review, fee: '1001' }, fees)).toThrow(FEE_TOO_HIGH);
  });
});
