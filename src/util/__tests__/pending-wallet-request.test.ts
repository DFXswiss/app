import { isPendingWalletRequest, mapWalletErrorMessage, PENDING_WALLET_REQUEST_HINT } from '../pending-wallet-request';

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

describe('isPendingWalletRequest', () => {
  it('recognises the pending-request text only', () => {
    expect(isPendingWalletRequest('Already processing eth_requestAccounts. Please wait.')).toBe(true);
    expect(isPendingWalletRequest('Already processing unlock. Please wait.\n{}')).toBe(false);
  });
});
