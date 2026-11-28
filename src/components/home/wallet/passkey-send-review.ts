import type { SendReview } from './passkey-transfer';
import type { PreparedBitcoinSend } from './wallet-client';

const sats = (value: number | string | bigint): string => value.toString();

// The confirm screen shows what the SDK verified against the request: destination, amount, fee and
// change come from the verified summary; the fee rate (sat/vB) is only in the prepare response.
export function sendReview(prepared: PreparedBitcoinSend): SendReview {
  const { summary, prepare } = prepared;
  return {
    destination: summary.destination,
    amount: sats(summary.amount),
    fee: sats(summary.fee),
    feeRate: sats(prepare.feeRate),
    change: sats(summary.change),
  };
}
