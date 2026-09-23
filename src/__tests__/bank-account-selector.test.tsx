const mockCreateAccount = jest.fn();
const mockGetAccount = jest.fn();
const mockOnChange = jest.fn();
const mockOnModalToggle = jest.fn();
const mockValidateIban = jest.fn(() => true as boolean | string);
const mockFormatIban = jest.fn(() => undefined as string | undefined);

const existing = { id: 1, iban: 'CH9300762011623852957', label: 'Main', default: true };
let mockBankAccounts: (typeof existing)[] | undefined = [existing];
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
    mockGetAccount.mockImplementation((list: (typeof existing)[], iban?: string) =>
      iban ? list.find((a) => a.iban === iban) : undefined,
    );
    mockCreateAccount.mockResolvedValue({ id: 2, iban: 'DE89370400440532013000' });
    mockValidateIban.mockReturnValue(true);
    mockFormatIban.mockReturnValue(undefined);
  });

  it('does nothing while bank accounts have not loaded', () => {
    mockBankAccounts = undefined;
    render(<BankAccountSelector placeholder="IBAN" onChange={mockOnChange} onModalToggle={mockOnModalToggle} />);
    expect(mockOnChange).not.toHaveBeenCalled();
    expect(mockCreateAccount).not.toHaveBeenCalled();
  });

  it('does not auto-select when several accounts exist and none is default', () => {
    mockBankAccounts = [
      { id: 5, iban: 'CH3908307000001001001' },
      { id: 6, iban: 'CH3908307000001001002' },
    ];
    mockGetAccount.mockReturnValue(undefined);
    render(<BankAccountSelector placeholder="IBAN" onChange={mockOnChange} onModalToggle={mockOnModalToggle} />);
    expect(mockOnChange).not.toHaveBeenCalled();
    expect(mockCreateAccount).not.toHaveBeenCalled();
  });

  it('selects the only account when none is marked default', () => {
    const only = { id: 4, iban: 'CH3180869000123456789', label: 'Only' };
    mockBankAccounts = [only];
    mockGetAccount.mockReturnValue(undefined);
    render(<BankAccountSelector placeholder="IBAN" onChange={mockOnChange} onModalToggle={mockOnModalToggle} />);
    expect(mockOnChange).toHaveBeenCalledWith(only);
  });

  it('selects the default account when no bank-account param is set', () => {
    render(<BankAccountSelector placeholder="IBAN" onChange={mockOnChange} onModalToggle={mockOnModalToggle} />);
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

  it('does not overwrite a manual selection when an account creation resolves later', async () => {
    let resolveCreate: (value: unknown) => void = () => undefined;
    const createdAccount = { id: 2, iban: 'DE89370400440532013000' };
    mockBankAccounts = [existing];
    mockBankAccountParam = createdAccount.iban;
    mockGetAccount.mockReturnValue(undefined);
    mockCreateAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    render(
      <BankAccountSelector placeholder="IBAN" isModalOpen onChange={mockOnChange} onModalToggle={mockOnModalToggle} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByTestId('pick-1'));
    await act(async () => {
      resolveCreate(createdAccount);
      await Promise.resolve();
    });

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnChange).toHaveBeenCalledWith(existing);
    expect(mockOnChange).not.toHaveBeenCalledWith(createdAccount);
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

  it('retries the same IBAN only after the retry token changes', async () => {
    const onError = jest.fn();
    const createdAccount = { id: 2, iban: 'DE89370400440532013000' };
    mockBankAccountParam = createdAccount.iban;
    mockGetAccount.mockReturnValue(undefined);
    mockCreateAccount.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce(createdAccount);

    const { rerender } = render(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
        onError={onError}
        retryToken={0}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockCreateAccount).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('temporary failure', 'other');

    rerender(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
        onError={onError}
        retryToken={1}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockCreateAccount).toHaveBeenCalledTimes(2);
    expect(mockOnChange).toHaveBeenCalledWith(createdAccount);
  });

  it('retries the same IBAN when the user reopens the selector after a failure', async () => {
    const createdAccount = { id: 2, iban: 'DE89370400440532013000' };
    mockBankAccountParam = createdAccount.iban;
    mockGetAccount.mockReturnValue(undefined);
    mockCreateAccount.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce(createdAccount);

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

    fireEvent.click(screen.getByTestId('open-selector'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockCreateAccount).toHaveBeenCalledTimes(2);
    expect(mockOnChange).toHaveBeenCalledWith(createdAccount);
  });

  it('notifies onCreateStart when the param IBAN is created', async () => {
    const onCreateStart = jest.fn();
    mockBankAccountParam = 'DE89370400440532013000';
    mockGetAccount.mockReturnValue(undefined);

    render(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
        onCreateStart={onCreateStart}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(onCreateStart).toHaveBeenCalledTimes(1);
    expect(mockCreateAccount).toHaveBeenCalledTimes(1);
  });

  it('calls onError when createAccount rejects and the request is still current', async () => {
    const onError = jest.fn();
    mockBankAccountParam = 'DE89370400440532013000';
    mockGetAccount.mockReturnValue(undefined);
    mockCreateAccount.mockRejectedValue({
      statusCode: 400,
      message: 'You cannot add an IBAN to a KYC only account; connect a wallet first',
    });
    await act(async () => {
      render(
        <BankAccountSelector
          placeholder="IBAN"
          isModalOpen={false}
          onChange={mockOnChange}
          onModalToggle={mockOnModalToggle}
          onError={onError}
        />,
      );
      await Promise.resolve();
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      'You cannot add an IBAN to a KYC only account; connect a wallet first',
      'kyc-only',
    );
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('does not classify an unrelated KYC-only 400 as a missing-wallet rejection', async () => {
    const onError = jest.fn();
    mockBankAccountParam = 'DE89370400440532013000';
    mockGetAccount.mockReturnValue(undefined);
    mockCreateAccount.mockRejectedValue({ statusCode: 400, message: 'KYC only review pending' });
    await act(async () => {
      render(
        <BankAccountSelector
          placeholder="IBAN"
          isModalOpen={false}
          onChange={mockOnChange}
          onModalToggle={mockOnModalToggle}
          onError={onError}
        />,
      );
      await Promise.resolve();
    });
    expect(onError).toHaveBeenCalledWith('KYC only review pending', 'other');
  });

  it('keeps a KYC-only sentence generic when the status is not 400', async () => {
    const onError = jest.fn();
    mockBankAccountParam = 'DE89370400440532013000';
    mockGetAccount.mockReturnValue(undefined);
    mockCreateAccount.mockRejectedValue({
      statusCode: 500,
      message: 'You cannot add an IBAN to a KYC only account',
    });
    await act(async () => {
      render(
        <BankAccountSelector
          placeholder="IBAN"
          isModalOpen={false}
          onChange={mockOnChange}
          onModalToggle={mockOnModalToggle}
          onError={onError}
        />,
      );
      await Promise.resolve();
    });
    expect(onError).toHaveBeenCalledWith('You cannot add an IBAN to a KYC only account', 'other');
  });

  it('reports a multi-account rejection as its own kind', async () => {
    const onError = jest.fn();
    mockBankAccountParam = 'DE89370400440532013000';
    mockGetAccount.mockReturnValue(undefined);
    mockCreateAccount.mockRejectedValue({ statusCode: 400, message: 'Multi-account IBAN' });
    await act(async () => {
      render(
        <BankAccountSelector
          placeholder="IBAN"
          isModalOpen={false}
          onChange={mockOnChange}
          onModalToggle={mockOnModalToggle}
          onError={onError}
        />,
      );
      await Promise.resolve();
    });
    expect(onError).toHaveBeenCalledWith('Multi-account IBAN', 'multi-account');
  });

  it('reports a rejection without a message as an unknown error', async () => {
    const onError = jest.fn();
    mockBankAccountParam = 'DE89370400440532013000';
    mockGetAccount.mockReturnValue(undefined);
    mockCreateAccount.mockRejectedValue({ statusCode: 400 });
    await act(async () => {
      render(
        <BankAccountSelector
          placeholder="IBAN"
          isModalOpen={false}
          onChange={mockOnChange}
          onModalToggle={mockOnModalToggle}
          onError={onError}
        />,
      );
      await Promise.resolve();
    });
    expect(onError).toHaveBeenCalledWith('Unknown error', 'other');
  });

  it('does not call onError after the bank-account param has changed', async () => {
    let rejectCreate: (reason?: unknown) => void = () => undefined;
    const onError = jest.fn();
    mockBankAccounts = [];
    mockBankAccountParam = 'DE89370400440532013000';
    mockGetAccount.mockReturnValue(undefined);
    mockCreateAccount.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectCreate = reject;
        }),
    );
    const { rerender } = render(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
        onError={onError}
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
        onError={onError}
      />,
    );
    await act(async () => {
      rejectCreate({ message: 'stale' });
      await Promise.resolve();
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not call onError after unmount', async () => {
    let rejectCreate: (reason?: unknown) => void = () => undefined;
    const onError = jest.fn();
    mockBankAccounts = [];
    mockBankAccountParam = 'DE89370400440532013000';
    mockGetAccount.mockReturnValue(undefined);
    mockCreateAccount.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectCreate = reject;
        }),
    );
    const { unmount } = render(
      <BankAccountSelector
        placeholder="IBAN"
        isModalOpen={false}
        onChange={mockOnChange}
        onModalToggle={mockOnModalToggle}
        onError={onError}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    await act(async () => {
      rejectCreate({ message: 'unmounted' });
      await Promise.resolve();
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('picks an account from the modal and accepts AddBankAccount', () => {
    render(
      <BankAccountSelector placeholder="IBAN" isModalOpen onChange={mockOnChange} onModalToggle={mockOnModalToggle} />,
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
