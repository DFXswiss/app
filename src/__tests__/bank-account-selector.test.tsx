const mockCreateAccount = jest.fn();
const mockGetAccount = jest.fn();
const mockOnChange = jest.fn();
const mockOnModalToggle = jest.fn();
const mockValidateIban = jest.fn(() => true as boolean | string);
const mockFormatIban = jest.fn(() => undefined as string | undefined);

const existing = { id: 1, iban: 'CH9300762011623852957', label: 'Main', default: true };
let mockBankAccounts: typeof existing[] | undefined = [existing];
let mockBankAccountParam: string | undefined;

jest.mock('@dfx.swiss/react', () => ({
  Utils: { formatIban: (...args: unknown[]) => mockFormatIban(...args) },
  Validations: { Iban: () => ({ validate: (...args: unknown[]) => mockValidateIban(...args) }) },
  useBankAccountContext: () => ({
    bankAccounts: mockBankAccounts,
    createAccount: (...args: unknown[]) => mockCreateAccount(...args),
  }),
  useBankAccount: () => ({ getAccount: mockGetAccount }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledModalButton: ({ value, onClick, onBlur, placeholder }: any) => (
    <button type="button" data-testid="open-selector" onClick={onClick} onBlur={onBlur}>
      {placeholder}:{value}
    </button>
  ),
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key, allowedCountries: [] }),
}));
jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: 800 }),
}));
jest.mock('src/hooks/app-params.hook', () => ({
  useAppParams: () => ({ bankAccount: mockBankAccountParam }),
}));
jest.mock('src/components/payment/add-bank-account', () => ({
  AddBankAccount: ({ onSubmit }: any) => (
    <button type="button" data-testid="add-account" onClick={() => onSubmit({ id: 9, iban: 'AT123' })}>
      add
    </button>
  ),
}));
jest.mock('src/components/actionable-list', () => ({
  __esModule: true,
  default: ({ items }: any) => (
    <div>
      {(items ?? []).map((item: any) => (
        <button key={item.key} type="button" data-testid={`pick-${item.key}`} onClick={item.onClick}>
          {item.label}
        </button>
      ))}
    </div>
  ),
}));
jest.mock('src/components/modal', () => ({
  Modal: ({ children, isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="selector-modal">
        <button type="button" data-testid="close-modal" onClick={onClose}>
          close
        </button>
        {children}
      </div>
    ) : null,
}));
jest.mock('src/util/utils', () => ({
  blankedAddress: (value: string) => value,
}));

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BankAccountSelector } from 'src/components/order/bank-account-selector';

