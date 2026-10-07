import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import KycScreen from '../screens/kyc.screen';

jest.setTimeout(30000);

const mockGetKycInfo = jest.fn();
const mockContinueKyc = jest.fn();
const mockStartStep = jest.fn();
const mockAddTransferClient = jest.fn();
const mockCancelStep = jest.fn();
const mockReloadUser = jest.fn();
const mockLogout = jest.fn();
const mockIsStepDone = jest.fn();
const mockDelay = jest.fn();
const mockGuard = jest.fn();
const mockLayout = jest.fn();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockClearParams = jest.fn();

const mockKyc = {
  getKycInfo: mockGetKycInfo,
  continueKyc: mockContinueKyc,
  startStep: mockStartStep,
  addTransferClient: mockAddTransferClient,
  cancelStep: mockCancelStep,
  getFinancialData: jest.fn(),
  setFinancialData: jest.fn(),
  setContactData: jest.fn(),
  setPersonalData: jest.fn(),
  setLegalEntityData: jest.fn(),
  setNationalityData: jest.fn(),
  setRecommendationData: jest.fn(),
  setFileData: jest.fn(),
  setSignatoryPowerData: jest.fn(),
  setBeneficialData: jest.fn(),
  setOperationalData: jest.fn(),
  setManualIdentData: jest.fn(),
  setPhoneChangeData: jest.fn(),
  setAddressChangeData: jest.fn(),
  setNameChangeData: jest.fn(),
  setPaymentData: jest.fn(),
  setRecallData: jest.fn(),
};

const mockUser: { user?: { kyc: { hash: string } }; reloadUser: jest.Mock } = {
  user: undefined,
  reloadUser: mockReloadUser,
};
const mockApp: {
  isInitialized: boolean;
  isWidget: boolean;
  params: { autoStart?: string };
  setParams: jest.Mock;
} = { isInitialized: true, isWidget: false, params: {}, setParams: jest.fn() };
const mockParams: { lang?: string } = { lang: 'EN' };
const mockDevice = { isMobile: false };
const mockNav = { navigate: mockNavigate, goBack: mockGoBack, clearParams: mockClearParams };
const COUNTRY = { id: 1, symbol: 'CH', name: 'Switzerland' };
const mockSettings = {
  translate: (_namespace: string, text: string, values?: Record<string, string>) =>
    values ? Object.entries(values).reduce((result, [key, value]) => result.replace(`{{${key}}}`, value), text) : text,
  translateError: (key: string) => key,
  changeLanguage: jest.fn(),
  processingKycData: false,
  language: { symbol: 'EN' },
  allowedCountries: [COUNTRY],
  allowedOrganizationCountries: [COUNTRY],
  nationalityCountries: [COUNTRY],
};

jest.mock('@dfx.swiss/react', () => ({
  AccountType: { PERSONAL: 'Personal', ORGANIZATION: 'Organization' },
  DocumentType: { ID: 'Id' },
  GenderType: { FEMALE: 'Female' },
  GoodsCategory: { OTHER: 'Other' },
  GoodsType: { SERVICE: 'Service' },
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
  KycStepStatus: {
    NOT_STARTED: 'NotStarted',
    IN_PROGRESS: 'InProgress',
    FAILED: 'Failed',
    COMPLETED: 'Completed',
  },
  KycStepType: {
    VIDEO: 'Video',
    AUTO: 'Auto',
    SUMSUB_VIDEO: 'SumsubVideo',
    SUMSUB_AUTO: 'SumsubAuto',
    MANUAL: 'Manual',
  },
  KycStepCancelable: ['PhoneChange'],
  KycStepReason: { ACCOUNT_MERGE_REQUESTED: 'AccountMergeRequested' },
  LegalEntity: { AG: 'AG' },
  MerchantCategory: { OTHER: 'Other' },
  QuestionType: { CONFIRMATION: 'Confirmation', SINGLE_CHOICE: 'Single', MULTIPLE_CHOICE: 'Multiple' },
  SignatoryPower: { SOLE: 'Sole' },
  StoreType: { ONLINE: 'Online' },
  SupportIssueType: { NOTIFICATION_OF_CHANGES: 'NotificationOfChanges' },
  UrlType: { BROWSER: 'Browser', TOKEN: 'Token' },
  Utils: { createRules: (rules: Record<string, unknown>) => rules },
  Validations: { Required: {}, Phone: {}, Mail: {}, Custom: (validator: unknown) => ({ validate: validator }) },
  isStepDone: (...args: unknown[]) => mockIsStepDone(...args),
  useKyc: () => mockKyc,
  useSessionContext: () => ({ logout: mockLogout }),
  useUserContext: () => mockUser,
}));

