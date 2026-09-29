// Component tests for ReactivateAccount: the button, which values reach the hook, the in-flight and
// account-switch guards, and what the clerk sees when the API refuses or the clerk has no verified name.

const mockStaffName: { name?: string; isLoading: boolean; error?: string } = { name: 'JR', isLoading: false };
const mockReactivateAccount = jest.fn();

jest.mock('src/hooks/account-reactivation.hook', () => ({
  useAccountReactivation: () => ({ reactivateAccount: mockReactivateAccount }),
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => mockStaffName,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <p data-testid="error-hint">{message}</p>,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactivateAccount } from 'src/components/compliance/reactivate-account';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function element(props: Partial<{ userDataId: number; onReactivated: jest.Mock }> = {}) {
  return <ReactivateAccount userDataId={props.userDataId ?? 88001} onReactivated={props.onReactivated ?? jest.fn()} />;
}

function openForm(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
}

function fillReason(reason: string): void {
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: reason } });
}

function saveButton(): HTMLElement {
  // Inside the form the primary button carries the same label as the trigger; the trigger is gone by then.
  return screen.getByRole('button', { name: 'Reactivate' });
}

describe('ReactivateAccount', () => {
  beforeEach(() => {
    mockReactivateAccount.mockReset();
    mockStaffName.name = 'JR';
    mockStaffName.isLoading = false;
    mockStaffName.error = undefined;
  });

  it('shows only the button until it is clicked', () => {
    render(element());

    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
  });

  it('opens the form with the clerk name and disables Save until a reason is entered', () => {
    render(element());
    openForm();

    expect(screen.getByText('JR')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fillReason('   ');
    expect(saveButton()).toBeDisabled();
    fillReason('merge copied the old status');
    expect(saveButton()).toBeEnabled();
  });

  it('saves the trimmed reason, reports the status row and closes the form', async () => {
    const info = { id: 88001, status: 'NA' };
    mockReactivateAccount.mockResolvedValue(info);
    const onReactivated = jest.fn();
    render(element({ onReactivated }));
    openForm();
    fillReason('  merge copied the old status  ');
    fireEvent.click(saveButton());

    await waitFor(() => expect(onReactivated).toHaveBeenCalledWith(info));
    expect(mockReactivateAccount).toHaveBeenCalledWith(88001, { reason: 'merge copied the old status' });
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
  });

  it('starts one update for two clicks in the same tick and locks Save while it runs', async () => {
    const deferred = createDeferred<{ id: number; status: string }>();
    mockReactivateAccount.mockReturnValue(deferred.promise);
    render(element());
    openForm();
    fillReason('reason');
    const save = saveButton();

    // One act: React batches the state updates, so the button is still enabled for the second click.
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });

    expect(mockReactivateAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Reason')).toBeDisabled();

    await act(async () => {
      deferred.resolve({ id: 88001, status: 'NA' });
      await deferred.promise;
    });
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
  });

  it('ignores an update that finishes after the box is gone', async () => {
    const deferred = createDeferred<{ id: number; status: string }>();
    mockReactivateAccount.mockReturnValue(deferred.promise);
    const onReactivated = jest.fn();
    const { unmount } = render(element({ onReactivated }));
    openForm();
    fillReason('reason');
    fireEvent.click(saveButton());
    unmount();

    await act(async () => {
      deferred.resolve({ id: 88001, status: 'NA' });
      await deferred.promise;
    });

    expect(onReactivated).not.toHaveBeenCalled();

    // The rejection path after unmount must be just as silent.
    const deferredReject = createDeferred<{ id: number; status: string }>();
    mockReactivateAccount.mockReturnValue(deferredReject.promise);
    const { unmount: unmountSecond } = render(element({ onReactivated }));
    openForm();
    fillReason('reason');
    fireEvent.click(saveButton());
    unmountSecond();

    await act(async () => {
      deferredReject.reject(new Error('late'));
      await deferredReject.promise.catch(() => undefined);
    });

    expect(onReactivated).not.toHaveBeenCalled();
  });

  it('closes the form on account switch, resets the save lock, and drops a late success for the previous account', async () => {
    const deferred = createDeferred<{ id: number; status: string }>();
    mockReactivateAccount.mockReturnValue(deferred.promise);
    const onReactivated = jest.fn();
    const { rerender } = render(element({ onReactivated }));
    openForm();
    fillReason('reason');
    fireEvent.click(saveButton());

    rerender(element({ userDataId: 88002, onReactivated }));
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeEnabled();

    await act(async () => {
      deferred.resolve({ id: 88001, status: 'NA' });
      await deferred.promise;
    });
    expect(onReactivated).not.toHaveBeenCalled();

    // The lock was released by the switch: the new account can start its own update.
    mockReactivateAccount.mockResolvedValue({ id: 88002, status: 'Active' });
    openForm();
    fillReason('second account');
    fireEvent.click(saveButton());
    await waitFor(() => expect(onReactivated).toHaveBeenCalledWith({ id: 88002, status: 'Active' }));
  });

  it('does not show a late error from the previous account after the form is open on the new one', async () => {
    const deferred = createDeferred<{ id: number; status: string }>();
    mockReactivateAccount.mockReturnValue(deferred.promise);
    const { rerender } = render(element());
    openForm();
    fillReason('reason');
    fireEvent.click(saveButton());

    rerender(element({ userDataId: 88002 }));
    openForm();

    await act(async () => {
      deferred.reject(new Error('Account is not deactivated'));
      await deferred.promise.catch(() => undefined);
    });

    expect(screen.queryByText('Account is not deactivated')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
  });

  it('shows the API message when the change is refused and keeps the form open', async () => {
    mockReactivateAccount.mockRejectedValue(new Error('Account is not deactivated'));
    render(element());
    openForm();
    fillReason('reason');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Account is not deactivated')).toBeInTheDocument();
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('falls back to a generic message when the failure is not an Error', async () => {
    mockReactivateAccount.mockRejectedValue('boom');
    render(element());
    openForm();
    fillReason('reason');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Failed to reactivate the account')).toBeInTheDocument();
  });

  it('closes the form on Cancel and drops a pending error', async () => {
    mockReactivateAccount.mockRejectedValue(new Error('refused'));
    render(element());
    openForm();
    fillReason('reason');
    fireEvent.click(saveButton());
    await screen.findByText('refused');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();

    openForm();
    expect(screen.queryByText('refused')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Reason')).toHaveValue('');
  });

  it('refuses to save without a verified clerk name and says why', () => {
    mockStaffName.name = undefined;
    render(element());
    openForm();
    fillReason('reason');

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
    openForm();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('Could not load your verified name: HTTP 500');
  });

  it('waits while the clerk name is loading', () => {
    mockStaffName.name = undefined;
    mockStaffName.isLoading = true;
    render(element());
    openForm();
    fillReason('reason');

    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });
});
