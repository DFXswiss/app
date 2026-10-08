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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

type LimitPayload = {
  maxEthPerTransfer: string | null;
  maxChfPerCustomerMonth: string | null;
};

function deferredLimit(): {
  promise: Promise<LimitPayload>;
  resolve: (value: LimitPayload) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve: (value: LimitPayload) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<LimitPayload>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function readReactHandler(node: HTMLElement, propName: string): (...args: unknown[]) => unknown {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  if (!key) {
    throw new Error('DOM node has no React props');
  }
  const props = (node as unknown as Record<string, Record<string, unknown>>)[key];
  if (!props || typeof props[propName] !== 'function') {
    throw new Error(`DOM node has no ${propName}`);
  }
  return props[propName] as (...args: unknown[]) => unknown;
}

function readOnClick(node: HTMLElement): () => void {
  return readReactHandler(node, 'onClick') as () => void;
}

async function startOverlappingRetryLoads(): Promise<{
  older: ReturnType<typeof deferredLimit>;
  newer: ReturnType<typeof deferredLimit>;
}> {
  mockGetTransferCostLimit.mockRejectedValueOnce(new Error('load-fail'));
  render(<RealunitTransferCostLimitPanel translate={translate} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument());

  const older = deferredLimit();
  const newer = deferredLimit();
  mockGetTransferCostLimit.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

  const onClick = readOnClick(screen.getByRole('button', { name: 'Retry' }));
  await act(async () => {
    // Retry unmounts once isLoading commits, so both generations must start in the same turn.
    onClick();
    onClick();
  });
  expect(mockGetTransferCostLimit).toHaveBeenCalledTimes(3);
  return { older, newer };
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

  it('keeps Save disabled after GET failure until Retry load succeeds', async () => {
    mockGetTransferCostLimit.mockRejectedValueOnce(new Error('load-fail'));
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('load-fail'));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mockUpdateTransferCostLimit).not.toHaveBeenCalled();

    let resolveRetry: (value: LimitPayload) => void = () => undefined;
    mockGetTransferCostLimit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRetry = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mockUpdateTransferCostLimit).not.toHaveBeenCalled();

    resolveRetry({ maxEthPerTransfer: '0.02', maxChfPerCustomerMonth: '25.00' });
    await waitForSaveEnabled();
    mockUpdateTransferCostLimit.mockResolvedValue({
      maxEthPerTransfer: '0.02',
      maxChfPerCustomerMonth: '25.00',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mockUpdateTransferCostLimit).toHaveBeenCalledWith({
        maxEthPerTransfer: '0.02',
        maxChfPerCustomerMonth: '25.00',
      }),
    );
  });

  it('ignores a stale GET success from an older Retry generation', async () => {
    const { older, newer } = await startOverlappingRetryLoads();
    newer.resolve({ maxEthPerTransfer: '0.02', maxChfPerCustomerMonth: '25.00' });
    await waitFor(() => expect(screen.getByLabelText(ETH_LABEL)).toHaveValue('0.02'));
    expect(screen.getByLabelText(CHF_LABEL)).toHaveValue('25.00');
    await waitForSaveEnabled();

    await act(async () => {
      older.resolve({ maxEthPerTransfer: '9', maxChfPerCustomerMonth: '9' });
      await older.promise;
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByLabelText(ETH_LABEL)).toHaveValue('0.02');
    expect(screen.getByLabelText(CHF_LABEL)).toHaveValue('25.00');
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('ignores a stale GET failure from an older Retry generation', async () => {
    const { older, newer } = await startOverlappingRetryLoads();
    newer.resolve({ maxEthPerTransfer: '0.02', maxChfPerCustomerMonth: '25.00' });
    await waitFor(() => expect(screen.getByLabelText(ETH_LABEL)).toHaveValue('0.02'));
    expect(screen.getByLabelText(CHF_LABEL)).toHaveValue('25.00');

    await act(async () => {
      older.reject(new Error('load-fail'));
      await older.promise.catch(() => undefined);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.getByLabelText(ETH_LABEL)).toHaveValue('0.02');
    expect(screen.getByLabelText(CHF_LABEL)).toHaveValue('25.00');
  });

  it('does not save when the empty form is submitted', async () => {
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    await waitForLoaded();
    const form = screen.getByTestId('transfer-cost-limit-panel').querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    expect(mockUpdateTransferCostLimit).not.toHaveBeenCalled();
  });

  it('ignores a second same-turn form submit while update is in flight', async () => {
    mockGetTransferCostLimit.mockResolvedValue({ maxEthPerTransfer: '0.02', maxChfPerCustomerMonth: '25.00' });
    render(<RealunitTransferCostLimitPanel translate={translate} />);
    await waitForSaveEnabled();

    const deferred = deferredLimit();
    mockUpdateTransferCostLimit.mockReturnValueOnce(deferred.promise);

    const form = screen.getByTestId('transfer-cost-limit-panel').querySelector('form') as HTMLFormElement;
    const onSubmit = readReactHandler(form, 'onSubmit');
    await act(async () => {
      onSubmit();
      onSubmit();
    });
    expect(mockUpdateTransferCostLimit).toHaveBeenCalledTimes(1);
    expect(mockUpdateTransferCostLimit).toHaveBeenCalledWith({
      maxEthPerTransfer: '0.02',
      maxChfPerCustomerMonth: '25.00',
    });

    await act(async () => {
      deferred.resolve({ maxEthPerTransfer: '0.02', maxChfPerCustomerMonth: '25.00' });
      await deferred.promise;
    });
  });
});
