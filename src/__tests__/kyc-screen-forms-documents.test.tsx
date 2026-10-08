jest.setTimeout(30000);

const mockStartStep = jest.fn();
const mockContinueKyc = jest.fn();
const mockSetRecommendationData = jest.fn();
const mockSetFileData = jest.fn();
const mockSetSignatoryPowerData = jest.fn();
const mockSetBeneficialData = jest.fn();
const mockToBase64 = jest.fn();
const mockWindowOpen = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  AccountType: { PERSONAL: 'Personal', ORGANIZATION: 'Organization' },
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
    SUMSUB_VIDEO: 'SumsubVideo',
    SUMSUB_AUTO: 'SumsubAuto',
    MANUAL: 'Manual',
  },
  KycStepCancelable: [],
  KycStepReason: { ACCOUNT_MERGE_REQUESTED: 'AccountMergeRequested' },
  SignatoryPower: { SINGLE: 'Single', DOUBLE: 'Double', NONE: 'None' },
  UrlType: { BROWSER: 'Browser' },
  isStepDone: () => false,
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
      return {};
    },
    Custom: (validator: (value: any) => true | string) => ({ validate: validator }),
  },
  useKyc: () => ({
    getKycInfo: jest.fn(),
    continueKyc: mockContinueKyc,
    startStep: mockStartStep,
    addTransferClient: jest.fn(),
    cancelStep: jest.fn(),
    setRecommendationData: mockSetRecommendationData,
    setFileData: mockSetFileData,
    setSignatoryPowerData: mockSetSignatoryPowerData,
    setBeneficialData: mockSetBeneficialData,
  }),
  useUserContext: () => ({ user: undefined, reloadUser: jest.fn() }),
  useSessionContext: () => ({ logout: jest.fn() }),
}));

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

  const Form = ({ children, ...form }: any) => React.createElement('form', null, enrich(children, form));

  const field = (render: (field: any) => any) =>
    function Field({ control, name, rules, error, translate, ...props }: any) {
      return React.createElement(Controller, {
        control,
        name,
        rules,
        render: ({ field: controllerField }: any) =>
          React.createElement(
            'div',
            null,
            render({ ...controllerField, ...props, name, rules }),
            error ? React.createElement('p', null, translate(error.message)) : null,
          ),
      });
    };

  const StyledInput = field(({ name, value, onChange, onBlur, forceErrorMessage }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement('input', {
        'data-testid': name,
        value: value ?? '',
        onBlur,
        onChange: (event: any) => onChange(event.target.value),
      }),
      forceErrorMessage ? React.createElement('p', { 'data-testid': `${name}-forced-error` }, forceErrorMessage) : null,
    ),
  );

  const StyledFileUpload = field(({ name, onChange, onBlur, rules }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement('input', {
        'data-testid': name,
        type: 'file',
        onBlur,
        onChange: (event: any) => onChange(event.target.files[0]),
      }),
      React.createElement(
        'output',
        { 'data-testid': `${name}-validation-callbacks` },
        JSON.stringify([
          rules.validate(undefined),
          rules.validate({ type: 'application/pdf' }),
          rules.validate({ type: 'text/plain' }),
        ]),
      ),
    ),
  );

  const dropdown = (search: boolean) =>
    field(({ name, onChange, onBlur, items = [], labelFunc, filterFunc, matchFunc, rules }) => {
      const first = items[0];
      const callbackResults =
        search && first
          ? [
              filterFunc(first, ''),
              filterFunc(first, first.name),
              filterFunc(first, first.symbol),
              filterFunc(first, 'not-found'),
              matchFunc(first, undefined),
              matchFunc(first, first.name.toLowerCase()),
              matchFunc(first, 'not-found'),
            ]
          : undefined;

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
              onClick: () => {
                onChange(item);
                onBlur();
              },
            },
            labelFunc(item),
          ),
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': `${name}-clear`,
            onClick: () => {
              onChange(undefined);
              onBlur();
            },
          },
          `Clear ${name}`,
        ),
        callbackResults
          ? React.createElement(
              'output',
              { 'data-testid': `${name}-search-callbacks` },
              JSON.stringify(callbackResults),
            )
          : null,
        rules?.validate
          ? React.createElement(
              'output',
              { 'data-testid': `${name}-validation-callbacks` },
              JSON.stringify([rules.validate(undefined), rules.validate(false)]),
            )
          : null,
      );
    });

  const StyledDropdown = dropdown(false);
  const StyledSearchDropdown = dropdown(true);
  const StyledButton = ({ label, onClick, disabled, isLoading }: any) =>
    React.createElement('button', { type: 'button', onClick, disabled: disabled || isLoading }, label);
  const Stack = ({ children }: any) => React.createElement('div', null, children);

  return {
    DfxIcon: () => null,
    Form,
    StyledInput,
    StyledFileUpload,
    StyledDropdown,
    StyledSearchDropdown,
    StyledDropdownMultiChoice: StyledDropdown,
    StyledCheckboxRow: StyledInput,
    StyledButton,
    StyledIconButton: StyledButton,
    StyledLink: ({ children }: any) => React.createElement('a', null, children),
    StyledCollapsible: ({ titleContent, children }: any) =>
      React.createElement('section', null, titleContent, children),
    StyledVerticalStack: Stack,
    StyledHorizontalStack: Stack,
    StyledLoadingSpinner: () => React.createElement('div', { 'data-testid': 'loading-spinner' }),
    SpinnerSize: { LG: 'lg' },
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white', GRAY_OUTLINE: 'gray-outline' },
    StyledButtonWidth: { FULL: 'full', MIN: 'min' },
    IconColor: {},
    IconSize: {},
    IconVariant: {},
  };
});

