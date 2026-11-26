// Component tests for AccountMergeEditor: loading the other account, the side-by-side table, the
// keep choice and the mail it produces, the pre-submit refusals, the mandatory reason, the clerk
// rules, the in-flight and account-switch guards, and the switched-off 404.

const mockStaffName: { name?: string; isLoading: boolean; error?: string } = { name: 'JR', isLoading: false };
const mockGetUserData = jest.fn();
const mockMergeUserData = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  UserRole: { USER: 'User', SUPPORT: 'Support', MARKETING: 'Marketing', COMPLIANCE: 'Compliance', ADMIN: 'Admin' },
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ getUserData: mockGetUserData }),
}));

jest.mock('src/hooks/user-data-operator-merge.hook', () => ({
  useUserDataOperatorMerge: () => ({ mergeUserData: mockMergeUserData }),
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => mockStaffName,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <p data-testid="error-hint">{message}</p>,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ACCOUNT_MERGE_API_OFF, AccountMergeEditor } from 'src/components/compliance/account-merge-editor';
import type { UserDataDetail } from 'src/hooks/compliance.hook';

function detail(overrides: Partial<UserDataDetail> = {}): UserDataDetail {
  return {
    id: 88001,
    status: 'Active',
    mail: 'master@example.com',
    kycLevel: 30,
    verifiedName: 'Master Name',
    ...overrides,
  } as UserDataDetail;
}

interface EditorProps {
  userDataId: number;
  userData: UserDataDetail;
  onMerged: jest.Mock;
}

function element(props: Partial<EditorProps> = {}): JSX.Element {
  return (
    <AccountMergeEditor
      userDataId={props.userDataId ?? 88001}
      userData={props.userData ?? detail()}
      onMerged={props.onMerged ?? jest.fn()}
    />
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function open(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Merge accounts' }));
}

function loadButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Load' });
}

function mergeButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Merge' });
}

function mergeForm(): HTMLFormElement {
  return mergeButton().closest('form') as HTMLFormElement;
}

function typeOther(value: string): void {
  fireEvent.change(screen.getByLabelText('Other UserDataID'), { target: { value } });
}

function fillReason(value: string): void {
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value } });
}

async function load(other: UserDataDetail): Promise<void> {
  mockGetUserData.mockResolvedValue({ userData: other });
  typeOther(String(other.id));
  fireEvent.click(loadButton());
  await screen.findByText('Other account');
}

async function openAndLoad(other: UserDataDetail): Promise<void> {
  open();
  await load(other);
}

async function openLoadAndFill(other = detail({ id: 88002, mail: 'other@example.com', kycLevel: 20 })): Promise<void> {
  await openAndLoad(other);
  fillReason('Duplicate account');
}

function submit(): void {
  fireEvent.submit(mergeForm());
}