jest.mock('@dfx.swiss/react-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const Stack = ({ children }: any) => React.createElement('div', null, children);
  const Field = ({ name }: any) => React.createElement('div', { 'data-testid': `field-${name}` });
  return {
    DfxIcon: () => React.createElement('span'),
    Form: ({ children, onSubmit }: any) => React.createElement('form', { onSubmit }, children),
    IconColor: { BLUE: 'blue' },
    IconSize: { XL: 'xl' },
    IconVariant: { USER_DATA: 'user', CHEV_LEFT: 'left' },
    SpinnerSize: { LG: 'lg' },
    StyledButton: ({ label, onClick, disabled }: any) =>
      React.createElement('button', { type: 'button', onClick, disabled: Boolean(disabled) }, label),
    StyledButtonColor: { STURDY_WHITE: 'white', GRAY_OUTLINE: 'gray' },
    StyledButtonWidth: { FULL: 'full', MIN: 'min' },
    StyledCheckboxRow: ({ children, onChange }: any) =>
      React.createElement('button', { type: 'button', onClick: () => onChange(true) }, children),
    StyledCollapsible: ({ children, titleContent }: any) => React.createElement('div', null, titleContent, children),
    StyledDropdown: Field,
    StyledDropdownMultiChoice: Field,
    StyledFileUpload: Field,
    StyledHorizontalStack: Stack,
    StyledIconButton: ({ onClick }: any) => React.createElement('button', { type: 'button', onClick }),
    StyledInput: Field,
    StyledLink: ({ label, onClick, url }: any) => React.createElement('a', { href: url, onClick }, label),
    StyledLoadingSpinner: () => React.createElement('div', { 'data-testid': 'loading-spinner' }),
    StyledSearchDropdown: Field,
    StyledVerticalStack: Stack,
  };
});

jest.mock('@sumsub/websdk-react', () => () => <div data-testid="sumsub-sdk" />);
jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockDevice.isMobile;
  },
}));
jest.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    handleSubmit: (submit: (data: any) => void) => () => submit({}),
    getValues: () => ({}),
    reset: jest.fn(),
    resetField: jest.fn(),
    setValue: jest.fn(),
    formState: { isValid: false, isDirty: false, errors: {} },
  }),
  useWatch: () => undefined,
}));
jest.mock('react-i18next', () => ({ Trans: ({ children }: any) => children }));
jest.mock('react-icons/fa', () => ({ FaHandshake: () => <span /> }));
jest.mock('src/contexts/app-handling.context', () => ({ useAppHandlingContext: () => mockApp }));
jest.mock('src/contexts/layout.context', () => ({ useLayoutContext: () => ({ rootRef: { current: null } }) }));
jest.mock('src/hooks/app-params.hook', () => ({ useAppParams: () => mockParams }));
jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message, onBack }: any) => (
    <div>
      <span data-testid="error-hint">{message}</span>
      {onBack && <button onClick={onBack}>Error back</button>}
    </div>
  ),
}));
jest.mock('../components/kyc-status', () => ({
  KycStatusTable: ({ onLimitIncrease }: any) => (
    <div data-testid="kyc-status" data-has-limit-increase={Boolean(onLimitIncrease)}>
      {onLimitIncrease && <button onClick={onLimitIncrease}>Increase limit</button>}
    </div>
  ),
}));
jest.mock('../contexts/settings.context', () => ({ useSettingsContext: () => mockSettings }));
jest.mock('../hooks/geo-location.hook', () => ({ useGeoLocation: () => ({ countryCode: 'CH' }) }));
jest.mock('../hooks/guard.hook', () => ({ useUserGuard: (...args: unknown[]) => mockGuard(...args) }));
jest.mock('../hooks/kyc-helper.hook', () => ({
  useKycHelper: () => ({
    nameToString: (value: string) => `step:${value}`,
    accountTypeToString: (value: string) => value,
    legalEntityToString: (value: string) => value,
    legalEntityToDescription: () => undefined,
    signatoryPowerToString: (value: string) => value,
    genderTypeToString: (value: string) => value,
    documentTypeToString: (value: string) => value,
    goodsCategoryToString: (value: string) => value,
    storeTypeToString: (value: string) => value,
    merchantCategoryToString: (value: string) => value,
  }),
}));
jest.mock('../hooks/layout-config.hook', () => ({ useLayoutOptions: (value: unknown) => mockLayout(value) }));
jest.mock('../hooks/navigation.hook', () => ({ useNavigation: () => mockNav }));
jest.mock('../util/single-flight', () => ({
  createKeyedSerial: () => (_key: string, task: () => Promise<unknown>) => task(),
}));
jest.mock('../util/utils', () => ({
  delay: (...args: unknown[]) => mockDelay(...args),
  toBase64: jest.fn().mockResolvedValue('base64'),
  url: ({ path }: { path: string }) => path,
}));
jest.mock('../util/validation-rules', () => ({
  AddressZipValidation: {},
  RequiredSwissPaymentTextValidation: {},
  SwissPaymentTextValidation: {},
  normalizeAddressApostrophes: (value: unknown) => value,
  normalizeApostrophes: (value: unknown) => value,
}));
jest.mock('../screens/kyc-redirect.screen', () => ({ IframeMessageType: 'kyc-message' }));

