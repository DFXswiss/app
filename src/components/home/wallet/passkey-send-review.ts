import type { SendInput, SendReview } from './passkey-transfer';
import type { PreparedBitcoinSend } from './wallet-client';

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
