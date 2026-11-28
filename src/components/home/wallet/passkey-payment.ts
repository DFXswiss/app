import { bitcoinBlockchain, satsFromBtc, sendAddresses, type PasskeyBitcoinBlockchain } from './passkey-bitcoin';
import { checkPaymentFee, sendReview } from './passkey-send-review';
import { getOpenPasskey } from './passkey-session';
import type { SendFees, SendInput } from './passkey-transfer';
import { createWalletClient, type BitcoinSendConfirm, type BitcoinSendParams } from './wallet-client';

export const PASSKEY_LOCKED = 'Open your passkey wallet first.';

export type LoadBitcoinFees = (blockchain: PasskeyBitcoinBlockchain) => Promise<SendFees>;

// Sell and swap send the quoted amount to the DFX deposit address from the passkey wallet.
// wallet-api prepares the payment; before confirm() runs, the SDK checks that the PSBT pays exactly
// the requested amount to the deposit address and the rest to the own change address. That check
// does not bound the fee (inputs minus outputs), and the sell screen shows none. So confirm()
// computes the same review as the desk send and refuses it unless the fee rate is not above
// wallet-api's current `fast` rate and the fee stays within MAX_FEE_SHARE of the amount.
export async function sendPasskeyPayment(
  depositAddress: string,
  amountBtc: number | string,
  loadFees: LoadBitcoinFees,
): Promise<string> {
  const session = getOpenPasskey();
  if (!session?.keys) throw new Error(PASSKEY_LOCKED);
  const fees = await loadFees(bitcoinBlockchain(session.bitcoinNetwork));
  const input: SendInput = { destination: depositAddress, amount: satsFromBtc(amountBtc), feeRate: 'normal' };
  const result = await passkeySend(input, async (prepared) => {
    checkPaymentFee(sendReview(prepared, input), fees);
    return true;
  });
  return result.txid;
}

// The app carries amounts as a decimal string of sats (or 'max'); BitcoinSend takes sats as
// bigint so no precision is lost. Anything other than plain digits is rejected, because BigInt()
// would also accept '', whitespace or hex literals.
export function sendAmount(amount: string): bigint | 'max' {
  if (amount === 'max') return 'max';
  if (!/^\d+$/.test(amount)) throw new Error(`Invalid amount in sats: ${amount}`);
  return BigInt(amount);
}

// One send path for the desk and for sell/swap. The request names the own addresses wallet-api may
// spend and the change address; prepare, verification, signing and submit run in BitcoinSend.
export async function passkeySend(
  input: { destination: string; amount: string; feeRate: 'fast' | 'normal' | 'slow' },
  confirm: BitcoinSendConfirm,
): Promise<{ txid: string; alreadySubmitted?: boolean }> {
  const session = getOpenPasskey();
  if (!session?.keys) throw new Error(PASSKEY_LOCKED);
  const keys = session.keys;
  // No blockchain in the request: BitcoinSend takes it from the ring's Bitcoin network.
  const params: BitcoinSendParams = {
    ...sendAddresses(keys, session.receiveIndex ?? 0),
    destination: input.destination,
    amount: sendAmount(input.amount),
    feeRate: input.feeRate,
  };
  return createWalletClient().bitcoinSend(session, keys).send(params, confirm);
}
