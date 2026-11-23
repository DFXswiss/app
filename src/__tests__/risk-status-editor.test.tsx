// Component tests for RiskStatusEditor: the button, which values reach the hook, the in-flight and
// account-switch guards, the switched-off 404, and what the clerk sees when the API refuses or the
// clerk has no verified name.

const mockStaffName: { name?: string; isLoading: boolean; error?: string } = { name: 'JR', isLoading: false };
const mockSetRiskStatus = jest.fn();

jest.mock('src/hooks/risk-status.hook', () => ({
  OPERATOR_RISK_STATUSES: ['Suspicious', 'Blocked', 'Released', 'BlockedBuyCrypto', 'BlockedBuyFiat'],
  useRiskStatus: () => ({ setRiskStatus: mockSetRiskStatus }),
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => mockStaffName,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <p data-testid="error-hint">{message}</p>,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RISK_STATUS_API_OFF, RiskStatusEditor } from 'src/components/compliance/risk-status-editor';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function element(
  props: Partial<{ userDataId: number; currentRiskStatus?: string; onChanged: jest.Mock }> = {},
): JSX.Element {
  return (
    <RiskStatusEditor
      userDataId={props.userDataId ?? 88001}
      currentRiskStatus={props.currentRiskStatus}
      onChanged={props.onChanged ?? jest.fn()}
    />
  );
}

function open(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Set risk status' }));
}

function selectValue(value: string): void {
  fireEvent.change(screen.getByLabelText('Risk status'), { target: { value } });
}

function fillReason(value: string): void {
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value } });
}

function saveButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Save' });
}

