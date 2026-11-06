import { render } from '@testing-library/react';
import { LayoutConfig } from '../contexts/layout-config.context';
import { useLayoutOptions } from '../hooks/layout-config.hook';

const mockSetConfig = jest.fn();
jest.mock('../contexts/layout-config.context', () => ({
  useLayoutConfigContext: () => ({ setConfig: mockSetConfig }),
}));

function Configured({ options }: { options: LayoutConfig }): JSX.Element {
  useLayoutOptions(options);
  return <div>content</div>;
}

describe('useLayoutOptions', () => {
  beforeEach(() => mockSetConfig.mockClear());

  it('applies changed options, ignores equivalent callbacks and clears on unmount', () => {
    const firstBack = jest.fn();
    const secondBack = jest.fn();
    const { rerender, unmount } = render(
      <Configured options={{ title: 'Wallet', noHeader: true, noMaxWidth: true, onBack: firstBack }} />,
    );
    expect(mockSetConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Wallet',
        noHeader: true,
        noMaxWidth: true,
        onBack: firstBack,
      }),
    );
    expect(mockSetConfig).toHaveBeenCalledTimes(1);
    rerender(<Configured options={{ title: 'Wallet', noHeader: true, noMaxWidth: true, onBack: secondBack }} />);
    expect(mockSetConfig).toHaveBeenCalledTimes(1);
    rerender(<Configured options={{ title: 'Wallet', noHeader: false, noMaxWidth: false }} />);
    expect(mockSetConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Wallet',
        noHeader: false,
        noMaxWidth: false,
        onBack: undefined,
      }),
    );
    unmount();
    expect(mockSetConfig).toHaveBeenLastCalledWith({});
  });
});
