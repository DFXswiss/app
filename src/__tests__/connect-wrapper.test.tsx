const mockOnLogin = jest.fn();
const mockOnCancel = jest.fn();
const mockOnSwitch = jest.fn();
const mockBlockchain = 'Ethereum';

function mockMarker(name: string) {
  return {
    __esModule: true,
    default: (props: { wallet: string; blockchain?: string; isConnect: boolean; onCancel: () => void }) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const React = require('react');
      return React.createElement(
        'div',
        null,
        React.createElement('span', null, `${name}:${props.wallet}:${props.blockchain}:${props.isConnect}`),
        React.createElement('button', { type: 'button', onClick: props.onCancel }, `cancel-${name}`),
      );
    },
  };
}

jest.mock('../contexts/wallet.context', () => ({
  WalletType: {
    META_MASK: 'MetaMask',
    LEDGER_BTC: 'LedgerBtc',
    LEDGER_ETH: 'LedgerEth',
    BITBOX_BTC: 'BitBoxBtc',
    BITBOX_ETH: 'BitBoxEth',
    TREZOR_BTC: 'TrezorBtc',
    TREZOR_ETH: 'TrezorEth',
    CLI_BTC: 'CliBtc',
    CLI_SPARK: 'CliSpark',
    CLI_ARK: 'CliArk',
    CLI_FIRO: 'CliFiro',
    CLI_XMR: 'CliXmr',
    CLI_ZANO: 'CliZano',
    CLI_ICP: 'CliIcp',
    CLI_ETH: 'CliEth',
    CLI_ADA: 'CliAda',
    CLI_AR: 'CliAr',
    CLI_LN: 'CliLn',
    CLI_SOL: 'CliSol',
    CLI_TRX: 'CliTrx',
    DFX_TARO: 'DfxTaro',
    WALLET_CONNECT: 'WalletConnect',
    CAKE: 'Cake',
    MONERO: 'Monero',
    PHANTOM_SOL: 'PhantomSol',
    TRUST_SOL: 'TrustSol',
    TRUST_TRX: 'TrustTrx',
    TRONLINK_TRX: 'TronLinkTrx',
    MAIL: 'Mail',
    ADDRESS: 'Address',
  },
}));

jest.mock('../components/home/wallet/connect-metamask', () => mockMarker('metamask'));
jest.mock('../components/home/wallet/connect-ledger', () => mockMarker('ledger'));
jest.mock('../components/home/wallet/connect-bitbox', () => mockMarker('bitbox'));
jest.mock('../components/home/wallet/connect-trezor', () => mockMarker('trezor'));
jest.mock('../components/home/wallet/connect-cli', () => mockMarker('cli'));
jest.mock('../components/home/wallet/connect-taro', () => mockMarker('taro'));
jest.mock('../components/home/wallet/connect-wallet-connect', () => mockMarker('wallet-connect'));
jest.mock('../components/home/wallet/connect-monero', () => mockMarker('monero'));
jest.mock('../components/home/wallet/connect-phantom', () => mockMarker('phantom'));
jest.mock('../components/home/wallet/connect-trust-sol', () => mockMarker('trust-sol'));
jest.mock('../components/home/wallet/connect-trust-trx', () => mockMarker('trust-trx'));
jest.mock('../components/home/wallet/connect-tronlink-trx', () => mockMarker('tronlink-trx'));
jest.mock('../components/home/wallet/connect-mail', () => mockMarker('mail'));
jest.mock('../components/home/wallet/connect-address', () => mockMarker('address'));

import { Suspense, createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectWrapper } from '../components/home/connect-wrapper';
import { WalletType } from '../contexts/wallet.context';

function connectProps(wallet: WalletType) {
  return {
    rootRef: createRef<HTMLDivElement>(),
    wallet,
    blockchain: mockBlockchain as any,
    isConnect: true,
    onLogin: mockOnLogin,
    onCancel: mockOnCancel,
    onSwitch: mockOnSwitch,
  };
}

function renderConnect(wallet: WalletType) {
  return render(
    <Suspense fallback={<div>loading</div>}>
      <ConnectWrapper {...connectProps(wallet)} />
    </Suspense>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ConnectWrapper', () => {
  it.each<[WalletType, string]>([
    [WalletType.META_MASK, 'metamask'],
    [WalletType.LEDGER_BTC, 'ledger'],
    [WalletType.LEDGER_ETH, 'ledger'],
    [WalletType.BITBOX_BTC, 'bitbox'],
    [WalletType.BITBOX_ETH, 'bitbox'],
    [WalletType.TREZOR_BTC, 'trezor'],
    [WalletType.TREZOR_ETH, 'trezor'],
    [WalletType.CLI_BTC, 'cli'],
    [WalletType.CLI_SPARK, 'cli'],
    [WalletType.CLI_ARK, 'cli'],
    [WalletType.CLI_LN, 'cli'],
    [WalletType.CLI_FIRO, 'cli'],
    [WalletType.CLI_XMR, 'cli'],
    [WalletType.CLI_ZANO, 'cli'],
    [WalletType.CLI_ICP, 'cli'],
    [WalletType.CLI_ETH, 'cli'],
    [WalletType.CLI_ADA, 'cli'],
    [WalletType.CLI_AR, 'cli'],
    [WalletType.CLI_SOL, 'cli'],
    [WalletType.CLI_TRX, 'cli'],
    [WalletType.DFX_TARO, 'taro'],
    [WalletType.WALLET_CONNECT, 'wallet-connect'],
    [WalletType.CAKE, 'monero'],
    [WalletType.MONERO, 'monero'],
    [WalletType.PHANTOM_SOL, 'phantom'],
    [WalletType.TRUST_SOL, 'trust-sol'],
    [WalletType.TRUST_TRX, 'trust-trx'],
    [WalletType.TRONLINK_TRX, 'tronlink-trx'],
    [WalletType.MAIL, 'mail'],
    [WalletType.ADDRESS, 'address'],
  ])('renders the %s connector', async (wallet, name) => {
    renderConnect(wallet);

    expect(await screen.findByText(`${name}:${wallet}:Ethereum:true`)).toBeInTheDocument();
  });

  it('passes the handlers through to the connector', async () => {
    renderConnect(WalletType.META_MASK);

    fireEvent.click(await screen.findByText('cancel-metamask'));

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for a wallet type it does not handle', () => {
    const element = ConnectWrapper({ ...connectProps(WalletType.MAIL), wallet: 'Unknown' as WalletType });

    expect(element).toBeUndefined();
  });
});
