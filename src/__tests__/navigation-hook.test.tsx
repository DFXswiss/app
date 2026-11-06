jest.mock('@dfx.swiss/react', () => ({}));

const mockAppHandling: { redirectPath?: string; setRedirectPath: jest.Mock; params: { wallet?: string } } = {
  redirectPath: undefined,
  setRedirectPath: jest.fn(),
  params: {},
};

jest.mock('src/contexts/app-handling.context', () => ({
  useAppHandlingContext: () => mockAppHandling,
}));

import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useNavigation } from 'src/hooks/navigation.hook';

let navigation: ReturnType<typeof useNavigation>;

function Harness(): JSX.Element {
  const { pathname, search } = useLocation();
  navigation = useNavigation();
  return (
    <>
      <div data-testid="pathname">{pathname}</div>
      <div data-testid="search">{search}</div>
    </>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Harness />
    </MemoryRouter>,
  );
}

describe('useNavigation', () => {
  beforeEach(() => {
    mockAppHandling.redirectPath = undefined;
    mockAppHandling.setRedirectPath.mockReset();
    mockAppHandling.params = {};
    sessionStorage.removeItem('dfx.kyc.redirect');
    sessionStorage.removeItem('dfx.kyc.address');
  });

  it('stores the kyc location when setRedirect leaves a query', () => {
    renderAt('/kyc?wallet=RealUnit&client=Aktionariat');
    act(() => {
      navigation.navigate('/login', { setRedirect: true });
    });
    expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith('/kyc?wallet=RealUnit&client=Aktionariat');
    expect(sessionStorage.getItem('dfx.kyc.redirect')).toBe('/kyc?wallet=RealUnit&client=Aktionariat');
  });

  it('puts params.wallet back when the live kyc search has no wallet key', () => {
    mockAppHandling.params = { wallet: 'RealUnit' };
    renderAt('/kyc?client=Aktionariat&kyc-redirect=https%3A%2F%2Fshares.realunit.ch%2Fback');
    act(() => {
      navigation.navigate('/2fa', { setRedirect: true });
    });
    expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith(
      '/kyc?client=Aktionariat&kyc-redirect=https%3A%2F%2Fshares.realunit.ch%2Fback&wallet=RealUnit',
    );
    expect(sessionStorage.getItem('dfx.kyc.redirect')).toBe(
      '/kyc?client=Aktionariat&kyc-redirect=https%3A%2F%2Fshares.realunit.ch%2Fback&wallet=RealUnit',
    );
  });

  it('keeps the live wallet when params.wallet differs', () => {
    mockAppHandling.params = { wallet: 'Other' };
    renderAt('/kyc?wallet=RealUnit&client=Aktionariat');
    act(() => {
      navigation.navigate('/login', { setRedirect: true });
    });
    expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith('/kyc?wallet=RealUnit&client=Aktionariat');
    expect(sessionStorage.getItem('dfx.kyc.redirect')).toBe('/kyc?wallet=RealUnit&client=Aktionariat');
  });

  it('does not invent a wallet when params.wallet is missing', () => {
    renderAt('/kyc?client=Aktionariat');
    act(() => {
      navigation.navigate('/login', { setRedirect: true });
    });
    expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith('/kyc?client=Aktionariat');
    expect(sessionStorage.getItem('dfx.kyc.redirect')).toBe('/kyc?client=Aktionariat');
  });

  it('appends the stored address when the live search has wallet and client but no address', () => {
    sessionStorage.setItem('dfx.kyc.address', '0xdef');
    renderAt('/kyc?wallet=RealUnit&client=Aktionariat');
    act(() => {
      navigation.navigate('/login', { setRedirect: true });
    });
    expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith(
      '/kyc?wallet=RealUnit&client=Aktionariat&address=0xdef',
    );
    expect(sessionStorage.getItem('dfx.kyc.redirect')).toBe('/kyc?wallet=RealUnit&client=Aktionariat&address=0xdef');
  });

  it('appends wallet and address together', () => {
    mockAppHandling.params = { wallet: 'RealUnit' };
    sessionStorage.setItem('dfx.kyc.address', '0xdef');
    renderAt('/kyc?client=Aktionariat&kyc-redirect=https%3A%2F%2Fshares.realunit.ch%2Fback');
    act(() => {
      navigation.navigate('/login', { setRedirect: true });
    });
    expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith(
      '/kyc?client=Aktionariat&kyc-redirect=https%3A%2F%2Fshares.realunit.ch%2Fback&wallet=RealUnit&address=0xdef',
    );
    expect(sessionStorage.getItem('dfx.kyc.redirect')).toBe(
      '/kyc?client=Aktionariat&kyc-redirect=https%3A%2F%2Fshares.realunit.ch%2Fback&wallet=RealUnit&address=0xdef',
    );
  });

  it('keeps the live address when the stored address differs', () => {
    sessionStorage.setItem('dfx.kyc.address', '0xdef');
    renderAt('/kyc?wallet=RealUnit&address=0xabc');
    act(() => {
      navigation.navigate('/login', { setRedirect: true });
    });
    expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith('/kyc?wallet=RealUnit&address=0xabc');
    expect(sessionStorage.getItem('dfx.kyc.redirect')).toBe('/kyc?wallet=RealUnit&address=0xabc');
  });

  it('does not invent an address when reading it throws', () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: (key: string, value: string) => original.setItem(key, value),
        removeItem: (key: string) => original.removeItem(key),
        clear: () => original.clear(),
        key: (index: number) => original.key(index),
        get length() {
          return original.length;
        },
      },
    });
    try {
      renderAt('/kyc?wallet=RealUnit');
      expect(() => {
        act(() => {
          navigation.navigate('/login', { setRedirect: true });
        });
      }).not.toThrow();
      expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith('/kyc?wallet=RealUnit');
    } finally {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: original });
    }
  });

  it('stores only the buy pathname and does not write the redirect key', () => {
    renderAt('/buy?x=1');
    act(() => {
      navigation.navigate('/login', { setRedirect: true });
    });
    expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith('/buy');
    expect(sessionStorage.getItem('dfx.kyc.redirect')).toBeNull();
  });

  it('stores the explicit redirect path when supplied', () => {
    renderAt('/buy');
    act(() => {
      navigation.navigate('/login', { setRedirect: true, redirectPath: '/sell' });
    });
    expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith('/sell');
  });

  it('stores /kyc without a search and does not write the redirect key', () => {
    renderAt('/kyc');
    act(() => {
      navigation.navigate('/login', { setRedirect: true });
    });
    expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith('/kyc');
    expect(sessionStorage.getItem('dfx.kyc.redirect')).toBeNull();
  });

  it('goes back to the stored kyc query and clears it', () => {
    mockAppHandling.redirectPath = '/kyc?wallet=RealUnit';
    sessionStorage.setItem('dfx.kyc.redirect', '/kyc?wallet=RealUnit');
    sessionStorage.setItem('dfx.kyc.address', '0xdef');
    renderAt('/login');
    act(() => {
      navigation.goBack();
    });
    expect(screen.getByTestId('pathname').textContent).toBe('/kyc');
    expect(screen.getByTestId('search').textContent).toBe('?wallet=RealUnit');
    expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith(undefined);
    expect(sessionStorage.getItem('dfx.kyc.redirect')).toBeNull();
    expect(sessionStorage.getItem('dfx.kyc.address')).toBeNull();
  });

  it('goes back to a stored path without a query', () => {
    mockAppHandling.redirectPath = '/sell';
    renderAt('/login');
    act(() => {
      navigation.goBack();
    });
    expect(screen.getByTestId('pathname').textContent).toBe('/sell');
    expect(screen.getByTestId('search').textContent).toBe('');
  });

  it('clears both kyc session keys when going back without a query', () => {
    mockAppHandling.redirectPath = '/sell';
    sessionStorage.setItem('dfx.kyc.redirect', '/kyc?wallet=RealUnit&address=0xdef');
    sessionStorage.setItem('dfx.kyc.address', '0xdef');
    renderAt('/login');
    act(() => {
      navigation.goBack();
    });
    expect(screen.getByTestId('pathname').textContent).toBe('/sell');
    expect(sessionStorage.getItem('dfx.kyc.redirect')).toBeNull();
    expect(sessionStorage.getItem('dfx.kyc.address')).toBeNull();
  });

  it('still sets the redirect path when sessionStorage.setItem throws', () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => original.getItem(key),
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: (key: string) => original.removeItem(key),
        clear: () => original.clear(),
        key: (index: number) => original.key(index),
        get length() {
          return original.length;
        },
      },
    });
    try {
      renderAt('/kyc?wallet=RealUnit&client=Aktionariat');
      expect(() => {
        act(() => {
          navigation.navigate('/login', { setRedirect: true });
        });
      }).not.toThrow();
      expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith('/kyc?wallet=RealUnit&client=Aktionariat');
    } finally {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: original });
    }
  });

  it('still leaves the stored query when sessionStorage.removeItem throws', () => {
    mockAppHandling.redirectPath = '/kyc?wallet=RealUnit';
    sessionStorage.setItem('dfx.kyc.redirect', '/kyc?wallet=RealUnit');
    renderAt('/login');
    const original = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => original.getItem(key),
        setItem: (key: string, value: string) => original.setItem(key, value),
        removeItem: () => {
          throw new Error('blocked');
        },
        clear: () => original.clear(),
        key: (index: number) => original.key(index),
        get length() {
          return original.length;
        },
      },
    });
    try {
      expect(() => {
        act(() => {
          navigation.goBack();
        });
      }).not.toThrow();
      expect(screen.getByTestId('pathname').textContent).toBe('/kyc');
      expect(screen.getByTestId('search').textContent).toBe('?wallet=RealUnit');
    } finally {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: original });
    }
  });

  it('goes back to /account when no redirect is stored', () => {
    renderAt('/login');
    act(() => {
      navigation.goBack();
    });
    expect(screen.getByTestId('pathname').textContent).toBe('/account');
    expect(mockAppHandling.setRedirectPath).toHaveBeenCalledWith(undefined);
  });

  it('navigates back one history entry when given a number', () => {
    render(
      <MemoryRouter initialEntries={['/buy', '/kyc?wallet=RealUnit']} initialIndex={1}>
        <Harness />
      </MemoryRouter>,
    );
    act(() => {
      navigation.navigate(-1);
    });
    expect(screen.getByTestId('pathname').textContent).toBe('/buy');
  });

  it('sets a query param on the current search', () => {
    renderAt('/kyc?wallet=RealUnit');
    act(() => {
      navigation.setParams(new URLSearchParams('client=Aktionariat'));
    });
    expect(screen.getByTestId('pathname').textContent).toBe('/kyc');
    expect(screen.getByTestId('search').textContent).toBe('?wallet=RealUnit&client=Aktionariat');
  });

  it('clears a named query param and replaces the current entry', () => {
    renderAt('/kyc?wallet=RealUnit&client=Aktionariat');
    act(() => {
      navigation.clearParams(['wallet']);
    });
    expect(screen.getByTestId('pathname').textContent).toBe('/kyc');
    expect(screen.getByTestId('search').textContent).toBe('?client=Aktionariat');
  });
});
