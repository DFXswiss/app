// Component tests for UserDataPanel: every section of the customer box, the buttons next to id, status
// and depositLimit, the KYC link copy buttons, and that a reactivation updates the shown status from the
// PUT response for the account it came from.

let mockSession: { role?: string } | undefined = { role: 'Compliance' };
const mockCopy = jest.fn();
let mockIsCopying = false;
const mockReactivateProps: { userDataId?: number; onReactivated?: (info: unknown) => void } = {};

jest.mock('@dfx.swiss/react', () => ({
  useAuthContext: () => ({ session: mockSession }),
  UserRole: { USER: 'User', SUPPORT: 'Support', MARKETING: 'Marketing', COMPLIANCE: 'Compliance', ADMIN: 'Admin' },
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
    onClose,
    onCreated,
  }: {
    isOpen: boolean;
    userDataId: number;
    defaultName?: string;
    onClose: () => void;
    onCreated?: () => void;
  }) =>
    isOpen ? (
      <div data-testid="limit-request-modal">
        <span>
          modal for {userDataId} as {defaultName ?? 'no name'}
        </span>
        <button type="button" onClick={onClose}>
          close modal
        </button>
        <button type="button" onClick={() => onCreated?.()}>
          created
        </button>
      </div>
    ) : null,
}));

jest.mock('src/components/compliance/reactivate-account', () => ({
  ReactivateAccount: ({
    userDataId,
    onReactivated,
  }: {
    userDataId: number;
    onReactivated: (info: unknown) => void;
  }) => {
    mockReactivateProps.userDataId = userDataId;
    mockReactivateProps.onReactivated = onReactivated;
    return <button type="button">Reactivate</button>;
  },
}));

jest.mock('src/hooks/clipboard.hook', () => ({
  useClipboard: () => ({ copy: mockCopy, isCopying: mockIsCopying }),
}));

// The helper module pulls in @dfx.swiss/react (ESM this Jest setup cannot parse); the formatters are
// replaced by tagged echoes so the assertions read which formatter a row uses.
jest.mock('src/util/compliance-helpers', () => ({
  display: (value: unknown) => (value === undefined || value === null || value === '' ? '-' : String(value)),
  refName: (ref?: { name?: string; symbol?: string }) => ref?.name ?? ref?.symbol ?? '-',
  formatDate: (value: string) => `d:${value}`,
  formatDateTime: (value: string) => `dt:${value}`,
  formatBirthday: (value: string) => `b:${value}`,
}));

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { UserDataPanel } from 'src/components/compliance/user-data-panel';
import type { UserDataDetail } from 'src/hooks/compliance.hook';

function detail(overrides: Partial<UserDataDetail> = {}): UserDataDetail {
  return {
    id: 88001,
    created: '2025-07-01T21:20:33.000Z',
    status: 'Deactivated',
    riskStatus: 'NA',
    kycStatus: 'Completed',
    kycLevel: 50,
    depositLimit: 100000,
    wallet: { name: 'DFX' },
    firstname: 'Ada',
    surname: 'Example',
    birthday: '1980-01-01',
    kycHash: 'abc123',
    deactivationDate: '2025-07-01T21:35:38.000Z',
    ...overrides,
  } as UserDataDetail;
}

function row(section: string, key: string): HTMLElement {
  const table = within(screen.getByRole('region', { name: section }));
  return table.getByText(key).closest('tr') as HTMLElement;
}

function rowValue(section: string, key: string): string {
  return (row(section, key).querySelectorAll('td')[1] as HTMLElement).textContent ?? '';
}

