let mockIsMobile = false;

jest.mock('@dfx.swiss/react-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    StyledButtonWidth: { SM: 'sm' },
    StyledVerticalStack: ({ children }: { children?: unknown }) =>
      React.createElement('div', null, children as JSX.Element),
    StyledButton: ({ label, onClick }: { label: string; onClick: () => void }) =>
      React.createElement('button', { type: 'button', onClick }, label),
    StyledLink: ({ label, url }: { label: string; url: string }) =>
      React.createElement('a', { href: url }, label),
  };
});

jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockIsMobile;
  },
}));

jest.mock('react-i18next', () => ({
  Trans: ({ children }: { children?: unknown }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const React = require('react');
    return React.createElement('span', null, children as JSX.Element);
  },
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_namespace: string, key: string) => key }),
}));

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

import { fireEvent, render, screen } from '@testing-library/react';
import { InstallHint } from '../components/home/install-hint';
import { WalletType } from '../contexts/wallet.context';

function renderHint(type: WalletType) {
  const onConfirm = jest.fn();
  const view = render(<InstallHint type={type} onConfirm={onConfirm} />);
  return { ...view, onConfirm };
}

function clickOk(onConfirm: jest.Mock) {
  fireEvent.click(screen.getByRole('button', { name: 'OK' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsMobile = false;
});

describe('InstallHint MetaMask', () => {
  it('explains how to install MetaMask or Rabby and confirms', () => {
    const { onConfirm } = renderHint(WalletType.META_MASK);

    expect(screen.getByText('Please install MetaMask or Rabby!')).toBeInTheDocument();
    expect(
      screen.getByText('You need to install the MetaMask or Rabby browser extension to be able to use this service.'),
    ).toBeInTheDocument();
    expect(screen.getByText('metamask.io')).toHaveAttribute('href', 'https://metamask.io');
    expect(screen.getByText('rabby.io')).toHaveAttribute('href', 'https://rabby.io/');
    expect(screen.getByText(/Visit/)).toBeInTheDocument();
    expect(screen.getByText(/for more details/)).toBeInTheDocument();

    clickOk(onConfirm);
  });
});

describe('InstallHint WebHID', () => {
  it.each([WalletType.LEDGER_BTC, WalletType.LEDGER_ETH, WalletType.BITBOX_BTC, WalletType.BITBOX_ETH])(
    'explains the browser requirement for %s on a desktop',
    (wallet) => {
      const { onConfirm } = renderHint(wallet);

      expect(screen.getByText('Browser not supported!')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Please use a desktop device with a compatible browser (e.g. Chrome) to be able to use this service.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('caniuse.com')).toHaveAttribute('href', 'https://caniuse.com/webhid');

      clickOk(onConfirm);
    },
  );

  it('explains the missing support on a mobile device', () => {
    mockIsMobile = true;
    const { onConfirm } = renderHint(WalletType.LEDGER_BTC);

    expect(screen.getByText('Mobile not supported!')).toBeInTheDocument();
    expect(screen.queryByText('Browser not supported!')).not.toBeInTheDocument();

    clickOk(onConfirm);
  });
});

describe('InstallHint Trezor', () => {
  it.each([WalletType.TREZOR_BTC, WalletType.TREZOR_ETH])('explains the missing Trezor Bridge for %s', (wallet) => {
    const { onConfirm } = renderHint(wallet);

    expect(screen.getByText('Trezor Bridge not installed!')).toBeInTheDocument();
    expect(screen.getByText('Please install the Trezor Bridge to be able to use this service.')).toBeInTheDocument();
    expect(screen.getByText('trezor.io')).toHaveAttribute(
      'href',
      'https://trezor.io/learn/a/what-is-trezor-bridge',
    );

    clickOk(onConfirm);
  });
});

describe('InstallHint Phantom', () => {
  it('explains how to install Phantom', () => {
    const { onConfirm } = renderHint(WalletType.PHANTOM_SOL);

    expect(screen.getByText('Please install Phantom!')).toBeInTheDocument();
    expect(
      screen.getByText('You need to install the Phantom browser extension to be able to use this service.'),
    ).toBeInTheDocument();
    expect(screen.getByText('phantom.app')).toHaveAttribute('href', 'https://phantom.app/');

    clickOk(onConfirm);
  });
});

describe('InstallHint Trust', () => {
  it.each([WalletType.TRUST_SOL, WalletType.TRUST_TRX])('explains how to install Trust for %s', (wallet) => {
    const { onConfirm } = renderHint(wallet);

    expect(screen.getByText('Please install Trust!')).toBeInTheDocument();
    expect(
      screen.getByText('You need to install the Trust browser extension to be able to use this service.'),
    ).toBeInTheDocument();
    expect(screen.getByText('trustwallet.com')).toHaveAttribute('href', 'https://trustwallet.com');

    clickOk(onConfirm);
  });
});

describe('InstallHint TronLink', () => {
  it('explains how to install TronLink', () => {
    const { onConfirm } = renderHint(WalletType.TRONLINK_TRX);

    expect(screen.getByText('Please install TronLink!')).toBeInTheDocument();
    expect(
      screen.getByText('You need to install the TronLink browser extension to be able to use this service.'),
    ).toBeInTheDocument();
    expect(screen.getByText('tronlink.org')).toHaveAttribute('href', 'https://www.tronlink.org');

    clickOk(onConfirm);
  });
});

describe('InstallHint without an install hint', () => {
  it.each<WalletType>([
    WalletType.CLI_BTC,
    WalletType.CLI_LN,
    WalletType.CLI_FIRO,
    WalletType.CLI_XMR,
    WalletType.CLI_ZANO,
    WalletType.CLI_ICP,
    WalletType.CLI_ETH,
    WalletType.CLI_ADA,
    WalletType.CLI_AR,
    WalletType.CLI_SOL,
    WalletType.CLI_TRX,
    WalletType.CLI_SPARK,
    WalletType.CLI_ARK,
    WalletType.DFX_TARO,
    WalletType.WALLET_CONNECT,
    WalletType.CAKE,
    WalletType.MONERO,
    WalletType.MAIL,
    WalletType.ADDRESS,
  ])('renders nothing for %s', (wallet) => {
    const { container } = renderHint(wallet);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an unknown wallet type', () => {
    const onConfirm = jest.fn();

    expect(InstallHint({ type: 'Unknown' as WalletType, onConfirm })).toBeUndefined();
  });
});
