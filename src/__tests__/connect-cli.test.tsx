// Component-level: the CLI wallet uses the real ConnectBase with replaced contexts and controls.

import { Control, FieldValues } from 'react-hook-form';

const mockLogin = jest.fn();
const mockSwitchBlockchain = jest.fn();
const mockLogout = jest.fn();
const mockSetSession = jest.fn();
const mockGetSignMessage = jest.fn();
const mockCopy = jest.fn();
const mockSetParams = jest.fn();
const mockOnSwitch = jest.fn();
let mockActiveWallet: string | undefined;
let mockSession: { address?: string } | undefined;
let mockLanguage: { symbol: string } | undefined;

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    ETHEREUM: 'Ethereum',
    FIRO: 'Firo',
    MONERO: 'Monero',
    ZANO: 'Zano',
    INTERNET_COMPUTER: 'InternetComputer',
    CARDANO: 'Cardano',
    ARWEAVE: 'Arweave',
    SOLANA: 'Solana',
    TRON: 'Tron',
    SPARK: 'Spark',
    ARKADE: 'Arkade',
  },
  Utils: { createRules: (rules: unknown) => rules },
  Validations: { Required: {}, Custom: (validate: unknown) => validate },
  useAuth: () => ({ getSignMessage: mockGetSignMessage }),
  useAuthContext: () => ({ session: mockSession }),
  useSessionContext: () => ({ logout: mockLogout }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useController } = require('react-hook-form');
  const FormControl = React.createContext(null);
  const Field = ({ name, label, items }: { name: string; label: string; items?: string[] }) => {
    const control = React.useContext(FormControl) as Control<FieldValues>;
    const { field } = useController({ name, control });
    return items ? (
      <select aria-label={label} {...field} value={field.value ?? ''}>
        {items.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    ) : (
      <input aria-label={label} {...field} value={field.value ?? ''} />
    );
  };
  return {
    Form: ({
      control,
      children,
      onSubmit,
    }: {
      control: Control<FieldValues>;
      children: JSX.Element;
      onSubmit: () => void;
    }) => (
      <FormControl.Provider value={control}>
        <form onSubmit={onSubmit}>{children}</form>
      </FormControl.Provider>
    ),
    StyledInput: Field,
    StyledDropdown: Field,
    StyledButton: ({
      label,
      onClick,
      disabled,
      isLoading,
    }: {
      label: string;
      onClick: () => void;
      disabled: boolean;
      isLoading: boolean;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {label}
        {isLoading && ' loading'}
      </button>
    ),
    StyledButtonWidth: { MIN: 'min' },
    StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    StyledHorizontalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    StyledLink: ({ url }: { url: string }) => <a href={url}>Instructions</a>,
    CopyButton: ({ onCopy }: { onCopy: () => void }) => (
      <button type="button" onClick={onCopy}>
        Copy
      </button>
    ),
    SpinnerSize: { LG: 'lg' },
    StyledLoadingSpinner: () => <div>loading</div>,
  };
});

