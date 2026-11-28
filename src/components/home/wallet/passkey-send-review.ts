import BigNumber from 'bignumber.js';
import type { SendFees, SendInput, SendReview } from './passkey-transfer';
import type { PreparedBitcoinSend } from './wallet-client';

// Highest share of the paid amount a payment without a review screen (sell, swap) may spend as fee.
export const MAX_FEE_SHARE = 0.1;
export const FEE_RATE_TOO_HIGH = 'The network fee rate of this payment is above the current fast rate.';
export const FEE_TOO_HIGH = 'The network fee of this payment is too high for its amount.';

// vsize in vB the device assumes for the PSBT, from its input and output counts alone. The ring spends
// P2WPKH inputs only (68 vB each, signature included); 43 vB per output covers a P2TR output, the
// largest destination type, and 11 vB covers version, locktime, counts and the segwit marker. Real
// P2WPKH transactions are a little smaller (10.5 vB overhead, 31 vB per P2WPKH output), so this is an
// upper bound. That gap is the documented tolerance of the fee-rate check: the rate the network sees
// can exceed fee ÷ this vsize by at most 12 vB per non-P2TR output plus 0.5 vB, priced at that rate.
export function estimatedVsize(inputs: number, outputs: number): number {
  return 11 + 68 * inputs + 43 * outputs;
}

const sats = (value: number | string | bigint): string => value.toString();

// Same rule as sendAmount() in passkey-payment: 'max' or plain digits of sats, nothing else.
function requestedSats(amount: string): bigint | 'max' {
  if (amount === 'max') return 'max';
  if (!/^\d+$/.test(amount)) throw new Error(`Invalid amount in sats: ${amount}`);
  return BigInt(amount);
}

function psbtVsize({ summary }: PreparedBitcoinSend): number {
  return estimatedVsize(summary.inputs.length, summary.outputs.length);
}

// The confirm screen shows what the SDK verified. BitcoinSend checks the PSBT against the request
// before confirm() runs: it pays exactly the requested amount (or, for `max`, everything without
// change) to the requested destination and the rest back to the own change address. So destination
// and amount are the request's, the fee is the PSBT's (inputs minus outputs), and the change is what
// is left of the PSBT inputs. The fee rate (sat/vB) is the PSBT's too: its fee divided by
// estimatedVsize(), rounded to one decimal. The rate in wallet-api's prepare response is not used,
// because nothing ties it to the PSBT.
export function sendReview(prepared: PreparedBitcoinSend, input: Pick<SendInput, 'destination' | 'amount'>): SendReview {
  const { summary } = prepared;
  const spent = summary.inputs.reduce((total, row) => total + row.amount, BigInt(0)) - summary.fee;
  const requested = requestedSats(input.amount);
  const amount = requested === 'max' ? spent : requested;
  const change = spent - amount;
  if (amount < BigInt(0) || change < BigInt(0)) throw new Error('The prepared payment does not match the request.');
  const feeRate = new BigNumber(sats(summary.fee)).div(psbtVsize(prepared));
  return {
    destination: input.destination,
    amount: sats(amount),
    fee: sats(summary.fee),
    feeRate: feeRate.decimalPlaces(1, BigNumber.ROUND_HALF_UP).toString(),
    change: sats(change),
  };
}

// Sell and swap sign without the desk's review screen, so the PSBT must stay inside what wallet-api
// itself quotes. Both limits are taken from the PSBT, not from the prepare response: its fee may not
// exceed the `fast` rate times estimatedVsize() (so its effective rate is not above `fast`, within the
// tolerance documented there), and it may not exceed MAX_FEE_SHARE of the amount. Fails closed when
// the fast rate is not a usable number. Returns the review it checked.
export function checkPaymentFee(
  prepared: PreparedBitcoinSend,
  input: Pick<SendInput, 'destination' | 'amount'>,
  fees: SendFees,
): SendReview {
  const review = sendReview(prepared, input);
  const fast = new BigNumber(fees.rates.fast);
  const fee = new BigNumber(review.fee);
  if (!fast.isFinite() || fee.gt(fast.times(psbtVsize(prepared)))) throw new Error(FEE_RATE_TOO_HIGH);
  if (fee.gt(new BigNumber(review.amount).times(MAX_FEE_SHARE))) throw new Error(FEE_TOO_HIGH);
  return review;
}
