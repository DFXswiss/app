const mockNavigate = jest.fn();
const mockGetConfig = jest.fn();
const mockGetAccount = jest.fn();
const mockGetFees = jest.fn();
const mockUseWalletApi = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockPasskeySend = jest.fn();
const mockClient = {
  syncAddresses: jest.fn(),
  revoke: jest.fn(),
  credentials: jest.fn(),
  exportMnemonic: jest.fn(),
  diagnostics: jest.fn(),
};
const mockCheckPasskeyPlatform = jest.fn();
const mockSendPanel = jest.fn();
const mockReceivePanel = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useWalletApi: (token?: string) => mockUseWalletApi(token),
}));
jest.mock('@dfx.swiss/react-components', () => ({
  StyledVerticalStack: () => <div data-testid="empty-desk" />,
}));
jest.mock('@dfx.swiss/wallet', () => ({
  RP_IDS: { prd: 'app.dfx.swiss', dev: 'dev.app.dfx.swiss', stg: 'stg.app.dfx.swiss', loc: 'localhost' },
  checkPasskeyPlatform: (...args: unknown[]) => mockCheckPasskeyPlatform(...args),
  passkeyDiagnostic: (input: Record<string, unknown>) => ({ ...input, recorded: true }),
}));
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    locale: 'en-US',
    translate: (_namespace: string, text: string, values?: Record<string, string | number>) =>
      text.replace(/{{(\w+)}}/g, (match, key: string) => (values?.[key] === undefined ? match : String(values[key]))),
  }),
}));
jest.mock('../hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('../components/home/wallet/passkey-dfx-account', () => ({
  usePasskeyDfxAccount: () => ({ connect: mockConnect, disconnect: mockDisconnect }),
}));
jest.mock('../components/home/wallet/passkey-payment', () => ({
  passkeySend: (...args: unknown[]) => mockPasskeySend(...args),
}));
jest.mock('../components/home/wallet/wallet-client', () => ({ createWalletClient: () => mockClient }));
jest.mock('../components/home/wallet/passkey-transfer', () => {
  const actual = jest.requireActual('../components/home/wallet/passkey-transfer');
  return {
    ...actual,
    PasskeySendPanel: (props: unknown) => {
      mockSendPanel(props);
      return <div data-testid="send-panel" />;
    },
    PasskeyReceivePanel: (props: { readReceive: (family: string) => string; onReceiveError: (m?: string) => void }) => {
      mockReceivePanel(props);
      return <div data-testid="receive-panel" />;
    },
  };
});

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MAX_ADDRESSES } from '../components/home/wallet/passkey-bitcoin';
import PasskeyDesk, { ADDRESS_REUSE_HINT, enabledFamilies } from '../components/home/wallet/passkey-desk';
import { getOpenPasskey, setOpenPasskey, type OpenPasskey } from '../components/home/wallet/passkey-session';
import { HISTORY_TRUNCATED } from '../components/home/wallet/passkey-wallet-history';

const onCancel = jest.fn();
const onRevoked = jest.fn();

function ring() {
  return {
    wipe: jest.fn(),
    evm: () => ({ address: '0x00000000000000000000000000000000000000e0' }),
    sparkIdentity: () => ({ address: 'spark1identityaddress000000' }),
    bitcoinAddress: (_account: number, index: number) => ({ address: `bcrt1qreceiveaddress${index}` }),
  };
}

function open(keys: ReturnType<typeof ring> | undefined = ring(), patch: Partial<OpenPasskey> = {}): OpenPasskey {
  const session = {
    token: 'wallet-token',
    credentialId: 'cred',
    keys: keys as unknown as OpenPasskey['keys'],
    bitcoinNetwork: 'regtest' as const,
    ...patch,
  };
  setOpenPasskey(session);
  return session;
}

function account(usedCount = 0) {
  return (body: { addresses: string[] }) =>
    Promise.resolve({
      balance: { confirmed: 15000, unconfirmed: 0, total: 15000 },
      addresses: body.addresses.map((address, index) => ({ address, used: index < usedCount })),
      history: [{ txid: 't1', confirmed: true, time: 1764288000, netAmount: 15000, direction: 'incoming' }],
      historyComplete: true,
    });
}

