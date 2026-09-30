const mockNavigate = jest.fn();
const mockCopy = jest.fn();
const mockFetchHolders = jest.fn();
const mockUseRealunitGuard = jest.fn();
let mockContext: Record<string, any>;

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  IconColor: { GRAY: 'gray' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
  StyledButtonWidth: { MIN: 'min' },
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{label}</button>
  ),
  CopyButton: ({ onCopy }: { onCopy?: () => void }) => <button type="button" onClick={onCopy}>Copy</button>,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <p role="alert">{message}</p>,
}));
jest.mock('src/hooks/guard.hook', () => ({ useRealunitGuard: (...args: unknown[]) => mockUseRealunitGuard(...args) }));
jest.mock('src/contexts/settings.context', () => ({ useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }) }));
jest.mock('src/hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));
jest.mock('src/hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('src/hooks/clipboard.hook', () => ({ useClipboard: () => ({ copy: mockCopy }) }));
jest.mock('src/contexts/realunit.context', () => ({ useRealunitContext: () => mockContext }));
jest.mock('src/util/utils', () => ({ blankedAddress: (address: string) => address }));

import { StrictMode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import RealunitHoldersScreen from 'src/screens/realunit-holders.screen';
import { PaginationDirection } from 'src/dto/realunit.dto';

const HOLDER = { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', balance: '10', percentage: 1.25 };
const PAGE_INFO = { startCursor: 'start-1', endCursor: 'end-1', hasPreviousPage: true, hasNextPage: true };

function setContext(overrides: Record<string, unknown> = {}) {
  mockContext = {
    holders: [HOLDER],
    totalCount: 1,
    pageInfo: PAGE_INFO,
    holdersLoading: false,
    holdersError: false,
    fetchHolders: mockFetchHolders,
    ...overrides,
  };
}

describe('RealunitHoldersScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setContext();
  });

  it('guards the screen and shows a spinner while the first page is loading', () => {
    setContext({ holders: [], holdersLoading: true });
    render(<RealunitHoldersScreen />);
    expect(mockUseRealunitGuard).toHaveBeenCalled();
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('loads an empty collection as a successful zero result', () => {
    setContext({ holders: [], totalCount: 0 });
    render(<RealunitHoldersScreen />);
    expect(screen.getByRole('heading', { name: 'All Holders (0)' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockFetchHolders).toHaveBeenCalledTimes(1);
  });

  it('uses the existing zero count fallback while successful holder rows are visible', () => {
    setContext({ totalCount: undefined });
    render(<RealunitHoldersScreen />);
    expect(screen.getByRole('heading', { name: 'All Holders (0)' })).toBeInTheDocument();
    expect(screen.getByText(HOLDER.balance)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('bootstraps the first page only once under StrictMode', () => {
    setContext({ holders: [], totalCount: 0 });
    render(
      <StrictMode>
        <RealunitHoldersScreen />
      </StrictMode>,
    );
    expect(mockFetchHolders).toHaveBeenCalledTimes(1);
  });

  it('shows the failed state without a zero count and retries the first page', () => {
    setContext({ holders: [], totalCount: undefined, holdersError: true });
    render(<RealunitHoldersScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load holders.');
    expect(screen.getByRole('heading', { name: 'All Holders (—)' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'All Holders (0)' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockFetchHolders).toHaveBeenCalledTimes(2);
    expect(mockFetchHolders).toHaveBeenLastCalledWith();
  });

  it('renders holder details, navigates, copies, and paginates both directions', () => {
    render(<RealunitHoldersScreen />);
    expect(screen.getByRole('heading', { name: 'All Holders (1)' })).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('1.25%')).toBeInTheDocument();
    const address = screen.getByRole('button', { name: HOLDER.address });
    fireEvent.click(address);
    expect(mockNavigate).toHaveBeenCalledWith(`/realunit/user/${encodeURIComponent(HOLDER.address)}`);
    fireEvent.click(within(address.closest('tr') as HTMLElement).getByRole('button', { name: 'Copy' }));
    expect(mockCopy).toHaveBeenCalledWith(HOLDER.address);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mockFetchHolders).toHaveBeenLastCalledWith('end-1', PaginationDirection.NEXT);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(mockFetchHolders).toHaveBeenLastCalledWith('start-1', PaginationDirection.PREV);
  });

  it('keeps current rows visible while a page is loading and disables pagination', () => {
    setContext({ holdersLoading: true });
    render(<RealunitHoldersScreen />);
    expect(screen.getByRole('heading', { name: 'All Holders (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('disables each direction at the corresponding page boundary', () => {
    setContext({ pageInfo: { ...PAGE_INFO, hasPreviousPage: false, hasNextPage: false } });
    render(<RealunitHoldersScreen />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});
