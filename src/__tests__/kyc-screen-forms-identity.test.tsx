// KycScreen identity forms: contact confirmation, personal and organization details,
// legal-entity evidence, and nationality selection.

const mockStartStep = jest.fn();
const mockContinueKyc = jest.fn();
const mockGetKycInfo = jest.fn();
const mockSetContactData = jest.fn();
const mockSetPersonalData = jest.fn();
const mockSetLegalEntityData = jest.fn();
const mockSetNationalityData = jest.fn();
const mockReloadUser = jest.fn();
const mockReportClientError = jest.fn();
const mockToBase64 = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  AccountType: { PERSONAL: 'Personal', ORGANIZATION: 'Organization' },
  KycLevel: { Link: 10, Sell: 30, Completed: 50 },
  KycStepName: {
    CONTACT_DATA: 'ContactData',
    PERSONAL_DATA: 'PersonalData',
    LEGAL_ENTITY: 'LegalEntity',
    NATIONALITY_DATA: 'NationalityData',
  },
  KycStepStatus: {
    NOT_STARTED: 'NotStarted',
    IN_PROGRESS: 'InProgress',
    FAILED: 'Failed',
    COMPLETED: 'Completed',
  },
  KycStepType: {
    VIDEO: 'Video',
    AUTO: 'Auto',
    MANUAL: 'Manual',
    SUMSUB_VIDEO: 'SumsubVideo',
    SUMSUB_AUTO: 'SumsubAuto',
  },
  KycStepCancelable: [],
  KycStepReason: { ACCOUNT_MERGE_REQUESTED: 'AccountMergeRequested' },
  LegalEntity: { AG: 'AG', OTHER: 'Other' },
  UrlType: { BROWSER: 'Browser' },
  isStepDone: (step: { status?: string }) => step.status === 'Completed',
  Utils: {
    createRules: (rules: Record<string, any>) =>
      Object.fromEntries(
        Object.entries(rules).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.reduce((previous, current) => ({ ...previous, ...current }), {}) : value,
        ]),
      ),
  },
  Validations: {
    get Required() {
      return { required: { value: true, message: 'required' } };
    },
    get Mail() {
      return { validate: (value: string) => value.includes('@') || 'mail' };
    },
    get Phone() {
      return { validate: () => true };
    },
    Custom: (validator: (value: any) => true | string) => ({ validate: validator }),
  },
  useKyc: () => ({
    startStep: mockStartStep,
    continueKyc: mockContinueKyc,
    getKycInfo: mockGetKycInfo,
    addTransferClient: jest.fn(),
    cancelStep: jest.fn(),
    setContactData: mockSetContactData,
    setPersonalData: mockSetPersonalData,
    setLegalEntityData: mockSetLegalEntityData,
    setNationalityData: mockSetNationalityData,
  }),
  useUserContext: () => ({ user: undefined, reloadUser: mockReloadUser }),
  useSessionContext: () => ({ logout: jest.fn() }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  // babel-plugin-jest-hoist runs this factory before file imports.
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

  const Form = ({ children, ...form }: any) => React.createElement('form', null, enrich(children, form));

  const field = (renderField: (field: any) => any) =>
    function Field({ control, name, rules, error, translate, ...props }: any) {
      return React.createElement(Controller, {
        control,
        name,
        rules,
        render: ({ field: controlledField }: any) =>
          React.createElement(
            'div',
            null,
            renderField({ ...controlledField, ...props, name }),
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

  const StyledFileUpload = field(({ name, onChange }) =>
    React.createElement('input', {
      'data-testid': name,
      type: 'file',
      onChange: (event: any) => onChange(event.target.files[0]),
    }),
  );

  const dropdown = field(
    ({ name, onChange, onBlur, items = [], labelFunc, descriptionFunc, filterFunc, matchFunc }: any) => {
      const firstItem = items[0];
      const filterResults =
        firstItem && filterFunc
          ? [undefined, firstItem.name, firstItem.symbol, 'not-present'].map((search) => filterFunc(firstItem, search))
          : [];
      const matchResults =
        firstItem && matchFunc
          ? [firstItem.name, undefined, 'not-present'].map((search) => matchFunc(firstItem, search))
          : [];

      return React.createElement(
        'div',
        null,
        items.map((item: any, index: number) =>
          React.createElement(
            'button',
            {
              key: index,
              type: 'button',
              'data-testid': `${name}-option-${index}`,
              'data-description': descriptionFunc ? descriptionFunc(item) : undefined,
              onClick: () => {
                onChange(item);
                onBlur();
              },
            },
            labelFunc(item),
          ),
        ),
        filterFunc
          ? React.createElement('output', { 'data-testid': `${name}-filter-results` }, filterResults.join(','))
          : null,
        matchFunc
          ? React.createElement('output', { 'data-testid': `${name}-match-results` }, matchResults.join(','))
          : null,
      );
    },
  );

  const StyledButton = ({ label, onClick, disabled, isLoading }: any) =>
    React.createElement('button', { type: 'button', onClick, disabled: disabled || isLoading }, label);

  const Stack = ({ children }: any) => React.createElement('div', null, children);

  return {
    DfxIcon: () => React.createElement('div', { 'data-testid': 'user-data-icon' }),
    Form,
    IconColor: { BLUE: 'blue' },
    IconVariant: { USER_DATA: 'user-data' },
    StyledInput,
    StyledFileUpload,
    StyledDropdown: dropdown,
    StyledSearchDropdown: dropdown,
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

jest.mock('src/util/client-error', () => ({
  reportClientError: (...args: unknown[]) => mockReportClientError(...args),
}));

jest.mock('../util/utils', () => ({
  ...jest.requireActual('../util/utils'),
  toBase64: (...args: unknown[]) => mockToBase64(...args),
}));

const mockAppHandling = { isInitialized: true, isWidget: false, params: {}, setParams: jest.fn() };
jest.mock('src/contexts/app-handling.context', () => ({ useAppHandlingContext: () => mockAppHandling }));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('src/hooks/app-params.hook', () => ({
  useAppParams: () => ({ lang: 'EN' }),
}));

const COUNTRY_CH = { id: 1, symbol: 'CH', name: 'Switzerland' };
const COUNTRY_DE = { id: 2, symbol: 'DE', name: 'Germany' };

const mockSettings = {
  translate: (_namespace: string, text: string) => text,
  translateError: (key: string) => `error:${key}`,
  changeLanguage: jest.fn(),
  processingKycData: false,
  allowedCountries: [COUNTRY_DE, COUNTRY_CH],
  allowedOrganizationCountries: [COUNTRY_DE, COUNTRY_CH],
  nationalityCountries: [COUNTRY_CH, COUNTRY_DE] as Array<typeof COUNTRY_CH> | undefined,
};

jest.mock('../contexts/settings.context', () => ({ useSettingsContext: () => mockSettings }));
jest.mock('../components/kyc-status', () => ({ KycStatusTable: () => null }));
jest.mock('../hooks/geo-location.hook', () => ({ useGeoLocation: () => ({ countryCode: 'CH' }) }));
jest.mock('../hooks/guard.hook', () => ({ useUserGuard: () => undefined }));

jest.mock('../hooks/kyc-helper.hook', () => ({
  useKycHelper: () => ({
    nameToString: (name: string) => name,
    accountTypeToString: (type: string) => `Account ${type}`,
    legalEntityToString: (entity: string) => `Entity ${entity}`,
    legalEntityToDescription: (entity: string) => (entity === 'AG' ? 'Organization with shareholders' : undefined),
  }),
}));

jest.mock('../hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), clearParams: jest.fn() };
jest.mock('../hooks/navigation.hook', () => ({ useNavigation: () => mockNavigation }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import KycScreen from '../screens/kyc.screen';

jest.setTimeout(30000);

const PROOF = new File(['proof'], 'register.pdf', { type: 'application/pdf' });
let activeStepName = 'ContactData';

function session(stepName: string, withStepSession = true) {
  const currentStep = {
    name: stepName,
    status: 'InProgress',
    ...(withStepSession ? { session: { url: 'step-url', type: 'Browser' } } : {}),
  };

  return {
    kycLevel: 0,
    language: { symbol: 'EN' },
    kycClients: [],
    kycSteps: [currentStep],
    currentStep,
  };
}

async function renderStep(
  stepName: string,
  { path = '/kyc', withStepSession = true }: { path?: string; withStepSession?: boolean } = {},
) {
  activeStepName = stepName;
  mockStartStep.mockResolvedValue(session(stepName, withStepSession));
  render(
    <MemoryRouter initialEntries={[`${path}?code=kyc-code&step=${stepName}`]}>
      <Routes>
        <Route path="/kyc" element={<KycScreen />} />
        <Route path="/contact" element={<KycScreen />} />
        <Route path="/profile" element={<KycScreen />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(mockStartStep).toHaveBeenCalled(), { timeout: 10000 });
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
}

async function typeField(name: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByTestId(name), { target: { value } });
    fireEvent.blur(screen.getByTestId(name));
  });
}

async function pick(name: string, index: number) {
  const option = await screen.findByTestId(`${name}-option-${index}`, undefined, { timeout: 10000 });
  await act(async () => {
    fireEvent.click(option);
  });
}

async function upload(name = 'file') {
  await act(async () => {
    fireEvent.change(screen.getByTestId(name), { target: { files: [PROOF] } });
  });
}

async function clickButton(label: string) {
  await screen.findByRole('button', { name: label }, { timeout: 10000 });
  await waitFor(() => expect(screen.getByRole('button', { name: label })).toBeEnabled(), { timeout: 10000 });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }));
  });
}

async function enterContactMail(mail = 'person@example.com') {
  await typeField('mail', mail);
  await clickButton('Next');
  expect(await screen.findByText(mail, undefined, { timeout: 10000 })).toBeInTheDocument();
}

async function fillPersonalData(organization = false) {
  await pick('accountType', organization ? 1 : 0);
  await screen.findByTestId('firstName', undefined, { timeout: 10000 });
  await typeField('firstName', 'D’Arcy');
  await typeField('lastName', 'O’Brien');
  await typeField('address.street', 'Main Street');
  await typeField('address.houseNumber', '3‘a');
  await typeField('address.zip', '8000');
  await typeField('address.city', 'Zürich');
  await pick('address.country', 1);
  await typeField('phone', '+41791234567');
  if (organization) {
    await typeField('organizationName', 'Example Organization');
    await typeField('organizationAddress.street', 'Business Road');
    await typeField('organizationAddress.houseNumber', '8’b');
    await typeField('organizationAddress.zip', '10115');
    await typeField('organizationAddress.city', 'Berlin');
    await pick('organizationAddress.country', 0);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  activeStepName = 'ContactData';
  mockSettings.nationalityCountries = [COUNTRY_CH, COUNTRY_DE];
  mockContinueKyc.mockImplementation(() => Promise.resolve(session(activeStepName)));
  mockGetKycInfo.mockImplementation(() => Promise.resolve(session(activeStepName)));
  mockSetContactData.mockResolvedValue({ status: 'InProgress' });
  mockSetPersonalData.mockResolvedValue(undefined);
  mockSetLegalEntityData.mockResolvedValue(undefined);
  mockSetNationalityData.mockResolvedValue(undefined);
  mockToBase64.mockResolvedValue('data:application/pdf;base64,cHJvb2Y=');
});

describe('KycScreen contact data', () => {
  it('shows the profile introduction and lets the user revise the email confirmation', async () => {
    await renderStep('ContactData', { path: '/contact' });
    expect(screen.getByTestId('user-data-icon')).toBeInTheDocument();
    expect(screen.getByText('Please fill in personal information to continue')).toBeInTheDocument();
    await enterContactMail();
    await clickButton('Change');
    expect(screen.getByTestId('mail')).toHaveValue('person@example.com');
    expect(mockSetContactData).not.toHaveBeenCalled();
  });

  it('returns without calling the API when the step has no session', async () => {
    await renderStep('ContactData', { withStepSession: false });
    expect(screen.queryByTestId('user-data-icon')).not.toBeInTheDocument();
    await enterContactMail();
    await clickButton('Confirm');
    expect(mockSetContactData).not.toHaveBeenCalled();
  });

  it('continues KYC after a completed contact response', async () => {
    mockSetContactData.mockResolvedValue({ status: 'Completed' });
    await renderStep('ContactData');
    await enterContactMail();
    await clickButton('Confirm');
    expect(mockSetContactData).toHaveBeenCalledWith('kyc-code', 'step-url', { mail: 'person@example.com' });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('kyc-code'), { timeout: 10000 });
  });

  it('opens the account-link explanation for a merge response', async () => {
    mockSetContactData.mockResolvedValue({ status: 'Failed', reason: 'AccountMergeRequested' });
    await renderStep('ContactData');
    await enterContactMail();
    await clickButton('Confirm');
    expect(await screen.findByText(/already have an account/, undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockContinueKyc).not.toHaveBeenCalled();
  });

  it('shows a failed response reason and lets the user return', async () => {
    mockSetContactData.mockResolvedValue({ status: 'Failed', reason: 'Email verification failed' });
    await renderStep('ContactData');
    await enterContactMail();
    await clickButton('Confirm');
    expect(await screen.findByText('Email verification failed', undefined, { timeout: 10000 })).toBeInTheDocument();
    await clickButton('Back');
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledWith('kyc-code'), { timeout: 10000 });
  });

  it('keeps the confirmation visible for a nonfailed response that is not complete', async () => {
    await renderStep('ContactData');
    await enterContactMail();
    await clickButton('Confirm');
    expect(await screen.findByRole('button', { name: 'Confirm' }, { timeout: 10000 })).toBeEnabled();
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
    expect(mockContinueKyc).not.toHaveBeenCalled();
  });
});

describe('KycScreen personal data', () => {
  it('submits normalized organization data and exercises both search matching outcomes', async () => {
    await renderStep('PersonalData');
    expect(screen.queryByTestId('firstName')).not.toBeInTheDocument();
    await fillPersonalData(true);
    expect(screen.getByTestId('address.country-filter-results')).toHaveTextContent('true,true,true,false');
    expect(screen.getByTestId('address.country-match-results')).toHaveTextContent('true,false,false');
    expect(screen.getByTestId('organizationAddress.country-filter-results')).toHaveTextContent('true,true,true,false');
    expect(screen.getByTestId('organizationAddress.country-match-results')).toHaveTextContent('true,false,false');
    await clickButton('Next');
    expect(mockSetPersonalData).toHaveBeenCalledWith('kyc-code', 'step-url', {
      accountType: 'Organization',
      firstName: "D'Arcy",
      lastName: "O'Brien",
      address: {
        street: 'Main Street',
        houseNumber: "3'a",
        zip: '8000',
        city: 'Zürich',
        country: COUNTRY_CH,
      },
      phone: '+41791234567',
      organizationName: 'Example Organization',
      organizationAddress: {
        street: 'Business Road',
        houseNumber: "8'b",
        zip: '10115',
        city: 'Berlin',
        country: COUNTRY_DE,
      },
    });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('kyc-code'), { timeout: 10000 });
  });

  it('returns to the profile flow after saving personal-only data', async () => {
    await renderStep('PersonalData', { path: '/profile' });
    await fillPersonalData();
    expect(screen.queryByTestId('organizationName')).not.toBeInTheDocument();
    await clickButton('Next');
    expect(mockSetPersonalData).toHaveBeenCalledWith(
      'kyc-code',
      'step-url',
      expect.objectContaining({
        accountType: 'Personal',
        organizationName: undefined,
        organizationAddress: expect.objectContaining({
          street: undefined,
          zip: undefined,
          city: undefined,
          country: undefined,
        }),
      }),
    );
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledWith('kyc-code'), { timeout: 10000 });
    expect(mockContinueKyc).not.toHaveBeenCalled();
  });

  it('returns without calling the API when the step has no session', async () => {
    await renderStep('PersonalData', { withStepSession: false });
    await fillPersonalData();
    await clickButton('Next');
    expect(mockSetPersonalData).not.toHaveBeenCalled();
  });

  it.each([
    [{ message: 'Personal data failed' }, 'Personal data failed'],
    [{}, 'Unknown error'],
  ])('shows the API error fallback for %j', async (apiError, expectedMessage) => {
    mockSetPersonalData.mockRejectedValue(apiError);
    await renderStep('PersonalData');
    await fillPersonalData();
    await clickButton('Next');
    expect(await screen.findByText(expectedMessage, undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockSetPersonalData).toHaveBeenCalledWith(
      'kyc-code',
      'step-url',
      expect.objectContaining({ accountType: 'Personal' }),
    );
  });
});