describe('RiskStatusEditor', () => {
  beforeEach(() => {
    mockSetRiskStatus.mockReset();
    mockStaffName.name = 'JR';
    mockStaffName.isLoading = false;
    mockStaffName.error = undefined;
  });

  it('shows only the button until it is clicked', () => {
    render(element());

    expect(screen.getByRole('button', { name: 'Set risk status' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Risk status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('opens the form with the clerk, the current value fallback and the five sheet values in order', () => {
    render(element());
    open();

    expect(screen.getByText('JR')).toBeInTheDocument();
    expect(screen.getByText('Current: NA')).toBeInTheDocument();
    expect(screen.getByText('Select risk status')).toBeInTheDocument();
    const select = screen.getByLabelText('Risk status') as HTMLSelectElement;
    expect(select.options).toHaveLength(6);
    expect(
      Array.from(select.options)
        .slice(1)
        .map((option) => option.value),
    ).toEqual(['Suspicious', 'Blocked', 'Released', 'BlockedBuyCrypto', 'BlockedBuyFiat']);
    expect(saveButton()).toBeDisabled();
  });

  it('shows the current value that the panel passes', () => {
    render(element({ currentRiskStatus: 'Blocked' }));
    open();

    expect(screen.getByText('Current: Blocked')).toBeInTheDocument();
  });

  it('keeps Save disabled without a selected value even with a reason', () => {
    render(element());
    open();
    fillReason('because');

    expect(saveButton()).toBeDisabled();
  });

  it('disables Save again when the placeholder is selected after a value', () => {
    render(element());
    open();
    selectValue('Blocked');
    fillReason('because');
    expect(saveButton()).toBeEnabled();

    selectValue('');
    expect(saveButton()).toBeDisabled();
  });

  it.each([
    ['empty', ''],
    ['spaces', '   '],
    ['whitespace', '\t\n'],
  ])('keeps Save disabled for an %s reason', (_label, value) => {
    render(element());
    open();
    selectValue('Blocked');
    fillReason(value);

    expect(saveButton()).toBeDisabled();
  });

  it('cancels the form without calling the API', () => {
    render(element());
    open();
    selectValue('Blocked');
    fillReason('because');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Risk status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set risk status' })).toBeInTheDocument();
    expect(mockSetRiskStatus).not.toHaveBeenCalled();
  });

  it('keeps Save disabled while the clerk name is still loading even if a name is present', () => {
    mockStaffName.isLoading = true;
    render(element());
    open();
    selectValue('Blocked');
    fillReason('because');

    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('saves the selected value and trimmed reason, reports the change and closes the form', async () => {
    mockSetRiskStatus.mockResolvedValue(undefined);
    const onChanged = jest.fn();
    render(element({ onChanged }));
    open();
    selectValue('Blocked');
    fillReason('  blocked by ops  ');
    fireEvent.click(saveButton());

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockSetRiskStatus).toHaveBeenCalledWith(88001, { riskStatus: 'Blocked', reason: 'blocked by ops' });
    expect(screen.getByText('Risk status set to Blocked.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Risk status')).not.toBeInTheDocument();
  });

  it('starts one update for two clicks in the same tick and locks the form while it runs', async () => {
    const deferred = createDeferred<void>();
    mockSetRiskStatus.mockReturnValue(deferred.promise);
    render(element());
    open();
    selectValue('Blocked');
    fillReason('because');
    const save = saveButton();

    // One act: React batches the state updates, so the button is still enabled for the second click.
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });

    expect(mockSetRiskStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Risk status')).toBeDisabled();
    expect(screen.getByLabelText('Reason')).toBeDisabled();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
    expect(screen.queryByLabelText('Risk status')).not.toBeInTheDocument();
  });

  it('ignores an update that finishes after the box is gone', async () => {
    const deferred = createDeferred<void>();
    mockSetRiskStatus.mockReturnValue(deferred.promise);
    const onChanged = jest.fn();
    const { unmount } = render(element({ onChanged }));
    open();
    selectValue('Blocked');
    fillReason('because');
    fireEvent.click(saveButton());
    unmount();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(onChanged).not.toHaveBeenCalled();

    // The rejection path after unmount must be just as silent.
    const deferredReject = createDeferred<void>();
    mockSetRiskStatus.mockReturnValue(deferredReject.promise);
    const { unmount: unmountSecond } = render(element({ onChanged }));
    open();
    selectValue('Blocked');
    fillReason('because');
    fireEvent.click(saveButton());
    unmountSecond();

    await act(async () => {
      deferredReject.reject(new Error('late'));
      await deferredReject.promise.catch(() => undefined);
    });

    expect(onChanged).not.toHaveBeenCalled();
  });

  it('closes the form on account switch, resets the lock, and drops a late success for the previous account', async () => {
    const deferred = createDeferred<void>();
    mockSetRiskStatus.mockReturnValue(deferred.promise);
    const onChanged = jest.fn();
    const { rerender } = render(element({ onChanged }));
    open();
    selectValue('Blocked');
    fillReason('because');
    fireEvent.click(saveButton());

    rerender(element({ userDataId: 88002, onChanged }));
    expect(screen.queryByLabelText('Risk status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set risk status' })).toBeEnabled();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.queryByText(/Risk status set to/)).not.toBeInTheDocument();

    // The lock was released by the switch: the new account can start its own update.
    mockSetRiskStatus.mockResolvedValue(undefined);
    open();
    selectValue('Released');
    fillReason('now released');
    fireEvent.click(saveButton());
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockSetRiskStatus).toHaveBeenLastCalledWith(88002, { riskStatus: 'Released', reason: 'now released' });
  });

  it('does not show a late error from the previous account after the form is open on the new one', async () => {
    const deferred = createDeferred<void>();
    mockSetRiskStatus.mockReturnValue(deferred.promise);
    const { rerender } = render(element());
    open();
    selectValue('Blocked');
    fillReason('because');
    fireEvent.click(saveButton());

    rerender(element({ userDataId: 88002 }));
    open();
    selectValue('Released');
    fillReason('now released');

    await act(async () => {
      deferred.reject(new Error('Risk status change refused'));
      await deferred.promise.catch(() => undefined);
    });

    expect(screen.queryByText('Risk status change refused')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Risk status')).toBeInTheDocument();
  });

  it('reloads the row for a late success after A -> B -> A but keeps the newer form and its lock', async () => {
    const first = createDeferred<void>();
    const second = createDeferred<void>();
    mockSetRiskStatus.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const onChanged = jest.fn();
    const { rerender } = render(element({ onChanged }));
    open();
    selectValue('Blocked');
    fillReason('first');
    fireEvent.click(saveButton());

    rerender(element({ userDataId: 88002, onChanged }));
    rerender(element({ userDataId: 88001, onChanged }));
    open();
    selectValue('Released');
    fillReason('second');
    fireEvent.click(saveButton());
    expect(mockSetRiskStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      first.resolve();
      await first.promise;
    });
    // The earlier attempt changed the account that is shown again: the row reloads, nothing else moves.
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Risk status')).toBeInTheDocument();
    expect(screen.queryByText(/Risk status set to/)).not.toBeInTheDocument();
    // The newer save still holds the lock.
    const saving = screen.getByRole('button', { name: 'Saving…' });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    expect(mockSetRiskStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve();
      await second.promise;
    });
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Risk status set to Released.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Risk status')).not.toBeInTheDocument();
  });

  it('does not show a late error after A -> B -> A on the newer form', async () => {
    const deferred = createDeferred<void>();
    mockSetRiskStatus.mockReturnValue(deferred.promise);
    const onChanged = jest.fn();
    const { rerender } = render(element({ onChanged }));
    open();
    selectValue('Blocked');
    fillReason('first');
    fireEvent.click(saveButton());

    rerender(element({ userDataId: 88002, onChanged }));
    rerender(element({ userDataId: 88001, onChanged }));
    open();
    selectValue('Released');
    fillReason('second');

    await act(async () => {
      deferred.reject(new Error('Risk status change refused'));
      await deferred.promise.catch(() => undefined);
    });

    expect(screen.queryByText('Risk status change refused')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Risk status')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('shows the API message when the change is refused and keeps the form open', async () => {
    mockSetRiskStatus.mockRejectedValue(new Error('Risk status change refused'));
    render(element());
    open();
    selectValue('Blocked');
    fillReason('because');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Risk status change refused')).toBeInTheDocument();
    expect(screen.getByLabelText('Risk status')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('shows the API message for a 404 that carries one', async () => {
    mockSetRiskStatus.mockRejectedValue(Object.assign(new Error('User data not found'), { statusCode: 404 }));
    render(element());
    open();
    selectValue('Blocked');
    fillReason('because');
    fireEvent.click(saveButton());

    expect(await screen.findByText('User data not found')).toBeInTheDocument();
  });

  it('says the API is switched off for a bare 404', async () => {
    mockSetRiskStatus.mockRejectedValue({ statusCode: 404 });
    render(element());
    open();
    selectValue('Blocked');
    fillReason('because');
    fireEvent.click(saveButton());

    expect(await screen.findByText(RISK_STATUS_API_OFF)).toBeInTheDocument();
  });

  // The shape the client really raises while the flag or the process is off: Nest's NotFoundException body.
  it('says the API is switched off for a 404 whose message is Not Found', async () => {
    mockSetRiskStatus.mockRejectedValue(Object.assign(new Error('Not Found'), { statusCode: 404 }));
    render(element());
    open();
    selectValue('Blocked');
    fillReason('because');
    fireEvent.click(saveButton());

    expect(await screen.findByText(RISK_STATUS_API_OFF)).toBeInTheDocument();
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument();
  });

  it('shows the message of a plain error object', async () => {
    mockSetRiskStatus.mockRejectedValue({ statusCode: 400, message: 'Risk status change refused' });
    render(element());
    open();
    selectValue('Blocked');
    fillReason('because');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Risk status change refused')).toBeInTheDocument();
  });

  it('falls back to a generic message when a plain error object has no text message', async () => {
    mockSetRiskStatus.mockRejectedValue({ statusCode: 400, message: 42 });
    render(element());
    open();
    selectValue('Blocked');
    fillReason('because');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Failed to set the risk status')).toBeInTheDocument();
  });

  it('falls back to a generic message when the failure is not an Error', async () => {
    mockSetRiskStatus.mockRejectedValue('boom');
    render(element());
    open();
    selectValue('Blocked');
    fillReason('because');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Failed to set the risk status')).toBeInTheDocument();
  });

  it('falls back to a generic message when the call rejects with undefined and does not report a change', async () => {
    mockSetRiskStatus.mockRejectedValue(undefined);
    const onChanged = jest.fn();
    render(element({ onChanged }));
    open();
    selectValue('Blocked');
    fillReason('because');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Failed to set the risk status')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('refuses to save without a verified clerk name and says why', () => {
    mockStaffName.name = undefined;
    render(element());
    open();
    selectValue('Blocked');
    fillReason('because');

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByTestId('error-hint')).toHaveTextContent(
      'Staff identification requires a verified name on this account.',
    );
    expect(saveButton()).toBeDisabled();
  });

  it('names the load error when the clerk name could not be fetched', () => {
    mockStaffName.name = undefined;
    mockStaffName.error = 'HTTP 500';
    render(element());
    open();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('Could not load your verified name: HTTP 500');
  });
});
