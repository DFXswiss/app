// Component tests for AddBankAccount (src/components/payment/add-bank-account.tsx).
// Covers the KYC-only and multi-account IBAN rejections (custom hint + navigate, not ErrorHint),
// generic 400 fall-through, and the success path with and without confirmationText.
//
// @dfx.swiss/react and @dfx.swiss/react-components are fully mocked here (object-literal factories,
// no requireActual): loading the real packages under this repo's test command fails on their ESM
// `export` syntax, so this mock has to stand in completely rather than spread over the real module.
// Form/StyledInput are wired through react-hook-form Controller so submit reaches createAccount.

const mockCreateAccount = jest.fn();
const mockNavigate = jest.fn();
const mockOnSubmit = jest.fn();

const GENERIC_ERROR =
  'Something went wrong. Please try again. If the issue persists please reach out to our support.';
const WALLET_HINT = 'Before you can add a bank account, your DFX account needs a wallet.';
const KYC_ONLY_MESSAGE = 'You cannot add an IBAN to a KYC only account';
const MULTI_ACCOUNT_HINT =
  'This is a multi-account IBAN and cannot be added as a personal account. Please open a support ticket at';
const PUBLIC_URL = 'http://localhost:3001/';
const SUPPORT_HREF = new URL('support', PUBLIC_URL).href;
const SUPPORT_PATH = '/support/issue?issue-type=GenericIssue';

jest.mock('@dfx.swiss/react', () => ({
  SupportIssueType: { GENERIC_ISSUE: 'GenericIssue' },
  Utils: {
    createRules: (rules: Record<string, any>) => {
      const out: Record<string, any> = {};
      for (const key of Object.keys(rules)) {
        const value = rules[key];
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          out[key] = value.reduce((prev: any, curr: any) => (curr ? { ...prev, ...curr } : prev), {});
        } else {
          out[key] = value;
        }
      }
      return out;
    },
  },
  Validations: {
    Required: { required: { value: true, message: 'required' } },
    Iban: () => ({ validate: () => true }),
  },
  useBankAccountContext: () => ({
    createAccount: (...args: unknown[]) => mockCreateAccount(...args),
  }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  // babel-plugin-jest-hoist moves this factory above the module's imports, so React and
  // react-hook-form (imported normally further down for the tests themselves) are not yet
  // in scope here and must be required directly instead.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const { Children, cloneElement, isValidElement } = React;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  function enrichChildren(children: any, control: any, rules: any, errors: any, onSubmit: any): any {
    return Children.map(children, (child: any) => {
      if (!isValidElement(child)) return child;
      const childProps: any = child.props ?? {};
      const nextChildren = enrichChildren(childProps.children, control, rules, errors, onSubmit);
      if (childProps.name) {
        return cloneElement(child, {
          control,
          rules: rules?.[childProps.name],
          error: errors?.[childProps.name],
          onSubmit,
          children: nextChildren,
        });
      }
      return cloneElement(child, { children: nextChildren });
    });
  }

  function Form({ children, control, rules, errors, onSubmit }: any) {
    return React.createElement(
      'form',
      { className: 'w-full' },
      enrichChildren(children, control, rules, errors, onSubmit),
    );
  }

  function StyledInput({ control, name, label, rules, error, placeholder }: any) {
    return React.createElement(Controller, {
      control,
      name,
      rules,
      render: ({ field: { onChange, onBlur, value } }: any) =>
        React.createElement(
          'div',
          null,
          label ? React.createElement('label', null, label) : null,
          React.createElement('input', {
            placeholder,
            value: value ?? '',
            onBlur,
            onChange: (e: any) => onChange(e.target.value),
          }),
          error ? React.createElement('p', null, error.message) : null,
        ),
    });
  }

  function StyledButton({ label, onClick, disabled, isLoading, type }: any) {
    return React.createElement(
      'button',
      { type: type ?? 'button', onClick, disabled: disabled || isLoading },
      label,
    );
  }

  return {
    Form,
    StyledInput,
    StyledButton,
    StyledButtonColor: { RED: 'red' },
    StyledButtonWidth: { FULL: 'full' },
    StyledInfoText: ({ children }: any) => React.createElement('div', { 'data-testid': 'custom-error' }, children),
    StyledLink: ({ label, onClick }: any) => React.createElement('a', { href: '#', onClick }, label),
    StyledSpacer: () => null,
    StyledVerticalStack: ({ children }: any) => React.createElement('div', null, children),
  };
});

