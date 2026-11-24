// Partner onboarding-fee screen: the fee list gate, the assign flow, the remove confirmation, the
// double-submit and unmount guards, and every API failure the screen turns into a message.

const mockGetOnboardingFeeAmounts = jest.fn();
const mockSetPartnerOnboardingFee = jest.fn();
const mockRemovePartnerOnboardingFee = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  Utils: {
    createRules: (rules: Record<string, any>) =>
      Object.fromEntries(
        Object.entries(rules).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.reduce((prev, curr) => ({ ...prev, ...curr }), {}) : value,
        ]),
      ),
  },
  Validations: {
    get Required() {
      return { required: { value: true, message: 'required' } };
    },
    Custom: (validator: (value: any) => true | string) => ({ validate: validator }),
  },
}));

jest.mock('@dfx.swiss/react-components', () => {
  // babel-plugin-jest-hoist runs this factory before file imports — require React / RHF here.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  const errorAt = (errors: any, name: string) => name.split('.').reduce((e, key) => e?.[key], errors);

  function enrich(children: any, form: any): any {
    return React.Children.map(children, (child: any) => {
      if (!React.isValidElement(child)) return child;
      const props: any = child.props;
      const nested = enrich(props.children, form);
      if (!props.name) return React.cloneElement(child, { children: nested });
      return React.cloneElement(child, {
        control: form.control,
        rules: form.rules?.[props.name],
        error: errorAt(form.errors, props.name),
        translate: form.translate,
        children: nested,
      });
    });
  }

  const Form = ({ children, ...form }: any) => React.createElement('form', null, enrich(children, form));

  const field = (render: (field: any) => any) =>
    function Field({ control, name, rules, error, translate, items, labelFunc, disabled, forceEnable }: any) {
      return React.createElement(Controller, {
        control,
        name,
        rules,
        render: ({ field: f }: any) =>
          React.createElement(
            'div',
            null,
            render({ ...f, name, items, labelFunc, disabled, forceEnable }),
            error ? React.createElement('p', null, translate(error.message)) : null,
          ),
      });
    };

  const StyledInput = field(({ name, value, onChange, onBlur }) =>
    React.createElement('input', {
      'data-testid': name,
      value: value ?? '',
      onBlur,
      onChange: (e: any) => onChange(e.target.value),
    }),
  );

  const StyledDropdown = field(({ name, onChange, items, labelFunc, disabled, forceEnable }) => {
    // Mirror the component's own gate: a list of at most one item stays disabled unless forceEnable.
    const isDisabled = disabled || ((items ?? []).length <= 1 && !forceEnable);
    return React.createElement(
      'div',
      { 'data-testid': `${name}-dropdown`, 'data-disabled': isDisabled ? 'true' : 'false' },
      (items ?? []).map((item: any, i: number) =>
        React.createElement(
          'button',
          {
            key: i,
            type: 'button',
            disabled: isDisabled,
            'data-testid': `${name}-option-${i}`,
            onClick: () => onChange(item),
          },
          labelFunc(item),
        ),
      ),
    );
  });

  const StyledButton = ({ label, onClick, disabled, isLoading }: any) =>
    React.createElement('button', { type: 'button', onClick, disabled: disabled || isLoading }, label);

  const Stack = ({ children }: any) => React.createElement('div', null, children);

  return {
    Form,
    StyledInput,
    StyledDropdown,
    StyledButton,
    StyledVerticalStack: Stack,
    StyledButtonColor: { WHITE: 'white' },
    StyledButtonWidth: { FULL: 'full' },
  };
});

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <p data-testid="error-hint">{message}</p>,
}));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

// The screen translates the shared API-off constant; the mock below maps it so the assertions see
// the translated text rather than the English source key.
const API_OFF_KEY = 'The onboarding fee API is switched off.';
const API_OFF_TRANSLATED = 'Die Onboarding-Gebühren-API ist ausgeschaltet.';

