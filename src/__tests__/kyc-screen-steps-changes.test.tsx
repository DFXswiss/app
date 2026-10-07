const mockStartStep = jest.fn();
const mockGetKycInfo = jest.fn();
const mockContinueKyc = jest.fn();
const mockCancelStep = jest.fn();
const mockSetPhoneChangeData = jest.fn();
const mockSetAddressChangeData = jest.fn();
const mockSetNameChangeData = jest.fn();
const mockSetPaymentData = jest.fn();
const mockSetRecallData = jest.fn();
const mockToBase64 = jest.fn();

const mockStoreTypeToString = jest.fn((value: string) => `store:${value}`);
const mockMerchantCategoryToString = jest.fn((value: string) => `merchant:${value}`);
const mockGoodsCategoryToString = jest.fn((value: string) => `goods:${value}`);

jest.mock('@dfx.swiss/react', () => {
  const state = {
    cancelable: [] as string[],
    createdRules: [] as Record<string, any>[],
    toggles: { allowEmptyRequired: false },
  };
  const required = {
    required: {
      get value() {
        return !state.toggles.allowEmptyRequired;
      },
      message: 'required',
    },
  };

  return {
    __state: state,
    AccountType: { PERSONAL: 'Personal', ORGANIZATION: 'Organization' },
    GoodsCategory: { ELECTRONICS: 'Electronics', OTHER: 'Other' },
    GoodsType: { TANGIBLE: 'Tangible', VIRTUAL: 'Virtual' },
    MerchantCategory: { RETAIL: 'Retail', SERVICES: 'Services' },
    StoreType: { ONLINE: 'Online', PHYSICAL: 'Physical' },
    KycLevel: { Link: 10, Sell: 30, Completed: 50 },
    KycStepName: {
      CONTACT_DATA: 'ContactData',
      PERSONAL_DATA: 'PersonalData',
      LEGAL_ENTITY: 'LegalEntity',
      COMMERCIAL_REGISTER: 'CommercialRegister',
      SOLE_PROPRIETORSHIP_CONFIRMATION: 'SoleProprietorshipConfirmation',
      OWNER_DIRECTORY: 'OwnerDirectory',
      NATIONALITY_DATA: 'NationalityData',
      RECOMMENDATION: 'Recommendation',
      SIGNATORY_POWER: 'SignatoryPower',
      AUTHORITY: 'Authority',
      BENEFICIAL_OWNER: 'BeneficialOwner',
      OPERATIONAL_ACTIVITY: 'OperationalActivity',
      IDENT: 'Ident',
      FINANCIAL_DATA: 'FinancialData',
      ADDITIONAL_DOCUMENTS: 'AdditionalDocuments',
      RESIDENCE_PERMIT: 'ResidencePermit',
      STATUTES: 'Statutes',
      DFX_APPROVAL: 'DfxApproval',
      PAYMENT_AGREEMENT: 'PaymentAgreement',
      RECALL_AGREEMENT: 'RecallAgreement',
      PHONE_CHANGE: 'PhoneChange',
      ADDRESS_CHANGE: 'AddressChange',
      NAME_CHANGE: 'NameChange',
    },
    KycStepStatus: { NOT_STARTED: 'NotStarted', IN_PROGRESS: 'InProgress', FAILED: 'Failed' },
    KycStepType: {
      VIDEO: 'Video',
      AUTO: 'Auto',
      MANUAL: 'Manual',
      SUMSUB_VIDEO: 'SumsubVideo',
      SUMSUB_AUTO: 'SumsubAuto',
    },
    KycStepCancelable: state.cancelable,
    KycStepReason: { ACCOUNT_MERGE_REQUESTED: 'AccountMergeRequested' },
    UrlType: { BROWSER: 'Browser' },
    isStepDone: () => false,
    Utils: {
      createRules: (rules: Record<string, any>) => {
        const created = Object.fromEntries(
          Object.entries(rules).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.reduce((previous, current) => ({ ...previous, ...current }), {}) : value,
          ]),
        );
        state.createdRules.push(created);
        return created;
      },
    },
    Validations: {
      Required: required,
      Phone: { validate: () => true },
      Custom: (validator: (value: any) => true | string) => ({ validate: validator }),
    },
    useKyc: () => ({
      startStep: mockStartStep,
      getKycInfo: mockGetKycInfo,
      continueKyc: mockContinueKyc,
      cancelStep: mockCancelStep,
      addTransferClient: jest.fn(),
      setPhoneChangeData: mockSetPhoneChangeData,
      setAddressChangeData: mockSetAddressChangeData,
      setNameChangeData: mockSetNameChangeData,
      setPaymentData: mockSetPaymentData,
      setRecallData: mockSetRecallData,
    }),
    useUserContext: () => ({ user: undefined, reloadUser: jest.fn() }),
    useSessionContext: () => ({ logout: jest.fn() }),
  };
});

