const mockGetKycInfo = jest.fn();
const mockContinueKyc = jest.fn();
const mockStartStep = jest.fn();
const mockAddTransferClient = jest.fn();
const mockCancelStep = jest.fn();
const mockSetContactData = jest.fn();
const mockSetPersonalData = jest.fn();
const mockSetLegalEntityData = jest.fn();
const mockSetNationalityData = jest.fn();
const mockSetRecommendationData = jest.fn();
const mockSetFileData = jest.fn();
const mockSetSignatoryPowerData = jest.fn();
const mockSetBeneficialData = jest.fn();
const mockSetOperationalData = jest.fn();
const mockGetFinancialData = jest.fn();
const mockSetFinancialData = jest.fn();
const mockSetManualIdentData = jest.fn();
const mockSetPhoneChangeData = jest.fn();
const mockSetAddressChangeData = jest.fn();
const mockSetNameChangeData = jest.fn();
const mockSetPaymentData = jest.fn();
const mockSetRecallData = jest.fn();
const mockLogout = jest.fn();
const mockReloadUser = jest.fn();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockClearParams = jest.fn();
const mockChangeLanguage = jest.fn();
const mockSetParams = jest.fn();
const mockUseLayoutOptions = jest.fn();
const mockToBase64 = jest.fn();
const mockWindowOpen = jest.fn();
const mockSumsub = {
  onMessage: undefined as ((type: string, payload: unknown) => void) | undefined,
  onError: undefined as ((err: { error: string }) => void) | undefined,
  expirationHandler: undefined as (() => Promise<string>) | undefined,
};

const mockDevice = { isMobile: false };
const mockApp = {
  isInitialized: true,
  params: {} as { autoStart?: string },
  processingKycData: false,
  lang: undefined as string | undefined,
};
const mockAuth: { user?: { kyc?: { hash?: string } } } = { user: { kyc: { hash: 'user-hash' } } };

const CH = { name: 'Switzerland', symbol: 'CH' };
const DE = { name: 'Germany', symbol: 'DE' };
const LANG = { symbol: 'EN', name: 'English' };
const mockAllowedCountries = [CH, DE];
const mockOrgCountries = [CH];
let mockNationalityCountries: { name: string; symbol: string }[] | undefined = [CH, DE];
let mockLanguage: { symbol: string; name: string } | undefined = LANG;

jest.mock('@dfx.swiss/react', () => ({
  AccountType: {
    PERSONAL: 'Personal',
    ORGANIZATION: 'Organization',
    SOLE_PROPRIETORSHIP: 'SoleProprietorship',
  },
  DocumentType: {
    IDCARD: 'IDCARD',
    PASSPORT: 'PASSPORT',
    DRIVERS_LICENSE: 'DRIVERS_LICENSE',
    RESIDENCE_PERMIT: 'RESIDENCE_PERMIT',
  },
  GenderType: { MALE: 'Male', FEMALE: 'Female' },
  GoodsType: { TANGIBLE: 'Tangible', VIRTUAL: 'Virtual' },
  GoodsCategory: { JEWELRY: 'Jewelry', OTHERS: 'Others' },
  StoreType: { ONLINE: 'Online', PHYSICAL: 'Physical', ONLINE_AND_PHYSICAL: 'OnlineAndPhysical' },
  MerchantCategory: { BANK: 'Bank', OTHER: 'Other' },
  KycLevel: { Link: 10, Sell: 20, Completed: 50 },
  KycStepName: {
    CONTACT_DATA: 'ContactData',
    PERSONAL_DATA: 'PersonalData',
    LEGAL_ENTITY: 'LegalEntity',
    OWNER_DIRECTORY: 'OwnerDirectory',
    NATIONALITY_DATA: 'NationalityData',
    RECOMMENDATION: 'Recommendation',
    COMMERCIAL_REGISTER: 'CommercialRegister',
    SOLE_PROPRIETORSHIP_CONFIRMATION: 'SoleProprietorshipConfirmation',
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
  KycStepCancelable: ['AddressChange', 'PhoneChange', 'NameChange'],
  KycStepType: {
    AUTO: 'Auto',
    VIDEO: 'Video',
    MANUAL: 'Manual',
    SUMSUB_AUTO: 'SumsubAuto',
    SUMSUB_VIDEO: 'SumsubVideo',
  },
  KycStepStatus: {
    NOT_STARTED: 'NotStarted',
    IN_PROGRESS: 'InProgress',
    IN_REVIEW: 'InReview',
    FAILED: 'Failed',
    COMPLETED: 'Completed',
    OUTDATED: 'Outdated',
    DATA_REQUESTED: 'DataRequested',
    ON_HOLD: 'OnHold',
  },
  UrlType: { BROWSER: 'Browser', API: 'API', TOKEN: 'Token', NONE: 'None' },
  KycStepReason: { ACCOUNT_EXISTS: 'AccountExists', ACCOUNT_MERGE_REQUESTED: 'AccountMergeRequested' },
  LegalEntity: { AG: 'AG', GMBH: 'GmbH', OTHER: 'Other' },
  SignatoryPower: { SINGLE: 'Single', DOUBLE: 'Double', NONE: 'None' },
  QuestionType: {
    CONFIRMATION: 'Confirmation',
    SINGLE_CHOICE: 'SingleChoice',
    MULTIPLE_CHOICE: 'MultipleChoice',
    TEXT: 'Text',
  },
  SupportIssueType: { NOTIFICATION_OF_CHANGES: 'NotificationOfChanges', LIMIT_REQUEST: 'LimitRequest' },
  Utils: {
    createRules: (rules: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rules)) {
        out[key] = Array.isArray(value) ? Object.assign({}, ...value) : value;
      }
      return out;
    },
  },
  Validations: {
    Required: {},
    Mail: {},
    Phone: {},
    Custom: (fn: (v: unknown) => unknown) => ({ validate: fn }),
  },
  isStepDone: (result: { status: string }) => ['InReview', 'OnHold', 'Completed'].includes(result.status),
  useKyc: () => ({
    getKycInfo: mockGetKycInfo,
    continueKyc: mockContinueKyc,
    startStep: mockStartStep,
    addTransferClient: mockAddTransferClient,
    cancelStep: mockCancelStep,
    setContactData: mockSetContactData,
    setPersonalData: mockSetPersonalData,
    setLegalEntityData: mockSetLegalEntityData,
    setNationalityData: mockSetNationalityData,
    setRecommendationData: mockSetRecommendationData,
    setFileData: mockSetFileData,
    setSignatoryPowerData: mockSetSignatoryPowerData,
    setBeneficialData: mockSetBeneficialData,
    setOperationalData: mockSetOperationalData,
    getFinancialData: mockGetFinancialData,
    setFinancialData: mockSetFinancialData,
    setManualIdentData: mockSetManualIdentData,
    setPhoneChangeData: mockSetPhoneChangeData,
    setAddressChangeData: mockSetAddressChangeData,
    setNameChangeData: mockSetNameChangeData,
    setPaymentData: mockSetPaymentData,
    setRecallData: mockSetRecallData,
  }),
  useSessionContext: () => ({ logout: mockLogout }),
  useUserContext: () => ({ user: mockAuth.user, reloadUser: mockReloadUser }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  function enrich(elements: unknown, control: unknown, rules?: Record<string, unknown>): unknown {
    if (!elements) return elements;
    return React.Children.map(elements, (element: unknown) => {
      if (!React.isValidElement(element)) return element;
      const props = element.props as { name?: string; children?: unknown };
      const children = enrich(props.children, control, rules);
      if (props.name) {
        return React.cloneElement(element, { control, rules: rules ? rules[props.name] : undefined, children });
      }
      return React.cloneElement(element, { children });
    });
  }

  return {
    DfxIcon: () => null,
    Form: ({
      children,
      control,
      rules,
      onSubmit,
    }: {
      children: React.ReactNode;
      control: unknown;
      rules?: Record<string, unknown>;
      onSubmit?: React.FormEventHandler;
    }) => (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.(e);
        }}
      >
        {enrich(children, control, rules)}
      </form>
    ),
    IconColor: { BLUE: 'blue' },
    IconSize: { MD: 'md', XL: 'xl', XS: 'xs' },
    IconVariant: { USER_DATA: 'user', CHEV_LEFT: 'left' },
    SpinnerSize: { LG: 'lg' },
    StyledLoadingSpinner: () => <span role="status">loading</span>,
    StyledButton: ({
      label,
      onClick,
      disabled,
    }: {
      label: string;
      onClick?: () => void;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onClick} disabled={false} data-would-disable={disabled ? 'yes' : 'no'}>
        {label}
      </button>
    ),
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white', GRAY_OUTLINE: 'gray' },
    StyledButtonWidth: { MIN: 'min', FULL: 'full' },
    StyledInput: ({
      control,
      name,
      label,
      rules,
      placeholder,
      forceErrorMessage,
    }: {
      control?: unknown;
      name: string;
      label?: string;
      rules?: unknown;
      placeholder?: string;
      forceErrorMessage?: string;
    }) => (
      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({ field }: { field: { value?: string; onChange: (v: string) => void } }) => (
          <label>
            {label}
            <input
              data-testid={name}
              placeholder={placeholder}
              value={field.value ?? ''}
              onChange={(e) => {
                field.onChange(e.target.value);
                const validate = (rules as { validate?: (v: unknown) => unknown } | undefined)?.validate;
                validate?.(e.target.value);
              }}
            />
            {forceErrorMessage ? <span data-testid={`${name}-error`}>{forceErrorMessage}</span> : null}
          </label>
        )}
      />
    ),
    StyledDropdown: ({
      control,
      name,
      items,
      labelFunc,
      descriptionFunc,
      label,
      rules,
    }: {
      control?: unknown;
      name: string;
      items: unknown[];
      labelFunc?: (item: unknown) => string;
      descriptionFunc?: (item: unknown) => string;
      label?: string;
      rules?: unknown;
    }) => (
      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({ field }: { field: { value?: unknown; onChange: (v: unknown) => void; onBlur: () => void } }) => {
          const keyOf = (item: unknown) =>
            item !== null && typeof item === 'object' ? JSON.stringify(item) : String(item);
          return (
            <div data-testid={name} data-has-control={control ? 'yes' : 'no'}>
              {label}
              {(items ?? []).map((item, i) => (
                <button
                  key={i}
                  type="button"
                  data-testid={`${name}-option-${keyOf(item)}`}
                  onClick={() => {
                    field.onChange(item);
                    field.onBlur();
                  }}
                >
                  {labelFunc ? labelFunc(item) : String(item)}
                  {descriptionFunc ? ` ${descriptionFunc(item)}` : ''}
                </button>
              ))}
            </div>
          );
        }}
      />
    ),
    StyledDropdownMultiChoice: ({
      control,
      name,
      items,
      labelFunc,
      rules,
    }: {
      control?: unknown;
      name: string;
      items: { key: string; text: string }[];
      labelFunc?: (item: { key: string; text: string }) => string;
      rules?: unknown;
    }) => (
      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({ field }: { field: { onChange: (v: unknown) => void } }) => (
          <div data-testid={name}>
            {(items ?? []).map((item) => (
              <button
                key={item.key}
                type="button"
                data-testid={`${name}-option-${item.key}`}
                onClick={() => field.onChange([item])}
              >
                {labelFunc ? labelFunc(item) : item.text}
              </button>
            ))}
          </div>
        )}
      />
    ),
    StyledSearchDropdown: ({
      control,
      name,
      items,
      labelFunc,
      filterFunc,
      matchFunc,
      label,
      rules,
    }: {
      control?: unknown;
      name: string;
      items?: { name: string; symbol?: string }[];
      labelFunc?: (item: { name: string; symbol?: string }) => string;
      filterFunc?: (item: { name: string; symbol?: string }, s?: string) => boolean;
      matchFunc?: (item: { name: string; symbol?: string }, s?: string) => boolean;
      label?: string;
      rules?: unknown;
    }) => (
      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({ field }: { field: { onChange: (v: unknown) => void } }) => (
          <div data-testid={name}>
            {label}
            <input
              data-testid={`${name}-search`}
              onChange={(e) => {
                const search = e.target.value;
                const filtered = (items ?? []).filter((i) => (filterFunc ? filterFunc(i, search) : true));
                const matches = filtered.filter((i) => (matchFunc ? matchFunc(i, search) : false));
                if (matches.length === 1) field.onChange(matches[0]);
              }}
            />
            {(items ?? []).map((item, i) => (
              <button
                key={i}
                type="button"
                data-testid={`${name}-option-${item.name}`}
                onClick={() => field.onChange(item)}
              >
                {labelFunc ? labelFunc(item) : item.name}
              </button>
            ))}
          </div>
        )}
      />
    ),
    StyledFileUpload: ({
      control,
      name,
      rules,
    }: {
      control?: unknown;
      name: string;
      rules?: unknown;
    }) => (
      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({ field }: { field: { onChange: (v: unknown) => void } }) => (
          <input
            type="file"
            data-testid={name}
            onChange={(e) => {
              const file = e.target.files?.[0];
              field.onChange(file);
              const validate = (rules as { validate?: (v: unknown) => unknown } | undefined)?.validate;
              validate?.(file);
              validate?.(undefined);
            }}
          />
        )}
      />
    ),
    StyledCheckboxRow: ({
      isChecked,
      onChange,
      children,
    }: {
      isChecked?: boolean;
      onChange?: (checked: boolean) => void;
      children?: React.ReactNode;
    }) => (
      <label>
        <input
          type="checkbox"
          data-testid="checkbox"
          checked={!!isChecked}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        {children}
      </label>
    ),
    StyledCollapsible: ({ titleContent, children }: { titleContent?: React.ReactNode; children?: React.ReactNode }) => (
      <div>
        {titleContent}
        {children}
      </div>
    ),
    StyledHorizontalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    StyledLink: ({ label, onClick, url }: { label: string; onClick?: () => void; url?: string }) => (
      <button type="button" onClick={onClick || (() => mockWindowOpen(url))}>
        {label}
      </button>
    ),
    StyledIconButton: ({ onClick }: { onClick?: () => void }) => (
      <button type="button" data-testid="icon-back" onClick={onClick}>
        back
      </button>
    ),
  };
});

