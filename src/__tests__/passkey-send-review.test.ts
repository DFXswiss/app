import {
  FEE_RATE_TOO_HIGH,
  FEE_TOO_HIGH,
  MAX_FEE_SHARE,
  checkPaymentFee,
  estimatedVsize,
  sendReview,
} from '../components/home/wallet/passkey-send-review';
import type { PreparedBitcoinSend } from '../components/home/wallet/wallet-client';

// A verified PSBT summary with the given input amounts, output count and fee. `feeRate` is what
// wallet-api reports in its prepare response; the device must not rely on it.
function prepared(inputs: number[], fee: number, outputs = 2, feeRate = 3): PreparedBitcoinSend {
  return {
    prepare: { feeRate },
    summary: {
      network: 'regtest',
      inputs: inputs.map((amount, vout) => ({ txid: 'tx', vout, amount: BigInt(amount), path: `m/84'/1'/0'/0/${vout}` })),
      outputs: Array.from({ length: outputs }, (_, index) => ({ address: `out${index}`, amount: BigInt(1) })),
      fee: BigInt(fee),
    },
  } as unknown as PreparedBitcoinSend;
}

describe('estimatedVsize', () => {
  it('bounds a P2WPKH transaction from above by its input and output counts', () => {
    expect(estimatedVsize(1, 1)).toBe(122);
    expect(estimatedVsize(1, 2)).toBe(165);
    expect(estimatedVsize(2, 2)).toBe(233);
  });
});

describe('sendReview', () => {
  it('shows the requested amount, the rest of the PSBT inputs as change and the PSBT fee rate', () => {
    // 141 sats over 11 + 2·68 + 2·43 = 233 vB.
    expect(sendReview(prepared([10000, 5000], 141), { destination: 'bcrt1qdest', amount: '12000' })).toEqual({
      destination: 'bcrt1qdest',
      amount: '12000',
      fee: '141',
      feeRate: '0.6',
      change: '2859',
    });
  });

  it('shows everything spendable and no change for max', () => {
    // 141 sats over 11 + 2·68 + 43 = 190 vB.
    expect(sendReview(prepared([10000, 5000], 141, 1), { destination: 'bcrt1qdest', amount: 'max' })).toEqual({
      destination: 'bcrt1qdest',
      amount: '14859',
      fee: '141',
      feeRate: '0.7',
      change: '0',
    });
  });

  it('ignores the fee rate wallet-api reports in its prepare response', () => {
    // 1650 sats over 165 vB is 10 sat/vB, whatever the prepare response says.
    expect(sendReview(prepared([20000], 1650, 2, 1), { destination: 'd', amount: '10000' }).feeRate).toBe('10');
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
  const input = { destination: 'd', amount: '10000' };
  // One P2WPKH input, destination and change: estimatedVsize(1, 2) = 165 vB, so `fast` allows 825 sats.
  const fastFee = 5 * 165;

  it('accepts a PSBT at a normal rate and up to the fast rate, and returns its review', () => {
    expect(checkPaymentFee(prepared([20000], 141), input, fees)).toEqual({
      destination: 'd',
      amount: '10000',
      fee: '141',
      feeRate: '0.9',
      change: '9859',
    });
    expect(() => checkPaymentFee(prepared([20000], fastFee), input, fees)).not.toThrow();
    expect(fastFee).toBeLessThanOrEqual(10000 * MAX_FEE_SHARE);
  });

  it('refuses a PSBT whose own fee exceeds the fast rate while wallet-api reports a low rate', () => {
    expect(() => checkPaymentFee(prepared([20000], fastFee + 1, 2, 3), input, fees)).toThrow(FEE_RATE_TOO_HIGH);
    // 1 BTC sell with a 0.01 BTC fee: inside MAX_FEE_SHARE, but far above fast × vsize.
    expect(() =>
      checkPaymentFee(prepared([110000000], 1000000, 2, 3), { destination: 'd', amount: '100000000' }, fees),
    ).toThrow(FEE_RATE_TOO_HIGH);
  });

  it('refuses without a usable fast rate', () => {
    expect(() => checkPaymentFee(prepared([20000], 141), input, { rates: { ...fees.rates, fast: Number.NaN } })).toThrow(
      FEE_RATE_TOO_HIGH,
    );
  });

  it('refuses a fee above the share of the amount even inside the fast rate', () => {
    // 141 sats is inside 825, but above 10 % of 1000 sats.
    expect(() => checkPaymentFee(prepared([20000], 141), { destination: 'd', amount: '1000' }, fees)).toThrow(
      FEE_TOO_HIGH,
    );
  });
});