describe('AccountMergeEditor', () => {
  beforeEach(() => {
    mockGetUserData.mockReset();
    mockMergeUserData.mockReset();
    mockStaffName.name = 'JR';
    mockStaffName.isLoading = false;
    mockStaffName.error = undefined;
  });

  it('shows only the button until it is clicked', () => {
    render(element());

    expect(screen.getByRole('button', { name: 'Merge accounts' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Other UserDataID')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merge' })).not.toBeInTheDocument();
  });

  it('opens the form with the clerk and a disabled Load', () => {
    render(element());
    open();

    expect(screen.getByText('JR')).toBeInTheDocument();
    expect(screen.getByLabelText('Other UserDataID')).toHaveValue('');
    expect(loadButton()).toBeDisabled();
    expect(mergeButton()).toBeDisabled();
  });

  it.each(['', '   ', '0', '-5', '1.5', 'abc', '1e3'])('keeps Load disabled for %j', (value) => {
    render(element());
    open();
    typeOther(value);

    expect(loadButton()).toBeDisabled();
  });

  it('enables Load for a positive integer', () => {
    render(element());
    open();
    typeOther(' 88002 ');

    expect(loadButton()).toBeEnabled();
  });

  it('loads the other account, shows both side by side and keeps the current one on a lower KYC level', async () => {
    render(element());
    await openAndLoad(
      detail({ id: 88002, status: 'InProgress', mail: 'other@example.com', kycLevel: 20, verifiedName: 'Other Name' }),
    );

    expect(mockGetUserData).toHaveBeenCalledWith(88002);
    expect(screen.getByText('This account')).toBeInTheDocument();
    expect(screen.getByText('Other account')).toBeInTheDocument();
    expect(screen.getAllByText('88002').length).toBeGreaterThan(0);
    expect(screen.getByText('InProgress')).toBeInTheDocument();
    expect(screen.getByText('Other Name')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Keep this account (88001)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Keep other account (88002)' })).not.toBeChecked();
    expect(screen.getByText('Mail after merge: master@example.com')).toBeInTheDocument();
    expect(mergeButton()).toBeDisabled();
  });

  it('preselects the account with the higher KYC level', async () => {
    render(element());
    await openAndLoad(detail({ id: 88002, kycLevel: 40 }));

    expect(screen.getByRole('radio', { name: 'Keep other account (88002)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Keep this account (88001)' })).not.toBeChecked();
  });

  it('preselects the current account on a KYC level tie', async () => {
    render(element());
    await openAndLoad(detail({ id: 88002, kycLevel: 30 }));

    expect(screen.getByRole('radio', { name: 'Keep this account (88001)' })).toBeChecked();
  });

  it('compares a missing KYC level as zero', async () => {
    render(element());
    await openAndLoad(detail({ id: 88002, kycLevel: undefined }));

    expect(screen.getByRole('radio', { name: 'Keep this account (88001)' })).toBeChecked();
  });

  it('compares a missing current KYC level as zero', async () => {
    render(element({ userData: detail({ kycLevel: undefined }) }));
    await openAndLoad(detail({ id: 88002, kycLevel: 0 }));

    expect(screen.getByRole('radio', { name: 'Keep this account (88001)' })).toBeChecked();
  });

  it.each<[string, number, 'current' | 'other']>([
    ['higher', 40, 'other'],
    ['equal', 30, 'current'],
    ['lower', 20, 'current'],
  ])('%s other KYC preselects the default kept account', async (_label, kycLevel, expected) => {
    render(element());
    await openAndLoad(detail({ id: 88002, kycLevel }));

    const keepOther = screen.getByRole('radio', { name: 'Keep other account (88002)' });
    const keepCurrent = screen.getByRole('radio', { name: 'Keep this account (88001)' });
    expect(expected === 'other' ? keepOther : keepCurrent).toBeChecked();
  });

  it('shows a dash for empty values', async () => {
    render(element());
    await openAndLoad(detail({ id: 88002, status: '', mail: undefined, kycLevel: undefined, verifiedName: '' }));

    const otherRow = screen.getByText('verifiedName').closest('tr') as HTMLElement;
    expect(otherRow.querySelectorAll('td')[2]).toHaveTextContent('-');
  });

  it('shows a dash for values the API sends as null', async () => {
    render(element());
    await openAndLoad(
      detail({ id: 88002, mail: null as unknown as string, verifiedName: null as unknown as string, kycLevel: 20 }),
    );

    const mailRow = screen.getByText('mail').closest('tr') as HTMLElement;
    const nameRow = screen.getByText('verifiedName').closest('tr') as HTMLElement;
    expect(mailRow.querySelectorAll('td')[2]).toHaveTextContent(/^-$/);
    expect(nameRow.querySelectorAll('td')[2]).toHaveTextContent(/^-$/);
  });

  it('shows the loading label and disables Load while the account is fetched', async () => {
    const deferred = createDeferred<{ userData: UserDataDetail }>();
    mockGetUserData.mockReturnValue(deferred.promise);
    render(element());
    open();
    typeOther('88002');
    fireEvent.click(loadButton());

    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();

    await act(async () => {
      deferred.resolve({ userData: detail({ id: 88002 }) });
      await deferred.promise;
    });
    expect(loadButton()).toBeEnabled();
    expect(screen.getByText('Other account')).toBeInTheDocument();
  });

  it('shows the message of a load failure', async () => {
    mockGetUserData.mockRejectedValue(new Error('Customer not found'));
    render(element());
    open();
    typeOther('88002');
    fireEvent.click(loadButton());

    expect(await screen.findByText('Customer not found')).toBeInTheDocument();
    expect(screen.queryByText('Other account')).not.toBeInTheDocument();
  });

  it('falls back to a generic message for a load failure without one', async () => {
    mockGetUserData.mockRejectedValue('boom');
    render(element());
    open();
    typeOther('88002');
    fireEvent.click(loadButton());

    expect(await screen.findByText('Failed to load the other account')).toBeInTheDocument();
  });

  it('falls back to a generic message for a non-Error load failure', async () => {
    mockGetUserData.mockRejectedValue(undefined);
    render(element());
    open();
    typeOther('88002');
    fireEvent.click(loadButton());

    expect(await screen.findByText('Failed to load the other account')).toBeInTheDocument();
  });

  it('clears the loaded account and the load error when the id changes', async () => {
    mockGetUserData.mockRejectedValueOnce(new Error('Customer not found'));
    render(element());
    open();
    typeOther('88002');
    fireEvent.click(loadButton());
    expect(await screen.findByText('Customer not found')).toBeInTheDocument();

    typeOther('88003');

    expect(screen.queryByText('Customer not found')).not.toBeInTheDocument();
    expect(screen.queryByText('Other account')).not.toBeInTheDocument();
    expect(loadButton()).toBeEnabled();
  });

  it('drops a late load success for an id that is no longer in the input', async () => {
    const deferred = createDeferred<{ userData: UserDataDetail }>();
    mockGetUserData.mockReturnValue(deferred.promise);
    render(element());
    open();
    typeOther('88002');
    fireEvent.click(loadButton());

    typeOther('88003');
    expect(loadButton()).toBeEnabled();

    await act(async () => {
      deferred.resolve({ userData: detail({ id: 88002 }) });
      await deferred.promise;
    });

    expect(screen.getByLabelText('Other UserDataID')).toHaveValue('88003');
    expect(screen.queryByText('Other account')).not.toBeInTheDocument();
    expect(loadButton()).toBeEnabled();
  });

  it('drops a late load failure for an id that is no longer in the input', async () => {
    const deferred = createDeferred<{ userData: UserDataDetail }>();
    mockGetUserData.mockReturnValue(deferred.promise);
    render(element());
    open();
    typeOther('88002');
    fireEvent.click(loadButton());

    typeOther('88003');

    await act(async () => {
      deferred.reject(new Error('Customer not found'));
      await deferred.promise.catch(() => undefined);
    });

    expect(screen.queryByText('Customer not found')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed to load the other account')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Other UserDataID')).toHaveValue('88003');
    expect(loadButton()).toBeEnabled();
  });

  it('keeps the loading state of a newer load when an older answer arrives late', async () => {
    const first = createDeferred<{ userData: UserDataDetail }>();
    const second = createDeferred<{ userData: UserDataDetail }>();
    mockGetUserData.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(element());
    open();
    typeOther('88002');
    fireEvent.click(loadButton());

    typeOther('88003');
    fireEvent.click(loadButton());
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();

    await act(async () => {
      first.resolve({ userData: detail({ id: 88002 }) });
      await first.promise;
    });

    expect(screen.queryByText('Other account')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();

    await act(async () => {
      second.resolve({ userData: detail({ id: 88003, kycLevel: 20 }) });
      await second.promise;
    });

    expect(screen.getByText('Other account')).toBeInTheDocument();
    expect(loadButton()).toBeEnabled();
  });

  it('keeps the loading state of a newer load when an older failure arrives late', async () => {
    const first = createDeferred<{ userData: UserDataDetail }>();
    const second = createDeferred<{ userData: UserDataDetail }>();
    mockGetUserData.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(element());
    open();
    typeOther('88002');
    fireEvent.click(loadButton());

    typeOther('88003');
    fireEvent.click(loadButton());
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();

    await act(async () => {
      first.reject(new Error('Customer not found'));
      await first.promise.catch(() => undefined);
    });

    expect(screen.queryByText('Customer not found')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();

    await act(async () => {
      second.resolve({ userData: detail({ id: 88003, kycLevel: 20 }) });
      await second.promise;
    });

    expect(screen.getByText('Other account')).toBeInTheDocument();
    expect(loadButton()).toBeEnabled();
  });

  it('drops a load for the previous account when the screen switches accounts', async () => {
    const deferred = createDeferred<{ userData: UserDataDetail }>();
    mockGetUserData.mockReturnValue(deferred.promise);
    const { rerender } = render(element());
    open();
    typeOther('88002');
    fireEvent.click(loadButton());

    rerender(element({ userDataId: 88003, userData: detail({ id: 88003 }) }));
    expect(screen.getByRole('button', { name: 'Merge accounts' })).toBeInTheDocument();

    await act(async () => {
      deferred.resolve({ userData: detail({ id: 88002 }) });
      await deferred.promise;
    });

    open();
    expect(screen.getByLabelText('Other UserDataID')).toHaveValue('');
    expect(screen.queryByText('Other account')).not.toBeInTheDocument();
    expect(mockGetUserData).toHaveBeenCalledWith(88002);
  });

  it('refuses a load that returns a different account than requested', async () => {
    mockGetUserData.mockResolvedValue({ userData: detail({ id: 88003 }) });
    render(element());
    open();
    typeOther('88002');
    fireEvent.click(loadButton());

    expect(await screen.findByText('Failed to load the other account')).toBeInTheDocument();
    expect(screen.queryByText('Other account')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Other UserDataID')).toHaveValue('88002');
    expect(mergeButton()).toBeDisabled();
    expect(loadButton()).toBeEnabled();
  });

  it('uses the kept account as master and shows the mail the remaining account will carry', async () => {
    render(element());
    await openAndLoad(detail({ id: 88002, mail: 'other@example.com', kycLevel: 30 }));

    fireEvent.click(screen.getByRole('radio', { name: 'Keep other account (88002)' }));

    expect(screen.getByText('Mail after merge: other@example.com')).toBeInTheDocument();
    fillReason('Duplicate account');
    expect(mergeButton()).toBeEnabled();
  });

  it('refuses to keep the other account when it has the lower KYC level', async () => {
    render(element());
    await openAndLoad(detail({ id: 88002, mail: 'other@example.com', kycLevel: 20 }));
    fireEvent.click(screen.getByRole('radio', { name: 'Keep other account (88002)' }));
    fillReason('Duplicate account');

    expect(screen.getByTestId('account-merge-validation')).toHaveTextContent(
      'The account that stays (88002) has KYC level 20; the other account has 30. ' +
        'Keep the account with the higher KYC level.',
    );
    expect(mergeButton()).toBeDisabled();
  });

  it('keeps the master mail when the other account has none', async () => {
    render(element());
    await openAndLoad(detail({ id: 88002, mail: undefined, kycLevel: 20 }));

    expect(screen.getByText('Mail after merge: master@example.com')).toBeInTheDocument();
  });

  it('fills an empty master mail from the other account', async () => {
    render(element({ userData: detail({ mail: undefined }) }));
    await openAndLoad(detail({ id: 88002, mail: 'other@example.com', kycLevel: 20 }));

    expect(screen.getByText('Mail after merge: other@example.com')).toBeInTheDocument();
  });

  it('shows no mail when neither account has one', async () => {
    render(element({ userData: detail({ mail: undefined }) }));
    await openAndLoad(detail({ id: 88002, mail: undefined, kycLevel: 20 }));

    expect(screen.getByText('Mail after merge: -')).toBeInTheDocument();
  });

  it('refuses an account merged with itself and disables Merge', async () => {
    render(element());
    await openAndLoad(detail({ id: 88001 }));
    fillReason('Duplicate account');

    expect(screen.getByTestId('account-merge-validation')).toHaveTextContent(
      'An account cannot be merged with itself.',
    );
    expect(mergeButton()).toBeDisabled();
    submit();
    expect(mockMergeUserData).not.toHaveBeenCalled();
  });

  it('refuses a master that is already merged', async () => {
    render(element({ userData: detail({ status: 'Merged' }) }));
    await openAndLoad(detail({ id: 88002, kycLevel: 20 }));

    expect(screen.getByTestId('account-merge-validation')).toHaveTextContent('Account 88001 is already merged.');
  });

  it('refuses a slave that is already merged', async () => {
    render(element());
    await openAndLoad(detail({ id: 88002, status: 'Merged', kycLevel: 20 }));

    expect(screen.getByText('Account 88002 is already merged.')).toBeInTheDocument();
  });

  it('lists every validation message', async () => {
    render(element({ userData: detail({ id: 88001, status: 'Merged' }) }));
    mockGetUserData.mockResolvedValue({ userData: detail({ id: 88001, status: 'Merged' }) });
    open();
    typeOther('88001');
    fireEvent.click(loadButton());
    await screen.findByText('Other account');

    expect(screen.getAllByTestId('account-merge-validation').map((node) => node.textContent)).toEqual([
      'An account cannot be merged with itself.',
      'Account 88001 is already merged.',
    ]);
  });

  it('refuses keeping the account with the lower KYC level', async () => {
    render(element({ userData: detail({ kycLevel: 20 }) }));
    await openAndLoad(detail({ id: 88002, kycLevel: 30 }));
    fireEvent.click(screen.getByRole('radio', { name: 'Keep this account (88001)' }));
    fillReason('Duplicate account');

    expect(screen.getByTestId('account-merge-validation')).toHaveTextContent(
      'The account that stays (88001) has KYC level 20; the other account has 30. ' +
        'Keep the account with the higher KYC level.',
    );
    expect(mergeButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Keep other account (88002)' }));
    expect(screen.queryByTestId('account-merge-validation')).not.toBeInTheDocument();
    expect(mergeButton()).toBeEnabled();
  });

  it.each(['', '   '])('keeps Merge disabled for a reason of %j', async (value) => {
    render(element());
    await openAndLoad(detail({ id: 88002, kycLevel: 20 }));
    fillReason(value);
    expect(mergeButton()).toBeDisabled();

    submit();
    expect(mockMergeUserData).not.toHaveBeenCalled();
  });

  it('merges the two accounts with the trimmed reason and reports the remaining account', async () => {
    mockMergeUserData.mockResolvedValue(undefined);
    const onMerged = jest.fn();
    render(element({ onMerged }));
    await openLoadAndFill(detail({ id: 88002, mail: 'other@example.com', kycLevel: 20 }));
    fillReason('  duplicate account  ');

    fireEvent.click(mergeButton());

    await waitFor(() => expect(onMerged).toHaveBeenCalledWith(88001));
    expect(mockMergeUserData).toHaveBeenCalledWith(88001, 88002, 'duplicate account');
    expect(mockMergeUserData.mock.invocationCallOrder[0]).toBeLessThan(onMerged.mock.invocationCallOrder[0]);
    expect(screen.getByRole('button', { name: 'Merge accounts' })).toBeInTheDocument();
  });

  it('sends the other account as master when it stays', async () => {
    mockMergeUserData.mockResolvedValue(undefined);
    const onMerged = jest.fn();
    render(element({ onMerged }));
    await openLoadAndFill(detail({ id: 88002, mail: 'other@example.com', kycLevel: 40 }));
    fireEvent.click(screen.getByRole('radio', { name: 'Keep other account (88002)' }));

    fireEvent.click(mergeButton());

    await waitFor(() => expect(onMerged).toHaveBeenCalledWith(88002));
    expect(mockMergeUserData).toHaveBeenCalledWith(88002, 88001, 'Duplicate account');
  });

  it('starts one merge for two submits in the same tick and locks the form while it runs', async () => {
    const deferred = createDeferred<void>();
    mockMergeUserData.mockReturnValue(deferred.promise);
    render(element());
    await openLoadAndFill();

    // One act: React batches the state updates, so the button is still enabled for the second submit.
    act(() => {
      fireEvent.submit(mergeForm());
      fireEvent.submit(mergeForm());
    });

    expect(mockMergeUserData).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Merging…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Other UserDataID')).toBeDisabled();
    expect(screen.getByLabelText('Reason')).toBeDisabled();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
    expect(screen.getByRole('button', { name: 'Merge accounts' })).toBeInTheDocument();
  });

  it('ignores a merge that finishes after the box is gone', async () => {
    const deferred = createDeferred<void>();
    mockMergeUserData.mockReturnValue(deferred.promise);
    const onMerged = jest.fn();
    const { unmount } = render(element({ onMerged }));
    await openLoadAndFill();
    fireEvent.click(mergeButton());
    unmount();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(onMerged).not.toHaveBeenCalled();

    // The rejection path after unmount must be just as silent.
    const deferredReject = createDeferred<void>();
    mockMergeUserData.mockReturnValue(deferredReject.promise);
    const { unmount: unmountSecond } = render(element({ onMerged }));
    await openLoadAndFill();
    fireEvent.click(mergeButton());
    unmountSecond();

    await act(async () => {
      deferredReject.reject(new Error('late'));
      await deferredReject.promise.catch(() => undefined);
    });

    expect(onMerged).not.toHaveBeenCalled();
  });

  it('ignores a load that finishes after the box is gone', async () => {
    const deferred = createDeferred<{ userData: UserDataDetail }>();
    mockGetUserData.mockReturnValue(deferred.promise);
    const { unmount } = render(element());
    open();
    typeOther('88002');
    fireEvent.click(loadButton());
    unmount();

    await act(async () => {
      deferred.resolve({ userData: detail({ id: 88002 }) });
      await deferred.promise;
    });
    expect(mockGetUserData).toHaveBeenCalledWith(88002);
  });

  it('ignores a load failure that arrives after the box is gone', async () => {
    const deferred = createDeferred<{ userData: UserDataDetail }>();
    mockGetUserData.mockReturnValue(deferred.promise);
    const { unmount } = render(element());
    open();
    typeOther('88002');
    fireEvent.click(loadButton());
    unmount();

    await act(async () => {
      deferred.reject(new Error('late load'));
      await deferred.promise.catch(() => undefined);
    });
    expect(mockGetUserData).toHaveBeenCalledWith(88002);
  });

  it('closes the form on account switch and drops a late success for the previous account', async () => {
    const deferred = createDeferred<void>();
    mockMergeUserData.mockReturnValue(deferred.promise);
    const onMerged = jest.fn();
    const { rerender } = render(element({ onMerged }));
    await openLoadAndFill();
    fireEvent.click(mergeButton());

    rerender(element({ userDataId: 88003, userData: detail({ id: 88003 }), onMerged }));
    expect(screen.queryByLabelText('Other UserDataID')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge accounts' })).toBeInTheDocument();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
    expect(onMerged).not.toHaveBeenCalled();

    // The new account starts with an empty form.
    open();
    expect(screen.getByLabelText('Other UserDataID')).toHaveValue('');
    expect(screen.queryByText('Other account')).not.toBeInTheDocument();
  });

  it('closes the form when returning to an account and does not reopen it', () => {
    const { rerender } = render(element());
    open();
    rerender(element({ userDataId: 88002, userData: detail({ id: 88002 }) }));
    rerender(element({ userDataId: 88001 }));

    expect(screen.queryByLabelText('Other UserDataID')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge accounts' })).toBeInTheDocument();
  });

  it('does not report a late error from the previous account on the new form', async () => {
    const deferred = createDeferred<void>();
    mockMergeUserData.mockReturnValue(deferred.promise);
    const { rerender } = render(element());
    await openLoadAndFill();
    fireEvent.click(mergeButton());

    rerender(element({ userDataId: 88002, userData: detail({ id: 88002 }) }));
    open();
    await load(detail({ id: 88003, kycLevel: 20 }));

    await act(async () => {
      deferred.reject(new Error('Merge refused'));
      await deferred.promise.catch(() => undefined);
    });

    expect(screen.queryByText('Merge refused')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Other UserDataID')).toBeInTheDocument();
  });

  it.each([
    ['a bare 404', { statusCode: 404 }],
    ['a 404 whose message is Not Found', Object.assign(new Error('Not Found'), { statusCode: 404 })],
  ])('says the API is switched off for %s', async (_label, rejection) => {
    mockMergeUserData.mockRejectedValue(rejection);
    render(element());
    await openLoadAndFill();
    fireEvent.click(mergeButton());

    expect(await screen.findByText(ACCOUNT_MERGE_API_OFF)).toBeInTheDocument();
    expect(screen.getByLabelText('Other UserDataID')).toBeInTheDocument();
  });

  it('shows the API message for a 404 that carries one', async () => {
    mockMergeUserData.mockRejectedValue(Object.assign(new Error('User data not found'), { statusCode: 404 }));
    render(element());
    await openLoadAndFill();
    fireEvent.click(mergeButton());

    expect(await screen.findByText('User data not found')).toBeInTheDocument();
  });

  it('shows another API error unchanged and keeps the form open', async () => {
    mockMergeUserData.mockRejectedValue(Object.assign(new Error('Merge refused'), { statusCode: 400 }));
    render(element());
    await openLoadAndFill();
    fireEvent.click(mergeButton());

    expect(await screen.findByText('Merge refused')).toBeInTheDocument();
    expect(screen.getByLabelText('Other UserDataID')).toBeInTheDocument();
    expect(mergeButton()).toBeEnabled();
  });

  it('falls back to a generic message for a plain error object without text', async () => {
    mockMergeUserData.mockRejectedValue({ statusCode: 400, message: 42 });
    render(element());
    await openLoadAndFill();
    fireEvent.click(mergeButton());

    expect(await screen.findByText('Failed to merge the accounts')).toBeInTheDocument();
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    mockMergeUserData.mockRejectedValue(undefined);
    render(element());
    await openLoadAndFill();
    fireEvent.click(mergeButton());

    expect(await screen.findByText('Failed to merge the accounts')).toBeInTheDocument();
  });

  it('cancels without loading or merging', () => {
    render(element());
    open();
    typeOther('88002');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Other UserDataID')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge accounts' })).toBeInTheDocument();
    expect(mockGetUserData).not.toHaveBeenCalled();
    expect(mockMergeUserData).not.toHaveBeenCalled();
  });

  it('does not merge before an account is loaded', () => {
    render(element());
    open();
    fillReason('why');
    submit();

    expect(mockMergeUserData).not.toHaveBeenCalled();
  });

  it('refuses to merge without a verified clerk name and says why', async () => {
    mockStaffName.name = undefined;
    render(element());
    await openLoadAndFill();

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByTestId('error-hint')).toHaveTextContent(
      'Staff identification requires a verified name on this account.',
    );
    expect(mergeButton()).toBeDisabled();

    submit();
    expect(mockMergeUserData).not.toHaveBeenCalled();
  });

  it('names the load error when the clerk name could not be fetched', () => {
    mockStaffName.name = undefined;
    mockStaffName.error = 'HTTP 500';
    render(element());
    open();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('Could not load your verified name: HTTP 500');
  });

  it('keeps Merge disabled while the clerk name is still loading even if a name is present', async () => {
    mockStaffName.isLoading = true;
    render(element());
    await openLoadAndFill();

    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(mergeButton()).toBeDisabled();

    submit();
    expect(mockMergeUserData).not.toHaveBeenCalled();
  });
});
