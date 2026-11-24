jest.mock('../App', () => ({
  __esModule: true,
  Routes: [{ children: [{ path: 'kyc', isKycScreen: true }] }],
}));

jest.mock('@dfx.swiss/react', () => ({}));

jest.mock('src/contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ redirectPath: undefined, setRedirectPath: jest.fn(), params: {} }),
}));

jest.mock('src/hooks/app-params.hook', () => ({
  useAppParams: () => ({}),
}));

jest.mock('src/components/info-banner', () => ({
  InfoBannerComponent: () => null,
}));

jest.mock('src/components/navigation', () => {
  const { forwardRef } = jest.requireActual('react') as typeof import('react');
  return {
    Navigation: forwardRef<HTMLDivElement>(function NavigationMock(_, ref) {
      return <div ref={ref} />;
    }),
  };
});

import { render, waitFor } from '@testing-library/react';
import { MutableRefObject, useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Layout } from 'src/components/layout';
import { LayoutConfigProvider } from 'src/contexts/layout-config.context';
import { LayoutContextProvider } from 'src/contexts/layout.context';
import { useNavigation } from 'src/hooks/navigation.hook';

let currentLocation = '';

function LocationProbe(): null {
  const { pathname, search } = useLocation();
  currentLocation = `${pathname}${search}`;
  return null;
}

// Like the chat screen without a stored conversation: redirect as soon as it mounts.
function RedirectingScreen({ to }: { to?: string }): null {
  const { navigate } = useNavigation();
  useEffect(() => {
    if (to) navigate(to, { replace: true });
  }, []);
  return null;
}

// Mounts the layout and the screen in one commit, as happens when the deleted-address gate
// releases the app after the user has loaded.
function renderAt(path: string, redirectTo?: string) {
  const ref = (): MutableRefObject<HTMLDivElement | null> => ({ current: null });
  render(
    <MemoryRouter initialEntries={[path]}>
      <LayoutContextProvider modalRootRef={ref()} scrollRef={ref()} rootRef={ref()}>
        <LayoutConfigProvider>
          <Layout>
            <RedirectingScreen to={redirectTo} />
          </Layout>
        </LayoutConfigProvider>
      </LayoutContextProvider>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('Layout with a screen that redirects on mount', () => {
  beforeEach(() => {
    currentLocation = '';
  });

  it('keeps the redirect of a screen mounted in the same commit', async () => {
    renderAt('/support/chat', '/support/issue');
    await waitFor(() => expect(currentLocation).toBe('/support/issue'));
    // Let any trailing navigation settle before the final check.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(currentLocation).toBe('/support/issue');
  });

  it('still drops the code param on a non-KYC route', async () => {
    renderAt('/account?code=abc');
    await waitFor(() => expect(currentLocation).toBe('/account'));
  });
});