describe('BankAccountSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBankAccounts = [existing];
    mockBankAccountParam = undefined;
    mockGetAccount.mockImplementation((list: typeof existing[], iban?: string) =>
      iban ? list.find((a) => a.iban === iban) : undefined,
    );
    mockCreateAccount.mockResolvedValue({ id: 2, iban: 'DE89370400440532013000' });
    mockValidateIban.mockReturnValue(true);
    mockFormatIban.mockReturnValue(undefined);
  });

  it('does nothing while bank accounts have not loaded', () => {
    mockBankAccounts = undefined;
    render(
      <BankAccountSelector placeholder="IBAN" onChange={mockOnChange} onModalToggle={mockOnModalToggle} />,
    );
    expect(mockOnChange).not.toHaveBeenCalled();
    expect(mockCreateAccount).not.toHaveBeenCalled();
  });

  it('does not auto-select when several accounts exist and none is default', () => {
    mockBankAccounts = [
      { id: 5, iban: 'CH3908307000001001001' },
      { id: 6, iban: 'CH3908307000001001002' },
    ];
    mockGetAccount.mockReturnValue(undefined);
    render(
      <BankAccountSelector placeholder="IBAN" onChange={mockOnChange} onModalToggle={mockOnModalToggle} />,
    );
    expect(mockOnChange).not.toHaveBeenCalled();
    expect(mockCreateAccount).not.toHaveBeenCalled();
  });

  it('selects the only account when none is marked default', () => {
    const only = { id: 4, iban: 'CH3180869000123456789', label: 'Only' };
    mockBankAccounts = [only];
    mockGetAccount.mockReturnValue(undefined);
    render(
      <BankAccountSelector placeholder="IBAN" onChange={mockOnChange} onModalToggle={mockOnModalToggle} />,
    );
    expect(mockOnChange).toHaveBeenCalledWith(only);
  });

  it('selects the default account when no bank-account param is set', () => {
    render(
      <BankAccountSelector placeholder="IBAN" onChange={mockOnChange} onModalToggle={mockOnModalToggle} />,
    );
    expect(mockOnChange).toHaveBeenCalledWith(existing);
    expect(mockCreateAccount).not.toHaveBeenCalled();
  });

  it('does not overwrite a manually selected non-default account when no param is set', () => {
    const other = { id: 8, iban: 'CH3908307000001001008', label: 'Other' };
    mockBankAccounts = [existing, other];
    const { rerender } = render(
      <BankAccountSelector placeholder="IBAN" onChange={mockOnChange} onModalToggle={mockOnModalToggle} />,
    );
    expect(mockOnChange).toHaveBeenCalledWith(existing);
    mockOnChange.mockClear();
    rerender(
      <BankAccountSelector
        value={other}
        placeholder="IBAN"
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('still forces the bank-account param over a different selected value', () => {
    const other = { id: 8, iban: 'CH3908307000001001008', label: 'Other' };
    mockBankAccounts = [existing, other];
    mockBankAccountParam = existing.iban;
    render(
      <BankAccountSelector
        value={other}
        placeholder="IBAN"
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    expect(mockOnChange).toHaveBeenCalledWith(existing);
  });

  it('selects an existing bank-account param without creating a new account', () => {
    mockBankAccountParam = existing.iban;
    render(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    expect(mockOnChange).toHaveBeenCalledWith(existing);
    expect(mockCreateAccount).not.toHaveBeenCalled();
  });

  it('does not create again after the existing account is already selected', () => {
    mockBankAccountParam = existing.iban;
    const { rerender } = render(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    rerender(
      <BankAccountSelector
        value={existing}
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    expect(mockCreateAccount).not.toHaveBeenCalled();
    expect(mockOnChange.mock.calls.length).toBe(1);
  });

  it('creates once when the param IBAN is not in the list', async () => {
    mockBankAccountParam = 'DE89370400440532013000';
    mockGetAccount.mockReturnValue(undefined);
    await act(async () => {
      render(
        <BankAccountSelector
          placeholder="IBAN"
          isModalOpen={false}
          onChange={mockOnChange}
          onModalToggle={mockOnModalToggle}
        />,
      );
      await Promise.resolve();
    });
    expect(mockCreateAccount).toHaveBeenCalledTimes(1);
    expect(mockCreateAccount).toHaveBeenCalledWith({ iban: 'DE89370400440532013000' });
    expect(mockOnChange).toHaveBeenCalledWith({ id: 2, iban: 'DE89370400440532013000' });
  });

  it('does not create an account when the param IBAN is invalid', () => {
    mockBankAccountParam = 'not-an-iban';
    mockGetAccount.mockReturnValue(undefined);
    mockValidateIban.mockReturnValue('Invalid IBAN');
    render(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    expect(mockCreateAccount).not.toHaveBeenCalled();
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('does not apply a create result after the bank-account param has changed', async () => {
    let resolveCreate: (value: unknown) => void = () => undefined;
    mockBankAccounts = [];
    mockBankAccountParam = 'DE89370400440532013000';
    mockGetAccount.mockReturnValue(undefined);
    mockCreateAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const { rerender } = render(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockCreateAccount).toHaveBeenCalledTimes(1);
    mockBankAccountParam = undefined;
    rerender(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    await act(async () => {
      resolveCreate({ id: 2, iban: 'DE89370400440532013000' });
      await Promise.resolve();
    });
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('does not apply a create result after unmount', async () => {
    let resolveCreate: (value: unknown) => void = () => undefined;
    mockBankAccounts = [];
    mockBankAccountParam = 'DE89370400440532013000';
    mockGetAccount.mockReturnValue(undefined);
    mockCreateAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const { unmount } = render(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    await act(async () => {
      resolveCreate({ id: 2, iban: 'DE89370400440532013000' });
      await Promise.resolve();
    });
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('does not retry create after createAccount rejects', async () => {
    mockBankAccountParam = 'DE89370400440532013000';
    mockGetAccount.mockReturnValue(undefined);
    mockCreateAccount.mockRejectedValue(new Error('duplicate'));
    render(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockCreateAccount).toHaveBeenCalledTimes(1);
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('picks an account from the modal and accepts AddBankAccount', () => {
    render(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    fireEvent.click(screen.getByTestId('pick-1'));
    expect(mockOnChange).toHaveBeenCalledWith(existing);
    expect(mockOnModalToggle).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByTestId('add-account'));
    expect(mockOnChange).toHaveBeenCalledWith({ id: 9, iban: 'AT123' });
  });

  it('falls back to the last four IBAN digits when an account has no label', () => {
    mockBankAccounts = [{ id: 3, iban: 'FR1420041010050500013M02606' }];
    mockGetAccount.mockReturnValue(undefined);
    render(
      <BankAccountSelector
        value={{ id: 3, iban: 'FR1420041010050500013M02606' }}
        placeholder="IBAN"
        isModalOpen
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    expect(screen.getByTestId('pick-3')).toHaveTextContent('FR 2606');
    // formatIban falling through to the raw IBAN is covered when the util returns undefined.
    expect(screen.getByTestId('open-selector')).toBeInTheDocument();
    fireEvent.blur(screen.getByTestId('open-selector'));
    fireEvent.click(screen.getByTestId('close-modal'));
    expect(mockOnModalToggle).toHaveBeenCalledWith(false);
  });

  it('shows the formatted IBAN when formatIban returns a value', () => {
    mockFormatIban.mockReturnValue('CH93 0076 2011 6238 5295 7');
    render(
      <BankAccountSelector
        value={existing}
        placeholder="IBAN"
        isModalOpen
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    expect(screen.getByTestId('open-selector')).toHaveTextContent('CH93 0076 2011 6238 5295 7');
  });

  it('opens the modal from the selector button', () => {
    render(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
      />,
    );
    fireEvent.click(screen.getByTestId('open-selector'));
    expect(mockOnModalToggle).toHaveBeenCalledWith(true);
  });
});
