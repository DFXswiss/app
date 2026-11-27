let mockRegtestAvailable = false;

jest.mock(
  '@dfx.swiss/wallet',
  () => ({
    KeyRing: {
      fromMnemonic: () => {
        throw new Error('unexpected key ring');
      },
    },
    checkPasskeyPlatform: () => new Promise(() => undefined),
    passkeyDiagnostic: (input: unknown) => input,
  }),
  { virtual: true },
);

jest.mock('@dfx.swiss/react-components', () => ({
  StyledVerticalStack: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_namespace: string, text: string) => text, locale: 'en' }),
}));

jest.mock('../components/home/wallet/passkey-host', () => ({
  passkeyMessage: (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.'),
  walletEnvForHost: () => 'loc',
}));

jest.mock('../components/home/wallet/passkey-bytes', () => ({ credentialBytes: () => new Uint8Array() }));

jest.mock('../components/home/wallet/wallet-client', () => ({
  createWalletClient: () => {
    throw new Error('no client in this test');
  },
}));

jest.mock('../components/home/wallet/passkey-transfer', () => ({
  PasskeyReceivePanel: () => null,
  PasskeySendPanel: () => null,
  receiveAddress: () => 'address',
}));

jest.mock('../components/home/wallet/passkey-wallet-card', () => ({
  __esModule: true,
  default: () => <div data-testid="wallet-card" />,
  formatWalletAmount: (value: number) => String(value),
}));

jest.mock('../components/home/wallet/passkey-wallet-actions', () => ({
  __esModule: true,
  default: () => <div data-testid="wallet-actions" />,
}));

jest.mock('../components/home/wallet/passkey-wallet-history', () => ({
  __esModule: true,
  default: () => <div data-testid="wallet-history" />,
}));

jest.mock('../components/home/wallet/passkey-words-sheet', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/home/wallet/passkey-revoke-sheet', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/home/wallet/passkey-settings-sheet', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/home/wallet/passkey-sheet', () => ({ __esModule: true, default: () => null }));

jest.mock('../components/home/wallet/passkey-regtest', () => ({
  __esModule: true,
  default: ({ unlocked }: { unlocked: boolean }) => <div data-testid="regtest">{unlocked ? 'unlocked' : 'locked'}</div>,
}));

jest.mock('../components/home/wallet/passkey-regtest-keys', () => ({
  regtestAvailable: () => mockRegtestAvailable,
}));

import { render, screen } from '@testing-library/react';
import PasskeyDesk from '../components/home/wallet/passkey-desk';
import { setOpenPasskey, type OpenPasskey } from '../components/home/wallet/passkey-session';

function open(keys?: unknown): OpenPasskey {
  return {
    accessToken: 'ceremony-token',
    state: keys === undefined ? 'locked' : 'unlocked',
    keys,
    wallet: {
      id: 7,
      credentialId: 'cred',
      status: 'Active',
      seedCheckAddress: '0x1111111111111111111111111111111111111111',
      // A linked Bitcoin address keeps the desk from linking one on its own.
      addresses: [{ family: 'Bitcoin', address: 'bc1qlinked', path: "m/84'/0'/0'/0/0" }],
    },
  } as unknown as OpenPasskey;
}

function renderDesk() {
  return render(<PasskeyDesk onCancel={jest.fn()} onRevoked={jest.fn()} />);
}

describe('PasskeyDesk regtest card', () => {
  beforeEach(() => {
    mockRegtestAvailable = false;
    setOpenPasskey(undefined);
  });

  it('shows the regtest card below the wallet actions for a session with keys when regtest is available', () => {
    mockRegtestAvailable = true;
    setOpenPasskey(open({ wipe: jest.fn(), mnemonic: () => 'words' }));
    renderDesk();

    const actions = screen.getByTestId('wallet-actions');
    const card = screen.getByTestId('regtest');
    expect(card).toHaveTextContent('unlocked');
    expect(actions.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('passes the locked state to the regtest card for a session without keys', () => {
    mockRegtestAvailable = true;
    setOpenPasskey(open());
    renderDesk();

    expect(screen.getByTestId('regtest')).toHaveTextContent('locked');
  });

  it('hides the regtest card on production builds and older wallet packages', () => {
    setOpenPasskey(open({ wipe: jest.fn(), mnemonic: () => 'words' }));
    renderDesk();

    expect(screen.getByTestId('wallet-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('regtest')).not.toBeInTheDocument();
  });
});