jest.mock('@sumsub/websdk-react', () => ({
  __esModule: true,
  default: ({
    onMessage,
    onError,
    expirationHandler,
  }: {
    onMessage: (type: string, payload: unknown) => void;
    onError: (err: { error: string }) => void;
    expirationHandler: () => Promise<string>;
  }) => {
    mockSumsub.onMessage = onMessage;
    mockSumsub.onError = onError;
    mockSumsub.expirationHandler = expirationHandler;
    return <div data-testid="sumsub" />;
  },
}));

jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockDevice.isMobile;
  },
}));

jest.mock('react-i18next', () => ({
  Trans: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string, params?: Record<string, string>) => {
      if (!params) return key;
      return Object.entries(params).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(String(v)), key);
    },
    translateError: (key: string) => key,
    changeLanguage: mockChangeLanguage,
    processingKycData: mockApp.processingKycData,
    allowedCountries: mockAllowedCountries,
    allowedOrganizationCountries: mockOrgCountries,
    get nationalityCountries() {
      return mockNationalityCountries;
    },
    get language() {
      return mockLanguage;
    },
  }),
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({
    isInitialized: mockApp.isInitialized,
    params: mockApp.params,
    setParams: mockSetParams,
  }),
}));

jest.mock('../contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('../hooks/app-params.hook', () => ({
  useAppParams: () => ({ lang: mockApp.lang }),
}));

jest.mock('../hooks/geo-location.hook', () => ({
  useGeoLocation: () => ({ countryCode: 'CH' }),
}));

jest.mock('../hooks/guard.hook', () => ({
  useUserGuard: () => undefined,
}));

jest.mock('../hooks/kyc-helper.hook', () => ({
  useKycHelper: () => ({
    nameToString: (name: string) => name,
    accountTypeToString: (t: string) => t,
    legalEntityToString: (e: string) => e,
    legalEntityToDescription: (e: string) => (e === 'Other' ? undefined : `desc-${e}`),
    signatoryPowerToString: (p: string) => p,
    genderTypeToString: (g: string) => g,
    documentTypeToString: (d: string) => d,
    goodsCategoryToString: (g: string) => g,
    storeTypeToString: (s: string) => s,
    merchantCategoryToString: (m: string) => m,
  }),
}));

jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: unknown) => mockUseLayoutOptions(options),
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    clearParams: mockClearParams,
  }),
}));

jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message, onBack }: { message: string; onBack?: () => void }) => (
    <div data-testid="error-hint">
      {message}
      {onBack ? (
        <button type="button" onClick={onBack}>
          error-back
        </button>
      ) : null}
    </div>
  ),
}));

jest.mock('../components/kyc-status', () => ({
  KycStatusTable: ({ onLimitIncrease }: { onLimitIncrease?: () => void }) => (
    <div data-testid="kyc-table">
      {onLimitIncrease ? (
        <button type="button" onClick={onLimitIncrease}>
          raise-limit
        </button>
      ) : null}
    </div>
  ),
}));

jest.mock('../util/utils', () => {
  const actual = jest.requireActual('../util/utils');
  return {
    ...actual,
    toBase64: (...args: unknown[]) => mockToBase64(...args),
    delay: () => Promise.resolve(),
  };
});

process.env.REACT_APP_PUBLIC_URL = 'https://app.dfx.swiss';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import KycScreen from '../screens/kyc.screen';

function info(overrides: Record<string, unknown> = {}) {
  return {
    kycLevel: 0,
    tradingLimit: { limit: 1000, period: 'Day' },
    language: LANG,
    kycClients: [] as string[],
    kycSteps: [{ name: 'ContactData', status: 'NotStarted', sequenceNumber: 0, isCurrent: false }],
    ...overrides,
  };
}

function session(step: Record<string, unknown> | undefined, overrides: Record<string, unknown> = {}) {
  return { ...info(overrides), currentStep: step };
}

function step(name: string, status = 'InProgress', extra: Record<string, unknown> = {}) {
  return {
    name,
    status,
    sequenceNumber: 0,
    session: { url: 'https://api.dfx.swiss/step', type: 'API' },
    ...extra,
  };
}

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '/kyc', element: <KycScreen /> }, { path: '/profile', element: <KycScreen /> }, { path: '/contact', element: <KycScreen /> }], {
    initialEntries: [path],
  });
  return Object.assign(render(<RouterProvider router={router} />), { router });
}

function select(testId: string, value: unknown) {
  const key = value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value);
  fireEvent.click(screen.getByTestId(`${testId}-option-${key}`));
}

