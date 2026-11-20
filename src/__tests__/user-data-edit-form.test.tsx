const mockStaffName: { name?: string; isLoading: boolean; error?: string } = {
  name: 'Staff Example',
  isLoading: false,
};
const mockMutateUserData = jest.fn();
let mockCountries = [
  { id: 1, symbol: 'CH', name: 'Switzerland' },
  { id: 2, symbol: 'DE', name: 'Germany' },
];

jest.mock('@dfx.swiss/react', () => ({
  UserRole: {
    USER: 'User',
    VIP: 'VIP',
    SUPPORT: 'Support',
    MARKETING: 'Marketing',
    COMPLIANCE: 'Compliance',
    ADMIN: 'Admin',
  },
}));

jest.mock('src/hooks/user-data-operator-mutation.hook', () => ({
  useUserDataOperatorMutation: () => ({ mutateUserData: mockMutateUserData }),
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => mockStaffName,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ countries: mockCountries }),
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <p data-testid="error-hint">{message}</p>,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UserDataEditForm } from 'src/components/compliance/user-data-edit-form';
import type { UserDataDetail } from 'src/hooks/compliance.hook';

interface FormProps {
  userDataId: number;
  userData: UserDataDetail;
  onSaved: jest.Mock;
  onCancel: jest.Mock;
}

function userData(overrides: Partial<UserDataDetail> = {}): UserDataDetail {
  return {
    id: 88001,
    mail: 'e2e-edit@example.com',
    phone: '+41 79 123 45 67',
    firstname: 'Ada',
    surname: 'Example',
    street: 'Teststrasse',
    houseNumber: '7',
    zip: '6300',
    location: 'Zug',
    country: { name: 'Switzerland', symbol: 'CH' },
    kycStatus: 'Completed',
    ...overrides,
  } as UserDataDetail;
}

function form(props: Partial<FormProps> = {}) {
  return (
    <UserDataEditForm
      userDataId={props.userDataId ?? 88001}
      userData={props.userData ?? userData()}
      onSaved={props.onSaved ?? jest.fn()}
      onCancel={props.onCancel ?? jest.fn()}
    />
  );
}

