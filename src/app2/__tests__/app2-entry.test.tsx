import { render, screen } from '@testing-library/react';
import MainApp2 from '../../Main.app2';

jest.mock('@dfx.swiss/react', () => ({
  DfxContextProvider: ({
    children,
    includePrivateAssets,
  }: {
    children: React.ReactNode;
    includePrivateAssets?: boolean;
  }) => (
    <div data-testid="dfx" data-include-private={String(includePrivateAssets)}>
      {children}
    </div>
  ),
}));

jest.mock('../App', () => ({
  __esModule: true,
  default: () => <div data-testid="app2-root">app2</div>,
}));

describe('App 2.0 entry', () => {
  it('wraps App2 in the DFX context provider', () => {
    render(<MainApp2 />);
    expect(screen.getByTestId('dfx')).toHaveAttribute('data-include-private', 'true');
    expect(screen.getByTestId('app2-root')).toHaveTextContent('app2');
  });
});
