jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('@dfx.swiss/react-components', () => ({
  StyledButtonWidth: { MIN: 'min' },
  StyledButtonSize: { SMALL: 'small', BIG: 'big' },
  StyledButtonColor: { BLUE: 'blue', RED: 'red' },
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

const mockGetTransferCostLimit = jest.fn();
const mockUpdateTransferCostLimit = jest.fn();
jest.mock('src/hooks/realunit-api.hook', () => ({
  useRealunitApi: () => ({
    getTransferCostLimit: (...args: unknown[]) => mockGetTransferCostLimit(...args),
    updateTransferCostLimit: (...args: unknown[]) => mockUpdateTransferCostLimit(...args),
  }),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RealunitTransferCostLimitPanel } from 'src/components/realunit/transfer-cost-limit-panel';

const translate = (_ns: string, key: string) => key;

const ETH_LABEL = 'Max ETH per transfer';
const CHF_LABEL = 'Max CHF per customer per month';

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByTestId('transfer-cost-limit-loading')).not.toBeInTheDocument());
}

async function waitForSaveEnabled() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled());
}

describe('RealunitTransferCostLimitPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTransferCostLimit.mockResolvedValue({ maxEthPerTransfer: null, maxChfPerCustomerMonth: null });
    mockUpdateTransferCostLimit.mockResolvedValue({ maxEthPerTransfer: '0', maxChfPerCustomerMonth: '0' });
  });

  it('shows the required hint and loading state and keeps Save disabled while loading', () => {
    mockGetTransferCostLimit.mockImplementation(() => new Promise(() => undefined));
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    expect(screen.getByTestId('transfer-cost-limit-panel')).toBeInTheDocument();
    expect(
      screen.getByText('Both values are required. Until they are saved, transfers are not possible.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('transfer-cost-limit-loading')).toHaveTextContent('Loading');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('renders empty inputs and keeps Save disabled when the API returns null caps', async () => {
    mockGetTransferCostLimit.mockResolvedValue({ maxEthPerTransfer: null, maxChfPerCustomerMonth: null });
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    await waitForLoaded();
    expect(screen.getByLabelText(ETH_LABEL)).toHaveValue('');
    expect(screen.getByLabelText(CHF_LABEL)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('renders 0.02 and 25.00 when the API returns those caps', async () => {
    mockGetTransferCostLimit.mockResolvedValue({ maxEthPerTransfer: '0.02', maxChfPerCustomerMonth: '25.00' });
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    await waitFor(() => expect(screen.getByLabelText(ETH_LABEL)).toHaveValue('0.02'));
    expect(screen.getByLabelText(CHF_LABEL)).toHaveValue('25.00');
  });

  it('shows ErrorHint and Retry when GET fails', async () => {
    mockGetTransferCostLimit.mockRejectedValue(new Error('load-fail'));
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('load-fail'));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('does not save when a field is empty', async () => {
    mockGetTransferCostLimit.mockResolvedValue({ maxEthPerTransfer: '0.02', maxChfPerCustomerMonth: '25.00' });
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    await waitForSaveEnabled();
    fireEvent.change(screen.getByLabelText(ETH_LABEL), { target: { value: '' } });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mockUpdateTransferCostLimit).not.toHaveBeenCalled();
  });

  it('does not save when CHF is 1.123', async () => {
    mockGetTransferCostLimit.mockResolvedValue({ maxEthPerTransfer: '0.02', maxChfPerCustomerMonth: '25.00' });
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    await waitForSaveEnabled();
    fireEvent.change(screen.getByLabelText(CHF_LABEL), { target: { value: '1.123' } });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mockUpdateTransferCostLimit).not.toHaveBeenCalled();
  });

  it('submits 0 and 0 as those two strings', async () => {
    mockGetTransferCostLimit.mockResolvedValue({ maxEthPerTransfer: null, maxChfPerCustomerMonth: null });
    mockUpdateTransferCostLimit.mockResolvedValue({ maxEthPerTransfer: '0', maxChfPerCustomerMonth: '0' });
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    await waitForLoaded();
    fireEvent.change(screen.getByLabelText(ETH_LABEL), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(CHF_LABEL), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockUpdateTransferCostLimit).toHaveBeenCalledWith({
        maxEthPerTransfer: '0',
        maxChfPerCustomerMonth: '0',
      }),
    );
    await waitFor(() => expect(screen.getByLabelText(ETH_LABEL)).toHaveValue('0'));
    expect(screen.getByLabelText(CHF_LABEL)).toHaveValue('0');
  });

  it('shows ErrorHint when PUT fails', async () => {
    mockUpdateTransferCostLimit.mockRejectedValue(new Error('save-fail'));
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    await waitForLoaded();
    fireEvent.change(screen.getByLabelText(ETH_LABEL), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(CHF_LABEL), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('save-fail'));
  });

  it('ignores a second Save click while update is in flight', async () => {
    const deferred: {
      resolve: (value: { maxEthPerTransfer: string | null; maxChfPerCustomerMonth: string | null }) => void;
    } = { resolve: () => undefined };
    mockUpdateTransferCostLimit.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve;
        }),
    );
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    await waitForLoaded();
    fireEvent.change(screen.getByLabelText(ETH_LABEL), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(CHF_LABEL), { target: { value: '0' } });

    const save = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(mockUpdateTransferCostLimit).toHaveBeenCalledTimes(1);

    deferred.resolve({ maxEthPerTransfer: '0', maxChfPerCustomerMonth: '0' });
    await waitFor(() => expect(screen.getByLabelText(ETH_LABEL)).toHaveValue('0'));
  });

  it('falls back to Failed to load transfer cost limits. when GET rejects without a message', async () => {
    mockGetTransferCostLimit.mockRejectedValue({});
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    await waitFor(() =>
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Failed to load transfer cost limits.'),
    );
  });

  it('falls back to Unknown error when PUT rejects without a message', async () => {
    mockUpdateTransferCostLimit.mockRejectedValue({});
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    await waitForLoaded();
    fireEvent.change(screen.getByLabelText(ETH_LABEL), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(CHF_LABEL), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });
});