jest.mock('@dfx.swiss/react-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  const errorAt = (errors: any, name: string) => name.split('.').reduce((error, key) => error?.[key], errors);

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

  const Form = ({ children, ...form }: any) =>
    React.createElement('form', { 'data-testid': 'kyc-form', onSubmit: form.onSubmit }, enrich(children, form));

  const field = (renderField: (fieldProps: any) => any) =>
    function Field({ control, name, rules, error, translate, items, labelFunc, filterFunc, matchFunc }: any) {
      return React.createElement(Controller, {
        control,
        name,
        rules,
        render: ({ field: rendered }: any) =>
          React.createElement(
            'div',
            null,
            renderField({ ...rendered, name, items, labelFunc, filterFunc, matchFunc }),
            error ? React.createElement('p', null, translate(error.message)) : null,
          ),
      });
    };

  const StyledInput = field(({ name, value, onChange, onBlur }) =>
    React.createElement('input', {
      'data-testid': name,
      value: value ?? '',
      onBlur,
      onChange: (event: any) => onChange(event.target.value),
    }),
  );

  const StyledFileUpload = field(({ name, onChange, onBlur }) =>
    React.createElement('input', {
      'data-testid': name,
      type: 'file',
      onBlur,
      onChange: (event: any) => onChange(event.target.files?.[0]),
    }),
  );

  const StyledDropdown = field(({ name, value, onChange, onBlur, items = [], labelFunc, filterFunc, matchFunc }) => {
    const first = items[0];
    const diagnostics: any[] = [];
    if (first && filterFunc) {
      diagnostics.push(
        React.createElement(
          'span',
          { key: 'filter-empty', 'data-testid': `${name}-filter-empty` },
          String(filterFunc(first, '')),
        ),
        React.createElement(
          'span',
          { key: 'filter-miss', 'data-testid': `${name}-filter-miss` },
          String(filterFunc(first, '__missing__')),
        ),
        React.createElement(
          'span',
          { key: 'filter-hit', 'data-testid': `${name}-filter-hit` },
          String(filterFunc(first, first.name.slice(0, 3))),
        ),
      );
    }
    if (first && matchFunc) {
      diagnostics.push(
        React.createElement(
          'span',
          { key: 'match-hit', 'data-testid': `${name}-match-hit` },
          String(matchFunc(first, first.name)),
        ),
        React.createElement(
          'span',
          { key: 'match-empty', 'data-testid': `${name}-match-empty` },
          String(matchFunc(first, undefined)),
        ),
      );
    }
    return React.createElement(
      'div',
      null,
      React.createElement(
        'span',
        { 'data-testid': `${name}-current` },
        value && typeof value === 'object' ? value.symbol : (value ?? ''),
      ),
      diagnostics,
      items.map((item: any, index: number) =>
        React.createElement(
          'button',
          {
            key: index,
            type: 'button',
            'data-testid': `${name}-option-${index}`,
            onClick: () => {
              onChange(item);
              onBlur();
            },
          },
          labelFunc ? labelFunc(item) : String(item),
        ),
      ),
    );
  });

  const StyledButton = ({ label, onClick, disabled, isLoading }: any) =>
    React.createElement(
      'button',
      {
        type: 'button',
        onClick,
        disabled: Boolean(disabled || isLoading),
        'data-disabled': String(Boolean(disabled)),
        'data-loading': String(Boolean(isLoading)),
      },
      label,
    );

  const StyledCheckboxRow = ({ isChecked, onChange, children }: any) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'agreement-checkbox',
        'data-checked': String(Boolean(isChecked)),
        onClick: () => onChange(!isChecked),
      },
      children,
    );

  const Stack = ({ children }: any) => React.createElement('div', null, children);
  return {
    Form,
    StyledInput,
    StyledFileUpload,
    StyledDropdown,
    StyledSearchDropdown: StyledDropdown,
    StyledCheckboxRow,
    StyledButton,
    StyledVerticalStack: Stack,
    StyledHorizontalStack: Stack,
    StyledLoadingSpinner: () => React.createElement('div', { 'data-testid': 'loading-spinner' }),
    SpinnerSize: { LG: 'lg' },
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white', GRAY_OUTLINE: 'gray-outline' },
    StyledButtonWidth: { FULL: 'full', MIN: 'min' },
  };
});

