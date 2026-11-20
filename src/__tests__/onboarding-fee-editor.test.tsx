// Component tests for OnboardingFeeEditor: the buttons, which values reach the hook, the in-flight and
// account-switch guards, the switched-off 404, and what the clerk sees when the API refuses or the
// clerk has no verified name.

const mockStaffName: { name?: string; isLoading: boolean; error?: string } = { name: 'JR', isLoading: false };
const mockSetOnboardingFee = jest.fn();
const mockRemoveOnboardingFee = jest.fn();

jest.mock('src/hooks/onboarding-fee.hook', () => ({
  useOnboardingFee: () => ({
    setOnboardingFee: mockSetOnboardingFee,
    removeOnboardingFee: mockRemoveOnboardingFee,
  }),
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => mockStaffName,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <p data-testid="error-hint">{message}</p>,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ONBOARDING_FEE_API_OFF, OnboardingFeeEditor } from 'src/components/compliance/onboarding-fee-editor';
import type { UserInfo } from 'src/hooks/compliance.hook';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function wallet(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1,
    address: '0xabc',
    role: 'User',
    status: 'NA',
    created: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const referred = wallet({ usedRef: '194-687' });
const unreferred = wallet({ id: 2, address: '0xdef', status: 'Active' });

function element(props: Partial<{ userDataId: number; users: UserInfo[]; onChanged: jest.Mock }> = {}): JSX.Element {
  return (
    <OnboardingFeeEditor
      userDataId={props.userDataId ?? 88001}
      users={props.users ?? [referred]}
      onChanged={props.onChanged ?? jest.fn()}
    />
  );
}

function openSet(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Set onboarding fee' }));
}

function openRemove(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Remove onboarding fee' }));
}

function fillAmount(value: string): void {
  fireEvent.change(screen.getByLabelText('Amount (CHF)'), { target: { value } });
}

function selectAddress(value: string): void {
  fireEvent.change(screen.getByLabelText('Address'), { target: { value } });
}

function saveButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Save' });
}

describe('OnboardingFeeEditor', () => {
  beforeEach(() => {
    mockSetOnboardingFee.mockReset();
    mockRemoveOnboardingFee.mockReset();
    mockStaffName.name = 'JR';
    mockStaffName.isLoading = false;
    mockStaffName.error = undefined;
  });

  it('shows only the two buttons until one is clicked', () => {
    render(element());

    expect(screen.getByRole('button', { name: 'Set onboarding fee' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove onboarding fee' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Amount (CHF)')).not.toBeInTheDocument();
    expect(screen.queryByText('Remove the onboarding fee of this account?')).not.toBeInTheDocument();
  });

  it('opens the set form with the clerk name and an address label that shows status and usedRef', () => {
    render(element({ users: [referred, unreferred] }));
    openSet();

    expect(screen.getByText('JR')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '0xabc (NA, 194-687)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '0xdef (Active, -)' })).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it.each([
    ['empty', ''],
    ['zero', '0'],
    ['negative', '-1'],
    ['not a number', 'abc'],
  ])('keeps Save disabled for an %s amount', (_label, value) => {
    render(element());
    openSet();
    selectAddress('0xabc');
    fillAmount(value);

    expect(saveButton()).toBeDisabled();
  });

  it('keeps Save disabled until an address is selected', () => {
    render(element());
    openSet();
    fillAmount('5');

    expect(saveButton()).toBeDisabled();
  });

  it('keeps Save disabled while the clerk name is still loading even if a name is present', () => {
    mockStaffName.isLoading = true;
    render(element());
    openSet();
    fillAmount('5');
    selectAddress('0xabc');

    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('saves the parsed amount and selected address, reports the change and closes the form', async () => {
    mockSetOnboardingFee.mockResolvedValue(undefined);
    const onChanged = jest.fn();
    render(element({ onChanged }));
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
    fireEvent.click(saveButton());

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockSetOnboardingFee).toHaveBeenCalledWith(88001, { amount: 5, address: '0xabc' });
    expect(
      screen.getByText('Onboarding fee of 5 CHF set; 0xabc attributed to the key account manager.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Amount (CHF)')).not.toBeInTheDocument();
  });

  it('starts one update for two clicks in the same tick and locks the form while it runs', async () => {
    const deferred = createDeferred<void>();
    mockSetOnboardingFee.mockReturnValue(deferred.promise);
    render(element());
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
    const save = saveButton();

    // One act: React batches the state updates, so the button is still enabled for the second click.
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });

    expect(mockSetOnboardingFee).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Amount (CHF)')).toBeDisabled();
    expect(screen.getByLabelText('Address')).toBeDisabled();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
    expect(screen.queryByLabelText('Amount (CHF)')).not.toBeInTheDocument();
  });

  it('ignores an update that finishes after the box is gone', async () => {
    const deferred = createDeferred<void>();
    mockSetOnboardingFee.mockReturnValue(deferred.promise);
    const onChanged = jest.fn();
    const { unmount } = render(element({ onChanged }));
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
    fireEvent.click(saveButton());
    unmount();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(onChanged).not.toHaveBeenCalled();

    // The rejection path after unmount must be just as silent.
    const deferredReject = createDeferred<void>();
    mockSetOnboardingFee.mockReturnValue(deferredReject.promise);
    const { unmount: unmountSecond } = render(element({ onChanged }));
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
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
    mockSetOnboardingFee.mockReturnValue(deferred.promise);
    const onChanged = jest.fn();
    const { rerender } = render(element({ onChanged }));
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
    fireEvent.click(saveButton());

    rerender(element({ userDataId: 88002, onChanged }));
    expect(screen.queryByLabelText('Amount (CHF)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set onboarding fee' })).toBeEnabled();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.queryByText(/attributed to the key account manager/)).not.toBeInTheDocument();

    // The lock was released by the switch: the new account can start its own update.
    mockSetOnboardingFee.mockResolvedValue(undefined);
    openSet();
    fillAmount('7');
    selectAddress('0xabc');
    fireEvent.click(saveButton());
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockSetOnboardingFee).toHaveBeenLastCalledWith(88002, { amount: 7, address: '0xabc' });
  });

  it('does not show a late error from the previous account after the form is open on the new one', async () => {
    const deferred = createDeferred<void>();
    mockSetOnboardingFee.mockReturnValue(deferred.promise);
    const { rerender } = render(element());
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
    fireEvent.click(saveButton());

    rerender(element({ userDataId: 88002 }));
    openSet();

    await act(async () => {
      deferred.reject(new Error('Address is blocked or deleted'));
      await deferred.promise.catch(() => undefined);
    });

    expect(screen.queryByText('Address is blocked or deleted')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Amount (CHF)')).toBeInTheDocument();
  });

  it('shows the API message when the change is refused and keeps the form open', async () => {
    mockSetOnboardingFee.mockRejectedValue(new Error('Address is blocked or deleted'));
    render(element());
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Address is blocked or deleted')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount (CHF)')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('shows the API message for a 404 that carries one', async () => {
    mockSetOnboardingFee.mockRejectedValue(Object.assign(new Error('Address not found'), { statusCode: 404 }));
    render(element());
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Address not found')).toBeInTheDocument();
  });

  it('says the API is switched off for a bare 404', async () => {
    mockSetOnboardingFee.mockRejectedValue({ statusCode: 404 });
    render(element());
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
    fireEvent.click(saveButton());

    expect(await screen.findByText(ONBOARDING_FEE_API_OFF)).toBeInTheDocument();
  });

  // The shape the client really raises while the flag is off: Nest's NotFoundException body.
  it('says the API is switched off for a 404 whose message is Not Found', async () => {
    mockSetOnboardingFee.mockRejectedValue(Object.assign(new Error('Not Found'), { statusCode: 404 }));
    render(element());
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
    fireEvent.click(saveButton());

    expect(await screen.findByText(ONBOARDING_FEE_API_OFF)).toBeInTheDocument();
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument();
  });

  it('shows the message of a plain error object', async () => {
    mockSetOnboardingFee.mockRejectedValue({ statusCode: 400, message: 'Address is blocked or deleted' });
    render(element());
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Address is blocked or deleted')).toBeInTheDocument();
  });

  it('falls back to a generic message when a plain error object has no text message', async () => {
    mockSetOnboardingFee.mockRejectedValue({ statusCode: 400, message: 42 });
    render(element());
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Failed to set the onboarding fee')).toBeInTheDocument();
  });

  it('falls back to a generic message when the set failure is not an Error', async () => {
    mockSetOnboardingFee.mockRejectedValue('boom');
    render(element());
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Failed to set the onboarding fee')).toBeInTheDocument();
  });

  it('falls back to a generic message when the set call rejects with undefined and does not report a change', async () => {
    mockSetOnboardingFee.mockRejectedValue(undefined);
    const onChanged = jest.fn();
    render(element({ onChanged }));
    openSet();
    fillAmount('5');
    selectAddress('0xabc');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Failed to set the onboarding fee')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('refuses to save without a verified clerk name and says why', () => {
    mockStaffName.name = undefined;
    render(element());
    openSet();
    fillAmount('5');
    selectAddress('0xabc');

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
    openSet();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('Could not load your verified name: HTTP 500');
  });

  it('shows the no-address hint and no Save button when the account has no users', () => {
    render(element({ users: [] }));
    openSet();

    expect(screen.getByText('This account has no address.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('opens the remove confirmation and cancels without calling the API', () => {
    render(element());
    openRemove();

    expect(screen.getByText('Remove the onboarding fee of this account?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Remove onboarding fee' })).toBeInTheDocument();
    expect(mockRemoveOnboardingFee).not.toHaveBeenCalled();
  });

  it('removes the fee, reports the change and calls onChanged', async () => {
    mockRemoveOnboardingFee.mockResolvedValue(undefined);
    const onChanged = jest.fn();
    render(element({ onChanged }));
    openRemove();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockRemoveOnboardingFee).toHaveBeenCalledWith(88001);
    expect(screen.getByText('Onboarding fee removed.')).toBeInTheDocument();
    expect(screen.queryByText('Remove the onboarding fee of this account?')).not.toBeInTheDocument();
  });

  it('starts one removal for two clicks in the same tick and locks the confirmation while it runs', async () => {
    const deferred = createDeferred<void>();
    mockRemoveOnboardingFee.mockReturnValue(deferred.promise);
    render(element());
    openRemove();
    const remove = screen.getByRole('button', { name: 'Remove' });

    act(() => {
      fireEvent.click(remove);
      fireEvent.click(remove);
    });

    expect(mockRemoveOnboardingFee).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Removing…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
    expect(screen.queryByText('Remove the onboarding fee of this account?')).not.toBeInTheDocument();
  });

  it('ignores a removal that finishes after the box is gone', async () => {
    const deferred = createDeferred<void>();
    mockRemoveOnboardingFee.mockReturnValue(deferred.promise);
    const onChanged = jest.fn();
    const { unmount } = render(element({ onChanged }));
    openRemove();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    unmount();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(onChanged).not.toHaveBeenCalled();
  });

  it('closes the confirmation on account switch and drops a late removal for the previous account', async () => {
    const deferred = createDeferred<void>();
    mockRemoveOnboardingFee.mockReturnValue(deferred.promise);
    const onChanged = jest.fn();
    const { rerender } = render(element({ onChanged }));
    openRemove();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    rerender(element({ userDataId: 88002, onChanged }));
    expect(screen.queryByText('Remove the onboarding fee of this account?')).not.toBeInTheDocument();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.queryByText('Onboarding fee removed.')).not.toBeInTheDocument();

    // The lock was released by the switch: the new account can start its own removal.
    mockRemoveOnboardingFee.mockResolvedValue(undefined);
    openRemove();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockRemoveOnboardingFee).toHaveBeenLastCalledWith(88002);
  });

  it('does not show a late removal error from the previous account after the confirmation is open on the new one', async () => {
    const deferred = createDeferred<void>();
    mockRemoveOnboardingFee.mockReturnValue(deferred.promise);
    const { rerender } = render(element());
    openRemove();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    rerender(element({ userDataId: 88002 }));
    openRemove();

    await act(async () => {
      deferred.reject(new Error('Account has no onboarding fee'));
      await deferred.promise.catch(() => undefined);
    });

    expect(screen.queryByText('Account has no onboarding fee')).not.toBeInTheDocument();
    expect(screen.getByText('Remove the onboarding fee of this account?')).toBeInTheDocument();
  });

  it('shows the API message when removing is refused', async () => {
    mockRemoveOnboardingFee.mockRejectedValue(new Error('Account has no onboarding fee'));
    render(element());
    openRemove();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByText('Account has no onboarding fee')).toBeInTheDocument();
    expect(screen.getByText('Remove the onboarding fee of this account?')).toBeInTheDocument();
  });

  it('falls back to a generic message when the removal failure is not an Error', async () => {
    mockRemoveOnboardingFee.mockRejectedValue('boom');
    render(element());
    openRemove();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByText('Failed to remove the onboarding fee')).toBeInTheDocument();
  });

  it('falls back to a generic message when the removal rejects with undefined and does not report a change', async () => {
    mockRemoveOnboardingFee.mockRejectedValue(undefined);
    const onChanged = jest.fn();
    render(element({ onChanged }));
    openRemove();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByText('Failed to remove the onboarding fee')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