function step(name: string, overrides: Record<string, any> = {}) {
  return {
    name,
    status: 'InProgress',
    type: 'Auto',
    session: { url: 'step-url', type: 'Browser' },
    ...overrides,
  };
}

function info(overrides: Record<string, any> = {}) {
  return {
    kycLevel: 0,
    language: { symbol: 'EN' },
    kycClients: [],
    kycSteps: [],
    tradingLimit: 1000,
    ...overrides,
  };
}

function session(currentStep?: Record<string, any>, overrides: Record<string, any> = {}) {
  return { ...info(), currentStep, ...overrides };
}

function tree(path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<KycScreen />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPath(path: string) {
  return render(tree(path));
}

async function settle() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

async function overview(data: Record<string, any>, path = '/kyc?code=CODE') {
  mockGetKycInfo.mockResolvedValueOnce(data);
  const rendered = renderPath(path);
  await screen.findByTestId('kyc-status', undefined, { timeout: 10000 });
  await settle();
  return rendered;
}

async function renderStep(name: string, currentStep = step(name), suffix = '') {
  mockStartStep.mockResolvedValueOnce(session(currentStep));
  const rendered = renderPath(`/kyc?code=CODE&step=${name}${suffix}`);
  await waitFor(() => expect(mockClearParams).toHaveBeenCalledWith(['step']), { timeout: 10000 });
  await settle();
  return rendered;
}

function layout(): any {
  const calls = mockLayout.mock.calls;
  return calls[calls.length - 1][0];
}

function deferred() {
  let resolve: (value: Record<string, any>) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<Record<string, any>>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

let openSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.user = undefined;
  mockApp.isInitialized = true;
  mockApp.isWidget = false;
  mockApp.params = {};
  mockParams.lang = 'EN';
  mockDevice.isMobile = false;
  mockSettings.processingKycData = false;
  mockSettings.language = { symbol: 'EN' };
  mockIsStepDone.mockImplementation((value: any) => value?.status === 'Completed');
  mockDelay.mockResolvedValue(undefined);
  mockReloadUser.mockResolvedValue(undefined);
  mockGetKycInfo.mockResolvedValue(info());
  mockContinueKyc.mockResolvedValue(session());
  mockStartStep.mockImplementation((_code: string, name: string, type: string) =>
    Promise.resolve(session(step(name, { type }))),
  );
  mockAddTransferClient.mockResolvedValue(undefined);
  mockCancelStep.mockResolvedValue(undefined);
  mockKyc.getFinancialData.mockResolvedValue({ questions: [], responses: [] });
  mockKyc.setFinancialData.mockResolvedValue({ status: 'InProgress' });
  Object.values(mockKyc).forEach((method) => {
    if (!method.getMockImplementation()) method.mockResolvedValue(undefined);
  });
  openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  openSpy.mockRestore();
  jest.useRealTimers();
});

