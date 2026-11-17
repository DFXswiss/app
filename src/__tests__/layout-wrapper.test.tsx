import { render, screen } from '@testing-library/react';
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

import { LayoutWrapper } from '../components/layout-wrapper';
import { getOpenPasskey, setOpenPasskey, type OpenPasskey } from '../components/home/wallet/passkey-session';

interface DfxSessionState {
  isLoggedIn: boolean;
  account?: number;
}

function applyDfxSession(state: DfxSessionState): void {
  mockSessionState.isLoggedIn = state.isLoggedIn;
  mockAuthState.session = state.account === undefined ? undefined : { account: state.account };
}

describe('LayoutWrapper passkey isolation', () => {
  beforeEach(() => {
    setOpenPasskey(undefined);
    applyDfxSession({ isLoggedIn: false });
  });

  it.each([
    {
      name: 'logs out',
      before: { isLoggedIn: true, account: 7 },
      after: { isLoggedIn: false },
    },
    {
      name: 'changes to another account',
      before: { isLoggedIn: true, account: 7 },
      after: { isLoggedIn: true, account: 8 },
    },
    {
      name: 'logs in after the wallet opened without an account',
      before: { isLoggedIn: false },
      after: { isLoggedIn: true, account: 4 },
    },
  ] as const)('keeps the open passkey when the DFX session $name', ({ before, after }) => {
    applyDfxSession(before);
    const wipe = jest.fn();
    const open = { state: 'unlocked', keys: { wipe } } as unknown as OpenPasskey;
    setOpenPasskey(open);

    const view = render(
      <LayoutWrapper>
        <span>child</span>
      </LayoutWrapper>,
    );

    expect(screen.getByText('child')).toBeInTheDocument();
    applyDfxSession(after);
    view.rerender(
      <LayoutWrapper>
        <span>child</span>
      </LayoutWrapper>,
    );

    expect(wipe).not.toHaveBeenCalled();
    expect(getOpenPasskey()).toBe(open);
  });
});
