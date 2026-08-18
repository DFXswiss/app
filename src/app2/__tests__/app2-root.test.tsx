const mockSessionState = { throwOnRender: false };

jest.mock('../screens/account', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/home', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/kyc', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/limit', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/ocp/OcpScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/support', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/transactions', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/return-route', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/parts/NotFound', () => ({ NotFound: () => <div>not-found</div> }));
jest.mock('../components/Shell', () => ({
  Shell: () => <div data-testid="shell" />,
}));
jest.mock('../wallets/session', () => ({
  WalletSessionProvider: ({ children }: { children: React.ReactNode }) => {
    if (mockSessionState.throwOnRender) throw new Error('session boom');
    return <div data-testid="session">{children}</div>;
  },
}));
jest.mock('../assets/brand/logo-white.svg', () => 'logo-white.svg');

import { fireEvent, render, screen } from '@testing-library/react';
import App2 from '../App';

describe('App2 root', () => {
  beforeEach(() => {
    mockSessionState.throwOnRender = false;
  });

  it('mounts the hash router inside the session and language providers', () => {
    window.location.hash = '#/';
    render(<App2 />);
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    expect(screen.getByTestId('session')).toBeInTheDocument();
  });

  it('replaces a real-path Checkout return into the hash before the router mounts', () => {
    const replace = jest.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/app2/buy/success',
        search: '?cko-payment-id=1',
        hash: '',
        href: 'http://localhost/app2/buy/success?cko-payment-id=1',
        origin: 'http://localhost',
        replace,
        reload: jest.fn(),
      },
    });
    jest.isolateModules(() => {
      require('../App');
    });
    expect(replace).toHaveBeenCalledWith('/app2/#/buy/success?cko-payment-id=1');
  });

  it('renders the branded fallback when a child throws', () => {
    mockSessionState.throwOnRender = true;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = jest.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
    render(<App2 />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(reload).toHaveBeenCalled();
    spy.mockRestore();
  });
});
