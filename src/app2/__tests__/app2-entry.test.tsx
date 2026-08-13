import { render, screen } from '@testing-library/react';
import MainApp2 from '../../Main.app2';

jest.mock('@dfx.swiss/react', () => ({
  DfxContextProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="dfx">{children}</div>,
}));

jest.mock('../App', () => ({
  __esModule: true,
  default: () => <div data-testid="app2-root">app2</div>,
}));

describe('App 2.0 entry', () => {
  it('wraps App2 in the DFX context provider', () => {
    render(<MainApp2 />);
    expect(screen.getByTestId('dfx')).toBeInTheDocument();
    expect(screen.getByTestId('app2-root')).toHaveTextContent('app2');
  });
});