jest.mock('@sumsub/websdk-react', () => () => null);

jest.mock('../components/error-hint', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return { ErrorHint: ({ message }: { message: string }) => React.createElement('p', null, message) };
});

jest.mock('../util/utils', () => ({
  delay: () => Promise.resolve(),
  toBase64: (...args: unknown[]) => mockToBase64(...args),
  url: ({ path }: { path: string }) => path,
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

const mockSettings: any = {
  translate: (_namespace: string, text: string, params?: Record<string, unknown>) =>
    Object.entries(params ?? {}).reduce(
      (translated, [key, value]) => translated.replace(`{{${key}}}`, String(value)),
      text,
    ),
  translateError: (key: string) => `error:${key}`,
  changeLanguage: jest.fn(),
  processingKycData: false,
  language: { symbol: 'EN' },
  allowedCountries: [COUNTRY_CH, COUNTRY_DE],
  allowedOrganizationCountries: [COUNTRY_CH, COUNTRY_DE],
};

jest.mock('../contexts/settings.context', () => ({ useSettingsContext: () => mockSettings }));

jest.mock('../components/kyc-status', () => ({ KycStatusTable: () => null }));
jest.mock('../hooks/geo-location.hook', () => ({ useGeoLocation: () => ({ countryCode: 'CH' }) }));
jest.mock('../hooks/guard.hook', () => ({ useUserGuard: () => undefined }));
jest.mock('../hooks/kyc-helper.hook', () => ({
  useKycHelper: () => ({
    nameToString: (name: string) => `Step ${name}`,
    accountTypeToString: (type: string) => type,
    signatoryPowerToString: (power: string) => `Power ${power}`,
  }),
}));
jest.mock('../hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), clearParams: jest.fn() };
jest.mock('../hooks/navigation.hook', () => ({ useNavigation: () => mockNavigation }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import KycScreen from '../screens/kyc.screen';

function controlledSuccess() {
  let finalizer = () => undefined;
  const chain: any = {
    then: (callback: () => unknown) => {
      callback();
      return chain;
    },
    catch: () => chain,
    finally: (callback: () => void) => {
      finalizer = callback;
      return chain;
    },
  };
  return { chain, finish: () => finalizer() };
}

function kycSession(stepName: string, stepSession: any = { url: 'step-url', type: 'Browser' }) {
  return {
    kycLevel: 0,
    language: { symbol: 'EN' },
    kycClients: [],
    kycSteps: [],
    currentStep: { name: stepName, status: 'InProgress', type: 'Auto', session: stepSession },
  };
}

async function renderStep(stepName: string, stepSession?: any) {
  const session = kycSession(stepName, stepSession);
  mockStartStep.mockResolvedValue(session);
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
  await waitFor(() => expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument(), {
    timeout: 10000,
  });
  // Let the pending session reload settle so the step form is not re-created after the test starts typing.
  for (let tick = 0; tick < 3; tick++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return session;
}

async function typeField(name: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByTestId(name), { target: { value } });
    fireEvent.blur(screen.getByTestId(name));
  });
}

async function upload(file?: File) {
  await act(async () => {
    fireEvent.change(screen.getByTestId('file'), { target: { files: file ? [file] : [] } });
    fireEvent.blur(screen.getByTestId('file'));
  });
}

async function pick(name: string, index: number) {
  await act(async () => {
    fireEvent.click(screen.getByTestId(`${name}-option-${index}`));
  });
}

async function clickNext() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled(), { timeout: 10000 });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  });
}