describe('KycScreen overview and parameter loading', () => {
  it('uses the URL code, renders Start, and exposes the normal layout', async () => {
    mockUser.user = { kyc: { hash: 'USER' } };
    await overview(info({ kycSteps: [step('ContactData', { status: 'NotStarted' })] }));
    expect(mockGetKycInfo).toHaveBeenCalledWith('CODE');
    expect(mockGuard).toHaveBeenCalledWith('/login', false);
    expect(await screen.findByRole('button', { name: 'Start' }, { timeout: 10000 })).toBeInTheDocument();
    expect(layout()).toMatchObject({ title: 'DFX KYC', backButton: false, noPadding: false });
  });

  it('uses the user code and adopts the KYC language when no language is fixed', async () => {
    mockUser.user = { kyc: { hash: 'USER' } };
    mockParams.lang = undefined;
    await overview(info({ language: { symbol: 'DE' } }), '/kyc');
    expect(mockGetKycInfo).toHaveBeenCalledWith('USER');
    expect(mockSettings.changeLanguage).toHaveBeenCalledWith({ symbol: 'DE' });
  });

  it('guards and remains loading without a code', async () => {
    renderPath('/kyc');
    await waitFor(() => expect(mockGuard).toHaveBeenCalledWith('/login', true), { timeout: 10000 });
    expect(mockGetKycInfo).not.toHaveBeenCalled();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it.each([
    ['Ident/VIDEO:3', 'SumsubVideo', 3],
    ['Ident/auto:0', 'SumsubAuto', 0],
    ['Ident/Manual', 'Manual', undefined],
    ['Ident', undefined, undefined],
  ])('maps explicit step parameter %s', async (parameter, type, sequence) => {
    await renderStep('Ident', step('Ident', { type }), parameter.slice('Ident'.length));
    expect(mockStartStep).toHaveBeenCalledWith('CODE', 'Ident', type, sequence);
    expect(mockClearParams).toHaveBeenCalledWith(['step']);
  });

  it.each([
    ['step', { message: 'step failed' }, 'step failed'],
    ['step', {}, 'Unknown error'],
    ['info', { message: 'info failed' }, 'info failed'],
    ['info', {}, 'Unknown error'],
  ])('shows %s request errors with a fallback', async (kind, failure, expected) => {
    if (kind === 'step') {
      mockStartStep.mockRejectedValueOnce(failure);
    } else {
      mockGetKycInfo.mockRejectedValueOnce(failure);
    }
    renderPath(`/kyc?code=CODE${kind === 'step' ? '&step=PersonalData' : ''}`);
    expect(await screen.findByTestId('error-hint', undefined, { timeout: 10000 })).toHaveTextContent(expected);
  });
});

describe('KycScreen overview actions and load protection', () => {
  it('continues started and fresh workflows', async () => {
    const first = await overview(info({ kycSteps: [step('ContactData')] }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }, { timeout: 10000 }));
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('CODE'), { timeout: 10000 });
    first.unmount();

    mockGetKycInfo.mockResolvedValueOnce(info({ kycSteps: [step('ContactData', { status: 'NotStarted' })] }));
    renderPath('/kyc?code=CODE');
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }, { timeout: 10000 }));
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledTimes(2), { timeout: 10000 });
  });

  it.each([
    [{ message: 'continue failed' }, 'continue failed'],
    [{}, 'Unknown error'],
  ])('shows continuation failures', async (failure, expected) => {
    mockContinueKyc.mockRejectedValueOnce(failure);
    await overview(info({ kycSteps: [step('ContactData', { status: 'NotStarted' })] }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }, { timeout: 10000 }));
    expect(await screen.findByTestId('error-hint', undefined, { timeout: 10000 })).toHaveTextContent(expected);
  });

  it('continues an incomplete limit request and navigates a completed high-level one', async () => {
    const first = await overview(info({ kycSteps: [step('ContactData')] }));
    fireEvent.click(await screen.findByRole('button', { name: 'Increase limit' }, { timeout: 10000 }));
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled(), { timeout: 10000 });
    first.unmount();

    mockGetKycInfo.mockResolvedValueOnce(
      info({ kycLevel: 50, kycSteps: [step('ContactData', { status: 'Completed' })] }),
    );
    renderPath('/kyc?code=CODE');
    fireEvent.click(await screen.findByRole('button', { name: 'Increase limit' }, { timeout: 10000 }));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/support/issue', search: '?issue-type=LimitRequest' });
  });

  it('hides workflow actions after low-level completion', async () => {
    await overview(info({ kycLevel: 10, kycSteps: [step('ContactData', { status: 'Completed' })] }));
    expect(await screen.findByTestId('kyc-status', undefined, { timeout: 10000 })).toHaveAttribute(
      'data-has-limit-increase',
      'false',
    );
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it.each(['resolve', 'reject'])('ignores stale %s results and keeps the newest result', async (result) => {
    const oldRequest = deferred();
    const newRequest = deferred();
    mockContinueKyc.mockReset().mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    await overview(info({ kycSteps: [step('PersonalData', { status: 'NotStarted' })] }));
    const start = await screen.findByRole('button', { name: 'Start' }, { timeout: 10000 });
    act(() => {
      fireEvent.click(start);
      fireEvent.click(start);
    });
    expect(mockContinueKyc).toHaveBeenCalledTimes(2);

    if (result === 'resolve') {
      await act(async () => oldRequest.resolve(session(step('PersonalData', { status: 'Failed', reason: 'old' }))));
      await act(async () => newRequest.resolve(session(step('PersonalData', { status: 'Failed', reason: 'new' }))));
      expect(await screen.findByText('new', undefined, { timeout: 10000 })).toBeInTheDocument();
    } else {
      await act(async () => oldRequest.reject({ message: 'old' }));
      await act(async () => newRequest.reject({ message: 'new' }));
      expect(await screen.findByTestId('error-hint', undefined, { timeout: 10000 })).toHaveTextContent('new');
    }
    expect(screen.queryByText('old')).not.toBeInTheDocument();
  });
});

