const mockCreateAccount = jest.fn();
const mockNavigate = jest.fn();
const mockReportDisplayedError = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  SupportIssueType: { GENERIC_ISSUE: 'GenericIssue' },
  Utils: { createRules: (rules: unknown) => rules },
  Validations: { Required: {}, Iban: () => ({}) },
  useBankAccountContext: () => ({ createAccount: (...args: unknown[]) => mockCreateAccount(...args) }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledButtonColor: { RED: 'red', GRAY_OUTLINE: 'gray' },
  StyledButtonWidth: { FULL: 'full' },
  Form: ({ children, onSubmit }: any) => <form onSubmit={onSubmit}>{children}</form>,
  StyledButton: ({ label, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledInfoText: ({ children }: any) => <div data-testid="info-text">{children}</div>,
  StyledInput: () => null,
  StyledLink: ({ label, onClick }: any) => (
    <a href="#" onClick={onClick}>
      {label}
    </a>
  ),
  StyledSpacer: () => null,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
    translateError: (_ns: string, key: string) => key,
    allowedCountries: [],
  }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/hooks/report-displayed-error.hook', () => ({
  useReportDisplayedError: (...args: unknown[]) => mockReportDisplayedError(...args),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddBankAccount } from 'src/components/payment/add-bank-account';

const GENERIC_ERROR = 'Something went wrong. Please try again. If the issue persists please reach out to our support.';
const newAccount = { id: 2, iban: 'DE89370400440532013000' };

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Add bank account' }));
}

function reportedMessages(): unknown[] {
  return mockReportDisplayedError.mock.calls.map(([message]) => message).filter(Boolean);
}

describe('AddBankAccount', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('passes the created account to onSubmit when no confirmation text is set', async () => {
    const onSubmit = jest.fn();
    mockCreateAccount.mockResolvedValue(newAccount);
    render(<AddBankAccount onSubmit={onSubmit} />);

    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(newAccount));
  });

  it('shows the confirmation text first and submits on OK', async () => {
    const onSubmit = jest.fn();
    mockCreateAccount.mockResolvedValue(newAccount);
    render(<AddBankAccount onSubmit={onSubmit} confirmationText="Please confirm" />);

    submit();

    expect(await screen.findByText('Please confirm')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onSubmit).toHaveBeenCalledWith(newAccount);
  });

  it('shows the wallet hint for a KYC-only account instead of the generic error', async () => {
    mockCreateAccount.mockRejectedValue({
      statusCode: 400,
      message: 'You cannot add an IBAN to a KYC only account',
    });
    render(<AddBankAccount onSubmit={jest.fn()} />);

    submit();

    const hint = await screen.findByTestId('info-text');
    expect(hint).toHaveTextContent(
      'A bank account can only be added once a wallet is linked to this account. Connect your wallet',
    );
    expect(screen.queryByText(GENERIC_ERROR)).not.toBeInTheDocument();
    expect(reportedMessages()).toEqual([]);
  });

  it('navigates to /connect with a redirect back when the KYC-only hint link is clicked', async () => {
    mockCreateAccount.mockRejectedValue({
      statusCode: 400,
      message: 'You cannot add an IBAN to a KYC only account',
    });
    render(<AddBankAccount onSubmit={jest.fn()} />);

    submit();
    fireEvent.click(await screen.findByText('Connect your wallet'));

    expect(mockNavigate).toHaveBeenCalledWith('/connect', { setRedirect: true });
  });

  it('shows the support hint for a multi-account IBAN', async () => {
    process.env.REACT_APP_PUBLIC_URL = 'https://app.example.com';
    mockCreateAccount.mockRejectedValue({ statusCode: 400, message: 'Multi-account IBAN not allowed' });
    render(<AddBankAccount onSubmit={jest.fn()} />);

    submit();

    const hint = await screen.findByTestId('info-text');
    expect(hint).toHaveTextContent('This is a multi-account IBAN and cannot be added as a personal account.');
    expect(screen.queryByText(GENERIC_ERROR)).not.toBeInTheDocument();
    expect(reportedMessages()).toEqual([]);

    fireEvent.click(screen.getByText('https://app.example.com/support'));
    expect(mockNavigate).toHaveBeenCalledWith('/support/issue?issue-type=GenericIssue');
  });

  it('shows and reports the generic error for any other rejection', async () => {
    mockCreateAccount.mockRejectedValue({ statusCode: 400, message: 'Invalid IBAN' });
    render(<AddBankAccount onSubmit={jest.fn()} />);

    submit();

    expect(await screen.findByText(GENERIC_ERROR)).toBeInTheDocument();
    expect(screen.getByText('Invalid IBAN')).toBeInTheDocument();
    expect(screen.queryByTestId('info-text')).not.toBeInTheDocument();
    expect(reportedMessages()).toEqual(['Invalid IBAN']);
  });

  it('does not treat a non-400 KYC-only message as the wallet hint', async () => {
    mockCreateAccount.mockRejectedValue({ statusCode: 500, message: 'KYC only account' });
    render(<AddBankAccount onSubmit={jest.fn()} />);

    submit();

    expect(await screen.findByText(GENERIC_ERROR)).toBeInTheDocument();
    expect(screen.queryByTestId('info-text')).not.toBeInTheDocument();
  });

  it('falls back to an unknown error when the rejection has no message', async () => {
    mockCreateAccount.mockRejectedValue({ statusCode: 400 });
    render(<AddBankAccount onSubmit={jest.fn()} />);

    submit();

    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
    expect(reportedMessages()).toEqual(['Unknown error']);
  });
});
