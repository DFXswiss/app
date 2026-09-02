import { AbortError } from '../util/abort-error';
import { TranslatedError } from '../util/translated-error';
import { resolveWalletTxError } from '../util/wallet-tx-error';

describe('resolveWalletTxError', () => {
  it('treats an EIP-1193 user rejection (code 4001) as a silent cancel', () => {
    expect(resolveWalletTxError({ code: 4001, message: 'User rejected' })).toEqual({ cancelled: true });
  });

  it('treats an AbortError as a silent cancel', () => {
    expect(resolveWalletTxError(new AbortError('User cancelled'))).toEqual({ cancelled: true });
  });

  it('surfaces the message of a TranslatedError as the key to display', () => {
    const message = 'There is already a request pending. Please confirm it in your MetaMask and retry.';
    expect(resolveWalletTxError(new TranslatedError(message))).toEqual({ cancelled: false, messageKey: message });
  });

  it('keeps the generic fallback for an unknown error (no message surfaced)', () => {
    expect(resolveWalletTxError(new Error('insufficient funds for intrinsic transaction cost'))).toEqual({
      cancelled: false,
    });
  });

  it('keeps the generic fallback for a TranslatedError without a message', () => {
    expect(resolveWalletTxError(new TranslatedError(''))).toEqual({ cancelled: false });
  });

  it('does not throw on null or undefined', () => {
    expect(resolveWalletTxError(null)).toEqual({ cancelled: false });
    expect(resolveWalletTxError(undefined)).toEqual({ cancelled: false });
  });
});