jest.mock('@sumsub/websdk-react', () => () => null);
jest.mock('react-device-detect', () => ({ isMobile: false }));
jest.mock('react-i18next', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return { Trans: ({ children }: any) => React.createElement(React.Fragment, null, children) };
});
jest.mock('../util/utils', () => ({
  delay: () => Promise.resolve(),
  toBase64: (...args: unknown[]) => mockToBase64(...args),
  url: ({ path }: { path: string }) => path,
}));
jest.mock('../components/error-hint', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return { ErrorHint: ({ message }: { message: string }) => React.createElement('div', { role: 'alert' }, message) };
});

const mockAppHandling = { isInitialized: true, isWidget: false, params: {}, setParams: jest.fn() };
jest.mock('src/contexts/app-handling.context', () => ({ useAppHandlingContext: () => mockAppHandling }));
jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));
jest.mock('src/hooks/app-params.hook', () => ({ useAppParams: () => ({ lang: 'EN' }) }));

const COUNTRY_DE = { id: 1, symbol: 'DE', name: 'Germany' };
const COUNTRY_CH = { id: 2, symbol: 'CH', name: 'Switzerland' };
const mockSettings = {
  translate: (_namespace: string, text: string) => text,
  translateError: (key: string) => `error:${key}`,
  changeLanguage: jest.fn(),
  processingKycData: false,
  allowedCountries: [COUNTRY_DE, COUNTRY_CH],
  allowedOrganizationCountries: [COUNTRY_DE, COUNTRY_CH],
};
jest.mock('../contexts/settings.context', () => ({ useSettingsContext: () => mockSettings }));
jest.mock('../components/kyc-status', () => ({ KycStatusTable: () => null }));
jest.mock('../hooks/geo-location.hook', () => ({ useGeoLocation: () => ({ countryCode: 'CH' }) }));
jest.mock('../hooks/guard.hook', () => ({ useUserGuard: () => undefined }));
jest.mock('../hooks/kyc-helper.hook', () => ({
  useKycHelper: () => ({
    nameToString: (name: string) => name,
    accountTypeToString: (type: string) => type,
    storeTypeToString: mockStoreTypeToString,
    merchantCategoryToString: mockMerchantCategoryToString,
    goodsCategoryToString: mockGoodsCategoryToString,
  }),
}));
jest.mock('../hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), clearParams: jest.fn() };
jest.mock('../hooks/navigation.hook', () => ({ useNavigation: () => mockNavigation }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import KycScreen from '../screens/kyc.screen';

jest.setTimeout(30000);

interface DfxReactMockState {
  cancelable: string[];
  createdRules: Record<string, any>[];
  toggles: { allowEmptyRequired: boolean };
}

const { __state: mockDfxState } = jest.requireMock('@dfx.swiss/react') as { __state: DfxReactMockState };
const mockCancelable = mockDfxState.cancelable;
const mockCreatedRules = mockDfxState.createdRules;
const mockToggles = mockDfxState.toggles;

const PROOF = new File(['proof'], 'proof.pdf', { type: 'application/pdf' });
const INVALID_PROOF = new File(['proof'], 'proof.txt', { type: 'text/plain' });
const CHANGE_STEPS = ['PhoneChange', 'AddressChange', 'NameChange'];

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve: Deferred<T>['resolve'] = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function kycSession(stepName: string, hasSession = true) {
  const currentStep = {
    name: stepName,
    status: 'InProgress',
    ...(hasSession ? { session: { url: 'step-url', type: 'Browser' } } : {}),
  };
  return {
    kycLevel: 0,
    tradingLimit: { limit: 0, period: 'Year' },
    language: { symbol: 'EN' },
    kycClients: [],
    kycSteps: [{ name: stepName, status: 'InProgress' }],
    currentStep,
  };
}

async function renderStep(stepName: string, { hasSession = true, cancelable = CHANGE_STEPS.includes(stepName) } = {}) {
  mockCancelable.splice(0, mockCancelable.length, ...(cancelable ? [stepName] : []));
  const current = kycSession(stepName, hasSession);
  mockStartStep.mockResolvedValue(current);
  mockContinueKyc.mockResolvedValue(current);
  mockGetKycInfo.mockResolvedValue(current);
  render(
    <MemoryRouter initialEntries={[`/kyc?code=TESTCODE&step=${stepName}`]}>
      <Routes>
        <Route path="/kyc" element={<KycScreen />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(mockStartStep).toHaveBeenCalledWith('TESTCODE', stepName, undefined, undefined), {
    timeout: 10000,
  });
  await waitFor(() => expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument(), { timeout: 10000 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await screen.findByTestId('kyc-form', undefined, { timeout: 10000 });
}

async function typeField(name: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByTestId(name), { target: { value } });
    fireEvent.blur(screen.getByTestId(name));
  });
}

async function upload(file: File) {
  await act(async () => {
    fireEvent.change(screen.getByTestId('file'), { target: { files: [file] } });
    fireEvent.blur(screen.getByTestId('file'));
  });
}

async function pick(name: string, index = 0) {
  await act(async () => {
    fireEvent.click(screen.getByTestId(`${name}-option-${index}`));
  });
}

async function submitForm() {
  await act(async () => {
    fireEvent.submit(screen.getByTestId('kyc-form'));
  });
}

async function fillAddress() {
  await typeField('address.street', 'Rue de l’Église');
  await typeField('address.houseNumber', '3‘a');
  await typeField('address.zip', '1000');
  await typeField('address.city', 'L’Abbaye');
}

async function fillName() {
  await typeField('firstName', 'D’Arcy');
  await typeField('lastName', 'O‘Brien');
}

async function fillPayment(website?: string) {
  await typeField('name', 'Public shop');
  if (website !== undefined) await typeField('website', website);
  await typeField('registrationNumber', 'CHE-000.000.000');
  await pick('storeType');
  await pick('merchantCategory');
  await pick('goodsType');
  await pick('goodsCategory');
  await typeField('purpose', 'Customer orders');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreTypeToString.mockImplementation((value: string) => `store:${value}`);
  mockMerchantCategoryToString.mockImplementation((value: string) => `merchant:${value}`);
  mockGoodsCategoryToString.mockImplementation((value: string) => `goods:${value}`);
  mockCreatedRules.splice(0, mockCreatedRules.length);
  mockCancelable.splice(0, mockCancelable.length);
  mockToggles.allowEmptyRequired = false;
  mockToBase64.mockResolvedValue('data:application/pdf;base64,cHJvb2Y=');
  mockSetPhoneChangeData.mockResolvedValue(undefined);
  mockSetAddressChangeData.mockResolvedValue(undefined);
  mockSetNameChangeData.mockResolvedValue(undefined);
  mockSetPaymentData.mockResolvedValue(undefined);
  mockSetRecallData.mockResolvedValue(undefined);
  mockCancelStep.mockResolvedValue(undefined);
});

describe('KycScreen change-step cancellation', () => {
  it.each(CHANGE_STEPS)('shows and drives cancellation state for %s', async (stepName) => {
    const cancel = deferred<void>();
    const reload = deferred<any>();
    mockCancelStep.mockReturnValue(cancel.promise);
    await renderStep(stepName);
    mockGetKycInfo.mockReturnValue(reload.promise);

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelButton).toHaveAttribute('data-loading', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-loading', 'true'),
      { timeout: 10000 },
    );
    expect(mockCancelStep).toHaveBeenCalledWith('TESTCODE', 'step-url');

    cancel.resolve(undefined);
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-loading', 'true');
        expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'true');
      },
      { timeout: 10000 },
    );

    reload.resolve(kycSession(stepName));
    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-loading', 'false');
        expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'false');
      },
      { timeout: 10000 },
    );
  });

  it.each(CHANGE_STEPS)('omits cancellation when %s is not cancelable', async (stepName) => {
    await renderStep(stepName, { cancelable: false });
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it.each([
    { rejection: { message: 'Cancellation failed' }, expected: 'Cancellation failed' },
    { rejection: {}, expected: 'Unknown error' },
  ])('shows the cancellation API rejection %#', async ({ rejection, expected }) => {
    mockCancelStep.mockRejectedValue(rejection);
    await renderStep('PhoneChange');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent(expected);
    expect(mockGetKycInfo).not.toHaveBeenCalled();
  });
});