jest.mock('../contexts/wallet.context', () => {
  const WalletType = {
    CLI_BTC: 'BTC',
    CLI_LN: 'LN',
    CLI_ETH: 'ETH',
    CLI_FIRO: 'FIRO',
    CLI_XMR: 'XMR',
    CLI_ZANO: 'ZANO',
    CLI_ICP: 'ICP',
    CLI_ADA: 'ADA',
    CLI_AR: 'AR',
    CLI_SOL: 'SOL',
    CLI_TRX: 'TRX',
    CLI_SPARK: 'SPARK',
    CLI_ARK: 'ARK',
    MAIL: 'Mail',
  };
  const WalletBlockchains: Record<string, string[]> = {
    BTC: ['Bitcoin'],
    LN: ['Lightning'],
    ETH: ['Ethereum'],
    FIRO: ['Firo'],
    XMR: ['Monero'],
    ZANO: ['Zano'],
    ICP: ['InternetComputer'],
    ADA: ['Cardano'],
    AR: ['Arweave'],
    SOL: ['Solana'],
    TRX: ['Tron'],
    SPARK: ['Spark'],
    ARK: ['Arkade'],
  };
  return {
    WalletType,
    WalletBlockchains,
    supportsBlockchain: (wallet: string, chain: string) => WalletBlockchains[wallet]?.includes(chain),
    useWalletContext: () => ({
      activeWallet: mockActiveWallet,
      login: mockLogin,
      setSession: mockSetSession,
      switchBlockchain: mockSwitchBlockchain,
    }),
  };
});

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
    translateError: (key: string) => key,
    language: mockLanguage,
  }),
}));
jest.mock('../hooks/app-params.hook', () => ({ useAppParams: () => ({ setParams: mockSetParams }) }));
jest.mock('../hooks/blockchain.hook', () => ({ useBlockchain: () => ({ toString: (chain: string) => chain }) }));
jest.mock('../hooks/clipboard.hook', () => ({ useClipboard: () => ({ copy: mockCopy }) }));
jest.mock('../util/lnurl', () => ({ Lnurl: { addressToLnurl: (address: string) => `encoded:${address}` } }));
jest.mock('../components/home/install-hint', () => ({ InstallHint: () => <div>install</div> }));
jest.mock('../components/home/sign-hint', () => ({ SignHint: () => <div>sign hint</div> }));
jest.mock('../hooks/report-displayed-error.hook', () => ({ useReportDisplayedError: () => undefined }));

import { Blockchain } from '@dfx.swiss/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ComponentProps, createRef } from 'react';
import ConnectCli from '../components/home/wallet/connect-cli';
import { WalletType } from '../contexts/wallet.context';

function renderCli(overrides: Partial<ComponentProps<typeof ConnectCli>> = {}) {
  return render(
    <ConnectCli
      rootRef={createRef<HTMLDivElement>()}
      wallet={WalletType.CLI_BTC}
      blockchain={Blockchain.BITCOIN}
      isConnect={false}
      onLogin={jest.fn()}
      onCancel={jest.fn()}
      onSwitch={mockOnSwitch}
      {...overrides}
    />,
  );
}

async function ready(overrides: Partial<ComponentProps<typeof ConnectCli>> = {}) {
  await act(async () => {
    renderCli(overrides);
  });
  await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
}

async function change(label: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
}

