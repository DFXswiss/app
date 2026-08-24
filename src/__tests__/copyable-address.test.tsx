import { act, fireEvent, render, screen } from '@testing-library/react';
import { CopyableAddress } from 'src/components/realunit/copyable-address';

const mockCopy = jest.fn();

jest.mock('src/hooks/clipboard.hook', () => ({
  useClipboard: () => ({ copy: mockCopy, isCopying: false }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  IconColor: { GRAY: 'gray' },
  CopyButton: ({ onCopy }: { onCopy?: () => void }) => (
    <button type="button" data-testid="copy-button" onClick={onCopy}>
      copy
    </button>
  ),
}));

jest.mock('src/util/utils', () => ({
  blankedAddress: (address: string) => `blanked:${address}`,
}));

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

describe('CopyableAddress', () => {
  beforeEach(() => {
    mockCopy.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('renders a dash when the address is missing', () => {
    render(<CopyableAddress />);
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.queryByTestId('copy-button')).not.toBeInTheDocument();
  });

  it('copies on address click and shows Copied until the timer elapses', () => {
    render(<CopyableAddress address={ADDRESS} />);
    fireEvent.click(screen.getByText(`blanked:${ADDRESS}`));
    expect(mockCopy).toHaveBeenCalledWith(ADDRESS);
    expect(screen.getByText('Copied')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });

  it('copies on the copy button and stops the click from bubbling', () => {
    const onRowClick = jest.fn();
    render(
      <div onClick={onRowClick}>
        <CopyableAddress address={ADDRESS} />
      </div>,
    );
    fireEvent.click(screen.getByTestId('copy-button'));
    expect(mockCopy).toHaveBeenCalledWith(ADDRESS);
    expect(screen.getByText('Copied')).toBeInTheDocument();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('clears the copied timer on unmount', () => {
    const { unmount } = render(<CopyableAddress address={ADDRESS} displayLength={18} />);
    fireEvent.click(screen.getByText(`blanked:${ADDRESS}`));
    unmount();
    jest.advanceTimersByTime(1000);
    expect(mockCopy).toHaveBeenCalledWith(ADDRESS);
  });
});