describe('KycScreen phone change', () => {
  it('submits the phone, exposes progress, and reloads the session', async () => {
    const update = deferred<void>();
    mockSetPhoneChangeData.mockReturnValue(update.promise);
    await renderStep('PhoneChange');
    await typeField('phone', '+41791234567');
    await submitForm();

    expect(mockSetPhoneChangeData).toHaveBeenCalledWith('TESTCODE', 'step-url', { phone: '+41791234567' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'true'), {
      timeout: 10000,
    });
    update.resolve(undefined);
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'false'), {
      timeout: 10000,
    });
  });

  it.each([
    { rejection: { message: 'Phone update failed' }, expected: 'Phone update failed' },
    { rejection: {}, expected: 'Unknown error' },
  ])('shows the phone API rejection %#', async ({ rejection, expected }) => {
    mockSetPhoneChangeData.mockRejectedValue(rejection);
    await renderStep('PhoneChange');
    await typeField('phone', '+41791234567');
    await submitForm();

    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent(expected);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'false'), {
      timeout: 10000,
    });
  });

  it('does not submit without a step session', async () => {
    await renderStep('PhoneChange', { hasSession: false });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await typeField('phone', '+41791234567');
    await submitForm();
    expect(mockCancelStep).not.toHaveBeenCalled();
    expect(mockSetPhoneChangeData).not.toHaveBeenCalled();
  });
});

