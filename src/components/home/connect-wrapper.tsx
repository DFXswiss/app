import { lazy } from 'react';
import { WalletType } from '../../contexts/wallet.context';
import { ConnectProps } from './connect-shared';

const ConnectAlby = lazy(() => import('./wallet/connect-alby'));
const ConnectBitbox = lazy(() => import('./wallet/connect-bitbox'));
const ConnectCli = lazy(() => import('./wallet/connect-cli'));
const ConnectLedger = lazy(() => import('./wallet/connect-ledger'));
const ConnectMetaMask = lazy(() => import('./wallet/connect-metamask'));
const ConnectTrezor = lazy(() => import('./wallet/connect-trezor'));
const ConnectTaro = lazy(() => import('./wallet/connect-taro'));
const ConnectWalletConnect = lazy(() => import('./wallet/connect-wallet-connect'));
const ConnectMonero = lazy(() => import('./wallet/connect-monero'));
const ConnectPhantom = lazy(() => import('./wallet/connect-phantom'));
const ConnectTrustSol = lazy(() => import('./wallet/connect-trust-sol'));
const ConnectTrustTrx = lazy(() => import('./wallet/connect-trust-trx'));
const ConnectTronLinkTrx = lazy(() => import('./wallet/connect-tronlink-trx'));
const ConnectMail = lazy(() => import('./wallet/connect-mail'));
const ConnectAddress = lazy(() => import('./wallet/connect-address'));
const ConnectPasskey = lazy(() => import('./wallet/connect-passkey'));

export function ConnectWrapper(props: ConnectProps): JSX.Element {
  switch (props.wallet) {
    case WalletType.META_MASK:
      return <ConnectMetaMask {...props} />;

    case WalletType.ALBY:
      return <ConnectAlby {...props} />;

    case WalletType.LEDGER_BTC:
    case WalletType.LEDGER_ETH:
      return <ConnectLedger {...props} wallet={props.wallet} />;

    case WalletType.BITBOX_BTC:
    case WalletType.BITBOX_ETH:
      return <ConnectBitbox {...props} wallet={props.wallet} />;

    case WalletType.TREZOR_BTC:
    case WalletType.TREZOR_ETH:
      return <ConnectTrezor {...props} wallet={props.wallet} />;

    case WalletType.CLI_BTC:
    case WalletType.CLI_SPARK:
    case WalletType.CLI_ARK:
    case WalletType.CLI_LN:
    case WalletType.CLI_FIRO:
    case WalletType.CLI_XMR:
    case WalletType.CLI_ZANO:
    case WalletType.CLI_ICP:
    case WalletType.CLI_ETH:
    case WalletType.CLI_ADA:
    case WalletType.CLI_AR:
    case WalletType.CLI_SOL:
    case WalletType.CLI_TRX:
      return <ConnectCli {...props} />;

    case WalletType.DFX_TARO:
      return <ConnectTaro {...props} />;

    case WalletType.WALLET_CONNECT:
      return <ConnectWalletConnect {...props} />;

    case WalletType.CAKE:
    case WalletType.MONERO:
      return <ConnectMonero {...props} wallet={props.wallet} />;

    case WalletType.PHANTOM_SOL:
      return <ConnectPhantom {...props} />;

    case WalletType.TRUST_SOL:
      return <ConnectTrustSol {...props} />;

    case WalletType.TRUST_TRX:
      return <ConnectTrustTrx {...props} />;

    case WalletType.TRONLINK_TRX:
      return <ConnectTronLinkTrx {...props} />;

    case WalletType.MAIL:
      return <ConnectMail {...props} />;

    case WalletType.ADDRESS:
      return <ConnectAddress {...props} />;

    case WalletType.PASSKEY:
      return <ConnectPasskey {...props} />;
  }
}
