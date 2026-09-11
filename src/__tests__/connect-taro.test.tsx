// Component-level: ConnectTaro creates an LNURL auth challenge, shows it as a Taro link, polls its
// status one request at a time and resolves the login with the access token. A challenge the API
// no longer knows once its 5-minute lifetime is over (404) rejects the login with a dedicated
// message; every other poll failure keeps the generic one.

const mockCreateLnurlAuth = jest.fn();
const mockGetLnurlAuth = jest.fn();
const mockConnect = jest.fn();
const mockAuthContext: { session?: { address?: string } } = {};
let mockContentError: string | undefined;
let mockConnectBaseProps: unknown;

jest.mock('@dfx.swiss/react', () => ({
  // mirrors the library class (its ESM build is not loadable under jest)
  ApiException: class ApiException extends Error {
    readonly statusCode: number;

    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  Blockchain: { LIGHTNING: 'Lightning' },
  useAuth: () => ({ createLnurlAuth: mockCreateLnurlAuth, getLnurlAuth: mockGetLnurlAuth }),
  useAuthContext: () => mockAuthContext,
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { MIN: 'min' },
  StyledLoadingSpinner: () => <div data-testid="spinner" />,
  StyledVerticalStack: ({ children }: { children: JSX.Element[] }) => <div>{children}</div>,
}));

jest.mock('src/contexts/wallet.context', () => ({
  WalletType: { DFX_TARO: 'DfxTaro' },
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('../components/payment/qr-code', () => ({
  QrCopy: ({ data }: { data: string }) => <div data-testid="qr">{data}</div>,
}));

jest.mock('../components/home/connect-shared', () => ({
  ConnectError: ({ error }: { error: string }) => <p>{error}</p>,
}));

jest.mock('../components/home/connect-base', () => ({
  ConnectBase: (props: { renderContent: (contentProps: object) => JSX.Element }) => {
    mockConnectBaseProps = props;
    return props.renderContent({ connect: mockConnect, error: mockContentError });
  },
}));

import { ApiException, Blockchain, LnurlAuthStatus } from '@dfx.swiss/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { Account } from '../components/home/connect-shared';
import ConnectTaro from '../components/home/wallet/connect-taro';
import { WalletType } from '../contexts/wallet.context';

const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;

interface ConnectBaseProps {
  isSupported: () => boolean;
  getAccount: (wallet: WalletType, blockchain: Blockchain, isReconnect: boolean) => Promise<Account>;
  signMessage: () => Promise<never>;
  autoConnect?: boolean;
}

interface PendingPoll {
  resolve: (status: LnurlAuthStatus) => void;
  reject: (error: unknown) => void;
}

function connectBase(): ConnectBaseProps {
  return mockConnectBaseProps as ConnectBaseProps;
}

function renderConnectTaro(): ReturnType<typeof render> {
  return render(
    <ConnectTaro
      rootRef={createRef<HTMLDivElement>()}
      wallet={WalletType.DFX_TARO}
      isConnect={false}
      onLogin={jest.fn()}
      onCancel={jest.fn()}
      onSwitch={jest.fn()}
    />,
  );
}

// starts a fresh login; `outcome` settles with the account on success or the error on rejection
// (wrapped in an object, since an async function would otherwise wait for the returned promise)
async function startLogin(): Promise<{ outcome: Promise<Account | unknown> }> {
  let outcome: Promise<Account | unknown> = Promise.resolve();

  await act(async () => {
    outcome = connectBase()
      .getAccount(WalletType.DFX_TARO, Blockchain.LIGHTNING, false)
      .catch((e: unknown) => e);

    // let createLnurlAuth resolve and the token promise be created before React renders
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

  return { outcome };
}

async function advanceTime(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

// status requests stay pending until the test settles them
function holdPolls(): PendingPoll[] {
  const polls: PendingPoll[] = [];
  mockGetLnurlAuth.mockImplementation(() => new Promise((resolve, reject) => polls.push({ resolve, reject })));
  return polls;
}

async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
  });
}

describe('ConnectTaro', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockAuthContext.session = undefined;
    mockContentError = undefined;
    mockConnectBaseProps = undefined;
    mockCreateLnurlAuth.mockResolvedValue({ k1: 'k1-challenge', lnurl: 'LNURL1TEST' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('login', () => {
    it('auto-connects on every device and never asks for a signature', async () => {
      renderConnectTaro();

      expect(connectBase().isSupported()).toBe(true);
      expect(connectBase().autoConnect).toBe(true);
      await expect(connectBase().signMessage()).rejects.toThrow('Invalid signature call');
    });

    it('reuses the session address on reconnect without creating a challenge', async () => {
      mockAuthContext.session = { address: 'LNURL1SESSION' };
      renderConnectTaro();

      await expect(connectBase().getAccount(WalletType.DFX_TARO, Blockchain.LIGHTNING, true)).resolves.toEqual({
        address: 'LNURL1SESSION',
      });
      expect(mockCreateLnurlAuth).not.toHaveBeenCalled();
    });

    it('shows the challenge as a Taro link and opens the app with it', async () => {
      const open = jest.spyOn(window, 'open').mockImplementation(() => null);
      holdPolls();
      renderConnectTaro();

      expect(screen.getByTestId('spinner')).toBeInTheDocument();

      await startLogin();

      expect(screen.getByTestId('qr')).toHaveTextContent('dfxtaro:lightning:LNURL1TEST');
      fireEvent.click(screen.getByText('Open app'));
      expect(open).toHaveBeenCalledWith('dfxtaro:lightning:LNURL1TEST', '_self');

      open.mockRestore();
    });

    it('keeps polling until the challenge is complete and resolves with the access token', async () => {
      mockGetLnurlAuth
        .mockResolvedValueOnce({ isComplete: false })
        .mockResolvedValueOnce({ isComplete: true, accessToken: 'access-token' });
      renderConnectTaro();

      const { outcome } = await startLogin();
      await advanceTime(1000);
      await advanceTime(1000);

      await expect(outcome).resolves.toEqual({ session: 'access-token' });

      await advanceTime(5000);
      expect(mockGetLnurlAuth).toHaveBeenCalledTimes(2);
    });

    it('sends the next status request only after the previous one has settled', async () => {
      const polls = holdPolls();
      renderConnectTaro();

      await startLogin();
      await advanceTime(5000);
      expect(mockGetLnurlAuth).toHaveBeenCalledTimes(1);

      await settle(() => polls[0].resolve({ isComplete: false }));
      await advanceTime(1000);
      expect(mockGetLnurlAuth).toHaveBeenCalledTimes(2);
    });

    it('stops polling when unmounted', async () => {
      const { unmount } = renderConnectTaro();

      await startLogin();
      unmount();
      await advanceTime(5000);

      expect(mockGetLnurlAuth).not.toHaveBeenCalled();
    });
  });

  describe('status poll failure', () => {
    // fails the first status request once the challenge is `challengeAge` ms old
    async function loginWithPollError(pollError: unknown, challengeAge: number): Promise<unknown> {
      const polls = holdPolls();
      renderConnectTaro();

      const { outcome } = await startLogin();
      await advanceTime(1000);
      await advanceTime(challengeAge - 1000);
      await settle(() => polls[0].reject(pollError));

      expect(mockGetLnurlAuth).toHaveBeenCalledWith('k1-challenge');
      return outcome;
    }

    it('rejects with "LNURL login expired" when the challenge is unknown (404) after its lifetime', async () => {
      const error = await loginWithPollError(new ApiException(404, 'k1 not found'), CHALLENGE_LIFETIME_MS);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('LNURL login expired');
      expect(screen.queryByTestId('qr')).not.toBeInTheDocument();
    });

    it('rejects with "Authentication failed" when the challenge is unknown (404) before its lifetime ends', async () => {
      const error = await loginWithPollError(new ApiException(404, 'k1 not found'), CHALLENGE_LIFETIME_MS - 1);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Authentication failed');
      expect(screen.queryByTestId('qr')).not.toBeInTheDocument();
    });

    it.each([
      ['a network error', new ApiException(0, 'Network error: Failed to fetch')],
      ['a server error', new ApiException(500, 'Internal server error')],
      ['a non-API error', new Error('404')],
      ['a non-ApiException object carrying statusCode 404', { statusCode: 404, message: 'k1 not found' }],
    ])('rejects with "Authentication failed" on %s after the challenge lifetime', async (_label, pollError) => {
      const error = await loginWithPollError(pollError, CHALLENGE_LIFETIME_MS);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Authentication failed');
      expect(screen.queryByTestId('qr')).not.toBeInTheDocument();
    });

    it('stops polling after the first failed status check', async () => {
      await loginWithPollError(new ApiException(404, 'k1 not found'), CHALLENGE_LIFETIME_MS);
      await advanceTime(5000);

      expect(mockGetLnurlAuth).toHaveBeenCalledTimes(1);
    });
  });

  describe('replaced challenge', () => {
    async function replaceChallengeWhilePolling(): Promise<{ polls: PendingPoll[]; outcome: Promise<unknown> }> {
      const polls = holdPolls();
      renderConnectTaro();

      await startLogin();
      await advanceTime(1000);

      mockCreateLnurlAuth.mockResolvedValueOnce({ k1: 'k1-retry', lnurl: 'LNURL1RETRY' });
      const { outcome } = await startLogin();

      return { polls, outcome };
    }

    it('ignores a failed status request of the replaced challenge and completes the new login', async () => {
      const { polls, outcome } = await replaceChallengeWhilePolling();

      await settle(() => polls[0].reject(new ApiException(404, 'k1 not found')));
      expect(screen.getByTestId('qr')).toHaveTextContent('dfxtaro:lightning:LNURL1RETRY');

      await advanceTime(1000);
      expect(mockGetLnurlAuth).toHaveBeenLastCalledWith('k1-retry');

      await settle(() => polls[1].resolve({ isComplete: true, accessToken: 'retry-token' }));
      await expect(outcome).resolves.toEqual({ session: 'retry-token' });
    });

    it('does not keep polling the replaced challenge after its pending status request', async () => {
      const { polls } = await replaceChallengeWhilePolling();

      await settle(() => polls[0].resolve({ isComplete: false }));
      await advanceTime(1000);

      expect(mockGetLnurlAuth.mock.calls).toEqual([['k1-challenge'], ['k1-retry']]);
    });
  });

  describe('content', () => {
    it('shows the connect error with a retry button', () => {
      mockContentError = 'LNURL login expired';
      renderConnectTaro();

      expect(screen.getByText('LNURL login expired')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Connect'));
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
  });
});