describe('KycScreen API error routing', () => {
  it('switches codes and logs out on a code handoff', async () => {
    mockGetKycInfo.mockRejectedValueOnce({ statusCode: 401, switchToCode: 'OTHER', message: 'switch' });
    renderPath('/kyc?code=CODE');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ search: '?code=OTHER' }), { timeout: 10000 });
    expect(mockLogout).toHaveBeenCalled();
  });

  it('does not switch for an unauthorized response without a switch code', async () => {
    mockGetKycInfo.mockRejectedValueOnce({ statusCode: 401, message: 'unauthorized' });
    renderPath('/kyc?code=CODE');
    expect(await screen.findByText('unauthorized', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('routes TFA errors', async () => {
    mockGetKycInfo.mockRejectedValueOnce({ code: 'TFA_REQUIRED', message: 'tfa' });
    renderPath('/kyc?code=CODE');
    expect(await screen.findByText('tfa', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockApp.setParams).toHaveBeenCalledWith({ autoStart: 'true' });
    expect(mockNavigate).toHaveBeenCalledWith('/2fa', { setRedirect: true });
  });

  it('shows and retries the merge hint', async () => {
    mockGetKycInfo
      .mockRejectedValueOnce({ statusCode: 409, message: 'account exists and needs merge' })
      .mockResolvedValueOnce(info());
    renderPath('/kyc?code=CODE');
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }, { timeout: 10000 }));
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledTimes(2), { timeout: 10000 });
    expect(await screen.findByTestId('kyc-status', undefined, { timeout: 10000 })).toBeInTheDocument();
  });

  it.each([
    [{ statusCode: 409, message: 'account exists elsewhere' }, 'account exists elsewhere'],
    [{ statusCode: 409, message: 'generic conflict' }, 'generic conflict'],
    [{ statusCode: 409 }, 'Unknown error'],
  ])('shows ordinary conflict errors', async (failure, expected) => {
    mockGetKycInfo.mockRejectedValueOnce(failure);
    renderPath('/kyc?code=CODE');
    expect(await screen.findByText(expected, undefined, { timeout: 10000 })).toBeInTheDocument();
  });
});

