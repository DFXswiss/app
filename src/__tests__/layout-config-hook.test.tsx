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
        onBack: expect.any(Function),
      }),
    );
    const publishedBack = mockSetConfig.mock.calls[0][0].onBack as (() => void) | undefined;
    if (publishedBack === undefined) throw new Error('Expected a published back handler');
    expect(mockSetConfig).toHaveBeenCalledTimes(1);
    rerender(<Configured options={{ title: 'Wallet', noHeader: true, noMaxWidth: true, onBack: secondBack }} />);
    publishedBack();
    expect(secondBack).toHaveBeenCalledTimes(1);
    expect(firstBack).not.toHaveBeenCalled();
    expect(mockSetConfig).toHaveBeenCalledTimes(1);
    rerender(<Configured options={{ title: 'Wallet', noHeader: true, noMaxWidth: false, onBack: secondBack }} />);
    expect(mockSetConfig).toHaveBeenCalledTimes(2);
    expect(mockSetConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ noHeader: true, noMaxWidth: false, onBack: publishedBack }),
    );
    rerender(<Configured options={{ title: 'Wallet', noHeader: false, noMaxWidth: false }} />);
    expect(mockSetConfig).toHaveBeenCalledTimes(3);
    expect(mockSetConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Wallet',
        noHeader: false,
        noMaxWidth: false,
        onBack: undefined,
      }),
    );
    publishedBack();
    expect(secondBack).toHaveBeenCalledTimes(1);
    unmount();
    expect(mockSetConfig).toHaveBeenLastCalledWith({});
  });
});
