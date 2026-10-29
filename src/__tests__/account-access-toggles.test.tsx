const mockSession: { current?: { role: string } } = { current: { role: 'Support' } };
const mockStaffName: { name?: string; isLoading: boolean; error?: string } = {
  name: 'Staff Example',
  isLoading: false,
};
const mockSetProvisionalApproval = jest.fn();
const mockSetVip = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useAuthContext: () => ({ session: mockSession.current }),
  UserRole: { USER: 'User', SUPPORT: 'Support', MARKETING: 'Marketing', COMPLIANCE: 'Compliance', ADMIN: 'Admin' },
}));

jest.mock('src/hooks/account-access.hook', () => ({
  useAccountAccess: () => ({
    setProvisionalApproval: mockSetProvisionalApproval,
    setVip: mockSetVip,
  }),
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => mockStaffName,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <p data-testid="error-hint">{message}</p>,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountAccessToggles } from 'src/components/compliance/account-access-toggles';

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
  props: Partial<{
    userDataId: number;
    provisionalApprovalDate: string;
    kycLevel: number;
    users: { id: number; role: string }[];
    onChanged: jest.Mock;
  }> = {},
) {
  return (
    <AccountAccessToggles
      userDataId={props.userDataId ?? 88001}
      provisionalApprovalDate={props.provisionalApprovalDate}
      kycLevel={props.kycLevel ?? 20}
      users={props.users ?? []}
      onChanged={props.onChanged ?? jest.fn()}
    />
  );
}

describe('AccountAccessToggles', () => {
  beforeEach(() => {
    mockSession.current = { role: 'Support' };
    mockStaffName.name = 'Staff Example';
    mockStaffName.isLoading = false;
    mockStaffName.error = undefined;
    mockSetProvisionalApproval.mockReset();
    mockSetVip.mockReset();
    mockSetProvisionalApproval.mockResolvedValue({ id: 88001, vipUserIds: [] });
    mockSetVip.mockResolvedValue({ id: 88001, vipUserIds: [] });
  });

  it('is hidden from a plain user role', () => {
    mockSession.current = { role: 'User' };
    const { container } = render(element());
    expect(container).toBeEmptyDOMElement();
  });

  it('is hidden after onboarding when neither access flag is set', () => {
    const { container } = render(element({ kycLevel: 50 }));
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['Support', 'Compliance', 'Admin'])('shows both off controls during onboarding for %s', (role) => {
    mockSession.current = { role };
    render(element());

    expect(screen.getByText('Provisional approval: off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant' })).toBeEnabled();
    expect(screen.getByText('VIP: off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set VIP' })).toBeEnabled();
  });

  it('shows revoke controls for set flags after onboarding is complete', () => {
    render(
      element({
        kycLevel: 50,
        provisionalApprovalDate: '2026-10-29',
        users: [{ id: 42, role: 'VIP' }],
      }),
    );

    expect(screen.getByText('Provisional approval: on')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled();
    expect(screen.getByText('VIP: on')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove VIP' })).toBeEnabled();
  });

  it('grants provisional approval and reloads the account after success', async () => {
    const onChanged = jest.fn();
    render(element({ onChanged }));
    fireEvent.click(screen.getByRole('button', { name: 'Grant' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockSetProvisionalApproval).toHaveBeenCalledWith(88001, true);
  });

  it('revokes provisional approval and removes VIP with false', async () => {
    const onChanged = jest.fn();
    const { rerender } = render(
      element({ provisionalApprovalDate: '2026-10-29', users: [{ id: 42, role: 'VIP' }], onChanged }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(mockSetProvisionalApproval).toHaveBeenCalledWith(88001, false));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    rerender(element({ provisionalApprovalDate: '2026-10-29', users: [{ id: 42, role: 'VIP' }], onChanged }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove VIP' }));
    await waitFor(() => expect(mockSetVip).toHaveBeenCalledWith(88001, false));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
  });

  it('sets VIP and reloads the account after success', async () => {
    const onChanged = jest.fn();
    render(element({ onChanged }));
    fireEvent.click(screen.getByRole('button', { name: 'Set VIP' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockSetVip).toHaveBeenCalledWith(88001, true);
  });

  it('shows the API error and permits retry', async () => {
    mockSetProvisionalApproval.mockRejectedValueOnce(new Error('Update refused'));
    render(element());
    fireEvent.click(screen.getByRole('button', { name: 'Grant' }));

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Update refused');
    expect(screen.getByRole('button', { name: 'Grant' })).toBeEnabled();
  });

  it('uses a generic API error for a non-Error rejection', async () => {
    mockSetVip.mockRejectedValueOnce('refused');
    render(element());
    fireEvent.click(screen.getByRole('button', { name: 'Set VIP' }));
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Failed to update account access');
  });

  it('starts one update for two clicks in the same tick and disables both controls while it runs', async () => {
    const deferred = createDeferred<{ id: number; vipUserIds: number[] }>();
    mockSetProvisionalApproval.mockReturnValue(deferred.promise);
    render(element());
    const grant = screen.getByRole('button', { name: 'Grant' });

    act(() => {
      fireEvent.click(grant);
      fireEvent.click(grant);
    });

    expect(mockSetProvisionalApproval).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Set VIP' })).toBeDisabled();

    await act(async () => {
      deferred.resolve({ id: 88001, vipUserIds: [] });
      await deferred.promise;
    });
  });

  it('disables updates and explains when the verified staff name is missing', () => {
    mockStaffName.name = undefined;
    render(element());

    expect(screen.getByRole('button', { name: 'Grant' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Set VIP' })).toBeDisabled();
    expect(screen.getByTestId('error-hint')).toHaveTextContent(
      'Staff identification requires a verified name on this account.',
    );
    expect(mockSetProvisionalApproval).not.toHaveBeenCalled();
    expect(mockSetVip).not.toHaveBeenCalled();
  });

  it('shows a staff-name load error and waits silently while the name is loading', () => {
    mockStaffName.name = undefined;
    mockStaffName.error = 'HTTP 500';
    const { rerender } = render(element());
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Could not load your verified name: HTTP 500');

    mockStaffName.isLoading = true;
    rerender(element());
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant' })).toBeDisabled();
  });

  it('drops a late answer for the previous account and resets the in-flight guard', async () => {
    const deferred = createDeferred<{ id: number; vipUserIds: number[] }>();
    mockSetProvisionalApproval.mockReturnValueOnce(deferred.promise);
    const onChanged = jest.fn();
    const { rerender } = render(element({ onChanged }));
    fireEvent.click(screen.getByRole('button', { name: 'Grant' }));

    rerender(element({ userDataId: 88002, onChanged }));
    expect(screen.getByRole('button', { name: 'Grant' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Set VIP' }));
    await waitFor(() => expect(mockSetVip).toHaveBeenCalledWith(88002, true));

    await act(async () => {
      deferred.resolve({ id: 88001, vipUserIds: [] });
      await deferred.promise;
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('ignores a rejection after unmount', async () => {
    const deferred = createDeferred<{ id: number; vipUserIds: number[] }>();
    mockSetProvisionalApproval.mockReturnValue(deferred.promise);
    const { unmount } = render(element());
    fireEvent.click(screen.getByRole('button', { name: 'Grant' }));
    unmount();

    await act(async () => {
      deferred.reject(new Error('late'));
      await deferred.promise.catch(() => undefined);
    });
  });
});