describe('KycScreen startup and route modes', () => {
  it('waits for initialization', async () => {
    mockApp.isInitialized = false;
    renderPath('/kyc?code=CODE');
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalled(), { timeout: 10000 });
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('auto-starts and clears its parameter', async () => {
    mockApp.params = { autoStart: 'true' };
    renderPath('/kyc?code=CODE');
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('CODE'), { timeout: 10000 });
    await waitFor(() => expect(mockApp.setParams).toHaveBeenCalledWith({ autoStart: undefined }), { timeout: 10000 });
  });

  it.each([
    ['processing', true, '/kyc?code=CODE'],
    ['missing code', false, '/kyc'],
  ])('keeps auto-start pending while %s', async (_label, processing, path) => {
    mockApp.params = { autoStart: 'true' };
    mockSettings.processingKycData = processing;
    renderPath(path);
    await waitFor(() => expect(mockGuard).toHaveBeenCalled(), { timeout: 10000 });
    expect(mockContinueKyc).not.toHaveBeenCalled();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it.each([
    ['/profile/kyc', 30],
    ['/contact/kyc', 10],
  ])('goes back from %s when its required level exists', async (path, level) => {
    mockGetKycInfo.mockResolvedValueOnce(info({ kycLevel: level }));
    renderPath(`${path}?code=CODE`);
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled(), { timeout: 10000 });
    expect(mockContinueKyc).not.toHaveBeenCalled();
  });

  it.each([
    ['/profile/kyc', 30],
    ['/contact/kyc', 10],
  ])('continues %s, reloads the user, delays, and goes back', async (path, level) => {
    mockGetKycInfo.mockResolvedValueOnce(info({ kycLevel: 0 }));
    mockContinueKyc.mockResolvedValueOnce(session(undefined, { kycLevel: level }));
    renderPath(`${path}?code=CODE`);
    await waitFor(() => expect(mockReloadUser).toHaveBeenCalled(), { timeout: 10000 });
    expect(mockDelay).toHaveBeenCalledWith(0.01);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('keeps contact mode open below its required level', async () => {
    mockGetKycInfo.mockResolvedValueOnce(info({ kycLevel: 0 }));
    mockContinueKyc.mockResolvedValueOnce(session(step('ContactData'), { kycLevel: 0 }));
    renderPath('/contact/kyc?code=CODE');
    expect(await screen.findByTestId('field-mail', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockReloadUser).not.toHaveBeenCalled();
  });
});

describe('KycScreen redirect and consent effects', () => {
  const complete = () => info({ kycSteps: [step('ContactData', { status: 'Completed' })] });

  it('opens a completed HTTPS redirect in the same window', async () => {
    mockGetKycInfo.mockResolvedValueOnce(complete());
    renderPath('/kyc?code=CODE&kyc-redirect=https%3A%2F%2Fexample.com%2Fdone');
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://example.com/done', '_self'), { timeout: 10000 });
  });

  it.each(['http%3A%2F%2Fexample.com', 'invalid-url'])('ignores unsafe redirect %s', async (redirect) => {
    mockGetKycInfo.mockResolvedValueOnce(complete());
    renderPath(`/kyc?code=CODE&kyc-redirect=${redirect}`);
    await screen.findByTestId('kyc-status', undefined, { timeout: 10000 });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('does not redirect incomplete KYC', async () => {
    await overview(info({ kycSteps: [step('ContactData')] }), '/kyc?code=CODE&kyc-redirect=https://example.com');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('submits missing-client consent and continues', async () => {
    mockGetKycInfo.mockResolvedValueOnce(complete());
    renderPath('/kyc?code=CODE&client=CLIENT');
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }, { timeout: 10000 }));
    await waitFor(() => expect(mockAddTransferClient).toHaveBeenCalledWith('CODE', 'CLIENT'), { timeout: 10000 });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('CODE'), { timeout: 10000 });
  });

  it.each([
    [{ message: 'consent failed' }, 'consent failed'],
    [{}, 'Unknown error'],
  ])('shows consent errors', async (failure, expected) => {
    mockGetKycInfo.mockResolvedValueOnce(complete());
    mockAddTransferClient.mockRejectedValueOnce(failure);
    renderPath('/kyc?code=CODE&client=CLIENT');
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }, { timeout: 10000 }));
    expect(await screen.findByTestId('error-hint', undefined, { timeout: 10000 })).toHaveTextContent(expected);
  });

  it('skips consent for an existing client and for incomplete info without currentStep', async () => {
    const first = await overview(info({ kycClients: ['CLIENT'] }), '/kyc?code=CODE&client=CLIENT');
    expect(screen.queryByText(/I hereby authorize/)).not.toBeInTheDocument();
    first.unmount();
    mockGetKycInfo.mockResolvedValueOnce(info({ kycSteps: [step('ContactData')] }));
    renderPath('/kyc?code=CODE&client=CLIENT');
    await screen.findByTestId('kyc-status', undefined, { timeout: 10000 });
    expect(screen.queryByText(/I hereby authorize/)).not.toBeInTheDocument();
  });

  it('prioritizes consent when an incomplete session has currentStep', async () => {
    mockStartStep.mockResolvedValueOnce(
      session(step('PersonalData'), { kycSteps: [step('PersonalData', { status: 'InProgress' })] }),
    );
    renderPath('/kyc?code=CODE&client=CLIENT&step=PersonalData');
    expect(await screen.findByText(/I hereby authorize/, undefined, { timeout: 10000 })).toHaveTextContent('CLIENT');
  });

  it('guards retained consent and reload actions after the user code disappears', async () => {
    mockUser.user = { kyc: { hash: 'USER' } };
    mockGetKycInfo.mockResolvedValueOnce(complete());
    const consentRender = renderPath('/kyc?client=CLIENT');
    await screen.findByText(/I hereby authorize/, undefined, { timeout: 10000 });
    await settle();
    mockUser.user = undefined;
    consentRender.rerender(tree('/kyc?client=CLIENT'));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }, { timeout: 10000 }));
    expect(mockAddTransferClient).not.toHaveBeenCalled();
    consentRender.unmount();

    mockUser.user = { kyc: { hash: 'USER' } };
    mockStartStep.mockResolvedValueOnce(
      session(step('PersonalData'), { kycSteps: [step('PersonalData', { status: 'NotStarted' })] }),
    );
    const loadRender = renderPath('/kyc?step=PersonalData');
    await waitFor(() => expect(mockClearParams).toHaveBeenCalled(), { timeout: 10000 });
    await settle();
    mockUser.user = undefined;
    loadRender.rerender(tree('/kyc?step=PersonalData'));
    fireEvent.click(await screen.findByRole('button', { name: 'Increase limit' }, { timeout: 10000 }));
    expect(mockContinueKyc).not.toHaveBeenCalled();
  });
});

