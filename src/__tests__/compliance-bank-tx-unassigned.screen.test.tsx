// Unit tests for ComplianceBankTxUnassignedScreen: load/error/empty states, DBIT highlight,
// admin-only assign form, single-row expansion, save validation, and reload-on-success.

let mockSessionRole = 'Admin';
const mockGetUnassignedBankTx = jest.fn();
const mockAssignBankTx = jest.fn();
const mockUseSupportStaffGuard = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useAuthContext: () => ({ session: { role: mockSessionRole } }),
  UserRole: {
    ADMIN: 'Admin',
    SUPPORT: 'Support',
    COMPLIANCE: 'Compliance',
    MARKETING: 'Marketing',
  },
}));

jest.mock('@dfx.swiss/react-components', () => {
  // babel-plugin-jest-hoist runs this factory before file imports — require React / RHF here.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Children, cloneElement, isValidElement, useState } = React;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  function enrichChildren(
    children: React.ReactNode,
    control: unknown,
    errors: Record<string, unknown> | undefined,
  ): React.ReactNode {
    return Children.map(children, (child: React.ReactNode) => {
      if (!isValidElement(child)) return child;
      const childProps = child.props as { name?: string; children?: React.ReactNode };
      const nextChildren = enrichChildren(childProps.children, control, errors);
      if (childProps.name) {
        return cloneElement(child, {
          control,
          error: errors?.[childProps.name],
          children: nextChildren,
        });
      }
      return cloneElement(child, { children: nextChildren });
    });
  }

  function Form({
    children,
    control,
    errors,
  }: {
    children: React.ReactNode;
    control: unknown;
    errors?: Record<string, unknown>;
  }) {
    return <form className="w-full">{enrichChildren(children, control, errors)}</form>;
  }

  function StyledDropdown({
    control,
    name,
    items,
    labelFunc,
    placeholder,
    label,
  }: {
    control: unknown;
    name: string;
    items: string[];
    labelFunc: (item: string) => string;
    placeholder?: string;
    label?: string;
  }) {
    const [open, setOpen] = useState(false);
    return (
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, value } }: { field: { onChange: (v: string) => void; value: string } }) => (
          <div data-testid={`${name}-dropdown`}>
            {label ? <label>{label}</label> : null}
            <button type="button" data-testid={`${name}-trigger`} onClick={() => setOpen((o: boolean) => !o)}>
              {value ? labelFunc(value) : (placeholder ?? 'Select...')}
            </button>
            {open ? (
              <div data-testid={`${name}-options`}>
                {(items ?? []).map((item: string, i: number) => (
                  <button
                    type="button"
                    key={i}
                    data-testid={`${name}-option-${i}`}
                    onClick={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                  >
                    {labelFunc(item)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      />
    );
  }

  function StyledInput({
    control,
    name,
    label,
    placeholder,
    type,
  }: {
    control: unknown;
    name: string;
    label?: string;
    placeholder?: string;
    type?: string;
  }) {
    return (
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }: { field: { onChange: (v: string) => void; onBlur: () => void; value: string } }) => (
          <div>
            {label ? <label htmlFor={name}>{label}</label> : null}
            <input
              id={name}
              data-testid={`${name}-input`}
              type={type ?? 'text'}
              placeholder={placeholder}
              value={value ?? ''}
              onBlur={onBlur}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        )}
      />
    );
  }

  return {
    Form,
    StyledDropdown,
    StyledInput,
    StyledButton: ({
      label,
      onClick,
      disabled,
      isLoading,
    }: {
      label: string;
      onClick: () => void;
      disabled?: boolean;
      isLoading?: boolean;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled || isLoading}>
        {label}
      </button>
    ),
    StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    StyledLoadingSpinner: ({ size }: { size?: string }) => (
      <div data-testid="loading-spinner" data-size={size} />
    ),
    SpinnerSize: { SM: 'sm', LG: 'lg' },
    StyledButtonWidth: { FULL: 'full', MIN: 'min' },
  };
});

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/guard.hook', () => ({
  useSupportStaffGuard: (...args: unknown[]) => mockUseSupportStaffGuard(...args),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/hooks/bank-tx-assignment.hook', () => ({
  useBankTxAssignment: () => ({
    getUnassignedBankTx: mockGetUnassignedBankTx,
    assignBankTx: mockAssignBankTx,
  }),
  AssignableBankTxTypes: ['Internal', 'BuyCrypto', 'BuyFiat'],
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UserRole } from '@dfx.swiss/react';
import ComplianceBankTxUnassignedScreen from 'src/screens/compliance-bank-tx-unassigned.screen';