function typeField(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

async function clickNext() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const png = new File(['x'], 'doc.png', { type: 'image/png' });
const txt = new File(['x'], 'doc.txt', { type: 'text/plain' });

const pendingContinues: Array<(value: unknown) => void> = [];
function hangContinue() {
  mockContinueKyc.mockImplementation(
    () =>
      new Promise((resolve) => {
        pendingContinues.push(resolve);
      }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDevice.isMobile = false;
  mockApp.isInitialized = true;
  mockApp.params = {};
  mockApp.processingKycData = false;
  mockApp.lang = undefined;
  mockAuth.user = { kyc: { hash: 'user-hash' } };
  mockNationalityCountries = [CH, DE];
  mockLanguage = LANG;
  mockToBase64.mockResolvedValue('data:image/png;base64,xx');
  mockGetFinancialData.mockResolvedValue({ questions: [], responses: [] });
  mockSetFinancialData.mockResolvedValue({ status: 'InProgress' });
  mockGetKycInfo.mockResolvedValue(info());
  mockContinueKyc.mockResolvedValue(info());
  mockStartStep.mockResolvedValue(info());
  mockReloadUser.mockResolvedValue(undefined);
  mockAddTransferClient.mockResolvedValue(undefined);
  mockCancelStep.mockResolvedValue(undefined);
  mockWindowOpen.mockReset();
  window.open = mockWindowOpen as unknown as typeof window.open;
});

afterEach(() => {
  while (pendingContinues.length) {
    pendingContinues.pop()?.(info());
  }
});

describe('KycScreen shell', () => {
  it('shows the overview and Start when no step is running', async () => {
    renderAt('/kyc?code=abc');
    await screen.findByTestId('kyc-table');
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(mockGetKycInfo).toHaveBeenCalledWith('abc');
    const idleBack = mockUseLayoutOptions.mock.calls.at(-1)?.[0] as { onBack: () => void };
    await act(async () => {
      idleBack.onBack();
    });
    await waitFor(() => expect(mockChangeLanguage).toHaveBeenCalledWith(LANG));
  });

  it('labels the button Continue once a step has started', async () => {
    mockGetKycInfo.mockResolvedValue(
      info({ kycSteps: [{ name: 'ContactData', status: 'InProgress', sequenceNumber: 0 }] }),
    );
    renderAt('/kyc?code=abc');
    await screen.findByRole('button', { name: 'Continue' });
  });

  it('loads the next step when Continue is pressed', async () => {
    mockContinueKyc.mockResolvedValue(session(step('ContactData')));
    renderAt('/kyc?code=abc');
    await screen.findByRole('button', { name: 'Start' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });
    expect(await screen.findByText('Email address')).toBeInTheDocument();
  });

  it('falls back when continue rejects without a message', async () => {
    mockContinueKyc.mockRejectedValue({});
    renderAt('/kyc?code=abc');
    await screen.findByRole('button', { name: 'Start' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('shows the pending-result panel for a Recommendation in review', async () => {
    mockStartStep.mockResolvedValue(session(step('Recommendation', 'InReview')));
    renderAt('/kyc?code=abc&step=Recommendation');
    expect(
      await screen.findByText(
        'Your recommendation request has been sent. Your contact person has to confirm it before you can continue.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('This step has already been finished.')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    });
    expect(mockGetKycInfo).toHaveBeenCalled();
  });

  it('shows the finished copy for other in-review steps', async () => {
    mockStartStep.mockResolvedValue(session(step('Ident', 'InReview')));
    renderAt('/kyc?code=abc&step=Ident');
    expect(await screen.findByText('This step has already been finished.')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Your recommendation request has been sent. Your contact person has to confirm it before you can continue.',
      ),
    ).toBeNull();
  });

  it('shows a failed-result panel', async () => {
    mockStartStep.mockResolvedValue(session(step('Recommendation', 'Failed', { reason: 'AccountExists' })));
    renderAt('/kyc?code=abc&step=Recommendation');
    expect(await screen.findByText('This step has failed.')).toBeInTheDocument();
    expect(screen.getByText('AccountExists')).toBeInTheDocument();
  });

  it('maps ?step=Ident/video:3 onto Sumsub video with a sequence', async () => {
    mockStartStep.mockResolvedValue(session(step('Ident', 'InProgress', { type: 'SumsubVideo' })));
    hangContinue();
    renderAt('/kyc?code=abc&step=Ident/video:3');
    await waitFor(() =>
      expect(mockStartStep).toHaveBeenCalledWith('abc', 'Ident', 'SumsubVideo', 3),
    );
  });

  it('maps ?step=Ident/auto onto Sumsub auto', async () => {
    mockStartStep.mockResolvedValue(session(step('Ident')));
    hangContinue();
    renderAt('/kyc?code=abc&step=Ident/auto');
    await waitFor(() => expect(mockStartStep).toHaveBeenCalledWith('abc', 'Ident', 'SumsubAuto', undefined));
  });

  it('passes an unknown step type through', async () => {
    mockStartStep.mockResolvedValue(session(step('Ident', 'InProgress', { type: 'Manual' })));
    renderAt('/kyc?code=abc&step=Ident/Manual');
    await waitFor(() => expect(mockStartStep).toHaveBeenCalledWith('abc', 'Ident', 'Manual', undefined));
  });

  it('surfaces a load error', async () => {
    mockGetKycInfo.mockRejectedValue({ message: 'boom' });
    renderAt('/kyc?code=abc');
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('boom');
  });

  it('falls back to Unknown error when the rejection has no message', async () => {
    mockGetKycInfo.mockRejectedValue({});
    renderAt('/kyc?code=abc');
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('switches account on 401 switchToCode', async () => {
    mockGetKycInfo.mockRejectedValue({ statusCode: 401, switchToCode: 'other' });
    renderAt('/kyc?code=abc');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ search: '?code=other' }));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('sends the user to 2FA when required', async () => {
    mockGetKycInfo.mockRejectedValue({ code: 'TFA_REQUIRED' });
    renderAt('/kyc?code=abc');
    await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ autoStart: 'true' }));
    expect(mockNavigate).toHaveBeenCalledWith('/2fa', { setRedirect: true });
  });

  it('opens the existing-account hint on a 409 merge', async () => {
    mockGetKycInfo.mockRejectedValue({ statusCode: 409, message: 'account exists merge' });
    renderAt('/kyc?code=abc');
    expect(await screen.findByText(/already have an account/)).toBeInTheDocument();
  });

  it('shows a 409 exists error that is not a merge', async () => {
    mockGetKycInfo.mockRejectedValue({ statusCode: 409, message: 'account exists' });
    renderAt('/kyc?code=abc');
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('account exists');
  });

  it('retries the link hint', async () => {
    mockGetKycInfo.mockRejectedValueOnce({ statusCode: 409, message: 'account exists merge' });
    mockGetKycInfo.mockResolvedValueOnce(info());
    renderAt('/kyc?code=abc');
    await screen.findByText(/already have an account/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    });
    await screen.findByTestId('kyc-table');
  });

  it('asks for client consent when the client is missing and steps are done', async () => {
    mockGetKycInfo.mockResolvedValue(
      info({
        kycSteps: [{ name: 'ContactData', status: 'Completed', sequenceNumber: 0 }],
        kycClients: [],
      }),
    );
    renderAt('/kyc?code=abc&client=Acme');
    expect(await screen.findByText(/transfer my KYC data to Acme/)).toBeInTheDocument();
    const consentBack = mockUseLayoutOptions.mock.calls.at(-1)?.[0] as { onBack: () => void };
    mockGetKycInfo.mockResolvedValue(
      info({
        kycSteps: [{ name: 'ContactData', status: 'Completed', sequenceNumber: 0 }],
        kycClients: [],
      }),
    );
    await act(async () => {
      consentBack.onBack();
    });
    mockAddTransferClient.mockResolvedValue(undefined);
    mockContinueKyc.mockResolvedValue(info({ kycSteps: [{ name: 'ContactData', status: 'Completed', sequenceNumber: 0 }] }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(mockAddTransferClient).toHaveBeenCalledWith('abc', 'Acme');
  });

  it('asks for consent when the session already has a current step', async () => {
    mockGetKycInfo.mockResolvedValue(
      session(step('ContactData'), {
        kycSteps: [{ name: 'ContactData', status: 'InProgress', sequenceNumber: 0 }],
        kycClients: [],
      }),
    );
    renderAt('/kyc?code=abc&client=Acme');
    expect(await screen.findByText(/transfer my KYC data to Acme/)).toBeInTheDocument();
  });

  it('shows a consent error', async () => {
    mockGetKycInfo.mockResolvedValue(
      info({ kycSteps: [{ name: 'ContactData', status: 'Completed', sequenceNumber: 0 }] }),
    );
    mockAddTransferClient.mockRejectedValue({ message: 'nope' });
    renderAt('/kyc?code=abc&client=Acme');
    await screen.findByText(/transfer my KYC data to Acme/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('nope');
  });

  it('falls back when consent fails without a message', async () => {
    mockGetKycInfo.mockResolvedValue(
      info({ kycSteps: [{ name: 'ContactData', status: 'Completed', sequenceNumber: 0 }] }),
    );
    mockAddTransferClient.mockRejectedValue({});
    renderAt('/kyc?code=abc&client=Acme');
    await screen.findByText(/transfer my KYC data/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('opens an https kyc-redirect when every step is done', async () => {
    mockGetKycInfo.mockResolvedValue(
      info({ kycSteps: [{ name: 'ContactData', status: 'Completed', sequenceNumber: 0 }] }),
    );
    renderAt('/kyc?code=abc&kyc-redirect=https://app.dfx.swiss/done');
    await waitFor(() => expect(mockWindowOpen).toHaveBeenCalledWith('https://app.dfx.swiss/done', '_self'));
  });

  it('ignores a non-https redirect and an invalid URL', async () => {
    mockGetKycInfo.mockResolvedValue(
      info({ kycSteps: [{ name: 'ContactData', status: 'Completed', sequenceNumber: 0 }] }),
    );
    renderAt('/kyc?code=abc&kyc-redirect=http://localhost/done');
    await screen.findByTestId('kyc-table');
    expect(mockWindowOpen).not.toHaveBeenCalled();

    const { unmount } = renderAt('/kyc?code=abc&kyc-redirect=not a url');
    await screen.findAllByTestId('kyc-table');
    unmount();
  });

  it('sends a completed user to the limit-request form', async () => {
    mockGetKycInfo.mockResolvedValue(
      info({
        kycLevel: 50,
        kycSteps: [{ name: 'ContactData', status: 'Completed', sequenceNumber: 0 }],
      }),
    );
    renderAt('/kyc?code=abc');
    await screen.findByTestId('kyc-table');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'raise-limit' }));
    });
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/support/issue',
      search: '?issue-type=LimitRequest',
    });
  });

  it('continues KYC from the limit-increase control when steps remain', async () => {
    mockContinueKyc.mockResolvedValue(session(step('ContactData')));
    renderAt('/kyc?code=abc');
    await screen.findByTestId('kyc-table');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'raise-limit' }));
    });
    expect(mockContinueKyc).toHaveBeenCalled();
  });

  it('auto-starts once the app is ready', async () => {
    mockApp.params = { autoStart: 'true' };
    mockContinueKyc.mockResolvedValue(info());
    renderAt('/kyc?code=abc');
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled());
    await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ autoStart: undefined }));
  });

  it('waits for processing KYC data before auto-start', async () => {
    mockApp.params = { autoStart: 'true' };
    mockApp.processingKycData = true;
    renderAt('/kyc?code=abc');
    await screen.findByRole('status');
    expect(mockContinueKyc).not.toHaveBeenCalled();
  });

  it('does not load until the app is initialized', async () => {
    mockApp.isInitialized = false;
    renderAt('/kyc?code=abc');
    await screen.findByRole('status');
  });

  it('goes back from /contact when the Link level is already met', async () => {
    mockGetKycInfo.mockResolvedValue(info({ kycLevel: 10 }));
    renderAt('/contact?code=abc');
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
  });

  it('continues KYC from /profile when below Sell', async () => {
    mockGetKycInfo.mockResolvedValue(info({ kycLevel: 10 }));
    mockContinueKyc.mockResolvedValue(session(step('PersonalData'), { kycLevel: 10 }));
    renderAt('/profile?code=abc');
    expect(await screen.findByText('Account Type')).toBeInTheDocument();
  });

  it('returns from /contact after continue raises the level', async () => {
    mockGetKycInfo.mockResolvedValue(info({ kycLevel: 0 }));
    mockContinueKyc.mockResolvedValue(session(undefined, { kycLevel: 10 }));
    renderAt('/contact?code=abc');
    await waitFor(() => expect(mockReloadUser).toHaveBeenCalled());
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('opens the merge hint when ContactData fails with a merge request', async () => {
    mockContinueKyc.mockResolvedValue(
      session(step('ContactData', 'Failed', { reason: 'AccountMergeRequested' })),
    );
    renderAt('/kyc?code=abc');
    await screen.findByRole('button', { name: 'Start' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });
    expect(await screen.findByText(/already have an account/)).toBeInTheDocument();
  });

  it('shows the ContactData failure reason otherwise', async () => {
    mockContinueKyc.mockResolvedValue(session(step('ContactData', 'Failed', { reason: 'AccountExists' })));
    renderAt('/kyc?code=abc');
    await screen.findByRole('button', { name: 'Start' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('AccountExists');
  });

  it('clears an in-progress step on back', async () => {
    mockStartStep.mockResolvedValue(session(step('ContactData')));
    renderAt('/kyc?code=abc&step=ContactData');
    await screen.findByText('Email address');
    const opts = mockUseLayoutOptions.mock.calls.at(-1)?.[0] as { onBack: () => void };
    await act(async () => {
      opts.onBack();
    });
    await screen.findByTestId('kyc-table');
  });

  it('reloads from the link hint on back', async () => {
    mockGetKycInfo.mockRejectedValueOnce({ statusCode: 409, message: 'account exists merge' });
    mockGetKycInfo.mockResolvedValue(info());
    renderAt('/kyc?code=abc');
    await screen.findByText(/already have an account/);
    const opts = mockUseLayoutOptions.mock.calls.at(-1)?.[0] as { onBack: () => void };
    await act(async () => {
      opts.onBack();
    });
    await screen.findByTestId('kyc-table');
  });

  it('cancels a cancelable step', async () => {
    mockStartStep.mockResolvedValue(session(step('PhoneChange')));
    mockCancelStep.mockResolvedValue(undefined);
    mockGetKycInfo.mockResolvedValue(info());
    renderAt('/kyc?code=abc&step=PhoneChange');
    await screen.findByText('Phone number');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(mockCancelStep).toHaveBeenCalled();
  });

  it('skips cancel when the step has no session', async () => {
    mockStartStep.mockResolvedValue(
      session({ name: 'PhoneChange', status: 'InProgress', sequenceNumber: 0 }),
    );
    renderAt('/kyc?code=abc&step=PhoneChange');
    await screen.findByRole('button', { name: 'Cancel' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(mockCancelStep).not.toHaveBeenCalled();
  });

  it('surfaces a cancel error', async () => {
    mockStartStep.mockResolvedValue(session(step('PhoneChange')));
    mockCancelStep.mockRejectedValue({});
    renderAt('/kyc?code=abc&step=PhoneChange');
    await screen.findByText('Phone number');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('sets noPadding on mobile browser sessions', async () => {
    mockDevice.isMobile = true;
    mockStartStep.mockResolvedValue(
      session(step('Ident', 'InProgress', { session: { url: 'https://app.dfx.swiss/ident', type: 'Browser' } })),
    );
    hangContinue();
    renderAt('/kyc?code=abc&step=Ident');
    await waitFor(() =>
      expect(mockUseLayoutOptions).toHaveBeenCalledWith(expect.objectContaining({ noPadding: true })),
    );
  });

  it('skips loading when no kyc code is available', async () => {
    mockAuth.user = undefined;
    renderAt('/kyc');
    await screen.findByRole('status');
    expect(mockGetKycInfo).not.toHaveBeenCalled();
  });

  it('does not reload from the link hint once the code is gone', async () => {
    mockGetKycInfo.mockRejectedValueOnce({ statusCode: 409, message: 'account exists merge' });
    const { router } = renderAt('/kyc?code=abc');
    await screen.findByText(/already have an account/);
    mockAuth.user = undefined;
    mockGetKycInfo.mockClear();
    await act(async () => {
      await router.navigate('/kyc');
    });
    const opts = mockUseLayoutOptions.mock.calls.at(-1)?.[0] as { onBack: () => void };
    await act(async () => {
      opts.onBack();
    });
    expect(mockGetKycInfo).not.toHaveBeenCalled();
  });

  it('does not send consent once the code is gone', async () => {
    mockGetKycInfo.mockResolvedValue(
      info({
        kycSteps: [{ name: 'ContactData', status: 'Completed', sequenceNumber: 0 }],
        kycClients: [],
      }),
    );
    const { router } = renderAt('/kyc?code=abc&client=Acme');
    await screen.findByText(/transfer my KYC data to Acme/);
    mockAuth.user = undefined;
    mockAddTransferClient.mockClear();
    await act(async () => {
      await router.navigate('/kyc?client=Acme');
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(mockAddTransferClient).not.toHaveBeenCalled();
  });
});

describe('KycEdit routing', () => {
  it.each([
    ['CommercialRegister'],
    ['DfxApproval'],
    ['UnknownStep'],
  ])('renders nothing for %s', async (name) => {
    mockStartStep.mockResolvedValue(session(step(name)));
    renderAt(`/kyc?code=abc&step=${name}`);
    await waitFor(() => expect(mockStartStep).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByTestId('file')).toBeNull();
    expect(screen.queryByTestId('result-hint')).toBeNull();
  });

  it('opens FileUpload with a hint for sole-proprietorship confirmation', async () => {
    mockStartStep.mockResolvedValue(session(step('SoleProprietorshipConfirmation')));
    renderAt('/kyc?code=abc&step=SoleProprietorshipConfirmation');
    expect(await screen.findByText(/Commercial register extract/)).toBeInTheDocument();
  });

  it('opens OwnerDirectory with a template', async () => {
    mockLanguage = { symbol: 'FR', name: 'Français' };
    mockStartStep.mockResolvedValue(session(step('OwnerDirectory')));
    renderAt('/kyc?code=abc&step=OwnerDirectory');
    expect(await screen.findByRole('button', { name: 'Document template' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Document template' }));
    });
    expect(mockWindowOpen).toHaveBeenCalled();
  });

  it('falls back to the English template when the language has no URL', async () => {
    mockLanguage = { symbol: 'IT', name: 'Italiano' };
    mockStartStep.mockResolvedValue(session(step('OwnerDirectory')));
    renderAt('/kyc?code=abc&step=OwnerDirectory');
    expect(await screen.findByRole('button', { name: 'Document template' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Document template' }));
    });
    expect(mockWindowOpen).toHaveBeenCalled();
  });

  it('opens Authority with a template', async () => {
    mockStartStep.mockResolvedValue(session(step('Authority')));
    renderAt('/kyc?code=abc&step=Authority');
    expect(await screen.findByRole('button', { name: 'Document template' })).toBeInTheDocument();
  });

  it.each([['AdditionalDocuments'], ['ResidencePermit'], ['Statutes']])(
    'opens %s as a file upload',
    async (name) => {
      mockStartStep.mockResolvedValue(session(step(name)));
      renderAt(`/kyc?code=abc&step=${name}`);
      expect(await screen.findByTestId('file')).toBeInTheDocument();
    },
  );
});

describe('ContactData', () => {
  it('confirms the mail and completes the step', async () => {
    mockStartStep.mockResolvedValue(session(step('ContactData')));
    mockSetContactData.mockResolvedValueOnce({ status: 'InProgress' });
    mockSetContactData.mockResolvedValue({ status: 'InReview' });
    mockContinueKyc.mockResolvedValue(info());
    renderAt('/kyc?code=abc&step=ContactData');
    await screen.findByTestId('mail');
    typeField('mail', 'a@b.ch');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByText('Is this email address correct?')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    });
    expect(mockSetContactData).toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    });
    expect(mockContinueKyc).toHaveBeenCalled();
  });

  it('shows extra copy outside KYC mode and handles a merge fail', async () => {
    mockStartStep.mockResolvedValue(session(step('ContactData'), { kycLevel: 0 }));
    mockSetContactData.mockResolvedValue({ status: 'Failed', reason: 'AccountMergeRequested' });
    renderAt('/contact?code=abc&step=ContactData');
    expect(await screen.findByText('Please fill in personal information to continue')).toBeInTheDocument();
    typeField('mail', 'a@b.ch');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    });
    expect(await screen.findByText(/already have an account/)).toBeInTheDocument();
  });

  it('shows a non-merge fail reason and skips submit without a session', async () => {
    mockStartStep.mockResolvedValue(
      session({ name: 'ContactData', status: 'InProgress', sequenceNumber: 0 }),
    );
    const first = renderAt('/kyc?code=abc&step=ContactData');
    await screen.findByTestId('mail');
    typeField('mail', 'a@b.ch');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    });
    expect(mockSetContactData).not.toHaveBeenCalled();
    first.unmount();

    mockStartStep.mockResolvedValue(session(step('ContactData')));
    mockSetContactData.mockResolvedValue({ status: 'Failed', reason: 'AccountExists' });
    renderAt('/kyc?code=def&step=ContactData');
    await screen.findByTestId('mail');
    typeField('mail', 'a@b.ch');
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Next' }).at(-1) as HTMLElement);
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('AccountExists');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'error-back' }));
    });
  });
});