jest.mock('react-i18next', () => ({
  Trans: ({ children }: any) => children,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
    translateError: (message: string) => message,
    allowedCountries: [],
  }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/components/error-hint', () => {
  // Same hoisting reason as the @dfx.swiss/react-components mock above: this factory runs
  // before the file's imports, so React has to be required here rather than imported.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    ErrorHint: ({ message }: { message: string }) =>
      React.createElement(
        'div',
        { 'data-testid': 'error-hint' },
        React.createElement(
          'p',
          null,
          'Something went wrong. Please try again. If the issue persists please reach out to our support.',
        ),
        React.createElement('p', null, message),
      ),
  };
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddBankAccount } from 'src/components/payment/add-bank-account';

const IBAN = 'DE89370400440532013000';
const OTHER_400_MESSAGE = 'IBAN country is currently not supported';
const CONFIRMATION_TEXT =
  'The bank account has been added, all transactions from this IBAN will now be associated with your account.';
const ACCOUNT = { id: 9, iban: IBAN };

async function submitIban(confirmationText?: string) {
  render(<AddBankAccount onSubmit={mockOnSubmit} confirmationText={confirmationText} />);
  const ibanInput = screen.getByPlaceholderText('XX XXXX XXXX XXXX XXXX X');
  fireEvent.change(ibanInput, { target: { value: IBAN } });
  fireEvent.blur(ibanInput);

  // useForm({ mode: 'onTouched' }) keeps isValid false until _updateValid finishes (async).
  // The submit button is disabled={!isValid}; React 17+ / JSDOM does not deliver click to a
  // disabled button, so handleSubmit never runs unless we wait for the control to enable.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Add bank account' })).not.toBeDisabled();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add bank account' }));

  await waitFor(() => expect(mockCreateAccount).toHaveBeenCalled());
  expect(mockCreateAccount.mock.calls[0][0]).toMatchObject({ iban: IBAN });
}

describe('AddBankAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REACT_APP_PUBLIC_URL = PUBLIC_URL;
  });

  it('shows the wallet-connect hint and hides the generic error box', async () => {
    mockCreateAccount.mockRejectedValue({ statusCode: 400, message: KYC_ONLY_MESSAGE });

    await submitIban();

    await waitFor(() => expect(screen.getByText(WALLET_HINT, { exact: false })).toBeInTheDocument());
    const connectLink = screen.getByRole('link', { name: 'Connect a wallet' });
    expect(connectLink).toBeInTheDocument();
    expect(screen.queryByText(GENERIC_ERROR)).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();

    fireEvent.click(connectLink);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/connect');
  });

  it('falls through to the generic error box for a different 400', async () => {
    mockCreateAccount.mockRejectedValue({ statusCode: 400, message: OTHER_400_MESSAGE });

    await submitIban();

    await waitFor(() => expect(screen.getByText(GENERIC_ERROR)).toBeInTheDocument());
    expect(screen.getByTestId('error-hint')).toBeInTheDocument();
    expect(screen.getByText(OTHER_400_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(WALLET_HINT, { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Connect a wallet' })).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('falls back to Unknown error when the rejection has no message', async () => {
    mockCreateAccount.mockRejectedValue({ statusCode: 500 });

    await submitIban();

    await waitFor(() => expect(screen.getByText(GENERIC_ERROR)).toBeInTheDocument());
    expect(screen.getByTestId('error-hint')).toBeInTheDocument();
    expect(screen.getByText('Unknown error')).toBeInTheDocument();
    expect(screen.queryByText(WALLET_HINT, { exact: false })).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('shows the support hint for a multi-account IBAN and navigates to the support issue', async () => {
    mockCreateAccount.mockRejectedValue({
      statusCode: 400,
      message: 'You cannot add a Multi-account IBAN as a personal account',
    });

    await submitIban();

    await waitFor(() => expect(screen.getByText(MULTI_ACCOUNT_HINT, { exact: false })).toBeInTheDocument());
    const supportLink = screen.getByRole('link', { name: SUPPORT_HREF });
    expect(supportLink).toBeInTheDocument();
    expect(screen.queryByText(GENERIC_ERROR)).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();

    fireEvent.click(supportLink);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(SUPPORT_PATH);
  });

  it('calls onSubmit immediately when createAccount succeeds without confirmationText', async () => {
    mockCreateAccount.mockResolvedValue(ACCOUNT);

    await submitIban();

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1));
    expect(mockOnSubmit).toHaveBeenCalledWith(ACCOUNT);
    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add bank account' })).toBeInTheDocument();
  });

  it('shows the confirmation text and calls onSubmit only after OK', async () => {
    mockCreateAccount.mockResolvedValue(ACCOUNT);

    await submitIban(CONFIRMATION_TEXT);

    await waitFor(() => expect(screen.getByText(CONFIRMATION_TEXT)).toBeInTheDocument());
    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Add bank account' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    expect(mockOnSubmit).toHaveBeenCalledWith(ACCOUNT);
  });
});
