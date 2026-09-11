// Component-level: ConnectTaro's LNURL status poller rejects the pending login with a dedicated
// message when the backend no longer knows the challenge (404 after the TTL cleanup), and keeps
// the generic message for every other poll failure.

const mockCreateLnurlAuth = jest.fn();
const mockGetLnurlAuth = jest.fn();
let mockConnectBaseProps: any;

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
  useAuthContext: () => ({ session: undefined }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledButton: () => null,
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { MIN: 'min' },
  StyledLoadingSpinner: () => null,
  StyledVerticalStack: () => null,
}));

jest.mock('src/contexts/wallet.context', () => ({
  WalletType: { DFX_TARO: 'DfxTaro' },
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('../components/payment/qr-code', () => ({ QrCopy: () => null }));

jest.mock('../components/home/connect-shared', () => ({ ConnectError: () => null }));

jest.mock('../components/home/connect-base', () => ({
  ConnectBase: (props: unknown) => {
    mockConnectBaseProps = props;
    return null;
  },
}));

import { ApiException } from '@dfx.swiss/react';
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import ConnectTaro from '../components/home/wallet/connect-taro';
import { WalletType } from '../contexts/wallet.context';

describe('ConnectTaro LNURL status poller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockConnectBaseProps = undefined;
    mockCreateLnurlAuth.mockResolvedValue({ k1: 'k1-challenge', lnurl: 'LNURL1TEST' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function loginWithPollError(pollError: unknown): Promise<unknown> {
    mockGetLnurlAuth.mockRejectedValue(pollError);

    render(
      <ConnectTaro
        rootRef={createRef<HTMLDivElement>()}
        wallet={WalletType.DFX_TARO}
        isConnect={false}
        onLogin={jest.fn()}
        onCancel={jest.fn()}
        onSwitch={jest.fn()}
      />,
    );

    let outcome: Promise<unknown> = Promise.resolve();
    await act(async () => {
      outcome = mockConnectBaseProps
        .getAccount(WalletType.DFX_TARO, 'Lightning', false)
        .then(() => new Error('login unexpectedly resolved'))
        .catch((e: unknown) => e);

      // let createLnurlAuth resolve and the token promise be created before React renders
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockGetLnurlAuth).toHaveBeenCalledWith('k1-challenge');
    return outcome;
  }

  it('rejects with "LNURL login expired" when the challenge is no longer known (404)', async () => {
    const error = await loginWithPollError(new ApiException(404, 'k1 not found'));

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('LNURL login expired');
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
  });

  it('stops polling after the first failed status check', async () => {
    await loginWithPollError(new ApiException(404, 'k1 not found'));

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockGetLnurlAuth).toHaveBeenCalledTimes(1);
  });
});
