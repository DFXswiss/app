import { Blockchain, useAuthContext, useSessionContext } from '@dfx.swiss/react';
import { signBitcoinMessage, type KeyRing } from '@dfx.swiss/wallet';
import { WalletType, useWalletContext } from '../../../contexts/wallet.context';
import { receiveAddress } from './passkey-bitcoin';

// The DFX login address of the passkey wallet: BIP-84 receive index 0 on the ring's network
// (bcrt1q… on DEV/STG). Buy pays out to this address; sell sends from the wallet's own addresses.
export const DFX_LOGIN_INDEX = 0;

export interface PasskeyDfxAccount {
  // Signs in to the DFX API with the passkey Bitcoin address unless that session is already open.
  connect: (keys: KeyRing) => Promise<void>;
  // Ends the DFX session only when it belongs to the passkey wallet.
  disconnect: () => Promise<void>;
}

// Buy, sell and KYC stay on the DFX API, so the passkey wallet needs a DFX customer session next to its
// wallet-api session. The two tokens are separate: this one is the SDK customer session.
export function usePasskeyDfxAccount(): PasskeyDfxAccount {
  const { login, activeWallet } = useWalletContext();
  const { session } = useAuthContext();
  const { isLoggedIn, logout } = useSessionContext();

  async function connect(keys: KeyRing): Promise<void> {
    const address = receiveAddress(keys, DFX_LOGIN_INDEX);
    if (isLoggedIn && activeWallet === WalletType.PASSKEY && session?.address === address) return;
    // The signature is made on this device (BIP-322 for the P2WPKH address); the key stays in the ring.
    await login(WalletType.PASSKEY, address, Blockchain.BITCOIN, async (_address, message) =>
      signBitcoinMessage(keys, DFX_LOGIN_INDEX, message),
    );
  }

  async function disconnect(): Promise<void> {
    if (activeWallet !== WalletType.PASSKEY) return;
    await logout();
  }

  return { connect, disconnect };
}
