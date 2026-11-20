const mockUpdateUserData = jest.fn();
const mockCreateKycLog = jest.fn();
let mockCountries: { id: number; symbol: string; name: string }[] = [
  { id: 1, symbol: 'CH', name: 'Switzerland' },
  { id: 2, symbol: 'DE', name: 'Germany' },
];

jest.mock('@dfx.swiss/react', () => ({
  useAuthContext: () => ({ session: { role: 'Admin' } }),
  UserRole: {
    USER: 'User',
    VIP: 'VIP',
    SUPPORT: 'Support',
    MARKETING: 'Marketing',
    COMPLIANCE: 'Compliance',
    ADMIN: 'Admin',
  },
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ updateUserData: mockUpdateUserData, createKycLog: mockCreateKycLog }),
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => ({ name: 'Staff Example', isLoading: false }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ countries: mockCountries }),
}));

jest.mock('src/components/compliance/collapsible-section', () => ({
  CollapsibleSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

jest.mock('src/components/compliance/limit-request-modal', () => ({
  LimitRequestModal: ({
    isOpen,
    userDataId,
    defaultName,
  }: {
    isOpen: boolean;
    userDataId: number;
    defaultName?: string;
  }) =>
    isOpen ? (
      <div data-testid="limit-request-modal">
        modal for {userDataId} as {defaultName ?? 'no name'}
      </div>
    ) : null,
}));

jest.mock('src/components/compliance/reactivate-account', () => ({
  ReactivateAccount: () => <button type="button">Reactivate</button>,
}));

jest.mock('src/components/compliance/account-access-toggles', () => ({
  AccountAccessToggles: () => <div data-testid="account-access-toggles" />,
}));

jest.mock('src/components/compliance/onboarding-fee-editor', () => ({
  OnboardingFeeEditor: () => <div data-testid="onboarding-fee-editor" />,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <p data-testid="error-hint">{message}</p>,
}));

jest.mock('src/hooks/clipboard.hook', () => ({
  useClipboard: () => ({ copy: jest.fn(), isCopying: false }),
}));

// The helper module pulls in @dfx.swiss/react (ESM this Jest setup cannot parse); keep the tagged
// echoes of the panel test and hand the form a fixed log message.
jest.mock('src/util/compliance-helpers', () => ({
  display: (value: unknown) => (value === undefined || value === null || value === '' ? '-' : String(value)),
  refName: (ref?: { name?: string; symbol?: string }) => ref?.name ?? ref?.symbol ?? '-',
  formatDate: (value: string) => `d:${value}`,
  formatDateTime: (value: string) => `dt:${value}`,
  formatBirthday: (value: string) => `b:${value}`,
  buildKycLogMessage: () => 'UserDataEdit log message',
}));

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { UserDataPanel } from 'src/components/compliance/user-data-panel';
import type { UserDataDetail } from 'src/hooks/compliance.hook';

function detail(overrides: Partial<UserDataDetail> = {}): UserDataDetail {
  return {
    id: 88001,
    created: '2025-07-01T21:20:33.000Z',
    status: 'Active',
    riskStatus: 'NA',
    kycStatus: 'Completed',
    kycLevel: 50,
    mail: 'e2e-edit@example.com',
    phone: '+41 79 123 45 67',
    firstname: 'Ada',
    surname: 'Example',
    street: 'Teststrasse',
    houseNumber: '7',
    zip: '6300',
    location: 'Zug',
    country: { name: 'Switzerland', symbol: 'CH' },
    ...overrides,
  } as UserDataDetail;
}

function panel(reload: () => void): JSX.Element {
  return <UserDataPanel userData={detail()} userDataId={88001} onAccountAccessChanged={reload} />;
}

function typeInto(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function openForm(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Edit personal data' }));
}

function saveMail(mail: string): void {
  typeInto('mail', mail);
  typeInto('Reason', 'Correcting the record');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

describe('UserDataPanel with the real edit form', () => {
  beforeEach(() => {
    mockCountries = [
      { id: 1, symbol: 'CH', name: 'Switzerland' },
      { id: 2, symbol: 'DE', name: 'Germany' },
    ];
    mockUpdateUserData.mockReset();
    mockUpdateUserData.mockResolvedValue(undefined);
    mockCreateKycLog.mockReset();
    mockCreateKycLog.mockResolvedValue(undefined);
  });

  it('saves the mail, writes the KYC log, closes the form and reloads without a warning', async () => {
    const reload = jest.fn();
    render(panel(reload));

    openForm();
    saveMail('e2e-new@example.com');

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    expect(mockUpdateUserData).toHaveBeenCalledWith(88001, { mail: 'e2e-new@example.com' });
    expect(mockCreateKycLog).toHaveBeenCalledWith(88001, 'UserDataEdit log message');
    expect(mockUpdateUserData.mock.invocationCallOrder[0]).toBeLessThan(mockCreateKycLog.mock.invocationCallOrder[0]);
    expect(screen.queryByLabelText('mail')).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved, but the KYC log entry failed/)).not.toBeInTheDocument();
  });

  it('shows the KYC log warning in the Personal Data section until the form is opened again', async () => {
    mockCreateKycLog.mockRejectedValueOnce(new Error('Log down'));
    const reload = jest.fn();
    render(panel(reload));

    openForm();
    saveMail('e2e-new@example.com');

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    const personal = within(screen.getByRole('region', { name: 'Personal Data' }));
    expect(personal.getByText('Saved, but the KYC log entry failed: Log down')).toBeInTheDocument();
    expect(screen.queryByLabelText('mail')).not.toBeInTheDocument();

    openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Saved, but the KYC log entry failed: Log down')).not.toBeInTheDocument();
  });

  it('waits for the countries, then preselects the country and saves without a countryId', async () => {
    mockCountries = [];
    const reload = jest.fn();
    const { rerender } = render(panel(reload));

    openForm();
    expect(screen.getByText('Loading countries…')).toBeInTheDocument();

    mockCountries = [
      { id: 1, symbol: 'CH', name: 'Switzerland' },
      { id: 2, symbol: 'DE', name: 'Germany' },
    ];
    rerender(panel(reload));

    expect((screen.getByLabelText('country') as HTMLSelectElement).value).toBe('1');
    saveMail('e2e-new@example.com');

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(mockUpdateUserData).toHaveBeenCalledWith(88001, { mail: 'e2e-new@example.com' });
  });
});