async function renderDesk(props: Partial<Parameters<typeof PasskeyDesk>[0]> = {}) {
  const view = render(<PasskeyDesk onCancel={onCancel} onRevoked={onRevoked} {...props} />);
  await act(async () => undefined);
  return view;
}

async function click(name: string | RegExp, root: HTMLElement = document.body): Promise<void> {
  await act(async () => {
    fireEvent.click(within(root).getByRole('button', { name }));
  });
}

describe('PasskeyDesk', () => {
  beforeEach(() => {
    jest.useRealTimers();
    setOpenPasskey(undefined);
    localStorage.removeItem('dfx.wallet.currency');
    mockUseWalletApi.mockImplementation(() => ({
      getConfig: mockGetConfig,
      getBitcoinAccount: (_blockchain: string, body: { addresses: string[] }) => mockGetAccount(_blockchain, body),
      getBitcoinFees: mockGetFees,
    }));
    mockGetConfig.mockResolvedValue({ families: { bitcoin: true, evm: false, spark: false } });
    mockGetAccount.mockImplementation((_blockchain: string, body: { addresses: string[] }) => account(2)(body));
    mockClient.syncAddresses.mockResolvedValue(undefined);
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
  });

  it('renders an empty stack without an open passkey', async () => {
    await renderDesk();
    expect(screen.getByTestId('empty-desk')).toBeInTheDocument();
  });

  it('reads families from wallet-api config only', () => {
    expect(enabledFamilies({ families: { bitcoin: true, evm: false, spark: false } } as never)).toEqual(['bitcoin']);
    expect(enabledFamilies({ families: { bitcoin: true, evm: true, spark: true } } as never)).toEqual([
      'evm',
      'bitcoin',
      'spark',
    ]);
    expect(enabledFamilies({ families: {} } as never)).toEqual([]);
  });

  it('loads balance and history from wallet-api with the wallet token and moves the receive index', async () => {
    const session = open();
    await renderDesk();

    expect(mockUseWalletApi).toHaveBeenCalledWith('wallet-token');
    expect(mockGetAccount.mock.calls[0][0]).toBe('BitcoinRegtest');
    expect(mockGetAccount.mock.calls[0][1].addresses).toHaveLength(5);
    expect(getOpenPasskey()?.receiveIndex).toBe(2);
    expect(mockClient.syncAddresses).toHaveBeenCalledWith(session, session.keys);
    expect(screen.getByText('Received Bitcoin')).toBeInTheDocument();
    expect(screen.getByText('+0.00015 BTC')).toBeInTheDocument();

    await click('Show wallet');
    expect(screen.getByText('0.00015 BTC')).toBeInTheDocument();
    expect(screen.getAllByText('Bitcoin Regtest').length).toBeGreaterThan(0);
    expect(screen.getByTitle('bcrt1qreceiveaddress2')).toBeInTheDocument();
    expect(screen.queryByText('Ethereum & EVM')).not.toBeInTheDocument();
    expect(screen.queryByText('Lightning (Spark)')).not.toBeInTheDocument();
  });

  it('keeps the receive address on the last covered index at the 50-address limit and hints at reuse', async () => {
    mockGetAccount.mockImplementation(async (_blockchain: string, body: { addresses: string[] }) => ({
      ...(await account(MAX_ADDRESSES)(body)),
      historyComplete: false,
    }));
    open();
    await renderDesk();
    // Discovery grows the request in gap steps up to the 50-address limit.
    await waitFor(() =>
      expect(getOpenPasskey()).toMatchObject({ receiveIndex: MAX_ADDRESSES - 1, addressLimitReached: true }),
    );
    expect(mockGetAccount.mock.calls.at(-1)?.[1].addresses).toHaveLength(MAX_ADDRESSES);

    await click('Show wallet');
    expect(screen.getByTitle(`bcrt1qreceiveaddress${MAX_ADDRESSES - 1}`)).toBeInTheDocument();
    expect(screen.getByTestId('passkey-address-reuse')).toHaveTextContent(ADDRESS_REUSE_HINT);

    await click('Receive');
    const props = mockReceivePanel.mock.calls.at(-1)?.[0] as { readReceive: (family: string) => string };
    expect(props.readReceive('bitcoin')).toBe(`bcrt1qreceiveaddress${MAX_ADDRESSES - 1}`);
    expect(screen.getByTestId('passkey-receive-reuse')).toHaveTextContent(ADDRESS_REUSE_HINT);
  });

  it('shows no reuse hint without Bitcoin and passes a capped history on as truncated', async () => {
    mockGetConfig.mockResolvedValue({ families: { bitcoin: false, evm: true, spark: false } });
    open(ring(), { addressLimitReached: true });
    const first = await renderDesk();
    await click('Show wallet');
    expect(screen.queryByTestId('passkey-address-reuse')).not.toBeInTheDocument();
    first.unmount();

    // Six capped rows, so the list can expand to its end sentence.
    const rows = Array.from({ length: 6 }, (_, index) => ({
      txid: `t${index}`,
      confirmed: true,
      time: 1764288000,
      netAmount: 1000,
      direction: 'incoming',
    }));
    mockGetConfig.mockResolvedValue({ families: { bitcoin: true } });
    mockGetAccount.mockImplementation(async (_blockchain: string, body: { addresses: string[] }) => ({
      ...(await account(2)(body)),
      history: rows,
      historyComplete: false,
    }));
    open();
    const second = await renderDesk();
    expect(getOpenPasskey()?.addressLimitReached).toBeUndefined();
    await click('Show more');
    expect(screen.getByText(HISTORY_TRUNCATED)).toBeInTheDocument();
    second.unmount();

    // An answer without historyComplete is not called truncated.
    mockGetAccount.mockImplementation(async (_blockchain: string, body: { addresses: string[] }) => {
      const answer: { historyComplete?: boolean } = await account(2)(body);
      delete answer.historyComplete;
      return { ...answer, history: rows };
    });
    open();
    await renderDesk();
    await click('Show more');
    expect(screen.getByText('That is all your transactions.')).toBeInTheDocument();
  });

  it('registers the addresses of one key ring once', async () => {
    const keys = ring();
    open(keys);
    const first = await renderDesk();
    first.unmount();
    open(keys, { token: 'refreshed' });
    await renderDesk();
    expect(mockClient.syncAddresses).toHaveBeenCalledTimes(1);
  });

  it('shows every family the config enables and a failed derivation', async () => {
    mockGetConfig.mockResolvedValue({ families: { bitcoin: true, evm: true, spark: true } });
    open();
    await renderDesk({ receiveError: 'spark' });
    await click('Show wallet');
    expect(screen.getByTitle('0x00000000000000000000000000000000000000e0')).toBeInTheDocument();
    expect(screen.getByTitle('bcrt1qreceiveaddress2')).toBeInTheDocument();
    expect(screen.getByText('Lightning (Spark)').parentElement).toHaveTextContent('Something went wrong. Please try again.');
  });

  it('does not load an account when Bitcoin is off or the ring is locked', async () => {
    mockGetConfig.mockResolvedValue({ families: { bitcoin: false, evm: true, spark: false } });
    open();
    const first = await renderDesk();
    expect(mockGetAccount).not.toHaveBeenCalled();
    await click('Send');
    expect(screen.getByText('Sending is not available for this wallet yet.')).toBeInTheDocument();
    first.unmount();

    mockGetConfig.mockResolvedValue({ families: { bitcoin: true } });
    open(undefined, { keys: undefined });
    await renderDesk();
    expect(mockGetAccount).not.toHaveBeenCalled();
    expect(mockClient.syncAddresses).toHaveBeenCalledTimes(1);
    await click('Send');
    await click('Buy');
    expect(screen.queryByTestId('send-panel')).not.toBeInTheDocument();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('reports load and address registration failures as a toast', async () => {
    mockGetConfig.mockRejectedValueOnce(new Error('config offline'));
    mockClient.syncAddresses.mockRejectedValueOnce(new Error('sync offline'));
    open();
    await renderDesk();
    expect(screen.getByRole('status')).toHaveTextContent(/offline/);
  });

  it('drops wallet data that arrives after the session changed', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mockGetConfig.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    open();
    await renderDesk();
    await act(async () => {
      open(ring(), { token: 'newer' });
    });
    mockGetConfig.mockClear();
    await act(async () => finish({ families: { bitcoin: true } }));
    expect(getOpenPasskey()?.token).toBe('newer');
  });

  it('prefers handbook fixtures over wallet-api data', async () => {
    open();
    await renderDesk({
      balance: { chf: 1234.5, eur: 1000 },
      assets: [{ name: 'Ether', amount: '1 ETH', chf: 3000, eur: 2900 }],
      history: { items: [], hasMore: false },
    });
    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
    await click('Show wallet');
    expect(screen.getByText('1 ETH')).toBeInTheDocument();
    expect(screen.getByText('CHF 3,000.00')).toBeInTheDocument();
    await click('EUR');
    expect(screen.getByText('EUR 2,900.00')).toBeInTheDocument();
    expect(localStorage.getItem('dfx.wallet.currency')).toBe('EUR');
  });

  it('keeps the currency in memory when storage throws', async () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      open();
      await renderDesk();
      await click('EUR');
      expect(screen.getByRole('button', { name: 'EUR' })).toHaveAttribute('aria-pressed', 'true');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('opens buy and sell on the DFX API with the passkey login', async () => {
    const session = open();
    await renderDesk();
    await click('Buy');
    expect(mockConnect).toHaveBeenCalledWith(session.keys);
    expect(mockNavigate).toHaveBeenCalledWith('/buy');
    await click('Sell');
    expect(mockNavigate).toHaveBeenCalledWith('/sell');
    await click('Swap');
    await click('Pay');
    expect(mockNavigate).toHaveBeenCalledTimes(2);

    mockConnect.mockRejectedValueOnce(new Error('Signature rejected'));
    await click('Buy');
    expect(screen.getByRole('status')).toHaveTextContent('Signature rejected');
  });

  it('wires the send panel to wallet-api fees and the SDK send, then reloads the account', async () => {
    open();
    await renderDesk();
    await click('Send');
    const props = mockSendPanel.mock.calls.at(-1)?.[0] as {
      loadFees: () => Promise<unknown>;
      send: (input: unknown, confirm: (review: unknown) => Promise<boolean>) => Promise<unknown>;
    };
    mockGetFees.mockResolvedValue({ rates: { fast: 3, normal: 2, slow: 1 } });
    await expect(props.loadFees()).resolves.toEqual({ rates: { fast: 3, normal: 2, slow: 1 } });
    expect(mockGetFees).toHaveBeenCalledWith('BitcoinRegtest');

    const confirm = jest.fn(async () => true);
    mockPasskeySend.mockImplementation(async (_input: unknown, check: (prepared: unknown) => Promise<boolean>) => {
      await check({
        prepare: { destination: 'server-d', amount: 9, fee: 9, feeRate: 2, change: 9 },
        // BitcoinPsbtSummary: inputs 642 sats, fee 141 sats; 1 sat to the destination leaves 500 change.
        summary: {
          network: 'regtest',
          inputs: [
            { txid: 'a', vout: 0, amount: BigInt(400), path: "m/84'/1'/0'/0/0" },
            { txid: 'b', vout: 1, amount: BigInt(242), path: "m/84'/1'/0'/0/1" },
          ],
          outputs: [],
          fee: BigInt(141),
        },
      });
      return { txid: 'tx' };
    });
    mockGetAccount.mockClear();
    let sent: unknown;
    await act(async () => {
      sent = await props.send({ destination: 'd', amount: '1', feeRate: 'normal' }, confirm);
    });
    expect(sent).toEqual({ txid: 'tx' });
    // The confirm screen gets the verified request and PSBT; only the fee rate comes from the prepare response.
    expect(confirm).toHaveBeenCalledWith({ destination: 'd', amount: '1', fee: '141', feeRate: '2', change: '500' });
    expect(mockGetAccount).toHaveBeenCalled();

    mockGetAccount.mockClear();
    mockPasskeySend.mockImplementation(async () => {
      setOpenPasskey(undefined);
      return { txid: 'tx2' };
    });
    await act(async () => {
      await props.send({ destination: 'd', amount: '1', feeRate: 'normal' }, confirm);
    });
    expect(mockGetAccount).not.toHaveBeenCalled();
  });

  it('passes the enabled families and the discovered receive address to the receive panel', async () => {
    open();
    await renderDesk();
    await click('Receive');
    const props = mockReceivePanel.mock.calls.at(-1)?.[0] as {
      families: string[];
      bitcoinLabel: string;
      readReceive: (family: string) => string;
      onReceiveError: (message?: string) => void;
    };
    expect(props.families).toEqual(['bitcoin']);
    expect(props.bitcoinLabel).toBe('Bitcoin Regtest');
    expect(props.readReceive('bitcoin')).toBe('bcrt1qreceiveaddress2');
    await act(async () => props.onReceiveError('derivation failed'));
    expect(screen.getByRole('alert')).toHaveTextContent('derivation failed');
    await act(async () => props.onReceiveError(undefined));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const current = getOpenPasskey() as OpenPasskey;
    act(() => setOpenPasskey({ ...current, receiveIndex: undefined }));
    expect(props.readReceive('bitcoin')).toBe('bcrt1qreceiveaddress0');
    act(() => setOpenPasskey({ ...current, keys: undefined }));
    expect(() => props.readReceive('bitcoin')).toThrow('locked');
  });

  it('reloads data, counts the passkeys, records a diagnostic and shows the words', async () => {
    // The desk works on the live session, which carries the discovered receive index after loading.
    const session = { ...open(), receiveIndex: 2 };
    mockClient.credentials.mockResolvedValue([{}, {}]);
    mockClient.diagnostics.mockResolvedValue(undefined);
    mockClient.exportMnemonic.mockResolvedValue(['alpha', 'beta']);
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes', os: 'iOS 18' });
    await renderDesk();
    await click('Settings');
    const dialog = screen.getByRole('dialog', { name: 'Settings' });

    await click('Reload data', dialog);
    expect(within(dialog).getByText('Data reloaded.')).toBeInTheDocument();

    await click('Check passkey status', dialog);
    expect(mockClient.credentials).toHaveBeenCalledWith(session);
    expect(within(dialog).getByText('Passkeys on this account: 2.')).toBeInTheDocument();

    await click('Record a diagnostic', dialog);
    expect(mockClient.diagnostics).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ stage: 'Capability', prf: true, os: 'iOS 18', recorded: true }),
    );

    await click(/Export recovery phrase/, dialog);
    expect(mockClient.exportMnemonic).toHaveBeenCalledWith(session);
    expect(screen.getByTestId('passkey-recovery-words')).toHaveTextContent('alpha');
  });

  it('records prf false, omits a missing os and reads client capabilities', async () => {
    const original = window.PublicKeyCredential;
    (window as { PublicKeyCredential?: unknown }).PublicKeyCredential = {
      getClientCapabilities: () => Promise.resolve({ 'extension:prf': true }),
    };
    try {
      open();
      mockClient.diagnostics.mockResolvedValue(undefined);
      mockCheckPasskeyPlatform.mockResolvedValueOnce({ available: true, prf: 'no' });
      await renderDesk();
      await click('Settings');
      await click('Record a diagnostic');
      expect(mockClient.diagnostics.mock.calls[0][1]).toEqual({
        stage: 'Capability',
        outcome: 'completed',
        prf: false,
        clientCapabilities: { 'extension:prf': true },
        recorded: true,
      });
      (window as { PublicKeyCredential?: unknown }).PublicKeyCredential = {};
      mockCheckPasskeyPlatform.mockResolvedValueOnce({ available: true, prf: 'unknown' });
      await click('Record a diagnostic');
      expect(mockClient.diagnostics.mock.calls[1][1]).toEqual({ stage: 'Capability', outcome: 'completed', recorded: true });
    } finally {
      (window as { PublicKeyCredential?: unknown }).PublicKeyCredential = original;
    }
  });

  it('shows a settings failure inside the open dialog', async () => {
    open();
    mockClient.credentials.mockRejectedValue(new Error('SessionRequired'));
    await renderDesk();
    await click('Settings');
    await click('Check passkey status');
    expect(screen.getByRole('alert')).toHaveTextContent('SessionRequired');
  });

  it('ends the wallet and the passkey DFX session for another passkey', async () => {
    const keys = ring();
    open(keys);
    await renderDesk();
    await click('Settings');
    await click('Use another passkey');
    expect(keys.wipe).toHaveBeenCalledTimes(1);
    expect(getOpenPasskey()).toBeUndefined();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('revokes with the wallet token, closes the wallet and reports it', async () => {
    const keys = ring();
    // The desk works on the live session, which carries the discovered receive index after loading.
    const session = { ...open(keys), receiveIndex: 2 };
    mockClient.revoke.mockResolvedValue(undefined);
    await renderDesk();
    await click('Settings');
    await click('Block passkey');
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    await click('Block');
    expect(mockClient.revoke).toHaveBeenCalledWith(session);
    expect(keys.wipe).toHaveBeenCalledTimes(1);
    expect(getOpenPasskey()).toBeUndefined();
    expect(onRevoked).toHaveBeenCalledTimes(1);
  });

  it('keeps the revoke dialog with the error and does not end a replaced session', async () => {
    open();
    mockClient.revoke.mockRejectedValueOnce(new Error('PasskeyInvalid'));
    await renderDesk();
    await click('Settings');
    await click('Block passkey');
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    await click('Block');
    expect(screen.getByRole('alert')).toHaveTextContent('PasskeyInvalid');

    mockClient.revoke.mockImplementationOnce(async () => {
      open(ring(), { token: 'replaced' });
    });
    await click('Block');
    expect(getOpenPasskey()?.token).toBe('replaced');
    expect(onRevoked).not.toHaveBeenCalled();
  });

  it('copies an address, reports a missing clipboard and hides the toast after four seconds', async () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      open();
      await renderDesk();
      await click('Show wallet');
      jest.useFakeTimers();
      await click('Copy address Bitcoin Regtest');
      expect(writeText).toHaveBeenCalledWith('bcrt1qreceiveaddress2');
      expect(screen.getByRole('status')).toHaveTextContent('Address copied');
      act(() => jest.advanceTimersByTime(4000));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();

      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      await click('Copy address Bitcoin Regtest');
      await click('Copy address Bitcoin Regtest');
      expect(screen.getByRole('status')).toHaveTextContent('Clipboard is not available.');
      fireEvent.click(screen.getByRole('status'));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
      if (previous) Object.defineProperty(navigator, 'clipboard', previous);
      else delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it('closes an open sheet when another session replaces this one and on Escape', async () => {
    open();
    await renderDesk();
    await click('Settings');
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await click('Settings');
    await act(async () => {
      open(ring(), { token: 'other' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('drops recovery words when the ring changes during the export', async () => {
    let finish: (words: string[]) => void = () => undefined;
    mockClient.exportMnemonic.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const session = open();
    await renderDesk();
    await click('Settings');
    await click(/Export recovery phrase/);
    await act(async () => {
      setOpenPasskey({ ...session, keys: ring() as never });
    });
    await act(async () => finish(['late']));
    expect(screen.queryByTestId('passkey-recovery-words')).not.toBeInTheDocument();
  });

  it('opens the home link and closes the desk from settings', async () => {
    const onHome = jest.fn();
    open();
    await renderDesk({ onHome });
    fireEvent.click(screen.getByRole('link', { name: 'DFX home' }));
    expect(onHome).toHaveBeenCalledTimes(1);
    await click('Settings');
    const closes = screen.getAllByRole('button', { name: 'Close' });
    fireEvent.click(closes[closes.length - 1]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
