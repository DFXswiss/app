jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('@dfx.swiss/react-components', () => ({
  StyledButtonWidth: { MIN: 'min' },
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

const mockGetBuyLimit = jest.fn();
const mockUpdateBuyLimit = jest.fn();
jest.mock('src/hooks/realunit-api.hook', () => ({
  useRealunitApi: () => ({
    getBuyLimit: (...args: unknown[]) => mockGetBuyLimit(...args),
    updateBuyLimit: (...args: unknown[]) => mockUpdateBuyLimit(...args),
  }),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RealunitBuyLimitPanel } from 'src/components/realunit/buy-limit-panel';

const translate = (_ns: string, key: string) => key;

const HEADING = 'Max tokens per buy';

async function waitForReady() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled());
}

describe('RealunitBuyLimitPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBuyLimit.mockResolvedValue({ maxTokensPerTx: null });
    mockUpdateBuyLimit.mockResolvedValue({ maxTokensPerTx: null });
  });

  it('shows the heading and loading state and keeps Save disabled while loading', () => {
    mockGetBuyLimit.mockImplementation(() => new Promise(() => undefined));
    render(<RealunitBuyLimitPanel translate={translate} />);
    expect(screen.getByRole('heading', { name: HEADING })).toBeInTheDocument();
    expect(screen.getByTestId('buy-limit-loading')).toHaveTextContent('Loading');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('renders an empty input when the API returns a null cap', async () => {
    mockGetBuyLimit.mockResolvedValue({ maxTokensPerTx: null });
    render(<RealunitBuyLimitPanel translate={translate} />);
    await waitForReady();
    expect(screen.getByLabelText(HEADING)).toHaveValue(null);
  });

  it('renders 20000 when the API returns that loaded cap', async () => {
    mockGetBuyLimit.mockResolvedValue({ maxTokensPerTx: 20000 });
    render(<RealunitBuyLimitPanel translate={translate} />);
    await waitFor(() => expect(screen.getByLabelText(HEADING)).toHaveValue(20000));
  });

  it('keeps Save disabled for 0, -1, and 1.5', async () => {
    render(<RealunitBuyLimitPanel translate={translate} />);
    await waitForReady();
    const input = screen.getByLabelText(HEADING);
    const save = screen.getByRole('button', { name: 'Save' });

    fireEvent.change(input, { target: { value: '0' } });
    expect(save).toBeDisabled();

    fireEvent.change(input, { target: { value: '-1' } });
    expect(save).toBeDisabled();

    fireEvent.change(input, { target: { value: '1.5' } });
    expect(save).toBeDisabled();
  });

  it('enables Save for empty, 1, and 20000', async () => {
    render(<RealunitBuyLimitPanel translate={translate} />);
    await waitForReady();
    const input = screen.getByLabelText(HEADING);
    const save = screen.getByRole('button', { name: 'Save' });

    fireEvent.change(input, { target: { value: '' } });
    expect(save).not.toBeDisabled();

    fireEvent.change(input, { target: { value: '1' } });
    expect(save).not.toBeDisabled();

    fireEvent.change(input, { target: { value: '20000' } });
    expect(save).not.toBeDisabled();
  });

  it('submits null when the input is empty', async () => {
    mockUpdateBuyLimit.mockResolvedValue({ maxTokensPerTx: null });
    render(<RealunitBuyLimitPanel translate={translate} />);
    await waitForReady();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockUpdateBuyLimit).toHaveBeenCalledWith(null));
    await waitFor(() => expect(screen.getByLabelText(HEADING)).toHaveValue(null));
  });

  it('submits 20000 when the input is 20000', async () => {
    mockGetBuyLimit.mockResolvedValue({ maxTokensPerTx: 20000 });
    mockUpdateBuyLimit.mockResolvedValue({ maxTokensPerTx: 20000 });
    render(<RealunitBuyLimitPanel translate={translate} />);
    await waitFor(() => expect(screen.getByLabelText(HEADING)).toHaveValue(20000));
    await waitForReady();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockUpdateBuyLimit).toHaveBeenCalledWith(20000));
    await waitFor(() => expect(screen.getByLabelText(HEADING)).toHaveValue(20000));
  });

  it('shows ErrorHint when GET fails', async () => {
    mockGetBuyLimit.mockRejectedValue(new Error('load-fail'));
    render(<RealunitBuyLimitPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('load-fail'));
  });

  it('shows ErrorHint when PUT fails', async () => {
    mockUpdateBuyLimit.mockRejectedValue(new Error('save-fail'));
    render(<RealunitBuyLimitPanel translate={translate} />);
    await waitForReady();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('save-fail'));
  });

  it('ignores a second Save click while update is in flight', async () => {
    const deferred: { resolve: (value: { maxTokensPerTx: number | null }) => void } = { resolve: () => undefined };
    mockUpdateBuyLimit.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve;
        }),
    );
    render(<RealunitBuyLimitPanel translate={translate} />);
    await waitForReady();

    const save = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(mockUpdateBuyLimit).toHaveBeenCalledTimes(1);

    deferred.resolve({ maxTokensPerTx: null });
    await waitFor(() => expect(screen.getByLabelText(HEADING)).toHaveValue(null));
  });

  it('keeps Save disabled after GET failure and does not call updateBuyLimit', async () => {
    mockGetBuyLimit.mockRejectedValue(new Error('load-fail'));
    render(<RealunitBuyLimitPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('load-fail'));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mockUpdateBuyLimit).not.toHaveBeenCalled();
  });

  it('falls back to Failed to load buy limit. when GET rejects without a message', async () => {
    mockGetBuyLimit.mockRejectedValue({});
    render(<RealunitBuyLimitPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Failed to load buy limit.'));
  });

  it('falls back to Unknown error when PUT rejects without a message', async () => {
    mockUpdateBuyLimit.mockRejectedValue({});
    render(<RealunitBuyLimitPanel translate={translate} />);
    await waitForReady();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });

  it('keeps Save disabled after GET failure until Retry load succeeds', async () => {
    mockGetBuyLimit.mockRejectedValueOnce(new Error('load-fail'));
    render(<RealunitBuyLimitPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('load-fail'));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mockUpdateBuyLimit).not.toHaveBeenCalled();

    let resolveRetry: (value: { maxTokensPerTx: number | null }) => void = () => undefined;
    mockGetBuyLimit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRetry = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mockUpdateBuyLimit).not.toHaveBeenCalled();

    resolveRetry({ maxTokensPerTx: null });
    await waitForReady();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockUpdateBuyLimit).toHaveBeenCalledWith(null));
  });
});
