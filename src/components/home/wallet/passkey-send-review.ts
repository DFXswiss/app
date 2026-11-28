import BigNumber from 'bignumber.js';
import type { SendFees, SendInput, SendReview } from './passkey-transfer';
import type { PreparedBitcoinSend } from './wallet-client';

// Highest share of the paid amount a payment without a review screen (sell, swap) may spend as fee.
export const MAX_FEE_SHARE = 0.1;
export const FEE_RATE_TOO_HIGH = 'The network fee rate of this payment is above the current fast rate.';
export const FEE_TOO_HIGH = 'The network fee of this payment is too high for its amount.';

const sats = (value: number | string | bigint): string => value.toString();

// Same rule as sendAmount() in passkey-payment: 'max' or plain digits of sats, nothing else.
function requestedSats(amount: string): bigint | 'max' {
  if (amount === 'max') return 'max';
  if (!/^\d+$/.test(amount)) throw new Error(`Invalid amount in sats: ${amount}`);
  return BigInt(amount);
}

// The confirm screen shows what the SDK verified. BitcoinSend checks the PSBT against the request
// before confirm() runs: it pays exactly the requested amount (or, for `max`, everything without
// change) to the requested destination and the rest back to the own change address. So destination
// and amount are the request's, the fee is the PSBT's (inputs minus outputs), and the change is what
// is left of the PSBT inputs. Only the fee rate (sat/vB) comes from the prepare response.
export function sendReview(prepared: PreparedBitcoinSend, input: Pick<SendInput, 'destination' | 'amount'>): SendReview {
  const { summary, prepare } = prepared;
  const spent = summary.inputs.reduce((total, row) => total + row.amount, BigInt(0)) - summary.fee;
  const requested = requestedSats(input.amount);
  const amount = requested === 'max' ? spent : requested;
  const change = spent - amount;
  if (amount < BigInt(0) || change < BigInt(0)) throw new Error('The prepared payment does not match the request.');
  return {
    destination: input.destination,
    amount: sats(amount),
    fee: sats(summary.fee),
    feeRate: sats(prepare.feeRate),
    change: sats(change),
  };
}

// Sell and swap sign without the desk's review screen, so the reviewed payment must stay inside
// what wallet-api itself quotes: a fee rate not above its current `fast` rate, and a fee of at most
// MAX_FEE_SHARE of the amount. Fails closed when the fast rate is not a usable number.
export function checkPaymentFee(review: SendReview, fees: SendFees): void {
  const fast = new BigNumber(fees.rates.fast);
  const rate = new BigNumber(review.feeRate);
  if (!fast.isFinite() || !rate.isFinite() || rate.gt(fast)) throw new Error(FEE_RATE_TOO_HIGH);
  if (new BigNumber(review.fee).gt(new BigNumber(review.amount).times(MAX_FEE_SHARE))) throw new Error(FEE_TOO_HIGH);
}
