import { PENDING_WALLET_REQUEST_HINT, mapWalletErrorMessage } from '../pending-wallet-request';

describe('mapWalletErrorMessage', () => {
  it('maps a pending connect to the hint', () => {
    expect(mapWalletErrorMessage('Already processing connect. Please wait.')).toBe(
      'Please confirm or close the pending request in your wallet.',
    );
  });

  it('maps a pending unlock to the hint', () => {
    expect(mapWalletErrorMessage('Already processing unlock. Please wait.')).toBe(PENDING_WALLET_REQUEST_HINT);
  });

  it('keeps any other message unchanged', () => {
    expect(mapWalletErrorMessage('No public key found')).toBe('No public key found');
    expect(mapWalletErrorMessage('Error: Already processing connect. Please wait.')).toBe(
      'Error: Already processing connect. Please wait.',
    );
  });
});