describe('KycScreen legal entity data', () => {
  it('renders labels and both present and absent entity descriptions', async () => {
    await renderStep('LegalEntity');
    expect(screen.getByTestId('legalEntity-option-0')).toHaveTextContent('Entity AG');
    expect(screen.getByTestId('legalEntity-option-0')).toHaveAttribute(
      'data-description',
      'Organization with shareholders',
    );
    expect(screen.getByTestId('legalEntity-option-1')).toHaveTextContent('Entity Other');
    expect(screen.getByTestId('legalEntity-option-1')).toHaveAttribute('data-description', '');
  });

  it('reports a missing file without attempting conversion', async () => {
    await renderStep('LegalEntity');
    await pick('legalEntity', 0);
    await clickButton('Next');
    expect(await screen.findByText('No file selected', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockToBase64).not.toHaveBeenCalled();
    expect(mockSetLegalEntityData).not.toHaveBeenCalled();
  });

  it('reports an empty file conversion result', async () => {
    mockToBase64.mockResolvedValue(undefined);
    await renderStep('LegalEntity');
    await pick('legalEntity', 0);
    await upload();
    await clickButton('Next');
    expect(await screen.findByText('No file selected', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockToBase64).toHaveBeenCalledWith(PROOF);
    expect(mockSetLegalEntityData).not.toHaveBeenCalled();
  });

  it('returns without converting the file when the step has no session', async () => {
    await renderStep('LegalEntity', { withStepSession: false });
    await pick('legalEntity', 0);
    await upload();
    await clickButton('Next');
    expect(mockToBase64).not.toHaveBeenCalled();
    expect(mockSetLegalEntityData).not.toHaveBeenCalled();
  });

  it('uploads the selected entity evidence and continues KYC', async () => {
    await renderStep('LegalEntity');
    await pick('legalEntity', 0);
    await upload();
    await clickButton('Next');
    expect(mockSetLegalEntityData).toHaveBeenCalledWith('kyc-code', 'step-url', {
      legalEntity: 'AG',
      file: 'data:application/pdf;base64,cHJvb2Y=',
      fileName: 'register.pdf',
    });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('kyc-code'), { timeout: 10000 });
  });

  it.each([
    [{ message: 'Legal entity failed' }, 'Legal entity failed'],
    [{}, 'Unknown error'],
  ])('shows the upload API error fallback for %j', async (apiError, expectedMessage) => {
    mockSetLegalEntityData.mockRejectedValue(apiError);
    await renderStep('LegalEntity');
    await pick('legalEntity', 1);
    await upload();
    await clickButton('Next');
    expect(await screen.findByText(expectedMessage, undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockSetLegalEntityData).toHaveBeenCalledWith(
      'kyc-code',
      'step-url',
      expect.objectContaining({ legalEntity: 'Other', fileName: 'register.pdf' }),
    );
  });
});

describe('KycScreen nationality data', () => {
  it('uses an empty list when nationality countries are unavailable', async () => {
    mockSettings.nationalityCountries = undefined;
    await renderStep('NationalityData');
    expect(screen.queryByTestId('nationality-option-0')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('submits the nationality and exercises every search and match result', async () => {
    await renderStep('NationalityData');
    expect(screen.getByTestId('nationality-filter-results')).toHaveTextContent('true,true,true,false');
    expect(screen.getByTestId('nationality-match-results')).toHaveTextContent('true,false,false');
    await pick('nationality', 0);
    await clickButton('Next');
    expect(mockSetNationalityData).toHaveBeenCalledWith('kyc-code', 'step-url', { nationality: COUNTRY_CH });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('kyc-code'), { timeout: 10000 });
  });

  it('returns without calling the API when the step has no session', async () => {
    await renderStep('NationalityData', { withStepSession: false });
    await pick('nationality', 1);
    await clickButton('Next');
    expect(mockSetNationalityData).not.toHaveBeenCalled();
  });

  it.each([
    [{ message: 'Nationality failed' }, 'Nationality failed'],
    [{}, 'Unknown error'],
  ])('shows the nationality API error fallback for %j', async (apiError, expectedMessage) => {
    mockSetNationalityData.mockRejectedValue(apiError);
    await renderStep('NationalityData');
    await pick('nationality', 1);
    await clickButton('Next');
    expect(await screen.findByText(expectedMessage, undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockSetNationalityData).toHaveBeenCalledWith('kyc-code', 'step-url', { nationality: COUNTRY_DE });
  });
});