describe('KycScreen address change', () => {
  it('uses the IP country and exercises country labels, filters, and matching', async () => {
    await renderStep('AddressChange');
    expect(screen.getByTestId('address.country-current')).toHaveTextContent('CH');
    expect(screen.getByTestId('address.country-option-0')).toHaveTextContent('Germany');
    expect(screen.getByTestId('address.country-option-1')).toHaveTextContent('Switzerland');
    expect(screen.getByTestId('address.country-filter-empty')).toHaveTextContent('true');
    expect(screen.getByTestId('address.country-filter-miss')).toHaveTextContent('false');
    expect(screen.getByTestId('address.country-filter-hit')).toHaveTextContent('true');
    expect(screen.getByTestId('address.country-match-hit')).toHaveTextContent('true');
    expect(screen.getByTestId('address.country-match-empty')).toHaveTextContent('false');
  });

  it('accepts empty and supported files and rejects an unsupported file type', async () => {
    await renderStep('AddressChange');
    const fileRule = mockCreatedRules[mockCreatedRules.length - 1].file.validate;
    expect(fileRule(undefined)).toBe(true);
    expect(fileRule(PROOF)).toBe(true);
    expect(fileRule(INVALID_PROOF)).toBe('file_type');

    await upload(INVALID_PROOF);
    expect(await screen.findByText('error:file_type', undefined, { timeout: 10000 })).toBeInTheDocument();
  });

  it('reports a missing file before conversion', async () => {
    mockToggles.allowEmptyRequired = true;
    await renderStep('AddressChange');
    await fillAddress();
    await submitForm();

    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent('No file selected');
    expect(mockToBase64).not.toHaveBeenCalled();
    expect(mockSetAddressChangeData).not.toHaveBeenCalled();
  });

  it('reports a conversion that produces no file data', async () => {
    mockToBase64.mockResolvedValue(undefined);
    await renderStep('AddressChange');
    await fillAddress();
    await upload(PROOF);
    await submitForm();

    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent('No file selected');
    expect(mockToBase64).toHaveBeenCalledWith(PROOF);
    expect(mockSetAddressChangeData).not.toHaveBeenCalled();
  });

  it('normalizes and submits the address while exposing progress', async () => {
    const update = deferred<void>();
    mockSetAddressChangeData.mockReturnValue(update.promise);
    await renderStep('AddressChange');
    await fillAddress();
    await upload(PROOF);
    await submitForm();

    expect(mockSetAddressChangeData).toHaveBeenCalledWith('TESTCODE', 'step-url', {
      file: 'data:application/pdf;base64,cHJvb2Y=',
      fileName: 'proof.pdf',
      address: {
        street: "Rue de l'Église",
        houseNumber: "3'a",
        zip: '1000',
        city: "L'Abbaye",
        country: COUNTRY_CH,
      },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'true'), {
      timeout: 10000,
    });
    update.resolve(undefined);
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'false'), {
      timeout: 10000,
    });
  });

  it.each([
    { rejection: { message: 'Address update failed' }, expected: 'Address update failed' },
    { rejection: {}, expected: 'Unknown error' },
  ])('shows the address API rejection %#', async ({ rejection, expected }) => {
    mockSetAddressChangeData.mockRejectedValue(rejection);
    await renderStep('AddressChange');
    await fillAddress();
    await upload(PROOF);
    await submitForm();

    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent(expected);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'false'), {
      timeout: 10000,
    });
  });

  it('does not read or submit the file without a step session', async () => {
    await renderStep('AddressChange', { hasSession: false });
    await fillAddress();
    await upload(PROOF);
    await submitForm();
    expect(mockToBase64).not.toHaveBeenCalled();
    expect(mockSetAddressChangeData).not.toHaveBeenCalled();
  });
});