async function clickNextAndFlushReload() {
  await clickNext();
  await act(async () => {
    await Promise.resolve();
    jest.runOnlyPendingTimers();
  });
}

async function clickBackAndFlushReload() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await Promise.resolve();
    jest.runOnlyPendingTimers();
  });
}

async function fillContact(prefix: string, suffix: string, countryIndex = 0) {
  await typeField(`${prefix}.firstName`, `First${suffix}`);
  await typeField(`${prefix}.lastName`, `Last${suffix}`);
  await typeField(`${prefix}.street`, `Main ’Street${suffix}`);
  await typeField(`${prefix}.houseNumber`, `1‘${suffix}`);
  await typeField(`${prefix}.zip`, `800${suffix}`);
  await typeField(`${prefix}.city`, `Zürich${suffix}`);
  await pick(`${prefix}.country`, countryIndex);
}

const PDF = new File(['%PDF'], 'document.pdf', { type: 'application/pdf' });
const TEXT = new File(['text'], 'document.txt', { type: 'text/plain' });
const SOLE_PROPRIETORSHIP_HINT = [
  'Commercial register extract, trade license/permit, AHV confirmation, or another document proving',
  'the existence of the business',
].join(' ');
const pendingKyc = new Promise(() => undefined);

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.language = { symbol: 'EN' };
  mockToBase64.mockResolvedValue('base64-pdf');
  mockContinueKyc.mockReturnValue(pendingKyc);
  mockSetRecommendationData.mockResolvedValue(undefined);
  mockSetFileData.mockResolvedValue(undefined);
  mockSetSignatoryPowerData.mockResolvedValue(undefined);
  mockSetBeneficialData.mockResolvedValue(undefined);
  Object.defineProperty(window, 'open', { configurable: true, writable: true, value: mockWindowOpen });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('KycScreen recommendation data', () => {
  it('submits a recommendation and enters the continuing state', async () => {
    const request = controlledSuccess();
    mockSetRecommendationData.mockReturnValue(request.chain);
    await renderStep('Recommendation');

    expect(await screen.findByText('FAQ')).toBeInTheDocument();
    expect(screen.getByText('How can I become a DFX customer?')).toBeInTheDocument();
    await typeField('key', 'referral-key');
    await clickNext();

    expect(mockSetRecommendationData).toHaveBeenCalledWith('TESTCODE', 'step-url', { key: 'referral-key' });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
    await act(async () => request.finish());
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it.each([
    [{ statusCode: 404, message: 'missing' }, 'No matching user found'],
    [{ statusCode: 400, message: 'Recommendation code is invalid' }, 'Invalid invitation code'],
    [{ statusCode: 400, message: 'Email is invalid' }, 'Invalid key'],
    [{ statusCode: 500, message: 'Service unavailable' }, 'Service unavailable'],
    [{ statusCode: 500 }, 'Unknown error'],
  ])('shows the mapped recommendation error for %o', async (rejection, expected) => {
    mockSetRecommendationData.mockRejectedValue(rejection);
    await renderStep('Recommendation');

    await typeField('key', 'invalid-key');
    await clickNext();

    expect(await screen.findByText(expected, undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('does not submit without a step session', async () => {
    await renderStep('Recommendation', null);

    await typeField('key', 'referral-key');
    await clickNext();

    expect(mockSetRecommendationData).not.toHaveBeenCalled();
    expect(screen.getByText('How did you hear about DFX?')).toBeInTheDocument();
  });
});

describe('KycScreen file upload', () => {
  it('uploads a supported document, opens the language template and continues', async () => {
    const request = controlledSuccess();
    mockSetFileData.mockReturnValue(request.chain);
    await renderStep('OwnerDirectory');

    fireEvent.click(screen.getByRole('button', { name: 'Document template' }));
    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://docs.google.com/document/d/1ICxt-RZihMyiz486NMS4gEJZdgrZG_LVTuDiLMbzyC0/edit',
      '_blank',
    );

    await upload(PDF);
    await clickNext();

    expect(mockToBase64).toHaveBeenCalledWith(PDF);
    expect(mockSetFileData).toHaveBeenCalledWith('TESTCODE', 'step-url', {
      file: 'base64-pdf',
      fileName: 'document.pdf',
    });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
    await act(async () => request.finish());
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('uses the English authority template when the active language has no template', async () => {
    mockSettings.language = { symbol: 'IT' };
    await renderStep('Authority');

    fireEvent.click(screen.getByRole('button', { name: 'Document template' }));

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://docs.google.com/document/d/1PKk0XvX6v7wdcO-bjCVJXj56uuIlDToca6Zpzff_t6g/edit',
      '_blank',
    );
  });

  it('shows the proof hint without a document template', async () => {
    await renderStep('SoleProprietorshipConfirmation');

    expect(screen.getByText(SOLE_PROPRIETORSHIP_HINT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Document template' })).not.toBeInTheDocument();
  });

  it('does not show a template when the settings language is unavailable', async () => {
    mockSettings.language = undefined;
    await renderStep('OwnerDirectory');

    expect(screen.queryByRole('button', { name: 'Document template' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Commercial register extract/)).not.toBeInTheDocument();
  });

  it('does not show optional document guidance for a plain upload step', async () => {
    await renderStep('AdditionalDocuments');

    expect(screen.getByText('Step AdditionalDocuments')).toBeInTheDocument();
    expect(screen.getByTestId('file-validation-callbacks')).toHaveTextContent('[true,true,"file_type"]');
    expect(screen.queryByRole('button', { name: 'Document template' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Commercial register extract/)).not.toBeInTheDocument();
  });

  it('reports an empty selection without converting or uploading a file', async () => {
    await renderStep('AdditionalDocuments');

    await clickNext();

    expect(await screen.findByText('No file selected', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockToBase64).not.toHaveBeenCalled();
    expect(mockSetFileData).not.toHaveBeenCalled();
  });

  it('reports a conversion that produces no data', async () => {
    mockToBase64.mockResolvedValue(undefined);
    await renderStep('AdditionalDocuments');

    await upload(PDF);
    await clickNext();

    expect(await screen.findByText('No file selected', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockSetFileData).not.toHaveBeenCalled();
  });

  it('rejects an unsupported file type through the form validation callback', async () => {
    await renderStep('AdditionalDocuments');

    await upload(TEXT);

    expect(await screen.findByText('error:file_type', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it.each([
    [{ message: 'Upload failed' }, 'Upload failed'],
    [{}, 'Unknown error'],
  ])('shows the upload API error for %o and resets the form', async (rejection, expected) => {
    mockSetFileData.mockRejectedValue(rejection);
    await renderStep('AdditionalDocuments');

    await upload(PDF);
    await clickNext();

    expect(await screen.findByText(expected, undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockSetFileData).toHaveBeenCalledWith('TESTCODE', 'step-url', {
      file: 'base64-pdf',
      fileName: 'document.pdf',
    });
  });

  it('does not convert or upload a document without a step session', async () => {
    await renderStep('AdditionalDocuments', null);

    await upload(PDF);
    await clickNext();

    expect(mockToBase64).not.toHaveBeenCalled();
    expect(mockSetFileData).not.toHaveBeenCalled();
  });
});

describe('KycScreen signatory power data', () => {
  it('renders both translated powers, submits one and continues', async () => {
    const request = controlledSuccess();
    mockSetSignatoryPowerData.mockReturnValue(request.chain);
    await renderStep('SignatoryPower');

    expect(screen.getByRole('button', { name: 'Power Single' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Power Double' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Power None' })).toBeInTheDocument();
    await pick('signatoryPower', 1);
    await clickNext();

    expect(mockSetSignatoryPowerData).toHaveBeenCalledWith('TESTCODE', 'step-url', {
      signatoryPower: 'Double',
    });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
    await act(async () => request.finish());
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it.each([
    [{ message: 'Power update failed' }, 'Power update failed'],
    [{}, 'Unknown error'],
  ])('shows the signatory API error for %o', async (rejection, expected) => {
    mockSetSignatoryPowerData.mockRejectedValue(rejection);
    await renderStep('SignatoryPower');

    await pick('signatoryPower', 0);
    await clickNext();

    expect(await screen.findByText(expected, undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('does not submit a power without a step session', async () => {
    await renderStep('SignatoryPower', null);

    await pick('signatoryPower', 0);
    await clickNext();

    expect(mockSetSignatoryPowerData).not.toHaveBeenCalled();
  });
});

describe('KycScreen beneficial owner data', () => {
  it('submits a normalized managing director and continues', async () => {
    const request = controlledSuccess();
    mockSetBeneficialData.mockReturnValue(request.chain);
    await renderStep('BeneficialOwner', {
      url: 'step-url',
      type: 'Browser',
      additionalInfo: { accountHolder: 'Account Holder' },
    });
    jest.useFakeTimers();

    await pick('ownerCount', 0);
    await clickNextAndFlushReload();
    expect(screen.getByText('Is the account holder (Account Holder) the managing director?')).toBeInTheDocument();
    await pick('isAccountHolderInvolved', 1);
    await clickNextAndFlushReload();
    expect(screen.getByText('Managing director')).toBeInTheDocument();
    expect(screen.getByTestId('director.country-search-callbacks')).toHaveTextContent(
      '[true,true,true,false,false,true,false]',
    );

    await fillContact('director', '0', 1);
    await clickNext();

    expect(mockSetBeneficialData).toHaveBeenCalledWith('TESTCODE', 'step-url', {
      hasBeneficialOwners: false,
      isAccountHolderInvolved: false,
      beneficialOwners: undefined,
      managingDirector: {
        firstName: 'First0',
        lastName: 'Last0',
        street: "Main 'Street0",
        houseNumber: "1'0",
        zip: '8000',
        city: 'Zürich0',
        country: COUNTRY_DE,
      },
    });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
    await act(async () => request.finish());
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('collects multiple normalized owners and shows a service error', async () => {
    mockSetBeneficialData.mockRejectedValue({ message: 'Owner update failed' });
    await renderStep('BeneficialOwner', { url: 'step-url', type: 'Browser', additionalInfo: {} });
    jest.useFakeTimers();

    await pick('ownerCount', 2);
    await clickNextAndFlushReload();
    expect(screen.getByText('Is the account holder a beneficial owner?')).toBeInTheDocument();
    await pick('isAccountHolderInvolved', 1);
    await clickNextAndFlushReload();
    expect(screen.getByText('Beneficial owner 1/2')).toBeInTheDocument();

    await fillContact('owners.0', '0');
    await clickNextAndFlushReload();
    expect(screen.getByText('Beneficial owner 2/2')).toBeInTheDocument();
    await fillContact('owners.1', '1', 1);
    await clickNext();

    expect(mockSetBeneficialData).toHaveBeenCalledWith('TESTCODE', 'step-url', {
      hasBeneficialOwners: true,
      isAccountHolderInvolved: false,
      beneficialOwners: [
        {
          firstName: 'First0',
          lastName: 'Last0',
          street: "Main 'Street0",
          houseNumber: "1'0",
          zip: '8000',
          city: 'Zürich0',
          country: COUNTRY_CH,
        },
        {
          firstName: 'First1',
          lastName: 'Last1',
          street: "Main 'Street1",
          houseNumber: "1'1",
          zip: '8001',
          city: 'Zürich1',
          country: COUNTRY_DE,
        },
      ],
      managingDirector: undefined,
    });
    expect(await screen.findByText('Owner update failed', undefined, { timeout: 10000 })).toBeInTheDocument();
  });

  it('submits directly when the sole owner is the account holder and shows the fallback error', async () => {
    mockSetBeneficialData.mockRejectedValue({});
    await renderStep('BeneficialOwner');
    jest.useFakeTimers();

    await pick('ownerCount', 1);
    await clickNextAndFlushReload();
    await pick('isAccountHolderInvolved', 0);
    await clickNext();

    expect(mockSetBeneficialData).toHaveBeenCalledWith('TESTCODE', 'step-url', {
      hasBeneficialOwners: true,
      isAccountHolderInvolved: true,
      beneficialOwners: undefined,
      managingDirector: undefined,
    });
    expect(await screen.findByText('Unknown error', undefined, { timeout: 10000 })).toBeInTheDocument();
  });

  it('submits directly when the account holder is the managing director', async () => {
    mockSetBeneficialData.mockRejectedValue({ message: 'Director update failed' });
    await renderStep('BeneficialOwner');
    jest.useFakeTimers();

    await pick('ownerCount', 0);
    await clickNextAndFlushReload();
    await pick('isAccountHolderInvolved', 0);
    await clickNext();

    expect(mockSetBeneficialData).toHaveBeenCalledWith('TESTCODE', 'step-url', {
      hasBeneficialOwners: false,
      isAccountHolderInvolved: true,
      beneficialOwners: undefined,
      managingDirector: undefined,
    });
    expect(await screen.findByText('Director update failed', undefined, { timeout: 10000 })).toBeInTheDocument();
  });

  it('validates an empty involvement choice and displays the single-owner label without a fraction', async () => {
    await renderStep('BeneficialOwner');
    jest.useFakeTimers();

    await pick('ownerCount', 1);
    await clickNextAndFlushReload();
    expect(screen.getByTestId('isAccountHolderInvolved-validation-callbacks')).toHaveTextContent('["required",true]');
    await act(async () => {
      fireEvent.click(screen.getByTestId('isAccountHolderInvolved-clear'));
    });
    expect(await screen.findByText('error:required', undefined, { timeout: 10000 })).toBeInTheDocument();

    await pick('isAccountHolderInvolved', 1);
    await clickNextAndFlushReload();
    expect(screen.getByText('Beneficial owner')).toBeInTheDocument();
  });

  it('moves backward from the second owner through every previous substep', async () => {
    await renderStep('BeneficialOwner');
    jest.useFakeTimers();

    await pick('ownerCount', 2);
    await clickNextAndFlushReload();
    await pick('isAccountHolderInvolved', 1);
    await clickNextAndFlushReload();
    await clickNextAndFlushReload();
    expect(screen.getByText('Beneficial owner 2/2')).toBeInTheDocument();

    await clickBackAndFlushReload();
    expect(screen.getByText('Beneficial owner 1/2')).toBeInTheDocument();
    await clickBackAndFlushReload();
    expect(screen.getByText('Is the account holder a beneficial owner?')).toBeInTheDocument();
    await clickBackAndFlushReload();
    expect(
      screen.getByText(
        'How many natural persons are there who directly or indirectly hold 25% or more of company shares?',
      ),
    ).toBeInTheDocument();
  });

  it('uses the involved holder in the owner number and reaches the remaining contact', async () => {
    await renderStep('BeneficialOwner');
    jest.useFakeTimers();

    await pick('ownerCount', 2);
    await clickNextAndFlushReload();
    await pick('isAccountHolderInvolved', 0);
    await clickNextAndFlushReload();

    expect(screen.getByText('Beneficial owner 2/2')).toBeInTheDocument();
  });

  it('honors the missing-session guard after the owner-count substep', async () => {
    const session = await renderStep('BeneficialOwner');
    jest.useFakeTimers();

    await pick('ownerCount', 1);
    const button = screen.getByRole('button', { name: 'Next' });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    session.currentStep.session = undefined;
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.getByText('Is the account holder a beneficial owner?')).toBeInTheDocument();

    await pick('isAccountHolderInvolved', 1);
    await clickNext();
    expect(mockSetBeneficialData).not.toHaveBeenCalled();
  });
});