describe('UserDataPanel', () => {
  beforeEach(() => {
    mockSession = { role: 'Compliance' };
    mockCopy.mockReset();
    mockIsCopying = false;
    mockReactivateProps.userDataId = undefined;
    mockReactivateProps.onReactivated = undefined;
    delete process.env.REACT_APP_PUBLIC_URL;
  });

  it('renders every section with the formatted values of the account', () => {
    render(<UserDataPanel userData={detail()} userDataId={88001} />);

    expect(rowValue('UserData', 'created')).toBe('dt:2025-07-01T21:20:33.000Z');
    expect(rowValue('UserData', 'kycLevel')).toBe('50');
    expect(rowValue('UserData', 'wallet')).toBe('DFX');
    expect(rowValue('Personal Data', 'firstname / surname')).toBe('Ada Example');
    expect(rowValue('Personal Data', 'street / houseNumber')).toBe('-');
    expect(rowValue('Personal Data', 'birthday')).toBe('b:1980-01-01');
    expect(rowValue('Personal Data', 'country')).toBe('-');
    expect(screen.getByText('No organization linked.')).toBeInTheDocument();
    expect(rowValue('Other', 'deactivationDate')).toBe('d:2025-07-01T21:35:38.000Z');
    expect(rowValue('Other', 'tradeApprovalDate')).toBe('-');
    expect(screen.getByRole('region', { name: 'PaymentLink Data' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'PhoneCall' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Volumes' })).toBeInTheDocument();
  });

  it('renders the organization rows when the account has one and hides the birthday without a value', () => {
    render(
      <UserDataPanel
        userData={detail({
          birthday: undefined,
          organization: { name: 'DFX AG', street: 'Bahnhofstrasse', houseNumber: '7', country: { symbol: 'CH' } },
        })}
      />,
    );

    expect(rowValue('Organization Data', 'name')).toBe('DFX AG');
    expect(rowValue('Organization Data', 'street / houseNumber')).toBe('Bahnhofstrasse 7');
    expect(rowValue('Organization Data', 'country')).toBe('CH');
    expect(rowValue('Personal Data', 'birthday')).toBe('-');
  });

  it('uses the half width by default and the full width when wide', () => {
    const { container, rerender } = render(<UserDataPanel userData={detail()} />);
    expect(container.firstChild).toHaveClass('w-1/2');

    rerender(<UserDataPanel userData={detail()} wide />);
    expect(container.firstChild).toHaveClass('w-full');
  });

  describe('kycHash row', () => {
    it('links the KYC hash and shows the copy buttons for a session that may copy KYC links', () => {
      process.env.REACT_APP_PUBLIC_URL = 'https://app.dfx.swiss';
      render(<UserDataPanel userData={detail()} canCopyKycLinks />);

      expect(screen.getByRole('link', { name: 'abc123' })).toHaveAttribute('href', '/kyc?code=abc123');
      fireEvent.click(screen.getByRole('button', { name: 'KYC' }));
      expect(mockCopy).toHaveBeenCalledWith('https://app.dfx.swiss/kyc?code=abc123');
      fireEvent.click(screen.getByRole('button', { name: 'Video' }));
      expect(mockCopy).toHaveBeenCalledWith('https://app.dfx.swiss/kyc?code=abc123&step=ident/video');
    });

    it('falls back to the window origin for the copied links and marks a running copy', () => {
      mockIsCopying = true;
      render(<UserDataPanel userData={detail()} canCopyKycLinks />);

      fireEvent.click(screen.getByRole('button', { name: '✓ KYC' }));
      expect(mockCopy).toHaveBeenCalledWith(`${window.location.origin}/kyc?code=abc123`);
      expect(screen.getByRole('button', { name: '✓ Video' })).toBeInTheDocument();
    });

    it('shows the link without copy buttons for other sessions and a dash without a hash', () => {
      const { rerender } = render(<UserDataPanel userData={detail()} />);
      expect(screen.getByRole('link', { name: 'abc123' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'KYC' })).not.toBeInTheDocument();

      rerender(<UserDataPanel userData={detail({ kycHash: undefined })} canCopyKycLinks />);
      expect(rowValue('KYC / AML', 'kycHash')).toBe('-');
    });
  });

  describe('id row', () => {
    it('offers the note button when the screen handles it', () => {
      const onCreateNote = jest.fn();
      render(<UserDataPanel userData={detail()} onCreateNote={onCreateNote} />);

      fireEvent.click(screen.getByRole('button', { name: 'Notiz erstellen' }));
      expect(onCreateNote).toHaveBeenCalledTimes(1);
      expect(rowValue('UserData', 'id')).toContain('88001');
    });

    it('shows the plain id without a handler', () => {
      render(<UserDataPanel userData={detail()} />);

      expect(screen.queryByRole('button', { name: 'Notiz erstellen' })).not.toBeInTheDocument();
      expect(rowValue('UserData', 'id')).toBe('88001');
    });
  });

  describe('depositLimit row', () => {
    it('opens and closes the limit request modal with the customer name and reports a created request', () => {
      const onLimitRequestCreated = jest.fn();
      render(<UserDataPanel userData={detail()} userDataId={88001} onLimitRequestCreated={onLimitRequestCreated} />);

      expect(screen.queryByTestId('limit-request-modal')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Limit Request' }));
      expect(screen.getByText('modal for 88001 as Ada Example')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'created' }));
      expect(onLimitRequestCreated).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'close modal' }));
      expect(screen.queryByTestId('limit-request-modal')).not.toBeInTheDocument();
    });

    it('passes no default name when the account has no name', () => {
      render(<UserDataPanel userData={detail({ firstname: undefined, surname: undefined })} userDataId={88001} />);

      fireEvent.click(screen.getByRole('button', { name: 'Limit Request' }));
      expect(screen.getByText('modal for 88001 as no name')).toBeInTheDocument();
    });

    it('shows the plain limit without an account id or without the permission', () => {
      const { rerender } = render(<UserDataPanel userData={detail()} />);
      expect(screen.queryByRole('button', { name: 'Limit Request' })).not.toBeInTheDocument();
      expect(rowValue('UserData', 'depositLimit')).toBe('100000');

      rerender(<UserDataPanel userData={detail()} userDataId={88001} canRequestLimit={false} />);
      expect(screen.queryByRole('button', { name: 'Limit Request' })).not.toBeInTheDocument();
    });
  });

  describe('status row', () => {
    it('offers Reactivate for a deactivated account to Compliance and shows the answered status afterwards', () => {
      render(<UserDataPanel userData={detail()} userDataId={88001} />);

      expect(rowValue('UserData', 'status')).toContain('Deactivated');
      expect(mockReactivateProps.userDataId).toBe(88001);

      // The mocked form reports the PUT response straight away.
      act(() => mockReactivateProps.onReactivated?.({ id: 88001, status: 'NA', deactivationDate: undefined }));

      expect(rowValue('UserData', 'status')).toBe('NA');
      expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument();
      expect(rowValue('Other', 'deactivationDate')).toBe('-');
    });

    it('ignores an answer for another account and keeps the button for the current one', () => {
      render(<UserDataPanel userData={detail()} userDataId={88001} />);

      act(() => mockReactivateProps.onReactivated?.({ id: 88002, status: 'NA' }));

      expect(rowValue('UserData', 'status')).toContain('Deactivated');
      expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
    });

    it('does not offer Reactivate when the row belongs to a different account than the route', () => {
      render(<UserDataPanel userData={detail({ id: 88001 })} userDataId={88002} />);

      expect(rowValue('UserData', 'status')).toContain('Deactivated');
      expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument();
    });

    it('does not paint a stored answer onto a row that is not that account', () => {
      const { rerender } = render(<UserDataPanel userData={detail({ id: 88002 })} userDataId={88002} />);
      act(() => mockReactivateProps.onReactivated?.({ id: 88002, status: 'NA', deactivationDate: undefined }));
      expect(rowValue('UserData', 'status')).toBe('NA');

      rerender(<UserDataPanel userData={detail({ id: 88001 })} userDataId={88002} />);

      expect(rowValue('UserData', 'status')).toContain('Deactivated');
      expect(rowValue('Other', 'deactivationDate')).toBe('d:2025-07-01T21:35:38.000Z');
      expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument();
    });

    it('does not apply a stored answer for the route when the row is still another account', () => {
      const { rerender } = render(<UserDataPanel userData={detail({ id: 88001 })} userDataId={88001} />);
      act(() => mockReactivateProps.onReactivated?.({ id: 88001, status: 'NA', deactivationDate: undefined }));
      expect(rowValue('UserData', 'status')).toBe('NA');

      rerender(<UserDataPanel userData={detail({ id: 88002 })} userDataId={88001} />);

      expect(rowValue('UserData', 'status')).toContain('Deactivated');
      expect(rowValue('Other', 'deactivationDate')).toBe('d:2025-07-01T21:35:38.000Z');
      expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument();
    });

    it.each(['Active', 'NA', 'KycOnly'])('shows the plain status %s without a button', (status) => {
      render(<UserDataPanel userData={detail({ status })} userDataId={88001} />);

      expect(rowValue('UserData', 'status')).toBe(status);
      expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument();
    });

    it('shows the plain status to a session that may not reactivate, without a session and without an account id', () => {
      mockSession = { role: 'Support' };
      const { rerender } = render(<UserDataPanel userData={detail()} userDataId={88001} />);
      expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument();
      expect(rowValue('UserData', 'status')).toBe('Deactivated');

      mockSession = undefined;
      rerender(<UserDataPanel userData={detail()} userDataId={88001} />);
      expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument();

      mockSession = { role: 'Compliance' };
      rerender(<UserDataPanel userData={detail()} />);
      expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument();
    });
  });
});