describe('PersonalData', () => {
  it('submits a personal account in KYC mode', async () => {
    mockStartStep.mockResolvedValue(session(step('PersonalData')));
    mockSetPersonalData.mockResolvedValue({});
    mockContinueKyc.mockResolvedValue(info());
    renderAt('/kyc?code=abc&step=PersonalData');
    await screen.findByTestId('accountType');
    select('accountType', 'Personal');
    await screen.findByTestId('firstName');
    typeField('firstName', 'Ada');
    typeField('lastName', 'Lovelace');
    typeField('address.street', 'Bahnhof');
    typeField('address.city', 'Zurich');
    typeField('address.zip', '8001');
    typeField('phone', '+41791234567');
    fireEvent.change(screen.getByTestId('address.country-search'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('address.country-search'), { target: { value: 'zz' } });
    fireEvent.change(screen.getByTestId('address.country-search'), { target: { value: 'ch' } });
    fireEvent.change(screen.getByTestId('address.country-search'), { target: { value: 'Switzerland' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(mockSetPersonalData).toHaveBeenCalled();
  });

  it('shows organization fields and goes back in profile mode', async () => {
    mockStartStep.mockResolvedValue(session(step('PersonalData'), { kycLevel: 10 }));
    mockSetPersonalData.mockResolvedValue({});
    renderAt('/profile?code=abc&step=PersonalData');
    await screen.findByTestId('accountType');
    select('accountType', 'Organization');
    await screen.findByTestId('organizationName');
    typeField('organizationName', 'ACME');
    fireEvent.change(screen.getByTestId('organizationAddress.country-search'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('organizationAddress.country-search'), { target: { value: 'zz' } });
    fireEvent.change(screen.getByTestId('organizationAddress.country-search'), { target: { value: 'ch' } });
    fireEvent.change(screen.getByTestId('organizationAddress.country-search'), { target: { value: 'Switzerland' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(mockSetPersonalData).toHaveBeenCalled();
  });

  it('shows an API error and skips submit without a session', async () => {
    mockStartStep.mockResolvedValue(
      session({ name: 'PersonalData', status: 'InProgress', sequenceNumber: 0 }),
    );
    renderAt('/kyc?code=abc&step=PersonalData');
    await screen.findByTestId('accountType');
    select('accountType', 'Personal');
    await screen.findByTestId('firstName');
    typeField('firstName', 'Ada');
    typeField('lastName', 'Lovelace');
    typeField('address.street', 'Bahnhof');
    typeField('address.city', 'Zurich');
    typeField('address.zip', '8001');
    typeField('phone', '+41791234567');
    fireEvent.change(screen.getByTestId('address.country-search'), { target: { value: 'Switzerland' } });
    await clickNext();
    expect(mockSetPersonalData).not.toHaveBeenCalled();
  });

  it('reports a PersonalData API error', async () => {
    mockStartStep.mockResolvedValue(session(step('PersonalData')));
    mockSetPersonalData.mockRejectedValue({});
    renderAt('/kyc?code=abc&step=PersonalData');
    await screen.findByTestId('accountType');
    await act(async () => {
      select('accountType', 'Personal');
    });
    expect(await screen.findByTestId('firstName')).toBeInTheDocument();
    typeField('firstName', 'Ada');
    typeField('lastName', 'Lovelace');
    typeField('address.street', 'Bahnhof');
    typeField('address.city', 'Zurich');
    typeField('address.zip', '8001');
    typeField('phone', '+41791234567');
    fireEvent.change(screen.getByTestId('address.country-search'), { target: { value: 'Switzerland' } });
    await clickNext();
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });
});

describe('form steps', () => {
  async function land(name: string, extra: Record<string, unknown> = {}) {
    mockStartStep.mockResolvedValue(session(step(name, 'InProgress', extra)));
    renderAt(`/kyc?code=abc&step=${name}`);
    await screen.findByRole('button', { name: 'Next' });
  }

  it('LegalEntity requires a file then submits', async () => {
    await land('LegalEntity');
    await screen.findByTestId('legalEntity');
    select('legalEntity', 'Other');
    select('legalEntity', 'AG');
    mockToBase64.mockResolvedValueOnce(undefined);
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('No file selected');
    mockToBase64.mockResolvedValue('data:image/png;base64,xx');
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    mockSetLegalEntityData.mockResolvedValue({});
    mockContinueKyc.mockResolvedValue(info());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(mockSetLegalEntityData).toHaveBeenCalled();
  });

  it('LegalEntity surfaces an API error', async () => {
    await land('LegalEntity');
    fireEvent.change(await screen.findByTestId('file'), { target: { files: [png] } });
    mockSetLegalEntityData.mockRejectedValue({});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('Nationality submits and reports errors', async () => {
    mockNationalityCountries = undefined;
    await land('NationalityData');
    fireEvent.change(await screen.findByTestId('nationality-search'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('nationality-search'), { target: { value: 'zz' } });
    fireEvent.change(screen.getByTestId('nationality-search'), { target: { value: 'ch' } });
    fireEvent.change(screen.getByTestId('nationality-search'), { target: { value: 'Switzerland' } });
    mockSetNationalityData.mockRejectedValue({});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('Recommendation submits a matching key', async () => {
    await land('Recommendation');
    await screen.findByTestId('key');
    typeField('key', 'ref');
    mockSetRecommendationData.mockResolvedValue({});
    mockContinueKyc.mockResolvedValue(info());
    await clickNext();
    expect(mockSetRecommendationData).toHaveBeenCalled();
  });

  it('Recommendation maps a 404 to no matching user', async () => {
    await land('Recommendation');
    typeField('key', 'ref');
    mockSetRecommendationData.mockRejectedValue({ statusCode: 404 });
    await clickNext();
    expect(await screen.findByText('No matching user found')).toBeInTheDocument();
  });

  it('Recommendation maps a 400 invitation-code error', async () => {
    await land('Recommendation');
    typeField('key', 'ref');
    mockSetRecommendationData.mockRejectedValue({
      statusCode: 400,
      message: 'Recommendation code is invalid',
    });
    await clickNext();
    expect(await screen.findByText('Invalid invitation code')).toBeInTheDocument();
  });

  it('Recommendation maps a 400 without that phrase to invalid key', async () => {
    await land('Recommendation');
    typeField('key', 'ref');
    mockSetRecommendationData.mockRejectedValue({ statusCode: 400, message: 'other' });
    await clickNext();
    expect(await screen.findByText('Invalid key')).toBeInTheDocument();
  });

  it('Recommendation maps other errors onto the hint', async () => {
    await land('Recommendation');
    typeField('key', 'ref');
    mockSetRecommendationData.mockRejectedValue({});
    await clickNext();
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('FileUpload reports a missing file, API error and no-session', async () => {
    await land('AdditionalDocuments');
    fireEvent.change(screen.getByTestId('file'), { target: { files: [txt] } });
    mockToBase64.mockResolvedValueOnce(undefined);
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    await clickNext();
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('No file selected');

    mockToBase64.mockResolvedValue('data:image/png;base64,xx');
    mockSetFileData.mockRejectedValueOnce({ message: 'too big' });
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    await clickNext();
    expect(await screen.findByText('too big')).toBeInTheDocument();

    mockSetFileData.mockRejectedValueOnce({});
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    await clickNext();
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });

  it('SignatoryPower submits', async () => {
    await land('SignatoryPower');
    select('signatoryPower', 'Single');
    mockSetSignatoryPowerData.mockRejectedValue({});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  async function landWithoutSession(name: string) {
    mockStartStep.mockResolvedValue(session({ name, status: 'InProgress', sequenceNumber: 0 }));
    renderAt(`/kyc?code=abc&step=${name}`);
    await screen.findByRole('button', { name: 'Next' });
  }

  it('skips Nationality submit without a session', async () => {
    await landWithoutSession('NationalityData');
    fireEvent.change(screen.getByTestId('nationality-search'), { target: { value: 'Switzerland' } });
    await clickNext();
    expect(mockSetNationalityData).not.toHaveBeenCalled();
  });

  it('skips Recommendation submit without a session', async () => {
    await landWithoutSession('Recommendation');
    typeField('key', 'ref');
    await clickNext();
    expect(mockSetRecommendationData).not.toHaveBeenCalled();
  });

  it('skips SignatoryPower submit without a session', async () => {
    await landWithoutSession('SignatoryPower');
    select('signatoryPower', 'Single');
    await clickNext();
    expect(mockSetSignatoryPowerData).not.toHaveBeenCalled();
  });

  it('skips OperationalActivity submit without a session', async () => {
    await landWithoutSession('OperationalActivity');
    select('isOperational', false);
    await clickNext();
    expect(mockSetOperationalData).not.toHaveBeenCalled();
  });

  it('skips FileUpload submit without a session', async () => {
    mockLanguage = undefined;
    await landWithoutSession('AdditionalDocuments');
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    await clickNext();
    expect(mockSetFileData).not.toHaveBeenCalled();
  });

  it('skips LegalEntity submit without a session', async () => {
    await landWithoutSession('LegalEntity');
    select('legalEntity', 'AG');
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    await clickNext();
    expect(mockSetLegalEntityData).not.toHaveBeenCalled();
  });

  it('skips PaymentAgreement submit without a session', async () => {
    await landWithoutSession('PaymentAgreement');
    typeField('name', 'Shop');
    typeField('registrationNumber', 'CHE');
    typeField('purpose', 'sales');
    select('storeType', 'Online');
    select('merchantCategory', 'Bank');
    select('goodsType', 'Tangible');
    select('goodsCategory', 'Jewelry');
    fireEvent.click(screen.getByTestId('checkbox'));
    await clickNext();
    expect(mockSetPaymentData).not.toHaveBeenCalled();
  });

  it('skips RecallAgreement submit without a session', async () => {
    await landWithoutSession('RecallAgreement');
    fireEvent.click(screen.getByTestId('checkbox'));
    await clickNext();
    expect(mockSetRecallData).not.toHaveBeenCalled();
  });

  it('OperationalActivity shows the website when operational', async () => {
    await land('OperationalActivity');
    select('isOperational', true);
    expect(await screen.findByTestId('website')).toBeInTheDocument();
    typeField('website', 'not-a-url');
    typeField('website', 'https://app.dfx.swiss');
    mockSetOperationalData.mockRejectedValue({});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });
});

describe('BeneficialOwner', () => {
  it('walks owner-count, involvement and contact data, including back', async () => {
    mockStartStep.mockResolvedValue(
      session(
        step('BeneficialOwner', 'InProgress', {
          session: { url: 'https://api.dfx.swiss/step', type: 'API', additionalInfo: { accountHolder: 'Ada' } },
        }),
      ),
    );
    mockSetBeneficialData.mockResolvedValue({});
    mockContinueKyc.mockResolvedValue(info());
    renderAt('/kyc?code=abc&step=BeneficialOwner');
    await screen.findByTestId('ownerCount');
    select('ownerCount', 2);
    await clickNext();
    expect(await screen.findByTestId('isAccountHolderInvolved-option-false')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await screen.findByTestId('ownerCount');
    select('ownerCount', 2);
    await clickNext();
    await screen.findByTestId('isAccountHolderInvolved-option-false');
    select('isAccountHolderInvolved', false);
    await clickNext();
    expect(await screen.findByTestId('owners.0.firstName')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await screen.findByTestId('isAccountHolderInvolved-option-false');
    select('isAccountHolderInvolved', false);
    await clickNext();
    expect(await screen.findByTestId('owners.0.firstName')).toBeInTheDocument();
    typeField('owners.0.firstName', 'Ann');
    typeField('owners.0.lastName', 'Owner');
    typeField('owners.0.street', 'A');
    typeField('owners.0.zip', '8001');
    typeField('owners.0.city', 'Z');
    fireEvent.change(screen.getByTestId('owners.0.country-search'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('owners.0.country-search'), { target: { value: 'zz' } });
    fireEvent.change(screen.getByTestId('owners.0.country-search'), { target: { value: 'ch' } });
    fireEvent.change(screen.getByTestId('owners.0.country-search'), { target: { value: 'Switzerland' } });
    await clickNext();
    expect(await screen.findByTestId('owners.1.firstName')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await clickNext();
    await screen.findByTestId('owners.1.firstName');
    typeField('owners.1.firstName', 'Bob');
    typeField('owners.1.lastName', 'Owner');
    typeField('owners.1.street', 'B');
    typeField('owners.1.zip', '8001');
    typeField('owners.1.city', 'Z');
    fireEvent.change(screen.getByTestId('owners.1.country-search'), { target: { value: 'Switzerland' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(mockSetBeneficialData).toHaveBeenCalled();
  });

  it('skips BeneficialOwner submit without a session', async () => {
    mockStartStep.mockResolvedValue(
      session({ name: 'BeneficialOwner', status: 'InProgress', sequenceNumber: 0 }),
    );
    renderAt('/kyc?code=abc&step=BeneficialOwner');
    await screen.findByTestId('ownerCount');
    select('ownerCount', 1);
    await clickNext();
    expect(mockSetBeneficialData).not.toHaveBeenCalled();
    expect(screen.getByTestId('ownerCount')).toBeInTheDocument();
  });

  it('submits immediately when the account holder is the only owner', async () => {
    mockStartStep.mockResolvedValue(session(step('BeneficialOwner')));
    mockSetBeneficialData.mockResolvedValue({});
    mockContinueKyc.mockResolvedValue(info());
    renderAt('/kyc?code=abc&step=BeneficialOwner');
    await screen.findByTestId('ownerCount');
    select('ownerCount', 1);
    await clickNext();
    await screen.findByTestId('isAccountHolderInvolved-option-true');
    select('isAccountHolderInvolved', true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(mockSetBeneficialData).toHaveBeenCalled();
  });

  it('collects a managing director when there are no owners', async () => {
    mockStartStep.mockResolvedValue(session(step('BeneficialOwner')));
    mockSetBeneficialData.mockRejectedValue({});
    renderAt('/kyc?code=abc&step=BeneficialOwner');
    await screen.findByTestId('ownerCount');
    select('ownerCount', 0);
    await clickNext();
    await screen.findByTestId('isAccountHolderInvolved-option-false');
    select('isAccountHolderInvolved', false);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByText('Managing director')).toBeInTheDocument();
    typeField('director.firstName', 'Dir');
    typeField('director.lastName', 'Ector');
    typeField('director.street', 'S');
    typeField('director.zip', '1');
    typeField('director.city', 'C');
    fireEvent.change(screen.getByTestId('director.country-search'), { target: { value: 'Switzerland' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });
});

describe('Ident', () => {
  function sumsub() {
    return mockSumsub;
  }

  it('drives the Sumsub token session', async () => {
    hangContinue();
    mockStartStep.mockResolvedValue(
      session(step('Ident', 'InProgress', { type: 'SumsubAuto', session: { url: 'tok', type: 'Token' } })),
    );
    renderAt('/kyc?code=abc&step=Ident');
    await screen.findByTestId('sumsub');
    await act(async () => {
      sumsub().onMessage?.('idCheck.onApplicantStatusChanged', {
        reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'FINAL', moderationComment: 'blurry' },
      });
    });
    expect(await screen.findByText('The identification has failed.')).toBeInTheDocument();
    expect(screen.getByText('blurry')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ok' }));
    });
  });

  it('marks video done and greens auto', async () => {
    hangContinue();
    mockStartStep.mockResolvedValue(
      session(step('Ident', 'InProgress', { type: 'SumsubVideo', session: { url: 'tok', type: 'Token' } })),
    );
    renderAt('/kyc?code=abc&step=Ident');
    await screen.findByTestId('sumsub');
    await act(async () => {
      sumsub().onMessage('idCheck.onStepCompleted', {});
    });
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('accepts a green review and an SDK error', async () => {
    hangContinue();
    mockStartStep.mockResolvedValue(
      session(step('Ident', 'InProgress', { type: 'SumsubAuto', session: { url: 'tok', type: 'Token' } })),
    );
    renderAt('/kyc?code=abc&step=Ident');
    await screen.findByTestId('sumsub');
    await act(async () => {
      sumsub().onMessage('idCheck.onApplicantStatusChanged', { reviewResult: { reviewAnswer: 'GREEN' } });
    });
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('stops listening for iframe messages after unmount', async () => {
    hangContinue();
    mockStartStep.mockResolvedValue(
      session(step('Ident', 'InProgress', { session: { url: 'https://app.dfx.swiss/ident', type: 'Browser' } })),
    );
    const view = renderAt('/kyc?code=abc&step=Ident');
    await screen.findByTitle('', { exact: false }).catch(() => document.querySelector('iframe'));
    view.unmount();
    mockContinueKyc.mockClear();
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'dfx-iframe-message', status: 'Completed', name: 'Ident' } }),
      );
    });
    expect(mockContinueKyc).not.toHaveBeenCalled();
  });

  it('renders an iframe session and handles iframe messages', async () => {
    hangContinue();
    mockStartStep.mockResolvedValue(
      session(step('Ident', 'InProgress', { session: { url: 'https://app.dfx.swiss/ident', type: 'Browser' } })),
    );
    renderAt('/kyc?code=abc&step=Ident');
    expect(await screen.findByTitle('', { exact: false }).catch(() => document.querySelector('iframe'))).toBeTruthy();
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'other', status: 'Completed' } }));
    });
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'dfx-iframe-message', status: 'Completed', name: 'Ident' } }),
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'dfx-iframe-message', status: 'NotStarted', name: 'Ident' } }),
      );
    });
  });

  it('shows No session URL without a session', async () => {
    mockStartStep.mockResolvedValue(
      session({ name: 'Ident', status: 'InProgress', sequenceNumber: 0 }),
    );
    renderAt('/kyc?code=abc&step=Ident');
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('No session URL');
  });

  it('surfaces an SDK error', async () => {
    hangContinue();
    mockStartStep.mockResolvedValue(
      session(step('Ident', 'InProgress', { type: 'SumsubAuto', session: { url: 'tok', type: 'Token' } })),
    );
    renderAt('/kyc?code=abc&step=Ident');
    await screen.findByTestId('sumsub');
    await act(async () => {
      sumsub().onError({ error: 'sdk-fail' });
    });
    expect(await screen.findByText('sdk-fail')).toBeInTheDocument();
  });

  it('shows Unknown error when a red review has no comment', async () => {
    hangContinue();
    mockStartStep.mockResolvedValue(
      session(step('Ident', 'InProgress', { type: 'SumsubAuto', session: { url: 'tok', type: 'Token' } })),
    );
    renderAt('/kyc?code=abc&step=Ident');
    await screen.findByTestId('sumsub');
    await act(async () => {
      sumsub().onMessage?.('idCheck.onApplicantStatusChanged', {
        reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'FINAL' },
      });
    });
    expect(await screen.findByText('The identification has failed.')).toBeInTheDocument();
    expect(screen.getByText('Unknown error')).toBeInTheDocument();
  });

  it('refreshes after the ident interval once done', async () => {
    hangContinue();
    mockStartStep.mockResolvedValue(
      session(step('Ident', 'InProgress', { type: 'SumsubAuto', session: { url: 'tok', type: 'Token' } })),
    );
    renderAt('/kyc?code=abc&step=Ident');
    await screen.findByTestId('sumsub');
    await act(async () => {
      sumsub().onMessage?.('idCheck.onApplicantStatusChanged', {
        reviewResult: { reviewAnswer: 'GREEN' },
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
  });

  it('calls the token expiration handler', async () => {
    hangContinue();
    mockStartStep.mockResolvedValue(
      session(step('Ident', 'InProgress', { type: 'SumsubAuto', session: { url: 'tok', type: 'Token' } })),
    );
    renderAt('/kyc?code=abc&step=Ident');
    await screen.findByTestId('sumsub');
    let token = 'pending';
    await act(async () => {
      token = (await sumsub().expirationHandler?.()) ?? 'missing';
    });
    expect(token).toBe('');
  });
});

describe('FinancialData', () => {
  const questions = [
    {
      key: 'tnc',
      type: 'Confirmation',
      title: 'T&C',
      description: 'Accept terms',
      options: [{ key: 'yes', text: 'Yes' }],
    },
    {
      key: 'notification_of_changes',
      type: 'Confirmation',
      title: 'NOC',
      description: 'See app.dfx.swiss/support/issue for details',
      options: [{ key: 'yes', text: 'Yes' }],
      conditions: [{ question: 'tnc', response: 'yes' }],
    },
    {
      key: 'own_funds',
      type: 'Confirmation',
      title: 'Funds',
      description: 'Own funds',
      options: [{ key: 'yes', text: 'Yes' }],
      conditions: [{ question: 'notification_of_changes', response: 'yes' }],
    },
    {
      key: 'source',
      type: 'SingleChoice',
      title: 'Source',
      description: 'Where from',
      options: [
        { key: 'job', text: 'Job' },
        { key: 'gift', text: 'Gift' },
      ],
      conditions: [{ question: 'own_funds', response: 'yes' }],
    },
    {
      key: 'coins',
      type: 'MultipleChoice',
      title: 'Coins',
      description: 'Which',
      options: [
        { key: 'btc', text: 'BTC' },
        { key: 'eth', text: 'ETH' },
      ],
      conditions: [{ question: 'source', response: 'job' }],
    },
    {
      key: 'note',
      type: 'Text',
      title: 'Note',
      description: 'Anything else',
      conditions: [{ question: 'coins', response: 'btc' }],
    },
    {
      key: 'plain',
      type: 'Confirmation',
      title: 'Plain',
      description: 'Just confirm',
      options: [{ key: 'yes', text: 'Yes' }],
      conditions: [{ question: 'note', response: 'hi' }],
    },
  ];

  it('updates an existing financial answer', async () => {
    mockGetFinancialData.mockResolvedValue({
      questions: [
        { key: 'note', type: 'Text', title: 'Note', description: 'Anything else' },
        { key: 'more', type: 'Text', title: 'More', description: 'And more' },
      ],
      responses: [{ key: 'note', value: 'old' }],
    });
    mockSetFinancialData.mockResolvedValue({ status: 'InProgress' });
    mockStartStep.mockResolvedValue(session(step('FinancialData')));
    renderAt('/kyc?code=abc&step=FinancialData');
    expect(await screen.findByText('More')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('icon-back'));
    expect(await screen.findByText('Note')).toBeInTheDocument();
    expect(screen.getByTestId('text')).toHaveValue('old');
    await clickNext();
    expect(await screen.findByText('More')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('icon-back'));
    expect(await screen.findByText('Note')).toBeInTheDocument();
    typeField('text', 'new');
    expect(screen.getByTestId('text')).toHaveValue('new');
    await clickNext();
    await waitFor(() =>
      expect(mockSetFinancialData).toHaveBeenCalledWith(
        'abc',
        'https://api.dfx.swiss/step',
        { responses: [expect.objectContaining({ key: 'note', value: 'new' })] },
      ),
    );
  });

  it('does not load questions without a session', async () => {
    mockStartStep.mockResolvedValue(
      session({ name: 'FinancialData', status: 'InProgress', sequenceNumber: 0 }),
    );
    renderAt('/kyc?code=abc&step=FinancialData');
    await waitFor(() => expect(mockStartStep).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockGetFinancialData).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('walks every question type, back, and completion', async () => {
    mockGetFinancialData.mockResolvedValue({ questions, responses: [] });
    mockSetFinancialData.mockResolvedValue({ status: 'InProgress' });
    mockStartStep.mockResolvedValue(session(step('FinancialData')));
    renderAt('/kyc?code=abc&step=FinancialData');
    expect(await screen.findByText('T&C')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('checkbox'));
    fireEvent.click(screen.getByTestId('checkbox'));
    fireEvent.click(screen.getByTestId('checkbox'));
    mockSetFinancialData.mockResolvedValueOnce({ status: 'InProgress' });
    await clickNext();
    expect(await screen.findByText('NOC')).toBeInTheDocument();
    fireEvent.click(screen.getByText('app.dfx.swiss/support/issue'));
    expect(mockWindowOpen).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('checkbox'));
    await clickNext();
    expect(await screen.findByText(/deliberate/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('checkbox'));
    await clickNext();
    select('selection', { key: 'job', text: 'Job' });
    await clickNext();
    fireEvent.click(screen.getByTestId('selectionMC-option-btc'));
    await clickNext();
    typeField('text', 'hi');
    await clickNext();
    expect(await screen.findByText('Just confirm')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('icon-back'));
    typeField('text', 'hi');
    typeField('text', 'ho');
    mockSetFinancialData.mockResolvedValue({ status: 'Completed' });
    mockContinueKyc.mockResolvedValue(info());
    await clickNext();
    await waitFor(() => expect(mockSetFinancialData).toHaveBeenCalled());
  });

  it('resumes at the first unanswered question', async () => {
    mockGetFinancialData.mockResolvedValue({
      questions: [
        {
          key: 'tnc',
          type: 'Confirmation',
          title: 'T&C',
          description: 'Accept terms',
          options: [{ key: 'yes', text: 'Yes' }],
        },
        {
          key: 'later',
          type: 'Confirmation',
          title: 'ResumeHere',
          description: 'Continue later',
          options: [{ key: 'yes', text: 'Yes' }],
        },
      ],
      responses: [{ key: 'tnc', value: 'yes' }],
    });
    mockSetFinancialData.mockResolvedValue({ status: 'InProgress' });
    mockStartStep.mockResolvedValue(session(step('FinancialData')));
    renderAt('/kyc?code=abc&step=FinancialData');
    expect(await screen.findByText('ResumeHere')).toBeInTheDocument();
  });

  it('shows a load error', async () => {
    mockGetFinancialData.mockRejectedValue({});
    mockStartStep.mockResolvedValue(session(step('FinancialData')));
    renderAt('/kyc?code=abc&step=FinancialData');
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('ignores Next before a value is chosen', async () => {
    mockGetFinancialData.mockResolvedValue({
      questions: [
        {
          key: 'tnc',
          type: 'Confirmation',
          title: 'T&C',
          description: 'Accept terms',
          options: [{ key: 'yes', text: 'Yes' }],
        },
      ],
      responses: [],
    });
    mockStartStep.mockResolvedValue(session(step('FinancialData')));
    renderAt('/kyc?code=abc&step=FinancialData');
    expect(await screen.findByText('T&C')).toBeInTheDocument();
    await clickNext();
    expect(screen.getByText('T&C')).toBeInTheDocument();
    expect(mockSetFinancialData).not.toHaveBeenCalled();
  });

  it('reports a save error', async () => {
    mockGetFinancialData.mockResolvedValue({
      questions: [
        {
          key: 'tnc',
          type: 'Confirmation',
          title: 'T&C',
          description: 'Accept terms',
          options: [{ key: 'yes', text: 'Yes' }],
        },
      ],
      responses: [],
    });
    mockSetFinancialData.mockRejectedValue({});
    mockStartStep.mockResolvedValue(session(step('FinancialData')));
    renderAt('/kyc?code=abc&step=FinancialData');
    expect(await screen.findByText('T&C')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('checkbox'));
    await clickNext();
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });
});

describe('ManualIdent and change steps', () => {
  it('skips manual ident submit without a session', async () => {
    mockNationalityCountries = undefined;
    mockStartStep.mockResolvedValue(
      session({ name: 'Ident', status: 'InProgress', sequenceNumber: 0, type: 'Manual' }),
    );
    renderAt('/kyc?code=abc&step=Ident/Manual');
    await screen.findByTestId('firstName');
    mockNationalityCountries = [CH, DE];
    typeField('firstName', 'Ada');
    typeField('lastName', 'L');
    typeField('birthday', '1990-01-01');
    typeField('documentNumber', '1');
    fireEvent.change(screen.getByTestId('nationality-search'), { target: { value: 'Switzerland' } });
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    await clickNext();
    expect(mockSetManualIdentData).not.toHaveBeenCalled();
  });

  it('submits manual ident', async () => {
    mockStartStep.mockResolvedValue(session(step('Ident', 'InProgress', { type: 'Manual' })));
    mockSetManualIdentData.mockRejectedValue({});
    renderAt('/kyc?code=abc&step=Ident/Manual');
    expect(await screen.findByTestId('firstName')).toBeInTheDocument();
    mockToBase64.mockResolvedValueOnce(undefined);
    typeField('firstName', 'Ada');
    typeField('lastName', 'L');
    typeField('birthName', 'Ada');
    typeField('birthday', 'not-a-date');
    typeField('birthday', '1990-01-01');
    typeField('birthplace', 'Bern');
    select('gender', 'Male');
    select('documentType', 'PASSPORT');
    typeField('documentNumber', '1');
    fireEvent.change(screen.getByTestId('nationality-search'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('nationality-search'), { target: { value: 'zz' } });
    fireEvent.change(screen.getByTestId('nationality-search'), { target: { value: 'ch' } });
    fireEvent.change(screen.getByTestId('nationality-search'), { target: { value: 'Switzerland' } });
    fireEvent.change(screen.getByTestId('file'), { target: { files: [txt] } });
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('skips PhoneChange submit without a session', async () => {
    mockStartStep.mockResolvedValue(
      session({ name: 'PhoneChange', status: 'InProgress', sequenceNumber: 0 }),
    );
    renderAt('/kyc?code=abc&step=PhoneChange');
    await screen.findByTestId('phone');
    typeField('phone', '+41791234567');
    await clickNext();
    expect(mockSetPhoneChangeData).not.toHaveBeenCalled();
  });

  it('PhoneChange submits', async () => {
    mockStartStep.mockResolvedValue(session(step('PhoneChange')));
    mockSetPhoneChangeData.mockRejectedValue({});
    renderAt('/kyc?code=abc&step=PhoneChange');
    expect(await screen.findByTestId('phone')).toBeInTheDocument();
    typeField('phone', '+41791234567');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('skips AddressChange submit without a session', async () => {
    mockStartStep.mockResolvedValue(
      session({ name: 'AddressChange', status: 'InProgress', sequenceNumber: 0 }),
    );
    renderAt('/kyc?code=abc&step=AddressChange');
    await screen.findByTestId('address.street');
    typeField('address.street', 'A');
    typeField('address.city', 'B');
    typeField('address.zip', '8001');
    fireEvent.change(screen.getByTestId('address.country-search'), { target: { value: 'Switzerland' } });
    fireEvent.change(screen.getByTestId('file'), { target: { files: [txt] } });
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    await clickNext();
    expect(mockSetAddressChangeData).not.toHaveBeenCalled();
  });

  it('AddressChange requires a file then submits', async () => {
    mockStartStep.mockResolvedValue(session(step('AddressChange')));
    renderAt('/kyc?code=abc&step=AddressChange');
    await screen.findByTestId('address.street');
    typeField('address.street', 'A');
    typeField('address.city', 'B');
    typeField('address.zip', '8001');
    fireEvent.change(screen.getByTestId('address.country-search'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('address.country-search'), { target: { value: 'zz' } });
    fireEvent.change(screen.getByTestId('address.country-search'), { target: { value: 'ch' } });
    fireEvent.change(screen.getByTestId('address.country-search'), { target: { value: 'Switzerland' } });
    mockToBase64.mockResolvedValueOnce(undefined);
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('No file selected');
    mockToBase64.mockResolvedValue('data:image/png;base64,xx');
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    mockSetAddressChangeData.mockRejectedValue({});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('skips NameChange submit without a session', async () => {
    mockStartStep.mockResolvedValue(
      session({ name: 'NameChange', status: 'InProgress', sequenceNumber: 0 }),
    );
    renderAt('/kyc?code=abc&step=NameChange');
    await screen.findByTestId('firstName');
    typeField('firstName', 'New');
    typeField('lastName', 'Name');
    fireEvent.change(screen.getByTestId('file'), { target: { files: [txt] } });
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    await clickNext();
    expect(mockSetNameChangeData).not.toHaveBeenCalled();
  });

  it('NameChange requires a file then submits', async () => {
    mockStartStep.mockResolvedValue(session(step('NameChange')));
    renderAt('/kyc?code=abc&step=NameChange');
    expect(await screen.findByTestId('firstName')).toBeInTheDocument();
    typeField('firstName', 'New');
    typeField('lastName', 'Name');
    mockToBase64.mockResolvedValueOnce(undefined);
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('No file selected');
    mockToBase64.mockResolvedValue('data:image/png;base64,xx');
    fireEvent.change(screen.getByTestId('file'), { target: { files: [png] } });
    mockSetNameChangeData.mockRejectedValue({});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });
});

describe('PaymentAgreement and RecallAgreement', () => {
  it('submits a payment agreement once accepted', async () => {
    mockStartStep.mockResolvedValue(session(step('PaymentAgreement')));
    mockSetPaymentData.mockResolvedValue({});
    mockContinueKyc.mockResolvedValue(info());
    renderAt('/kyc?code=abc&step=PaymentAgreement');
    expect(await screen.findByTestId('name')).toBeInTheDocument();
    typeField('name', 'Shop');
    typeField('registrationNumber', 'CHE');
    typeField('purpose', 'sales');
    select('storeType', 'Online');
    select('merchantCategory', 'Bank');
    select('goodsType', 'Tangible');
    select('goodsCategory', 'Jewelry');
    fireEvent.click(screen.getByTestId('checkbox'));
    mockSetPaymentData.mockRejectedValueOnce({});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
    mockSetPaymentData.mockResolvedValue({});
    mockContinueKyc.mockResolvedValue(info());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(mockSetPaymentData).toHaveBeenCalled();
  });

  it('submits a recall agreement', async () => {
    mockStartStep.mockResolvedValue(session(step('RecallAgreement')));
    mockSetRecallData.mockRejectedValueOnce({});
    renderAt('/kyc?code=abc&step=RecallAgreement');
    expect(await screen.findByText(/TODO: recall agreement text/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
    mockSetRecallData.mockResolvedValue({});
    mockContinueKyc.mockResolvedValue(info());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });
    expect(mockSetRecallData).toHaveBeenCalled();
  });
});