function renderForm(props: Partial<FormProps> = {}) {
  const onSaved = props.onSaved ?? jest.fn();
  const onCancel = props.onCancel ?? jest.fn();
  return { ...render(form({ ...props, onSaved, onCancel })), onSaved, onCancel };
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

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function select(label: string): HTMLSelectElement {
  return screen.getByLabelText(label) as HTMLSelectElement;
}

function typeInto(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillChange(reason = 'Correcting the record'): void {
  typeInto('mail', 'e2e-new@example.com');
  typeInto('Reason', reason);
}

function saveForm(): void {
  fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form') as HTMLFormElement);
}

describe('UserDataEditForm', () => {
  beforeEach(() => {
    mockStaffName.name = 'Staff Example';
    mockStaffName.isLoading = false;
    mockStaffName.error = undefined;
    mockCountries = [
      { id: 1, symbol: 'CH', name: 'Switzerland' },
      { id: 2, symbol: 'DE', name: 'Germany' },
    ];
    mockMutateUserData.mockReset();
    mockMutateUserData.mockResolvedValue(undefined);
  });

  it('renders the current values and keeps Save disabled until something changes', () => {
    renderForm();

    expect(input('mail').value).toBe('e2e-edit@example.com');
    expect(input('phone').value).toBe('+41 79 123 45 67');
    expect(input('firstname').value).toBe('Ada');
    expect(input('surname').value).toBe('Example');
    expect(input('street').value).toBe('Teststrasse');
    expect(input('houseNumber').value).toBe('7');
    expect(input('zip').value).toBe('6300');
    expect(input('location').value).toBe('Zug');

    expect(select('country').value).toBe('1');
    expect(screen.getByRole('option', { name: 'Switzerland' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Germany' })).toBeInTheDocument();

    expect(select('kycStatus').value).toBe('Completed');
    expect(screen.queryByRole('option', { name: 'Completed (current)' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Rejected' })).toBeInTheDocument();
    expect(screen.getByText('Check is set on the compliance review screen (KYC Status Check).')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('offers an empty country option only when the account has no country', () => {
    renderForm({ userData: userData({ country: undefined }) });

    expect(select('country').value).toBe('');
    expect(screen.getByRole('option', { name: 'No country' })).toBeInTheDocument();

    fireEvent.change(select('country'), { target: { value: '1' } });
    expect(select('country').value).toBe('1');

    fireEvent.change(select('country'), { target: { value: '' } });
    expect(select('country').value).toBe('');
  });

  it('shows the current kycStatus as a non-editable option', () => {
    renderForm({ userData: userData({ kycStatus: 'Check' }) });

    expect(select('kycStatus').value).toBe('Check');
    expect((screen.getByRole('option', { name: 'Check (current)' }) as HTMLOptionElement).value).toBe('Check');
    expect(screen.getByRole('option', { name: 'NA' })).toBeInTheDocument();
  });

  it('labels an empty current kycStatus as a dash', () => {
    renderForm({ userData: userData({ kycStatus: undefined }) });

    expect(select('kycStatus').value).toBe('');
    expect((screen.getByRole('option', { name: '- (current)' }) as HTMLOptionElement).value).toBe('');
    expect(screen.queryByRole('option', { name: ' (current)' })).not.toBeInTheDocument();
  });

  it('waits for the countries before showing the fields of an account with a country', () => {
    mockCountries = [];
    const onCancel = jest.fn();
    renderForm({ onCancel });

    expect(screen.getByText('Loading countries…')).toBeInTheDocument();
    expect(screen.queryByLabelText('mail')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toBeEnabled();
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not wait for the countries when the account has no country', () => {
    mockCountries = [];
    renderForm({ userData: userData({ country: undefined }) });

    expect(screen.queryByText('Loading countries…')).not.toBeInTheDocument();
    expect(input('mail').value).toBe('e2e-edit@example.com');
  });

  it('disables Save without a verified staff name and explains why', () => {
    mockStaffName.name = undefined;
    renderForm();
    fillChange();

    expect(screen.getByTestId('error-hint')).toHaveTextContent(
      'Staff identification requires a verified name on this account.',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows a staff-name load error instead of the missing hint', () => {
    mockStaffName.name = undefined;
    mockStaffName.error = 'HTTP 500';
    renderForm();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('Could not load your verified name: HTTP 500');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('disables Save while the staff name is loading and shows no hint then', () => {
    mockStaffName.isLoading = true;
    renderForm();
    fillChange();

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('requires a change and a non-empty reason to save', () => {
    renderForm();

    typeInto('Reason', 'why');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    typeInto('mail', 'e2e-new@example.com');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    typeInto('Reason', '   ');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    typeInto('Reason', 'why');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('lists a validation error as soon as an invalid value is entered and disables Save', () => {
    renderForm();
    typeInto('mail', 'not-an-email');
    typeInto('Reason', 'why');

    expect(screen.getByTestId('user-data-edit-validation')).toHaveTextContent('mail is not a valid e-mail address');
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves the changed fields in one operator mutation call with the trimmed reason', async () => {
    const onSaved = jest.fn();
    renderForm({ onSaved });

    typeInto('mail', 'e2e-new@example.com');
    typeInto('street', 'Newstrasse');
    fireEvent.change(select('kycStatus'), { target: { value: 'Rejected' } });
    typeInto('Reason', '  Correcting the record  ');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    expect(mockMutateUserData).toHaveBeenCalledTimes(1);
    expect(mockMutateUserData).toHaveBeenCalledWith(
      88001,
      { mail: 'e2e-new@example.com', street: 'Newstrasse', kycStatus: 'Rejected' },
      'Correcting the record',
    );
    expect(mockMutateUserData.mock.invocationCallOrder[0]).toBeLessThan(onSaved.mock.invocationCallOrder[0]);
  });

  it('saves a changed country in the same single call', async () => {
    const onSaved = jest.fn();
    renderForm({ onSaved });

    fireEvent.change(select('country'), { target: { value: '2' } });
    typeInto('Reason', 'Moved');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    expect(mockMutateUserData).toHaveBeenCalledTimes(1);
    expect(mockMutateUserData).toHaveBeenCalledWith(88001, { countryId: 2 }, 'Moved');
  });

  it('explains a 404 from the operator mutation endpoint instead of the raw message', async () => {
    mockMutateUserData.mockRejectedValueOnce({ statusCode: 404, message: 'Not Found' });
    const onSaved = jest.fn();
    renderForm({ onSaved });
    fillChange();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Editing personal data is not enabled on this environment yet.'),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(input('mail').value).toBe('e2e-new@example.com');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('shows another API error unchanged, keeps the values and does not reload', async () => {
    mockMutateUserData.mockRejectedValueOnce(new Error('Update refused'));
    const onSaved = jest.fn();
    renderForm({ onSaved });
    fillChange();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Update refused')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(input('mail').value).toBe('e2e-new@example.com');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('uses a generic message for a non-Error rejection', async () => {
    mockMutateUserData.mockRejectedValueOnce('refused');
    renderForm();
    fillChange();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Failed to save the customer data')).toBeInTheDocument();
  });

  it('uses a generic message for a rejection without a value', async () => {
    mockMutateUserData.mockRejectedValueOnce(undefined);
    renderForm();
    fillChange();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Failed to save the customer data')).toBeInTheDocument();
  });

  it('cancels without saving', () => {
    const onCancel = jest.fn();
    renderForm({ onCancel });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mockMutateUserData).not.toHaveBeenCalled();
  });

  it('saves once for two clicks and disables both controls while it runs', async () => {
    const deferred = createDeferred<void>();
    mockMutateUserData.mockReturnValue(deferred.promise);
    const onSaved = jest.fn();
    renderForm({ onSaved });
    fillChange();

    const save = screen.getByRole('button', { name: 'Save' });
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });

    expect(mockMutateUserData).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('ignores a successful answer after unmount', async () => {
    const deferred = createDeferred<void>();
    mockMutateUserData.mockReturnValue(deferred.promise);
    const onSaved = jest.fn();
    const { unmount } = renderForm({ onSaved });
    fillChange();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    unmount();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(onSaved).not.toHaveBeenCalled();
  });

  it('ignores a rejection after unmount', async () => {
    const deferred = createDeferred<void>();
    mockMutateUserData.mockReturnValue(deferred.promise);
    const onSaved = jest.fn();
    const { unmount } = renderForm({ onSaved });
    fillChange();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    unmount();

    await act(async () => {
      deferred.reject(new Error('late'));
      await deferred.promise.catch(() => undefined);
    });

    expect(onSaved).not.toHaveBeenCalled();
  });

  it('drops a successful answer for the previous account', async () => {
    const deferred = createDeferred<void>();
    mockMutateUserData.mockReturnValue(deferred.promise);
    const onSaved = jest.fn();
    const { rerender } = render(form({ onSaved }));
    fillChange();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    rerender(form({ userDataId: 88002, onSaved }));
    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(onSaved).not.toHaveBeenCalled();
  });

  it('drops a rejection for the previous account', async () => {
    const deferred = createDeferred<void>();
    mockMutateUserData.mockReturnValue(deferred.promise);
    const { rerender } = render(form());
    fillChange();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    rerender(form({ userDataId: 88002 }));
    await act(async () => {
      deferred.reject(new Error('late'));
      await deferred.promise.catch(() => undefined);
    });

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('does not save a submit without the required inputs', () => {
    renderForm();
    typeInto('Reason', 'why');

    saveForm();

    expect(mockMutateUserData).not.toHaveBeenCalled();
  });

  it('does not save a submit without a verified name or while the name loads', () => {
    mockStaffName.name = undefined;
    const { rerender } = render(form());
    fillChange();

    saveForm();
    expect(mockMutateUserData).not.toHaveBeenCalled();

    mockStaffName.name = 'Staff Example';
    mockStaffName.isLoading = true;
    rerender(form());
    saveForm();
    expect(mockMutateUserData).not.toHaveBeenCalled();
  });
});
