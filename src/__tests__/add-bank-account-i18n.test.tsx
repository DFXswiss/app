// Binds AddBankAccount's Trans i18nKey to the real de.json entry. The sibling component test
// mocks Trans as children (English source only); the translations test never renders the
// component. This file uses a dedicated i18next instance so a key typo cannot stay green.

const mockCreateAccount = jest.fn();
const mockNavigate = jest.fn();
const mockOnSubmit = jest.fn();

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
  // react-hook-form are not yet in scope here and must be required directly instead.
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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { AddBankAccount } from 'src/components/payment/add-bank-account';
import de from 'src/translations/languages/de.json';
import fr from 'src/translations/languages/fr.json';
import itLang from 'src/translations/languages/it.json';

const IBAN = 'DE89370400440532013000';
const KYC_ONLY_MESSAGE = 'You cannot add an IBAN to a KYC only account';
const DE_HINT = (de as { 'general/errors': { no_wallet: string } })['general/errors'].no_wallet
  .replace('<1></1>', '')
  .trim();

const i18n = createInstance();

describe('AddBankAccount i18n binding', () => {
  beforeAll(async () => {
    await i18n.init({
      lng: 'de',
      resources: {
        de: { translation: de },
        fr: { translation: fr },
        it: { translation: itLang },
      },
      interpolation: { escapeValue: false },
      nsSeparator: '>',
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the German no_wallet translation for the KYC-only rejection, not the English source', async () => {
    mockCreateAccount.mockRejectedValue({ statusCode: 400, message: KYC_ONLY_MESSAGE });

    render(
      <I18nextProvider i18n={i18n}>
        <AddBankAccount onSubmit={mockOnSubmit} />
      </I18nextProvider>,
    );

    const ibanInput = screen.getByPlaceholderText('XX XXXX XXXX XXXX XXXX X');
    fireEvent.change(ibanInput, { target: { value: IBAN } });
    fireEvent.blur(ibanInput);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add bank account' })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add bank account' }));

    await waitFor(() => expect(screen.getByText(DE_HINT, { exact: false })).toBeInTheDocument());
    expect(screen.queryByText('<1></1>')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect a wallet' })).toBeInTheDocument();
    expect(
      screen.queryByText('Before you can add a bank account, your DFX account needs a wallet.', { exact: false }),
    ).not.toBeInTheDocument();
  });
});