describe('KycScreen reload, back, status, and cancellation', () => {
  it.each([
    ['AccountMergeRequested', 'hint'],
    ['Contact rejected', 'error'],
  ])('handles failed contact reason %s', async (reason, view) => {
    await renderStep('ContactData', step('ContactData', { status: 'Failed', reason }));
    if (view === 'hint') {
      expect(await screen.findByText(/already have an account/, undefined, { timeout: 10000 })).toBeInTheDocument();
    } else {
      expect(await screen.findByTestId('error-hint', undefined, { timeout: 10000 })).toHaveTextContent(reason);
    }
  });

  it('backs out of an active step without a request', async () => {
    await renderStep('PersonalData');
    act(() => layout().onBack());
    expect(await screen.findByTestId('kyc-status', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockGetKycInfo).not.toHaveBeenCalled();
  });

  it('reloads when backing out of the link hint and consent', async () => {
    mockGetKycInfo.mockResolvedValueOnce(info());
    const first = await renderStep(
      'ContactData',
      step('ContactData', { status: 'Failed', reason: 'AccountMergeRequested' }),
    );
    act(() => layout().onBack());
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledTimes(1), { timeout: 10000 });
    first.unmount();

    mockGetKycInfo
      .mockResolvedValueOnce(info({ kycSteps: [step('ContactData', { status: 'Completed' })] }))
      .mockResolvedValueOnce(info());
    renderPath('/kyc?code=CODE&client=CLIENT');
    await screen.findByText(/I hereby authorize/, undefined, { timeout: 10000 });
    await settle();
    act(() => layout().onBack());
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledTimes(3), { timeout: 10000 });
  });

  it('does nothing from overview back', async () => {
    await overview(info());
    const count = mockGetKycInfo.mock.calls.length;
    act(() => layout().onBack());
    expect(mockGetKycInfo).toHaveBeenCalledTimes(count);
  });

  it.each([
    ['Failed', 'reason', 'This step has failed.'],
    ['Failed', undefined, 'This step has failed.'],
    ['Completed', undefined, 'This step has already been finished.'],
  ])('renders the %s step result', async (status, reason, text) => {
    await renderStep('PersonalData', step('PersonalData', { status, reason }));
    expect(await screen.findByText(text, undefined, { timeout: 10000 })).toBeInTheDocument();
    if (reason) {
      expect(await screen.findByText(reason, undefined, { timeout: 10000 })).toBeInTheDocument();
    } else {
      expect(screen.queryByText('reason')).not.toBeInTheDocument();
    }
  });

  it('reloads the result view from Continue', async () => {
    mockGetKycInfo.mockResolvedValueOnce(info());
    await renderStep('PersonalData', step('PersonalData', { status: 'Completed' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }, { timeout: 10000 }));
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledWith('CODE'), { timeout: 10000 });
  });

  it('cancels and reloads a cancelable step', async () => {
    mockGetKycInfo.mockResolvedValueOnce(info());
    await renderStep('PhoneChange');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }, { timeout: 10000 }));
    await waitFor(() => expect(mockCancelStep).toHaveBeenCalledWith('CODE', 'step-url'), { timeout: 10000 });
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledWith('CODE'), { timeout: 10000 });
  });

  it('returns from cancellation without a session', async () => {
    mockDevice.isMobile = true;
    await renderStep('PhoneChange', step('PhoneChange', { session: undefined }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }, { timeout: 10000 }));
    expect(mockCancelStep).not.toHaveBeenCalled();
    expect(layout().noPadding).toBe(false);
  });

  it.each([
    [{ message: 'cancel failed' }, 'cancel failed'],
    [{}, 'Unknown error'],
  ])('shows cancellation failures', async (failure, expected) => {
    mockCancelStep.mockRejectedValueOnce(failure);
    await renderStep('PhoneChange');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }, { timeout: 10000 }));
    expect(await screen.findByTestId('error-hint', undefined, { timeout: 10000 })).toHaveTextContent(expected);
  });
});

describe('KycScreen embedded callbacks and layout', () => {
  it.each([
    ['Failed', 'back'],
    ['Completed', 'done'],
  ])('routes iframe status %s to %s', async (status, direction) => {
    await renderStep('Ident', step('Ident', { type: 'Auto' }));
    await waitFor(() => expect(document.querySelector('iframe')).toBeInTheDocument(), { timeout: 10000 });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    act(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'kyc-message', status } })));
    if (direction === 'back') {
      await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledWith('CODE'), { timeout: 10000 });
    } else {
      await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('CODE'), { timeout: 10000 });
    }
  });

  it('uses no padding only for mobile browser sessions', async () => {
    mockDevice.isMobile = true;
    const first = await renderStep('Ident', step('Ident', { session: { url: 'browser', type: 'Browser' } }));
    expect(layout().noPadding).toBe(true);
    first.unmount();
    mockStartStep.mockResolvedValueOnce(
      session(step('Ident', { type: 'SumsubAuto', session: { url: 'token', type: 'Token' } })),
    );
    renderPath('/kyc?code=CODE&step=Ident');
    await waitFor(() => expect(mockClearParams).toHaveBeenCalledTimes(2), { timeout: 10000 });
    await settle();
    expect(layout().noPadding).toBe(false);
    expect(await screen.findByTestId('sumsub-sdk', undefined, { timeout: 10000 })).toBeInTheDocument();
  });
});

