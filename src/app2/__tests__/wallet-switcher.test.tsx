// Switch-wallet sheet: empty state, active/inactive rows, monogram fallback, chain chips.

const mockOnClose = jest.fn();
const mockOnSwitch = jest.fn();
const mockOnConnectAnother = jest.fn();

const switcher = {
  open: true,
  entries: [] as import('../wallets/session').WalletSwitchEntry[],
  onClose: () => mockOnClose(),
  onSwitch: (entry: import('../wallets/session').WalletSwitchEntry) => mockOnSwitch(entry),
  onConnectAnother: () => mockOnConnectAnother(),
};

jest.mock('../wallets/session', () => ({
  useWalletSession: () => ({ switcher }),
}));

jest.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key, language: 'en' }),
}));

jest.mock('../screens/trade/blockchain-meta', () => ({
  chainName: (chain: string) => chain,
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { WalletSwitcher } from '../wallets/WalletSwitcher';
import type { WalletSwitchEntry } from '../wallets/session';

function renderSwitcher(entries: WalletSwitchEntry[]) {
  switcher.entries = entries;
  return render(
    <div className="app">
      <WalletSwitcher />
    </div>,
  );
}

describe('WalletSwitcher', () => {
  beforeEach(() => {
    mockOnClose.mockReset();
    mockOnSwitch.mockReset();
    mockOnConnectAnother.mockReset();
  });

  it('shows the empty-state note and connects another wallet', () => {
    renderSwitcher([]);
    expect(screen.getByText('noWallets')).toBeInTheDocument();
    fireEvent.click(screen.getByText('connectAnother'));
    expect(mockOnConnectAnother).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('renders active vs inactive rows, chips, and a monogram when the logo is missing or broken', () => {
    const active: WalletSwitchEntry = {
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      name: 'MetaMask',
      walletType: 'MetaMask',
      blockchains: ['Ethereum', 'Arbitrum', 'Optimism'] as WalletSwitchEntry['blockchains'],
      active: true,
      linked: true,
      icon: 'metamask.svg',
    };
    const other: WalletSwitchEntry = {
      address: '0x0000000000000000000000000000000000000001',
      name: '',
      walletType: 'Ledger',
      blockchains: [] as WalletSwitchEntry['blockchains'],
      active: false,
      linked: false,
    };
    const unnamed: WalletSwitchEntry = {
      address: '0x0000000000000000000000000000000000000002',
      name: '',
      blockchains: ['Bitcoin'] as WalletSwitchEntry['blockchains'],
      active: false,
      linked: false,
    };

    renderSwitcher([active, other, unnamed]);

    expect(screen.getByText('walletActive')).toBeInTheDocument();
    expect(screen.getByText(/0x7099…79C8 · Ethereum · Arbitrum/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('MetaMask'));
    expect(mockOnSwitch).toHaveBeenCalledWith(active);

    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(screen.getByText('M')).toBeInTheDocument();

    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('W')).toBeInTheDocument();
    expect(screen.getByText(/0x0000…0002 · Bitcoin/)).toBeInTheDocument();
  });
});
