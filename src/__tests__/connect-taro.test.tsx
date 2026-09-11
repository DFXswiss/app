// Component-level: ConnectTaro creates an LNURL auth challenge, shows it as a Taro link, polls its
// status and resolves the login with the access token. An expired challenge (404 after the TTL
// cleanup) rejects the login with a dedicated message; every other poll failure keeps the generic one.

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

import { ApiException } from '@dfx.swiss/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { Account } from '../components/home/connect-shared';
import ConnectTaro from '../components/home/wallet/connect-taro';
import { WalletType } from '../contexts/wallet.context';

interface ConnectBaseProps {
  isSupported: () => boolean;
  getAccount: (wallet: WalletType, blockchain: string, isReconnect: boolean) => Promise<Account>;
  signMessage: () => Promise<never>;
  autoConnect?: boolean;
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
      .getAccount(WalletType.DFX_TARO, 'Lightning', false)
      .catch((e: unknown) => e);

    // let createLnurlAuth resolve and the token promise be created before React renders
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

  return { outcome };
}

async function advancePolling(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
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

      await expect(connectBase().getAccount(WalletType.DFX_TARO, 'Lightning', true)).resolves.toEqual({
        address: 'LNURL1SESSION',
      });
      expect(mockCreateLnurlAuth).not.toHaveBeenCalled();
    });

    it('shows the challenge as a Taro link and opens the app with it', async () => {
      const open = jest.spyOn(window, 'open').mockImplementation(() => null);
      mockGetLnurlAuth.mockResolvedValue({ isComplete: false });
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
      await advancePolling(1000);
      await advancePolling(1000);

      await expect(outcome).resolves.toEqual({ session: 'access-token' });

      await advancePolling(5000);
      expect(mockGetLnurlAuth).toHaveBeenCalledTimes(2);
    });

    it('stops polling when unmounted', async () => {
      const { unmount } = renderConnectTaro();

      await startLogin();
      unmount();
      await advancePolling(5000);

      expect(mockGetLnurlAuth).not.toHaveBeenCalled();
    });
  });

  describe('status poll failure', () => {
    async function loginWithPollError(pollError: unknown): Promise<unknown> {
      mockGetLnurlAuth.mockRejectedValue(pollError);
      renderConnectTaro();

      const { outcome } = await startLogin();
      await advancePolling(1000);

      expect(mockGetLnurlAuth).toHaveBeenCalledWith('k1-challenge');
      return outcome;
    }

    it('rejects with "LNURL login expired" when the challenge is no longer known (404)', async () => {
      const error = await loginWithPollError(new ApiException(404, 'k1 not found'));

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('LNURL login expired');
      expect(screen.queryByTestId('qr')).not.toBeInTheDocument();
    });

    it.each([
      ['a network error', new ApiException(0, 'Network error: Failed to fetch')],
      ['a server error', new ApiException(500, 'Internal server error')],
      ['a non-API error', new Error('404')],
      ['a non-ApiException object carrying statusCode 404', { statusCode: 404, message: 'k1 not found' }],
    ])('rejects with "Authentication failed" on %s', async (_label, pollError) => {
      const error = await loginWithPollError(pollError);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Authentication failed');
      expect(screen.queryByTestId('qr')).not.toBeInTheDocument();
    });

    it('stops polling after the first failed status check', async () => {
      await loginWithPollError(new ApiException(404, 'k1 not found'));
      await advancePolling(5000);

      expect(mockGetLnurlAuth).toHaveBeenCalledTimes(1);
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
