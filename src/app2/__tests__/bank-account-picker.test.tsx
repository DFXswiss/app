const mockCreateAccount = jest.fn();
const mockBankState: {
  bankAccounts: { id: number; iban: string; label?: string; default?: boolean }[] | undefined;
  isLoading: boolean;
  createAccount: typeof mockCreateAccount;
} = {
  bankAccounts: [],
  isLoading: false,
  createAccount: mockCreateAccount,
};

jest.mock('@dfx.swiss/react', () => ({
  useBankAccountContext: () => mockBankState,
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BankAccountPicker } from '../components/pickers/BankAccountPicker';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

function renderPicker(value?: { id: number; iban: string }) {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  render(
    <LanguageProvider>
      <ToastProvider>
        <BankAccountPicker open onClose={onClose} titleId="ba-title" value={value} onSelect={onSelect} />
      </ToastProvider>
    </LanguageProvider>,
  );
  return { onSelect, onClose };
}

describe('BankAccountPicker', () => {
  beforeEach(() => {
    mockCreateAccount.mockReset();
    mockBankState.bankAccounts = [];
    mockBankState.isLoading = false;
    mockBankState.createAccount = mockCreateAccount;
  });

  it('shows a loading row and an empty note', () => {
    mockBankState.isLoading = true;
    mockBankState.bankAccounts = undefined;
    renderPicker();
    expect(screen.getByText(/loading|laden|caricamento|chargement/i)).toBeInTheDocument();
  });

  it('picks an existing account and creates a valid IBAN', async () => {
    const account = { id: 1, iban: 'CH9300762011623852957', label: 'Main', default: true };
    const other = { id: 3, iban: 'AT611904300234573201' };
    mockBankState.bankAccounts = [account, other];
    mockCreateAccount.mockResolvedValue({ id: 2, iban: 'DE89370400440532013000' });
    const { onSelect, onClose } = renderPicker(account);

    fireEvent.click(screen.getByRole('button', { name: /main/i }));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /AT61/i }));
    expect(onSelect).toHaveBeenCalledWith(other);

    fireEvent.click(screen.getByRole('button', { name: /add bank account/i }));
    fireEvent.change(screen.getByLabelText(/payout iban/i), { target: { value: 'not-an-iban' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(screen.getByText(/invalid iban/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/payout iban/i), { target: { value: 'CH93 0076 2011 6238 5295 7' } });
    fireEvent.keyDown(screen.getByLabelText(/payout iban/i), { key: 'Tab' });
    expect(mockCreateAccount).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText(/payout iban/i), { key: 'Enter' });
    await waitFor(() => expect(mockCreateAccount).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces a create failure and goes back', async () => {
    mockCreateAccount.mockRejectedValue(new Error('down'));
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /add bank account/i }));
    fireEvent.change(screen.getByLabelText(/payout iban/i), { target: { value: 'CH93 0076 2011 6238 5295 7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    await waitFor(() => expect(screen.getByText(/something went wrong|fehler|errore|erreur|genErr/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByRole('button', { name: /add bank account/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add bank account/i }));
    fireEvent.keyDown(screen.getByText('Cancel').closest('[role="button"]') as HTMLElement, { key: 'Enter' });
    expect(screen.getByRole('button', { name: /add bank account/i })).toBeInTheDocument();
  });
});