const mockSettings = {
  translate: (_namespace: string, key: string, params?: Record<string, string>) => {
    const text = key === API_OFF_KEY ? API_OFF_TRANSLATED : key;
    return params ? text.replace(/\{\{(\w+)\}\}/g, (_match, name) => params[name] ?? '') : text;
  },
  translateError: (key: string) => key,
};

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => mockSettings,
}));

jest.mock('src/hooks/guard.hook', () => ({
  usePartnerGuard: () => undefined,
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/hooks/onboarding-fee.hook', () => ({
  useOnboardingFee: () => ({
    getOnboardingFeeAmounts: mockGetOnboardingFeeAmounts,
    setPartnerOnboardingFee: mockSetPartnerOnboardingFee,
    removePartnerOnboardingFee: mockRemovePartnerOnboardingFee,
  }),
}));

jest.mock('src/util/utils', () => ({
  formatChf: (value: number) => value.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PartnerOnboardingFeeScreen from 'src/screens/partner-onboarding-fee.screen';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderLoaded(): Promise<ReturnType<typeof render>> {
  const result = render(<PartnerOnboardingFeeScreen />);
  await screen.findByTestId('amount-option-0');
  return result;
}

function assignAddress(): HTMLInputElement {
  return screen.getAllByTestId('address')[0] as HTMLInputElement;
}

function removeAddress(): HTMLInputElement {
  return screen.getAllByTestId('address')[1] as HTMLInputElement;
}

function type(input: HTMLInputElement, value: string, blur = true): void {
  fireEvent.change(input, { target: { value } });
  if (blur) fireEvent.blur(input);
}

function pickAmount(index: number): void {
  fireEvent.click(screen.getByTestId(`amount-option-${index}`));
}

function assignButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Assign' });
}

function removeButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Remove' });
}

describe('PartnerOnboardingFeeScreen', () => {
  beforeEach(() => {
    mockGetOnboardingFeeAmounts.mockReset().mockResolvedValue([400, 800]);
    mockSetPartnerOnboardingFee.mockReset();
    mockRemovePartnerOnboardingFee.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the explanation, loads the fee list once, and keeps Assign disabled until the form is complete', async () => {
    render(<PartnerOnboardingFeeScreen />);

    expect(mockGetOnboardingFeeAmounts).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(
        'Enter the wallet address of your customer and choose the onboarding fee. The customer is attributed to your referral code.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assign onboarding fee' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Remove onboarding fee' })).toBeInTheDocument();
    expect(screen.getByTestId('amount-dropdown')).toHaveAttribute('data-disabled', 'true');
    expect(assignButton()).toBeDisabled();
    expect(removeButton()).toBeDisabled();

    await screen.findByTestId('amount-option-0');

    await waitFor(() => expect(screen.getByTestId('amount-dropdown')).toHaveAttribute('data-disabled', 'false'));
    expect(screen.getByText('CHF 400')).toBeInTheDocument();
    expect(screen.getByText('CHF 800')).toBeInTheDocument();

    type(assignAddress(), '0xabc');
    expect(assignButton()).toBeDisabled();

    pickAmount(0);
    expect(assignButton()).toBeEnabled();
  });

  it('keeps the fee list and Assign disabled and shows the error when the amounts cannot be loaded', async () => {
    mockGetOnboardingFeeAmounts.mockRejectedValue(new Error('boom'));
    render(<PartnerOnboardingFeeScreen />);

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('boom');
    expect(screen.getByTestId('amount-dropdown')).toHaveAttribute('data-disabled', 'true');
    expect(screen.queryByTestId('amount-option-0')).not.toBeInTheDocument();
    expect(assignButton()).toBeDisabled();
  });

  it('falls back to a generic message when loading the amounts rejects without a message', async () => {
    mockGetOnboardingFeeAmounts.mockRejectedValue({ statusCode: 500 });
    render(<PartnerOnboardingFeeScreen />);

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Failed to load the onboarding fee amounts');
    expect(screen.getByTestId('amount-dropdown')).toHaveAttribute('data-disabled', 'true');
    expect(assignButton()).toBeDisabled();
  });

  it('says the API is switched off when loading the amounts hits a bare 404', async () => {
    mockGetOnboardingFeeAmounts.mockRejectedValue({ statusCode: 404 });
    render(<PartnerOnboardingFeeScreen />);

    expect(await screen.findByTestId('error-hint')).toHaveTextContent(API_OFF_TRANSLATED);
  });

  it('ignores a successful amount load that finishes after unmount', async () => {
    const deferred = createDeferred<number[]>();
    mockGetOnboardingFeeAmounts.mockReturnValue(deferred.promise);
    const { unmount } = render(<PartnerOnboardingFeeScreen />);
    await waitFor(() => expect(mockGetOnboardingFeeAmounts).toHaveBeenCalledTimes(1));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    unmount();

    await act(async () => {
      deferred.resolve([400]);
      await deferred.promise;
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('ignores a failed amount load that finishes after unmount', async () => {
    const deferred = createDeferred<number[]>();
    mockGetOnboardingFeeAmounts.mockReturnValue(deferred.promise);
    const { unmount } = render(<PartnerOnboardingFeeScreen />);
    await waitFor(() => expect(mockGetOnboardingFeeAmounts).toHaveBeenCalledTimes(1));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    unmount();

    await act(async () => {
      deferred.reject(new Error('late'));
      await deferred.promise.catch(() => undefined);
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('assigns the trimmed address and the chosen fee and reports the result', async () => {
    mockSetPartnerOnboardingFee.mockResolvedValue(undefined);
    await renderLoaded();

    type(assignAddress(), '  0xabc  ');
    pickAmount(0);
    fireEvent.click(assignButton());

    await waitFor(() => expect(mockSetPartnerOnboardingFee).toHaveBeenCalledWith({ address: '0xabc', amount: 400 }));
    expect(await screen.findByText('Onboarding fee of CHF 400 assigned to 0xabc.')).toBeInTheDocument();
    expect(assignAddress().value).toBe('');
    expect(assignButton()).toBeDisabled();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('offers and assigns the only fee when the list has a single amount', async () => {
    mockGetOnboardingFeeAmounts.mockResolvedValue([400]);
    mockSetPartnerOnboardingFee.mockResolvedValue(undefined);
    await renderLoaded();

    expect(screen.getByTestId('amount-dropdown')).toHaveAttribute('data-disabled', 'false');
    expect(screen.getByTestId('amount-option-0')).toBeEnabled();

    type(assignAddress(), '0xabc');
    pickAmount(0);
    fireEvent.click(assignButton());

    await waitFor(() => expect(mockSetPartnerOnboardingFee).toHaveBeenCalledWith({ address: '0xabc', amount: 400 }));
    expect(await screen.findByText('Onboarding fee of CHF 400 assigned to 0xabc.')).toBeInTheDocument();
  });

  it('shows the API message and keeps the input when assigning is refused', async () => {
    mockSetPartnerOnboardingFee.mockRejectedValue(new Error('Address is blocked or deleted'));
    await renderLoaded();

    type(assignAddress(), '0xabc');
    pickAmount(0);
    fireEvent.click(assignButton());

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Address is blocked or deleted');
    expect(assignAddress().value).toBe('0xabc');
    expect(assignButton()).toBeEnabled();
  });

  it('shows the API-off message for a bare 404', async () => {
    mockSetPartnerOnboardingFee.mockRejectedValue({ statusCode: 404 });
    await renderLoaded();

    type(assignAddress(), '0xabc');
    pickAmount(0);
    fireEvent.click(assignButton());

    expect(await screen.findByTestId('error-hint')).toHaveTextContent(API_OFF_TRANSLATED);
  });

  it('falls back to a generic message when the assignment failure is not an Error', async () => {
    mockSetPartnerOnboardingFee.mockRejectedValue('boom');
    await renderLoaded();

    type(assignAddress(), '0xabc');
    pickAmount(0);
    fireEvent.click(assignButton());

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Failed to assign the onboarding fee');
  });

  it('starts one assignment for two clicks in the same tick and locks the form while it runs', async () => {
    const deferred = createDeferred<void>();
    mockSetPartnerOnboardingFee.mockReturnValue(deferred.promise);
    await renderLoaded();

    type(assignAddress(), '0xabc');
    pickAmount(0);
    const button = assignButton();

    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    await waitFor(() => expect(mockSetPartnerOnboardingFee).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(await screen.findByText('Onboarding fee of CHF 400 assigned to 0xabc.')).toBeInTheDocument();
  });

  it('ignores an assignment that finishes after unmount', async () => {
    const deferred = createDeferred<void>();
    mockSetPartnerOnboardingFee.mockReturnValue(deferred.promise);
    const { unmount } = await renderLoaded();

    type(assignAddress(), '0xabc');
    pickAmount(0);
    fireEvent.click(assignButton());
    await waitFor(() => expect(mockSetPartnerOnboardingFee).toHaveBeenCalledTimes(1));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    unmount();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('ignores a failed assignment that finishes after unmount', async () => {
    const deferred = createDeferred<void>();
    mockSetPartnerOnboardingFee.mockReturnValue(deferred.promise);
    const { unmount } = await renderLoaded();

    type(assignAddress(), '0xabc');
    pickAmount(0);
    fireEvent.click(assignButton());
    await waitFor(() => expect(mockSetPartnerOnboardingFee).toHaveBeenCalledTimes(1));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    unmount();

    await act(async () => {
      deferred.reject(new Error('late'));
      await deferred.promise.catch(() => undefined);
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('validates the assign address on blur', async () => {
    await renderLoaded();

    // Whitespace is not an address; the custom rule rejects it.
    type(assignAddress(), '   ');
    expect(await screen.findByText('required')).toBeInTheDocument();
    expect(assignButton()).toBeDisabled();

    type(assignAddress(), '0xabc');
    // Validation runs asynchronously after the change, so wait for the stale error to clear.
    await waitFor(() => expect(screen.queryByText('required')).not.toBeInTheDocument());

    // Clearing the field exercises the falsy branch of the rule.
    type(assignAddress(), '');
    expect(await screen.findByText('required')).toBeInTheDocument();
  });

  it('disables the initial Remove button while an assignment is pending', async () => {
    const deferred = createDeferred<void>();
    mockSetPartnerOnboardingFee.mockReturnValue(deferred.promise);
    await renderLoaded();

    // A removable address keeps the button independent of the empty-input rule, so only isSaving
    // can disable it.
    type(removeAddress(), '0xdef');
    expect(removeButton()).toBeEnabled();

    type(assignAddress(), '0xabc');
    pickAmount(0);
    fireEvent.click(assignButton());
    await waitFor(() => expect(mockSetPartnerOnboardingFee).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(removeButton()).toBeDisabled());

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    await waitFor(() => expect(removeButton()).toBeEnabled());
  });

  it('asks for confirmation before removing and cancels without calling the API', async () => {
    await renderLoaded();

    expect(removeButton()).toBeDisabled();

    type(removeAddress(), '0xdef');
    expect(removeButton()).toBeEnabled();
    fireEvent.click(removeButton());

    expect(await screen.findByText('Remove the onboarding fee of 0xdef?')).toBeInTheDocument();
    expect(mockRemovePartnerOnboardingFee).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Remove the onboarding fee of 0xdef?')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('address')).toHaveLength(2);
    expect(mockRemovePartnerOnboardingFee).not.toHaveBeenCalled();
  });

  it('removes the fee after confirmation and reports the result', async () => {
    mockRemovePartnerOnboardingFee.mockResolvedValue(undefined);
    await renderLoaded();

    type(removeAddress(), '  0xdef  ');
    fireEvent.click(removeButton());
    await screen.findByText('Remove the onboarding fee of 0xdef?');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(mockRemovePartnerOnboardingFee).toHaveBeenCalledWith('0xdef'));
    expect(await screen.findByText('Onboarding fee of 0xdef removed.')).toBeInTheDocument();
    expect(screen.queryByText('Remove the onboarding fee of 0xdef?')).not.toBeInTheDocument();
    expect(removeAddress().value).toBe('');
    expect(removeButton()).toBeDisabled();
  });

  it('shows the API message and keeps the confirmation when removing is refused', async () => {
    mockRemovePartnerOnboardingFee.mockRejectedValue(new Error('Account has no onboarding fee'));
    await renderLoaded();

    type(removeAddress(), '0xdef');
    fireEvent.click(removeButton());
    await screen.findByText('Remove the onboarding fee of 0xdef?');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Account has no onboarding fee');
    expect(screen.getByText('Remove the onboarding fee of 0xdef?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
  });

  it('falls back to a generic message when the removal failure is not an Error', async () => {
    mockRemovePartnerOnboardingFee.mockRejectedValue('boom');
    await renderLoaded();

    type(removeAddress(), '0xdef');
    fireEvent.click(removeButton());
    await screen.findByText('Remove the onboarding fee of 0xdef?');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Failed to remove the onboarding fee');
  });

  it('starts one removal for two clicks in the same tick and locks the confirmation while it runs', async () => {
    const deferred = createDeferred<void>();
    mockRemovePartnerOnboardingFee.mockReturnValue(deferred.promise);
    await renderLoaded();

    type(removeAddress(), '0xdef');
    fireEvent.click(removeButton());
    await screen.findByText('Remove the onboarding fee of 0xdef?');
    const confirm = screen.getByRole('button', { name: 'Remove' });

    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });

    await waitFor(() => expect(mockRemovePartnerOnboardingFee).toHaveBeenCalledTimes(1));
    const removing = await screen.findByRole('button', { name: 'Removing…' });
    expect(removing).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(await screen.findByText('Onboarding fee of 0xdef removed.')).toBeInTheDocument();
  });

  it('ignores a removal that finishes after unmount', async () => {
    const deferred = createDeferred<void>();
    mockRemovePartnerOnboardingFee.mockReturnValue(deferred.promise);
    const { unmount } = await renderLoaded();

    type(removeAddress(), '0xdef');
    fireEvent.click(removeButton());
    await screen.findByText('Remove the onboarding fee of 0xdef?');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mockRemovePartnerOnboardingFee).toHaveBeenCalledTimes(1));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    unmount();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('ignores a failed removal that finishes after unmount', async () => {
    const deferred = createDeferred<void>();
    mockRemovePartnerOnboardingFee.mockReturnValue(deferred.promise);
    const { unmount } = await renderLoaded();

    type(removeAddress(), '0xdef');
    fireEvent.click(removeButton());
    await screen.findByText('Remove the onboarding fee of 0xdef?');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mockRemovePartnerOnboardingFee).toHaveBeenCalledTimes(1));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    unmount();

    await act(async () => {
      deferred.reject(new Error('late'));
      await deferred.promise.catch(() => undefined);
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('validates the remove address on blur', async () => {
    await renderLoaded();

    type(removeAddress(), '   ');
    expect(await screen.findByText('required')).toBeInTheDocument();
    expect(removeButton()).toBeDisabled();

    type(removeAddress(), '0xdef');
    // Validation runs asynchronously after the change, so wait for the stale error to clear.
    await waitFor(() => expect(screen.queryByText('required')).not.toBeInTheDocument());
  });
});