describe('KycScreen name change', () => {
  it('accepts empty and supported files and rejects an unsupported file type', async () => {
    await renderStep('NameChange');
    const fileRule = mockCreatedRules[mockCreatedRules.length - 1].file.validate;
    expect(fileRule(undefined)).toBe(true);
    expect(fileRule(PROOF)).toBe(true);
    expect(fileRule(INVALID_PROOF)).toBe('file_type');

    await upload(INVALID_PROOF);
    expect(await screen.findByText('error:file_type', undefined, { timeout: 10000 })).toBeInTheDocument();
  });

  it('reports a missing file before conversion', async () => {
    mockToggles.allowEmptyRequired = true;
    await renderStep('NameChange');
    await fillName();
    await submitForm();

    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent('No file selected');
    expect(mockToBase64).not.toHaveBeenCalled();
    expect(mockSetNameChangeData).not.toHaveBeenCalled();
  });

  it('reports a conversion that produces no file data', async () => {
    mockToBase64.mockResolvedValue(undefined);
    await renderStep('NameChange');
    await fillName();
    await upload(PROOF);
    await submitForm();

    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent('No file selected');
    expect(mockToBase64).toHaveBeenCalledWith(PROOF);
    expect(mockSetNameChangeData).not.toHaveBeenCalled();
  });

  it('normalizes and submits the name while exposing progress', async () => {
    const update = deferred<void>();
    mockSetNameChangeData.mockReturnValue(update.promise);
    await renderStep('NameChange');
    await fillName();
    await upload(PROOF);
    await submitForm();

    expect(mockSetNameChangeData).toHaveBeenCalledWith('TESTCODE', 'step-url', {
      file: 'data:application/pdf;base64,cHJvb2Y=',
      fileName: 'proof.pdf',
      firstName: "D'Arcy",
      lastName: "O'Brien",
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'true'), {
      timeout: 10000,
    });
    update.resolve(undefined);
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'false'), {
      timeout: 10000,
    });
  });

  it.each([
    { rejection: { message: 'Name update failed' }, expected: 'Name update failed' },
    { rejection: {}, expected: 'Unknown error' },
  ])('shows the name API rejection %#', async ({ rejection, expected }) => {
    mockSetNameChangeData.mockRejectedValue(rejection);
    await renderStep('NameChange');
    await fillName();
    await upload(PROOF);
    await submitForm();

    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent(expected);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'false'), {
      timeout: 10000,
    });
  });

  it('does not read or submit the file without a step session', async () => {
    await renderStep('NameChange', { hasSession: false });
    await fillName();
    await upload(PROOF);
    await submitForm();
    expect(mockToBase64).not.toHaveBeenCalled();
    expect(mockSetNameChangeData).not.toHaveBeenCalled();
  });
});