async function clickLogin() {
  await act(async () => {
    fireEvent.click(screen.getByText('Login'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockActiveWallet = undefined;
  mockSession = { address: 'session-address' };
  mockLanguage = undefined;
  mockLogin.mockResolvedValue(undefined);
  mockSwitchBlockchain.mockResolvedValue(undefined);
  mockLogout.mockResolvedValue(undefined);
  mockGetSignMessage.mockResolvedValue('sign this');
});

describe('ConnectCli auto-connect', () => {
  it('does not log in, switch, log out, load or show an error on connect with the active wallet', async () => {
    mockActiveWallet = WalletType.CLI_BTC;
    await ready({ isConnect: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockSwitchBlockchain).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
    expect(screen.queryByText('Connection failed!')).not.toBeInTheDocument();
    expect(screen.queryByText('Login loading')).not.toBeInTheDocument();
  });

  it('switches blockchain without logging in outside connect with the active wallet', async () => {
    mockActiveWallet = WalletType.CLI_BTC;
    await ready();
    await waitFor(() => expect(mockSwitchBlockchain).toHaveBeenCalledWith(Blockchain.BITCOIN));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('does not connect outside connect when another wallet is active', async () => {
    mockActiveWallet = WalletType.CLI_ETH;
    await ready();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockSwitchBlockchain).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });
});

describe('ConnectCli content', () => {
  it('uses the default blockchain and language when none is provided', async () => {
    await ready({ blockchain: undefined });
    expect(screen.getByLabelText('Blockchain')).toHaveValue(Blockchain.BITCOIN);
    expect(screen.getByText('Instructions')).toHaveAttribute(
      'href',
      'https://docs.dfx.swiss/en/faq.html#command-line-login',
    );
  });

  it('uses the selected language in the instructions link', async () => {
    mockLanguage = { symbol: 'DE' };
    await ready();
    expect(screen.getByText('Instructions')).toHaveAttribute(
      'href',
      'https://docs.dfx.swiss/de/faq.html#command-line-login',
    );
  });

  it('does not request a sign message for a wallet without an address pattern', async () => {
    await ready({ wallet: WalletType.MAIL });
    await change('Address', `1${'A'.repeat(25)}`);
    expect(mockGetSignMessage).not.toHaveBeenCalled();
  });

  it.each<[WalletType, Blockchain, string]>([
    [WalletType.CLI_BTC, Blockchain.BITCOIN, `1${'A'.repeat(25)}`],
    [WalletType.CLI_LN, Blockchain.LIGHTNING, 'alice@example.com'],
    [WalletType.CLI_ETH, Blockchain.ETHEREUM, `0x${'a'.repeat(40)}`],
    [WalletType.CLI_FIRO, Blockchain.FIRO, `a${'A'.repeat(33)}`],
    [WalletType.CLI_XMR, Blockchain.MONERO, `40${'A'.repeat(93)}`],
    [WalletType.CLI_ZANO, Blockchain.ZANO, `Z${'a'.repeat(96)}`],
    [WalletType.CLI_ICP, Blockchain.INTERNET_COMPUTER, 'aaaaa-bbbbb'],
    [WalletType.CLI_ADA, Blockchain.CARDANO, 'addr1abc'],
    [WalletType.CLI_AR, Blockchain.ARWEAVE, 'a'.repeat(43)],
    [WalletType.CLI_SOL, Blockchain.SOLANA, 'A'.repeat(43)],
    [WalletType.CLI_TRX, Blockchain.TRON, `T${'A'.repeat(32)}`],
    [WalletType.CLI_SPARK, Blockchain.SPARK, 'spark1abcdef'],
    [WalletType.CLI_ARK, Blockchain.ARKADE, 'ark1abcdef'],
  ])(
    'requests a sign message for a valid %s address but not an invalid address',
    async (wallet, blockchain, address) => {
      await ready({ wallet, blockchain });
      if (screen.queryByLabelText('Key')) await change('Key', 'key');
      await change('Address', 'invalid');
      expect(mockGetSignMessage).not.toHaveBeenCalled();
      await change('Address', address);
      await waitFor(() =>
        expect(mockGetSignMessage).toHaveBeenCalledWith(wallet === WalletType.CLI_LN ? `encoded:${address}` : address),
      );
    },
  );

  it.each<[WalletType, Blockchain, string]>([
    [WalletType.CLI_ICP, Blockchain.INTERNET_COMPUTER, 'aaaaa-bbbbb'],
    [WalletType.CLI_ADA, Blockchain.CARDANO, 'addr1abc'],
    [WalletType.CLI_AR, Blockchain.ARWEAVE, 'a'.repeat(43)],
  ])('requires a key before requesting a sign message for %s', async (wallet, blockchain, address) => {
    await ready({ wallet, blockchain });
    await change('Address', address);
    expect(mockGetSignMessage).not.toHaveBeenCalled();
    await change('Key', 'public-key');
    await waitFor(() => expect(mockGetSignMessage).toHaveBeenCalledWith(address));
  });

  it('switches wallets and updates params when the selected blockchain changes', async () => {
    await ready();
    expect(mockOnSwitch).not.toHaveBeenCalled();
    expect(mockSetParams).not.toHaveBeenCalled();
    await change('Blockchain', Blockchain.ETHEREUM);
    await waitFor(() => expect(mockOnSwitch).toHaveBeenCalledWith(WalletType.CLI_ETH));
    expect(mockSetParams).toHaveBeenCalledWith({ blockchain: Blockchain.ETHEREUM });
  });

  it('shows and copies the loaded sign message', async () => {
    let resolveMessage: (message: string) => void = () => undefined;
    mockGetSignMessage.mockReturnValue(new Promise<string>((resolve) => (resolveMessage = resolve)));
    await ready();
    await change('Address', `1${'A'.repeat(25)}`);
    expect(screen.getByText('Login loading')).toBeInTheDocument();
    await act(async () => resolveMessage('sign this'));
    expect(screen.getByText('sign this')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Copy'));
    expect(mockCopy).toHaveBeenCalledWith('sign this');
  });

  it.each<[WalletType, Blockchain, string, string]>([
    [WalletType.CLI_BTC, Blockchain.BITCOIN, `1${'A'.repeat(25)}`, `1${'A'.repeat(25)}`],
    [WalletType.CLI_LN, Blockchain.LIGHTNING, 'alice@example.com', 'encoded:alice@example.com'],
  ])('submits the form values for %s to login', async (wallet, blockchain, address, encoded) => {
    await ready({ wallet, blockchain, isConnect: true });
    await change('Address', address);
    await screen.findByText('sign this');
    await change('Signature', 'signature');
    await clickLogin();
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith(wallet, encoded, blockchain, expect.any(Function), undefined),
    );
    await expect(mockLogin.mock.calls[0][3](encoded, 'message')).resolves.toBe('signature');
  });

  it('logs in with the entered address and signature without logging out when the wallet is active on connect', async () => {
    mockActiveWallet = WalletType.CLI_LN;
    mockSession = { address: 'session-address' };
    await ready({ wallet: WalletType.CLI_LN, blockchain: Blockchain.LIGHTNING, isConnect: true });
    await change('Address', 'alice@example.com');
    await screen.findByText('sign this');
    await change('Signature', 'signature');
    await clickLogin();
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith(
        WalletType.CLI_LN,
        'encoded:alice@example.com',
        Blockchain.LIGHTNING,
        expect.any(Function),
        undefined,
      ),
    );
    await expect(mockLogin.mock.calls[0][3]('encoded:alice@example.com', 'message')).resolves.toBe('signature');
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('logs in with the entered address and signature outside connect when another wallet is active', async () => {
    mockActiveWallet = WalletType.CLI_ETH;
    mockSession = { address: 'session-address' };
    await ready();
    const address = `1${'A'.repeat(25)}`;
    await change('Address', address);
    await screen.findByText('sign this');
    await change('Signature', 'signature');
    await clickLogin();
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith(
        WalletType.CLI_BTC,
        address,
        Blockchain.BITCOIN,
        expect.any(Function),
        undefined,
      ),
    );
    await expect(mockLogin.mock.calls[0][3](address, 'message')).resolves.toBe('signature');
  });

  it('submits form values when the active wallet has no session address', async () => {
    mockActiveWallet = WalletType.CLI_BTC;
    mockSession = undefined;
    await ready({ isConnect: true });
    const address = `1${'A'.repeat(25)}`;
    await change('Address', address);
    await screen.findByText('sign this');
    await change('Signature', 'signature');
    await clickLogin();
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith(
        WalletType.CLI_BTC,
        address,
        Blockchain.BITCOIN,
        expect.any(Function),
        undefined,
      ),
    );
  });

  it('shows the error when a login requests a signature from the CLI wallet', async () => {
    mockLogin.mockImplementation((_wallet, address, _blockchain, sign) => sign(address, 'message'));
    await ready({ isConnect: true });
    await change('Address', `1${'A'.repeat(25)}`);
    await screen.findByText('sign this');
    await clickLogin();
    expect(await screen.findByText('Invalid signature call')).toBeInTheDocument();
  });
});
