import { bitcoinBlockchain, satsFromBtc, sendAddresses } from './passkey-bitcoin';
import { getOpenPasskey } from './passkey-session';
import { createWalletClient, type BitcoinSendConfirm, type BitcoinSendParams } from './wallet-client';

export const PASSKEY_LOCKED = 'Open your passkey wallet first.';

// Sell and swap send the quoted amount to the DFX deposit address from the passkey wallet.
// wallet-api prepares the payment; the SDK checks inputs, outputs, amount and fee against this
// request before the device signs, so a payment to any other address or amount is rejected.
// The user already confirmed amount and deposit address on the sell screen, so confirm() accepts.
export async function sendPasskeyPayment(depositAddress: string, amountBtc: number | string): Promise<string> {
  const result = await passkeySend(
    { destination: depositAddress, amount: satsFromBtc(amountBtc), feeRate: 'normal' },
    async () => true,
  );
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
  const params: BitcoinSendParams = {
    blockchain: bitcoinBlockchain(session.bitcoinNetwork),
    ...sendAddresses(keys, session.receiveIndex ?? 0),
    destination: input.destination,
    amount: sendAmount(input.amount),
    feeRate: input.feeRate,
  };
  return createWalletClient().bitcoinSend(session, keys).send(params, confirm);
}