// Local fixture shape (mirrors UnassignedBankTx); avoid importing the production type from the
// mocked hook module so the test stays independent of the mock export surface.
interface UnassignedBankTxFixture {
  id: number;
  accountServiceRef: string;
  amount: number;
  currency: string;
  type: string;
  creditDebitIndicator?: string;
  name?: string;
  iban?: string;
  remittanceInfo?: string;
  bookingDate?: string;
  buyCandidateId?: number;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

function createDeferred<T>(): Deferred<T> {
  const controls = {
    resolve: (_value: T) => {
      throw new Error('deferred not initialized');
    },
    reject: (_reason: Error) => {
      throw new Error('deferred not initialized');
    },
  };
  const promise = new Promise<T>((resolve, reject) => {
    controls.resolve = resolve;
    controls.reject = reject;
  });
  return { promise, resolve: controls.resolve, reject: controls.reject };
}

function baseEntry(overrides: Partial<UnassignedBankTxFixture> = {}): UnassignedBankTxFixture {
  return {
    id: 42,
    accountServiceRef: 'ref-42',
    amount: 100.5,
    currency: 'EUR',
    creditDebitIndicator: 'CRDT',
    type: 'Pending',
    name: 'Alice Example',
    iban: 'CH9300762011623852957',
    remittanceInfo: 'Invoice 1',
    bookingDate: '2026-06-12T12:00:00.000Z',
    buyCandidateId: 7,
    ...overrides,
  };
}

async function renderWithData(entries: UnassignedBankTxFixture[]): Promise<void> {
  mockGetUnassignedBankTx.mockResolvedValue(entries);
  render(<ComplianceBankTxUnassignedScreen />);
  await waitFor(() => {
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });
}

async function openAssignForm(buttonIndex = 0): Promise<void> {
  const buttons = screen.getAllByRole('button', { name: 'Assign' });
  fireEvent.click(buttons[buttonIndex]);
  await waitFor(() => {
    expect(screen.getByTestId('type-dropdown')).toBeInTheDocument();
  });
}

async function selectType(typeLabel: string): Promise<void> {
  fireEvent.click(screen.getByTestId('type-trigger'));
  await waitFor(() => {
    expect(screen.getByTestId('type-options')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: typeLabel }));
}

describe('ComplianceBankTxUnassignedScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionRole = UserRole.ADMIN;
    mockGetUnassignedBankTx.mockResolvedValue([]);
    mockAssignBankTx.mockResolvedValue(undefined);
  });

  it('calls the support-staff guard on render', () => {
    render(<ComplianceBankTxUnassignedScreen />);
    expect(mockUseSupportStaffGuard).toHaveBeenCalledWith();
  });

  it('shows the loading spinner while the initial fetch is in flight and no table yet', async () => {
    const deferred = createDeferred<UnassignedBankTxFixture[]>();
    mockGetUnassignedBankTx.mockReturnValue(deferred.promise);

    render(<ComplianceBankTxUnassignedScreen />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();

    deferred.resolve([]);
    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
  });

  it('shows only ErrorHint on fetch failure (no table, no empty-state text)', async () => {
    mockGetUnassignedBankTx.mockRejectedValue(new Error('Network down'));

    render(<ComplianceBankTxUnassignedScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Network down');
    });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('No unassigned bank transactions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('stringifies non-Error load failures into the error hint', async () => {
    mockGetUnassignedBankTx.mockRejectedValue('boom');

    render(<ComplianceBankTxUnassignedScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('boom');
    });
  });

  it('shows the empty-state text when the response is a successful empty list', async () => {
    mockGetUnassignedBankTx.mockResolvedValue([]);

    render(<ComplianceBankTxUnassignedScreen />);

    await waitFor(() => {
      expect(screen.getByText('No unassigned bank transactions')).toBeInTheDocument();
    });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('renders populated rows as admin with id, amount, name, iban and type', async () => {
    await renderWithData([baseEntry()]);

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/100\.5\s+EUR/)).toBeInTheDocument();
    expect(screen.getByText('Alice Example')).toBeInTheDocument();
    expect(screen.getByText('CH9300762011623852957')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('marks DBIT rows with text-dfxRed-100 and leaves CRDT rows without that class', async () => {
    await renderWithData([
      baseEntry({ id: 1, name: 'Debit User', creditDebitIndicator: 'DBIT' }),
      baseEntry({ id: 2, name: 'Credit User', creditDebitIndicator: 'CRDT' }),
    ]);

    const debitCell = screen.getByText('DBIT');
    expect(debitCell.className).toContain('text-dfxRed-100');
    expect(debitCell.className).toContain('font-semibold');

    const creditCell = screen.getByText('CRDT');
    expect(creditCell.className).not.toContain('text-dfxRed-100');
    expect(creditCell.className).toContain('text-dfxBlue-800');
  });

  it('renders dashes for missing optional fields without throwing', async () => {
    await renderWithData([
      baseEntry({
        id: 99,
        name: undefined,
        iban: undefined,
        remittanceInfo: undefined,
        bookingDate: undefined,
        buyCandidateId: undefined,
        creditDebitIndicator: undefined,
      }),
    ]);

    const row = screen.getByText('99').closest('tr');
    expect(row).not.toBeNull();
    if (row) {
      const cells = row.querySelectorAll('td');
      // booking date, direction, name, iban, remittance, buy candidate
      expect(cells[1].textContent).toBe('-');
      expect(cells[3].textContent).toBe('-');
      expect(cells[4].textContent).toBe('-');
      expect(cells[5].textContent).toBe('-');
      expect(cells[6].textContent).toBe('-');
      expect(cells[8].textContent).toBe('-');
    }
  });

  it('shows the Assign column and button for ADMIN', async () => {
    mockSessionRole = UserRole.ADMIN;
    await renderWithData([baseEntry()]);

    expect(screen.getByRole('columnheader', { name: 'Assign' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
  });

  it('hides Assign column, button and form for SUPPORT', async () => {
    mockSessionRole = UserRole.SUPPORT;
    await renderWithData([baseEntry()]);

    expect(screen.queryByRole('columnheader', { name: 'Assign' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('type-dropdown')).not.toBeInTheDocument();
  });

  it('hides Assign column, button and form for COMPLIANCE', async () => {
    mockSessionRole = UserRole.COMPLIANCE;
    await renderWithData([baseEntry()]);

    expect(screen.queryByRole('columnheader', { name: 'Assign' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('type-dropdown')).not.toBeInTheDocument();
  });

  it('opens the assign form with type select and buy-id field prefilled from buyCandidateId', async () => {
    await renderWithData([baseEntry({ buyCandidateId: 7 })]);
    await openAssignForm();

    expect(screen.getByTestId('type-dropdown')).toBeInTheDocument();
    const buyIdInput = screen.getByTestId('buyId-input') as HTMLInputElement;
    expect(buyIdInput.value).toBe('7');
  });

  it('opens the assign form with an empty buy-id when buyCandidateId is missing', async () => {
    await renderWithData([baseEntry({ buyCandidateId: undefined })]);
    await openAssignForm();

    const buyIdInput = screen.getByTestId('buyId-input') as HTMLInputElement;
    expect(buyIdInput.value).toBe('');
  });

  it('keeps only one assign form open at a time', async () => {
    await renderWithData([
      baseEntry({ id: 1, name: 'First', buyCandidateId: 1 }),
      baseEntry({ id: 2, name: 'Second', buyCandidateId: 2 }),
    ]);

    await openAssignForm(0);
    expect(screen.getAllByTestId('type-dropdown')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    // Second row still shows Assign; opening it closes the first form
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => {
      expect(screen.getAllByTestId('type-dropdown')).toHaveLength(1);
    });
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);

    const buyIdInput = screen.getByTestId('buyId-input') as HTMLInputElement;
    expect(buyIdInput.value).toBe('2');
  });

  it('closes the form when the same Assign button is clicked again (Cancel)', async () => {
    await renderWithData([baseEntry()]);
    await openAssignForm();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByTestId('type-dropdown')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
  });

  it('disables Save until a type is chosen; BuyCrypto needs a buy id; other types do not', async () => {
    await renderWithData([baseEntry({ buyCandidateId: undefined })]);
    await openAssignForm();

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();

    await selectType('BuyCrypto');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(screen.getByTestId('buyId-input'), { target: { value: '15' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    });

    // Switch to a non-BuyCrypto type and clear buy id — still submittable
    await selectType('Internal');
    fireEvent.change(screen.getByTestId('buyId-input'), { target: { value: '' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    });
  });

  it('saves successfully, closes the form and reloads the list', async () => {
    await renderWithData([baseEntry({ id: 42, buyCandidateId: 7 })]);
    await openAssignForm();
    await selectType('BuyCrypto');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockAssignBankTx).toHaveBeenCalledWith(42, { type: 'BuyCrypto', buyId: 7 });
    });
    await waitFor(() => {
      expect(screen.queryByTestId('type-dropdown')).not.toBeInTheDocument();
    });
    expect(mockGetUnassignedBankTx).toHaveBeenCalledTimes(2);
  });

  it('saves a non-BuyCrypto type without a buy id', async () => {
    await renderWithData([baseEntry({ id: 42, buyCandidateId: undefined })]);
    await openAssignForm();
    await selectType('Internal');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockAssignBankTx).toHaveBeenCalledWith(42, { type: 'Internal' });
    });
  });

  it('keeps the form open with the input retained when assign fails', async () => {
    mockAssignBankTx.mockRejectedValue(new Error('Assign failed'));
    await renderWithData([baseEntry({ buyCandidateId: undefined })]);
    await openAssignForm();
    await selectType('Internal');
    fireEvent.change(screen.getByTestId('buyId-input'), { target: { value: '99' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Assign failed');
    });
    expect(screen.getByTestId('type-dropdown')).toBeInTheDocument();
    expect((screen.getByTestId('buyId-input') as HTMLInputElement).value).toBe('99');
    expect(mockGetUnassignedBankTx).toHaveBeenCalledTimes(1);
  });

  it('stringifies non-Error assign failures into the assign error hint', async () => {
    mockAssignBankTx.mockRejectedValue('server-down');
    await renderWithData([baseEntry({ buyCandidateId: undefined })]);
    await openAssignForm();
    await selectType('Internal');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('server-down');
    });
  });

  it('rejects a non-integer buy id with a whole-number message and does not call assignBankTx', async () => {
    await renderWithData([baseEntry({ buyCandidateId: undefined })]);
    await openAssignForm();
    await selectType('BuyCrypto');
    fireEvent.change(screen.getByTestId('buyId-input'), { target: { value: '12.5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent(/whole number/i);
    });
    expect(mockAssignBankTx).not.toHaveBeenCalled();
    expect(screen.getByTestId('type-dropdown')).toBeInTheDocument();
  });

  it('does not call assign when Save is clicked without a selected type', async () => {
    await renderWithData([baseEntry()]);
    await openAssignForm();

    // The button being disabled is what prevents the call - the handler has no guard of its own,
    // so this asserts the disabled state and that a click on it stays without effect.
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);

    expect(mockAssignBankTx).not.toHaveBeenCalled();
  });
});