describe('KycEdit switch', () => {
  it.each([
    'ContactData',
    'PersonalData',
    'LegalEntity',
    'CommercialRegister',
    'NationalityData',
    'Recommendation',
    'SignatoryPower',
    'BeneficialOwner',
    'OperationalActivity',
    'FinancialData',
    'AdditionalDocuments',
    'ResidencePermit',
    'Statutes',
    'DfxApproval',
    'PaymentAgreement',
    'RecallAgreement',
    'PhoneChange',
    'AddressChange',
    'NameChange',
    'UnknownStep',
  ])('hits the %s case', async (name) => {
    await renderStep(name);
    expect(layout()).toMatchObject({ title: `step:${name}`, backButton: true });
  });

  it('renders the sole-proprietorship hint', async () => {
    await renderStep('SoleProprietorshipConfirmation');
    expect(
      await screen.findByText(/another document proving the existence of the business/, undefined, {
        timeout: 10000,
      }),
    ).toBeInTheDocument();
  });

  it.each([
    ['OwnerDirectory', 'DE', '11m3MkP0RALZFYRoxZNdY0SwVv8oN3Vl_gzXaIO_YIxY'],
    ['OwnerDirectory', 'FR', '1uRV6Z1D6FYmF6VQZLfXK8GniR7hf5a9phBRqGNYlqW4'],
    ['Authority', 'DE', '1Sqob5OAM93Uwni7U099XOXxztytXfN6i6upO9ymDgGw'],
    ['Authority', 'FR', '17H2f0gAlNpp8e_1aEE6jTbEHbQnoLgr821yWfaSElms'],
  ])('opens the %s %s template', async (name, language, id) => {
    mockSettings.language = { symbol: language };
    await renderStep(name);
    fireEvent.click(await screen.findByRole('button', { name: 'Document template' }, { timeout: 10000 }));
    expect(openSpy).toHaveBeenCalledWith(`https://docs.google.com/document/d/${id}/edit`, '_blank');
  });

  it.each([
    ['OwnerDirectory', '1ICxt-RZihMyiz486NMS4gEJZdgrZG_LVTuDiLMbzyC0'],
    ['Authority', '1PKk0XvX6v7wdcO-bjCVJXj56uuIlDToca6Zpzff_t6g'],
  ])('uses the English %s template as fallback', async (name, id) => {
    mockSettings.language = { symbol: 'ES' };
    await renderStep(name);
    fireEvent.click(await screen.findByRole('button', { name: 'Document template' }, { timeout: 10000 }));
    expect(openSpy).toHaveBeenCalledWith(`https://docs.google.com/document/d/${id}/edit`, '_blank');
  });

  it('switches Ident between manual and non-manual rendering', async () => {
    const manual = await renderStep('Ident', step('Ident', { type: 'Manual' }));
    expect(await screen.findByTestId('field-documentNumber', undefined, { timeout: 10000 })).toBeInTheDocument();
    manual.unmount();
    mockStartStep.mockResolvedValueOnce(
      session(step('Ident', { type: 'SumsubAuto', session: { url: 'token', type: 'Token' } })),
    );
    renderPath('/kyc?code=CODE&step=Ident');
    await waitFor(() => expect(mockClearParams).toHaveBeenCalledTimes(2), { timeout: 10000 });
    await settle();
    expect(await screen.findByTestId('sumsub-sdk', undefined, { timeout: 10000 })).toBeInTheDocument();
  });

  it('renders both editable statuses', async () => {
    const first = await renderStep('ContactData', step('ContactData', { status: 'NotStarted' }));
    expect(layout().title).toBe('step:ContactData');
    first.unmount();
    mockStartStep.mockResolvedValueOnce(session(step('ContactData', { status: 'InProgress' })));
    renderPath('/kyc?code=CODE&step=ContactData');
    await waitFor(() => expect(mockClearParams).toHaveBeenCalledTimes(2), { timeout: 10000 });
    await settle();
    expect(layout().title).toBe('step:ContactData');
  });
});