describe('KycScreen payment agreement', () => {
  it('requires valid fields and acceptance and renders every category label', async () => {
    await renderStep('PaymentAgreement');
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('storeType-option-0')).toHaveTextContent('store:Online');
    expect(screen.getByTestId('merchantCategory-option-0')).toHaveTextContent('merchant:Retail');
    expect(screen.getByTestId('goodsType-option-0')).toHaveTextContent('Tangible');
    expect(screen.getByTestId('goodsCategory-option-0')).toHaveTextContent('goods:Electronics');
    expect(mockStoreTypeToString).toHaveBeenCalledWith('Online');
    expect(mockMerchantCategoryToString).toHaveBeenCalledWith('Retail');
    expect(mockGoodsCategoryToString).toHaveBeenCalledWith('Electronics');

    await fillPayment();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-disabled', 'true'), {
      timeout: 10000,
    });
    fireEvent.click(screen.getByTestId('agreement-checkbox'));
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-disabled', 'false'),
      { timeout: 10000 },
    );
    fireEvent.click(screen.getByTestId('agreement-checkbox'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-disabled', 'true'), {
      timeout: 10000,
    });
  });

  it('submits an empty website as undefined while exposing progress', async () => {
    const update = deferred<void>();
    mockSetPaymentData.mockReturnValue(update.promise);
    await renderStep('PaymentAgreement');
    await fillPayment();
    fireEvent.click(screen.getByTestId('agreement-checkbox'));
    await submitForm();

    expect(mockSetPaymentData).toHaveBeenCalledWith('TESTCODE', 'step-url', {
      name: 'Public shop',
      website: undefined,
      registrationNumber: 'CHE-000.000.000',
      storeType: 'Online',
      merchantCategory: 'Retail',
      goodsType: 'Tangible',
      goodsCategory: 'Electronics',
      purpose: 'Customer orders',
      contractAccepted: true,
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'true'), {
      timeout: 10000,
    });
    update.resolve(undefined);
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'false'), {
      timeout: 10000,
    });
  });

  it.each([
    { rejection: { message: 'Payment agreement failed' }, expected: 'Payment agreement failed' },
    { rejection: {}, expected: 'Unknown error' },
  ])('shows the payment API rejection %#', async ({ rejection, expected }) => {
    mockSetPaymentData.mockRejectedValue(rejection);
    await renderStep('PaymentAgreement');
    await fillPayment('https://shop.example');
    fireEvent.click(screen.getByTestId('agreement-checkbox'));
    await submitForm();

    expect(mockSetPaymentData).toHaveBeenCalledWith(
      'TESTCODE',
      'step-url',
      expect.objectContaining({ website: 'https://shop.example', contractAccepted: true }),
    );
    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent(expected);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'false'), {
      timeout: 10000,
    });
  });

  it('does not submit without a step session', async () => {
    await renderStep('PaymentAgreement', { hasSession: false });
    await fillPayment();
    fireEvent.click(screen.getByTestId('agreement-checkbox'));
    await submitForm();
    expect(mockSetPaymentData).not.toHaveBeenCalled();
  });
});

describe('KycScreen recall agreement', () => {
  it('submits an unchecked agreement as false while exposing progress', async () => {
    const update = deferred<void>();
    mockSetRecallData.mockReturnValue(update.promise);
    await renderStep('RecallAgreement');
    await submitForm();

    expect(mockSetRecallData).toHaveBeenCalledWith('TESTCODE', 'step-url', { accepted: false });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'true'), {
      timeout: 10000,
    });
    update.resolve(undefined);
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'false'), {
      timeout: 10000,
    });
  });

  it('submits a checked agreement as true', async () => {
    await renderStep('RecallAgreement');
    fireEvent.click(screen.getByTestId('agreement-checkbox'));
    await submitForm();

    expect(mockSetRecallData).toHaveBeenCalledWith('TESTCODE', 'step-url', { accepted: true });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
  });

  it.each([
    { rejection: { message: 'Recall agreement failed' }, expected: 'Recall agreement failed' },
    { rejection: {}, expected: 'Unknown error' },
  ])('shows the recall API rejection %#', async ({ rejection, expected }) => {
    mockSetRecallData.mockRejectedValue(rejection);
    await renderStep('RecallAgreement');
    fireEvent.click(screen.getByTestId('agreement-checkbox'));
    await submitForm();

    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent(expected);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-loading', 'false'), {
      timeout: 10000,
    });
  });

  it('does not submit without a step session', async () => {
    await renderStep('RecallAgreement', { hasSession: false });
    await submitForm();
    expect(mockSetRecallData).not.toHaveBeenCalled();
  });
});
