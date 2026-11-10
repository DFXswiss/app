import { ReactNode } from 'react';

const mockSessionState = { isInitialized: true, isLoggedIn: false };
const mockAuthState: { session?: { account?: number } } = {};

jest.mock('@dfx.swiss/react', () => ({
  useSessionContext: () => mockSessionState,
  useAuthContext: () => mockAuthState,
}));

jest.mock('../components/layout', () => ({
  Layout: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { render, screen } from '@testing-library/react';
import { LayoutWrapper } from '../components/layout-wrapper';
import { PasskeyDfxSession } from '../components/home/wallet/passkey-dfx-session';
import {
  getOpenPasskey,
  getOpenPasskeyAccount,
  setOpenPasskey,
  type OpenPasskey,
} from '../components/home/wallet/passkey-session';

function reset(): void {
  setOpenPasskey(undefined);
  mockSessionState.isInitialized = true;
  mockSessionState.isLoggedIn = false;
  mockAuthState.session = undefined;
}

function openWith(account: number | undefined, keys?: { wipe: jest.Mock }): OpenPasskey {
  const open = { state: 'unlocked', keys } as unknown as OpenPasskey;
  setOpenPasskey(open, account);
  return open;
}

describe('PasskeyDfxSession', () => {
  beforeEach(() => {
    reset();
  });

  it('wipes passkey keys when the DFX session logs out', () => {
    const wipe = jest.fn();
    const open = openWith(7, { wipe });
    mockSessionState.isLoggedIn = true;
    mockAuthState.session = { account: 7 };
    const view = render(<PasskeyDfxSession />);

    expect(wipe).not.toHaveBeenCalled();
    expect(getOpenPasskey()).toBe(open);

    mockSessionState.isLoggedIn = false;
    mockAuthState.session = undefined;
    view.rerender(<PasskeyDfxSession />);

    expect(wipe).toHaveBeenCalledTimes(1);
    expect(getOpenPasskey()).toBeUndefined();
    expect(getOpenPasskeyAccount()).toBeUndefined();
  });

  it('wipes passkey keys when the DFX account changes', () => {
    const wipe = jest.fn();
    openWith(7, { wipe });
    mockSessionState.isLoggedIn = true;
    mockAuthState.session = { account: 7 };
    const view = render(<PasskeyDfxSession />);

    expect(wipe).not.toHaveBeenCalled();

    mockAuthState.session = { account: 8 };
    view.rerender(<PasskeyDfxSession />);

    expect(wipe).toHaveBeenCalledTimes(1);
    expect(getOpenPasskey()).toBeUndefined();
  });

  it('keeps the passkey when the same DFX account receives a new token', () => {
    const wipe = jest.fn();
    const open = openWith(7, { wipe });
    mockSessionState.isLoggedIn = true;
    mockAuthState.session = { account: 7 };
    const view = render(<PasskeyDfxSession />);

    mockAuthState.session = { account: 7 };
    view.rerender(<PasskeyDfxSession />);

    expect(wipe).not.toHaveBeenCalled();
    expect(getOpenPasskey()).toBe(open);
  });

  it('wipes a passkey that was opened with no DFX session when a DFX login arrives', () => {
    const wipe = jest.fn();
    openWith(undefined, { wipe });
    const view = render(<PasskeyDfxSession />);

    expect(wipe).not.toHaveBeenCalled();

    mockSessionState.isLoggedIn = true;
    mockAuthState.session = { account: 4 };
    view.rerender(<PasskeyDfxSession />);

    expect(wipe).toHaveBeenCalledTimes(1);
    expect(getOpenPasskey()).toBeUndefined();
  });

  it('wipes when the stored account already differs from the account at the first render', () => {
    const wipe = jest.fn();
    openWith(7, { wipe });
    mockSessionState.isLoggedIn = true;
    mockAuthState.session = { account: 8 };

    render(<PasskeyDfxSession />);

    expect(wipe).toHaveBeenCalledTimes(1);
    expect(getOpenPasskey()).toBeUndefined();
  });

  it('does nothing when no passkey is open', () => {
    const view = render(<PasskeyDfxSession />);
    expect(getOpenPasskey()).toBeUndefined();

    mockSessionState.isLoggedIn = true;
    mockAuthState.session = { account: 9 };
    view.rerender(<PasskeyDfxSession />);

    mockAuthState.session = { account: 10 };
    view.rerender(<PasskeyDfxSession />);

    expect(getOpenPasskey()).toBeUndefined();
  });

  it('does nothing while signed in until the account id is a number', () => {
    const wipe = jest.fn();
    const open = openWith(7, { wipe });
    mockSessionState.isLoggedIn = true;
    mockAuthState.session = undefined;
    const view = render(<PasskeyDfxSession />);

    expect(wipe).not.toHaveBeenCalled();
    expect(getOpenPasskey()).toBe(open);

    mockAuthState.session = {};
    view.rerender(<PasskeyDfxSession />);

    expect(wipe).not.toHaveBeenCalled();
    expect(getOpenPasskey()).toBe(open);
  });

  it('does nothing before the DFX session is initialized', () => {
    const wipe = jest.fn();
    const open = openWith(7, { wipe });
    mockSessionState.isInitialized = false;
    mockSessionState.isLoggedIn = false;

    render(<PasskeyDfxSession />);

    expect(wipe).not.toHaveBeenCalled();
    expect(getOpenPasskey()).toBe(open);
  });

  it('clears an open passkey that has no keys when the account changes', () => {
    openWith(1);
    mockSessionState.isLoggedIn = true;
    mockAuthState.session = { account: 1 };
    const view = render(<PasskeyDfxSession />);

    mockAuthState.session = { account: 2 };
    view.rerender(<PasskeyDfxSession />);

    expect(getOpenPasskey()).toBeUndefined();
    expect(getOpenPasskeyAccount()).toBeUndefined();
  });

  it('mounts the guard from the layout wrapper', () => {
    const wipe = jest.fn();
    openWith(1, { wipe });
    mockSessionState.isLoggedIn = true;
    mockAuthState.session = { account: 2 };

    render(
      <LayoutWrapper>
        <span>child</span>
      </LayoutWrapper>,
    );

    expect(screen.getByText('child')).toBeInTheDocument();
    expect(wipe).toHaveBeenCalledTimes(1);
    expect(getOpenPasskey()).toBeUndefined();
  });
});
