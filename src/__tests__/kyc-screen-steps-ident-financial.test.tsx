const mockStartStep = jest.fn();
const mockGetKycInfo = jest.fn();
const mockContinueKyc = jest.fn();
const mockSetOperationalData = jest.fn();
const mockGetFinancialData = jest.fn();
const mockSetFinancialData = jest.fn();
let mockSumsubProps: any;

jest.mock('@dfx.swiss/react', () => ({
  KycLevel: { Link: 10, Sell: 30, Completed: 50 },
  KycStepName: {
    OPERATIONAL_ACTIVITY: 'OperationalActivity',
    IDENT: 'Ident',
    FINANCIAL_DATA: 'FinancialData',
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
  },
  KycStepCancelable: [],
  KycStepReason: {},
  QuestionType: {
    CONFIRMATION: 'Confirmation',
    SINGLE_CHOICE: 'SingleChoice',
    MULTIPLE_CHOICE: 'MultipleChoice',
    TEXT: 'Text',
  },
  SupportIssueType: { NOTIFICATION_OF_CHANGES: 'NotificationOfChanges' },
  UrlType: { BROWSER: 'Browser', API: 'API', TOKEN: 'Token', NONE: 'None' },
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
    Custom: (validator: (value: any) => true | string) => ({ validate: validator }),
  },
  useKyc: () => ({
    getKycInfo: mockGetKycInfo,
    continueKyc: mockContinueKyc,
    startStep: mockStartStep,
    addTransferClient: jest.fn(),
    cancelStep: jest.fn(),
    setOperationalData: mockSetOperationalData,
    getFinancialData: mockGetFinancialData,
    setFinancialData: mockSetFinancialData,
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

  const Form = ({ children, onSubmit, ...form }: any) =>
    React.createElement('form', { 'data-testid': 'form', onSubmit }, enrich(children, form));

  const field = (render: (field: any) => any) =>
    function Field({ control, name, rules, error, translate, items, labelFunc }: any) {
      return React.createElement(Controller, {
        control,
        name,
        rules,
        render: ({ field: controllerField }: any) =>
          React.createElement(
            'div',
            null,
            render({
              ...controllerField,
              name,
              rules,
              items,
              labelFunc,
            }),
            error ? React.createElement('p', null, translate ? translate(error.message) : error.message) : null,
          ),
      });
    };

  const validationProbe = (rules: any) =>
    typeof rules?.validate === 'function' ? String(rules.validate(undefined)) : undefined;

  const StyledInput = field(({ name, value, onChange, onBlur, rules }) =>
    React.createElement('input', {
      'data-testid': name,
      'data-empty-valid': validationProbe(rules),
      value: value ?? '',
      onBlur,
      onChange: (event: any) => onChange(event.target.value),
    }),
  );

  const StyledDropdown = field(({ name, value, onChange, onBlur, items, labelFunc, rules }) =>
    React.createElement(
      'div',
      { 'data-testid': `${name}-dropdown`, 'data-empty-valid': validationProbe(rules), onBlur },
      (items ?? []).map((item: any, index: number) =>
        React.createElement(
          'button',
          {
            key: index,
            type: 'button',
            'aria-pressed':
              item !== null && typeof item === 'object' && 'key' in item ? value?.key === item.key : value === item,
            'data-testid': `${name}-option-${index}`,
            onClick: () => {
              onChange(item);
              onBlur();
            },
          },
          labelFunc(item),
        ),
      ),
    ),
  );

  const StyledDropdownMultiChoice = field(({ name, value, onChange, onBlur, items, labelFunc }) =>
    React.createElement(
      'div',
      { 'data-testid': `${name}-multi` },
      (items ?? []).map((item: any, index: number) => {
        const selected = (value ?? []).some((entry: any) => entry.key === item.key);
        return React.createElement(
          'button',
          {
            key: index,
            type: 'button',
            'aria-pressed': selected,
            'data-testid': `${name}-option-${index}`,
            onClick: () => {
              onChange(
                selected ? (value ?? []).filter((entry: any) => entry.key !== item.key) : [...(value ?? []), item],
              );
              onBlur();
            },
          },
          labelFunc(item),
        );
      }),
    ),
  );

  const StyledButton = ({ label, onClick, disabled, isLoading }: any) =>
    React.createElement('button', { type: 'button', onClick, disabled: disabled || isLoading }, label);
  const StyledIconButton = ({ onClick }: any) =>
    React.createElement('button', { type: 'button', onClick, 'aria-label': 'Previous question' }, 'Previous question');
  const StyledCheckboxRow = ({ isChecked, onChange, children }: any) =>
    React.createElement(
      'div',
      null,
      React.createElement(
        'button',
        {
          type: 'button',
          'aria-label': 'Toggle confirmation',
          'aria-pressed': isChecked,
          onClick: () => onChange(!isChecked),
        },
        'Toggle confirmation',
      ),
      children,
    );
  const StyledLink = ({ label, url, onClick }: any) =>
    onClick
      ? React.createElement('button', { type: 'button', onClick }, label)
      : React.createElement('a', { href: url }, label);
  const Stack = ({ children }: any) => React.createElement('div', null, children);

  return {
    Form,
    StyledInput,
    StyledDropdown,
    StyledDropdownMultiChoice,
    StyledButton,
    StyledIconButton,
    StyledCheckboxRow,
    StyledLink,
    StyledVerticalStack: Stack,
    StyledCollapsible: Stack,
    StyledLoadingSpinner: () => React.createElement('div', { 'data-testid': 'loading-spinner' }),
    SpinnerSize: { LG: 'lg' },
    StyledButtonColor: { GRAY_OUTLINE: 'gray-outline', STURDY_WHITE: 'sturdy-white' },
    StyledButtonWidth: { FULL: 'full', MIN: 'min' },
    IconVariant: { CHEV_LEFT: 'chev-left' },
    IconSize: { XL: 'xl' },
    DfxIcon: () => null,
    IconColor: {},
  };
});

jest.mock('@sumsub/websdk-react', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return (props: any) => {
    mockSumsubProps = props;
    return React.createElement('div', { 'data-testid': 'sumsub-sdk' });
  };
});

jest.mock('react-device-detect', () => ({ isMobile: false }));
jest.mock('react-i18next', () => ({ Trans: ({ children }: any) => children }));

const mockAppHandling = { isInitialized: true, isWidget: false, params: {}, setParams: jest.fn() };
jest.mock('src/contexts/app-handling.context', () => ({ useAppHandlingContext: () => mockAppHandling }));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('src/hooks/app-params.hook', () => ({ useAppParams: () => ({ lang: 'EN' }) }));

const mockSettings: any = {
  translate: (_namespace: string, text: string) => text,
  translateError: (key: string) => `error:${key}`,
  changeLanguage: jest.fn(),
  processingKycData: false,
  language: { symbol: 'EN' },
};

jest.mock('../contexts/settings.context', () => ({ useSettingsContext: () => mockSettings }));
jest.mock('../components/error-hint', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    ErrorHint: ({ message, onBack }: any) =>
      React.createElement(
        'div',
        { role: 'alert' },
        React.createElement('span', null, message),
        onBack ? React.createElement('button', { type: 'button', onClick: onBack }, 'Error back') : null,
      ),
  };
});
jest.mock('../components/kyc-status', () => ({ KycStatusTable: () => null }));
jest.mock('../hooks/guard.hook', () => ({ useUserGuard: () => undefined }));
jest.mock('../hooks/kyc-helper.hook', () => ({
  useKycHelper: () => ({
    nameToString: (name: string) => name,
    accountTypeToString: (type: string) => type,
  }),
}));
jest.mock('../hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), clearParams: jest.fn() };
jest.mock('../hooks/navigation.hook', () => ({ useNavigation: () => mockNavigation }));

jest.mock('../util/utils', () => ({
  ...jest.requireActual('../util/utils'),
  url: () => 'https://app.example/support/issue?issue-type=NotificationOfChanges',
}));

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import KycScreen from '../screens/kyc.screen';

jest.setTimeout(30000);

interface RenderStepOptions {
  stepType?: string;
  sessionType?: string;
  sessionUrl?: string;
  noSession?: boolean;
}

function kycSession(stepName: string, options: RenderStepOptions = {}) {
  const currentStep: any = {
    name: stepName,
    status: 'InProgress',
    type: options.stepType,
  };
  if (!options.noSession) {
    currentStep.session = {
      url: options.sessionUrl ?? 'step-session',
      type: options.sessionType ?? 'Browser',
    };
  }
  return {
    kycLevel: 0,
    language: { symbol: 'EN' },
    kycClients: [],
    kycSteps: [],
    currentStep,
  };
}

function kycInfo() {
  return {
    kycLevel: 0,
    language: { symbol: 'EN' },
    kycClients: [],
    kycSteps: [],
  };
}

async function renderStep(stepName: string, options: RenderStepOptions = {}) {
  const nextSession = kycSession(stepName, options);
  mockStartStep.mockResolvedValue(nextSession);
  mockContinueKyc.mockResolvedValue(nextSession);
  mockGetKycInfo.mockResolvedValue(kycInfo());
  const stepSuffix = options.stepType ? `/${options.stepType}` : '';
  const view = render(
    <MemoryRouter initialEntries={[`/kyc?code=TESTCODE&step=${stepName}${stepSuffix}`]}>
      <Routes>
        <Route path="/kyc" element={<KycScreen />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(mockStartStep).toHaveBeenCalled(), { timeout: 10000 });
  await waitFor(() => expect(mockNavigation.clearParams).toHaveBeenCalledWith(['step']), {
    timeout: 10000,
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

async function typeField(name: string, value: string) {
  await act(async () => {
    fireEvent.change(screen.getByTestId(name), { target: { value } });
    fireEvent.blur(screen.getByTestId(name));
  });
}

async function choose(name: string, index: number) {
  await waitFor(() => expect(screen.getByTestId(`${name}-option-${index}`)).toBeInTheDocument(), {
    timeout: 10000,
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId(`${name}-option-${index}`));
  });
}

async function clickNext() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled(), {
    timeout: 10000,
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await Promise.resolve();
  });
}

function sdkProps() {
  if (!mockSumsubProps) throw new Error('The SDK props were not captured');
  return mockSumsubProps;
}

async function renderTokenIdent(stepType = 'SumsubAuto') {
  await renderStep('Ident', { stepType, sessionType: 'Token', sessionUrl: 'sdk-token' });
  await waitFor(() => expect(screen.getByTestId('sumsub-sdk')).toBeInTheDocument(), { timeout: 10000 });
  return sdkProps();
}

const confirmationOption = [{ key: 'accepted', text: 'Accepted' }];

beforeEach(() => {
  jest.clearAllMocks();
  mockSumsubProps = undefined;
  mockSettings.language = { symbol: 'EN' };
  mockSetOperationalData.mockResolvedValue(undefined);
  mockGetFinancialData.mockResolvedValue({ questions: [], responses: [] });
  mockSetFinancialData.mockResolvedValue({ status: 'InProgress' });
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('KycScreen operational activity', () => {
  it('validates the selection and website before submitting operational data', async () => {
    await renderStep('OperationalActivity');

    expect(screen.getByTestId('isOperational-dropdown')).toHaveAttribute('data-empty-valid', 'required');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.blur(screen.getByTestId('isOperational-dropdown'));
    await waitFor(() => expect(screen.getByText('error:required')).toBeInTheDocument(), {
      timeout: 10000,
    });

    await choose('isOperational', 0);
    expect(screen.getByTestId('website')).toHaveAttribute('data-empty-valid', 'true');
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();

    await typeField('website', 'http://invalid.example');
    expect(await screen.findByText('error:pattern', undefined, { timeout: 10000 })).toBeInTheDocument();

    await typeField('website', 'https://business.example/path');
    await clickNext();

    expect(mockSetOperationalData).toHaveBeenCalledWith('TESTCODE', 'step-session', {
      isOperational: true,
      websiteUrl: 'https://business.example/path',
    });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
  });

  it('submits a non-operational organization without a website', async () => {
    await renderStep('OperationalActivity');

    await choose('isOperational', 1);
    expect(screen.queryByTestId('website')).not.toBeInTheDocument();
    await clickNext();

    expect(mockSetOperationalData).toHaveBeenCalledWith('TESTCODE', 'step-session', {
      isOperational: false,
      websiteUrl: undefined,
    });
  });

  it('does not submit when the step has no session', async () => {
    await renderStep('OperationalActivity', { noSession: true });

    await choose('isOperational', 1);
    await clickNext();

    expect(mockSetOperationalData).not.toHaveBeenCalled();
  });

  it.each([
    [{ message: 'Operational update failed' }, 'Operational update failed'],
    [{}, 'Unknown error'],
  ])('shows the operational API error and restores the form state', async (rejection, expected) => {
    mockSetOperationalData.mockRejectedValue(rejection);
    await renderStep('OperationalActivity');

    await choose('isOperational', 1);
    await clickNext();

    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent(expected);
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('keeps the action disabled while an operational update is pending', async () => {
    let resolveUpdate: (() => void) | undefined;
    let resolveContinue: ((value: any) => void) | undefined;
    mockSetOperationalData.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    await renderStep('OperationalActivity');
    mockContinueKyc.mockReturnValue(
      new Promise((resolve) => {
        resolveContinue = resolve;
      }),
    );
    await choose('isOperational', 1);

    await clickNext();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await act(async () => {
      resolveUpdate?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled(), { timeout: 10000 });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await act(async () => {
      resolveContinue?.(kycSession('OperationalActivity'));
      await Promise.resolve();
    });
  });
});

describe('KycScreen standalone identification', () => {
  it('passes the token configuration and reports token expiration', async () => {
    const props = await renderTokenIdent();
    let expirationResult: string | undefined;

    expect(props.accessToken).toBe('sdk-token');
    expect(props.config).toEqual({ lang: 'en' });
    await act(async () => {
      expirationResult = await props.expirationHandler();
    });
    expect(expirationResult).toBe('');
    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent('Token expired');
  });

  it.each([
    ['Review was rejected', { moderationComment: 'Review was rejected' }],
    ['Unknown error', {}],
  ])('shows the final red review result as %s and returns from the error view', async (expected, extra) => {
    const props = await renderTokenIdent();
    await act(async () => {
      props.onMessage('idCheck.onApplicantStatusChanged', {
        reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'FINAL', ...extra },
      });
    });

    expect(screen.getByText('The identification has failed.')).toBeInTheDocument();
    expect(screen.getByText(expected)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ok' }));
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
  });

  it('handles non-final, incomplete, and unknown SDK messages without finishing', async () => {
    const props = await renderTokenIdent();

    await act(async () => {
      props.onMessage('idCheck.onApplicantStatusChanged', {
        reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'RETRY' },
      });
      props.onMessage('idCheck.onApplicantStatusChanged', undefined);
      props.onMessage('idCheck.onStepCompleted', {});
      props.onMessage('unknown.event', {});
    });

    expect(screen.getByTestId('sumsub-sdk')).toBeInTheDocument();
    expect(mockContinueKyc).not.toHaveBeenCalled();
    expect(mockGetKycInfo).not.toHaveBeenCalled();
  });

  it('polls after a green applicant result and clears the interval on unmount', async () => {
    const identView = await renderStep('Ident', {
      stepType: 'SumsubAuto',
      sessionType: 'Token',
      sessionUrl: 'sdk-token',
    });
    await waitFor(() => expect(screen.getByTestId('sumsub-sdk')).toBeInTheDocument(), { timeout: 10000 });
    const props = sdkProps();
    jest.useFakeTimers();
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');
    const sdk = screen.getByTestId('sumsub-sdk');

    await act(async () => {
      props.onMessage('idCheck.onApplicantStatusChanged', { reviewResult: { reviewAnswer: 'GREEN' } });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sdk).not.toBeInTheDocument();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(mockContinueKyc).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockContinueKyc).toHaveBeenCalledTimes(2);

    identView.unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    jest.clearAllTimers();
  });

  it('finishes a completed video step and keeps other step types open', async () => {
    const videoView = await renderStep('Ident', {
      stepType: 'SumsubVideo',
      sessionType: 'Token',
      sessionUrl: 'video-token',
    });
    const videoProps = sdkProps();
    await act(async () => {
      videoProps.onMessage('idCheck.onStepCompleted', {});
      await Promise.resolve();
    });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled(), { timeout: 10000 });
    videoView.unmount();

    jest.clearAllMocks();
    const autoProps = await renderTokenIdent('SumsubAuto');
    await act(async () => {
      autoProps.onMessage('idCheck.onStepCompleted', {});
    });
    expect(screen.getByTestId('sumsub-sdk')).toBeInTheDocument();
    expect(mockContinueKyc).not.toHaveBeenCalled();
  });

  it('shows SDK errors and returns through the error action', async () => {
    const props = await renderTokenIdent();
    await act(async () => {
      props.onError({ error: 'SDK unavailable' });
    });

    expect(screen.getByText('SDK unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ok' }));
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
  });

  it('renders the browser iframe and routes matching window messages', async () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const view = await renderStep('Ident', { stepType: 'Auto', sessionType: 'Browser', sessionUrl: 'browser-url' });
    mockGetKycInfo.mockResolvedValue(
      kycSession('Ident', { stepType: 'Auto', sessionType: 'Browser', sessionUrl: 'browser-url' }),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const iframe = view.container.querySelector('iframe');

    expect(iframe).toHaveAttribute('src', 'browser-url');
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'other', status: 'Completed' } }));
      await Promise.resolve();
    });
    expect(mockContinueKyc).not.toHaveBeenCalled();
    expect(mockGetKycInfo).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'dfx-iframe-message', status: 'InProgress' } }));
      await Promise.resolve();
    });
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'dfx-iframe-message', status: 'Completed' } }));
      await Promise.resolve();
    });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });

    const messageListener = addSpy.mock.calls.find(([type]) => type === 'message')?.[1];
    view.unmount();
    expect(removeSpy).toHaveBeenCalledWith('message', messageListener);
  });

  it('shows the missing-session error', async () => {
    await renderStep('Ident', { stepType: 'Auto', noSession: true });

    expect(screen.getByRole('alert')).toHaveTextContent('No session URL');
    expect(screen.queryByTestId('sumsub-sdk')).not.toBeInTheDocument();
  });
});

describe('KycScreen financial data', () => {
  it('walks through every question type and filters conditional questions', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    mockGetFinancialData.mockResolvedValue({
      questions: [
        {
          key: 'tnc',
          title: 'Terms',
          description: 'Read the terms',
          type: 'Confirmation',
          options: confirmationOption,
        },
        {
          key: 'notification_of_changes',
          title: 'Changes',
          description: 'Before app.dfx.swiss/support/issue after',
          type: 'Confirmation',
          options: confirmationOption,
          conditions: [],
        },
        {
          key: 'own_funds',
          title: 'Funds',
          description: 'Confirm own funds',
          type: 'Confirmation',
          options: confirmationOption,
        },
        {
          key: 'business',
          title: 'Business',
          description: 'Choose business',
          type: 'SingleChoice',
          options: [
            { key: 'retail', text: 'Retail' },
            { key: 'services', text: 'Services' },
          ],
        },
        {
          key: 'channels',
          title: 'Channels',
          description: 'Choose channels',
          type: 'MultipleChoice',
          options: [
            { key: 'online', text: 'Online' },
            { key: 'store', text: 'Store' },
          ],
          conditions: [{ question: 'business', response: 'services' }],
        },
        {
          key: 'details',
          title: 'Details',
          description: 'Add details',
          type: 'Text',
        },
        {
          key: 'hidden',
          title: 'Hidden question',
          description: 'Never shown',
          type: 'Text',
          conditions: [
            { question: 'business', response: 'missing-value' },
            { question: 'missing-question', response: 'missing-value' },
          ],
        },
      ],
      responses: [],
    });
    await renderStep('FinancialData');

    expect(await screen.findByText('Terms', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockGetFinancialData).toHaveBeenCalledWith('TESTCODE', 'step-session', 'EN');
    expect(screen.getByRole('link', { name: 'Read the terms' })).toHaveAttribute(
      'href',
      'https://dfx.swiss/terms-and-conditions',
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle confirmation' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle confirmation' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle confirmation' }));
    await clickNext();

    expect(await screen.findByText('Changes', undefined, { timeout: 10000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'app.dfx.swiss/support/issue' }));
    expect(openSpy).toHaveBeenCalledWith(
      'https://app.example/support/issue?issue-type=NotificationOfChanges',
      '_blank',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle confirmation' }));
    await clickNext();

    expect(await screen.findByText('Funds', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByText('deliberate')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle confirmation' }));
    await clickNext();

    expect(await screen.findByText('Business', undefined, { timeout: 10000 })).toBeInTheDocument();
    await choose('selection', 1);
    await clickNext();

    expect(await screen.findByText('Channels', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByText('5/6')).toBeInTheDocument();
    await choose('selectionMC', 0);
    await choose('selectionMC', 1);
    await clickNext();

    expect(await screen.findByText('Details', undefined, { timeout: 10000 })).toBeInTheDocument();
    await typeField('text', 'A detailed response');
    await clickNext();

    await waitFor(() => expect(mockSetFinancialData).toHaveBeenCalledTimes(6), { timeout: 10000 });
    expect(mockSetFinancialData).toHaveBeenLastCalledWith('TESTCODE', 'step-session', {
      responses: [
        { key: 'tnc', value: 'accepted' },
        { key: 'notification_of_changes', value: 'accepted' },
        { key: 'own_funds', value: 'accepted' },
        { key: 'business', value: 'services' },
        { key: 'channels', value: 'online,store' },
        { key: 'details', value: 'A detailed response' },
      ],
    });
    expect(screen.queryByText('Hidden question')).not.toBeInTheDocument();
  });

  it('moves back through saved answers, preserves unchanged values, and updates changed values', async () => {
    mockGetFinancialData.mockResolvedValue({
      questions: [
        {
          key: 'choice',
          title: 'Choice',
          description: 'Choose one',
          type: 'SingleChoice',
          options: [
            { key: 'first', text: 'First' },
            { key: 'second', text: 'Second' },
          ],
        },
        {
          key: 'multiple',
          title: 'Multiple',
          description: 'Choose several',
          type: 'MultipleChoice',
          options: [
            { key: 'one', text: 'One' },
            { key: 'two', text: 'Two' },
          ],
        },
        { key: 'text', title: 'Text', description: 'Enter text', type: 'Text' },
      ],
      responses: [],
    });
    await renderStep('FinancialData');

    await choose('selection', 0);
    await clickNext();
    expect(await screen.findByText('Multiple', undefined, { timeout: 10000 })).toBeInTheDocument();
    await choose('selectionMC', 0);
    await clickNext();
    expect(await screen.findByText('Text', undefined, { timeout: 10000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous question' }));
    expect(await screen.findByText('Multiple', undefined, { timeout: 10000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('selectionMC-option-0')).toHaveAttribute('aria-pressed', 'true'), {
      timeout: 10000,
    });
    const callsBeforeUnchanged = mockSetFinancialData.mock.calls.length;
    await clickNext();
    expect(await screen.findByText('Text', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(mockSetFinancialData).toHaveBeenCalledTimes(callsBeforeUnchanged);

    fireEvent.click(screen.getByRole('button', { name: 'Previous question' }));
    await choose('selectionMC', 1);
    await clickNext();
    await waitFor(() => expect(mockSetFinancialData.mock.calls.length).toBeGreaterThan(callsBeforeUnchanged), {
      timeout: 10000,
    });
    expect(mockSetFinancialData).toHaveBeenLastCalledWith('TESTCODE', 'step-session', {
      responses: [
        { key: 'choice', value: 'first' },
        { key: 'multiple', value: 'one,two' },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Previous question' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous question' }));
    expect(await screen.findByText('Choice', undefined, { timeout: 10000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('selection-option-0')).toHaveAttribute('aria-pressed', 'true'), {
      timeout: 10000,
    });
    await choose('selection', 1);
    await clickNext();
    await waitFor(
      () =>
        expect(mockSetFinancialData).toHaveBeenLastCalledWith('TESTCODE', 'step-session', {
          responses: [
            { key: 'choice', value: 'second' },
            { key: 'multiple', value: 'one,two' },
          ],
        }),
      { timeout: 10000 },
    );
  });

  it('ignores an empty response submission', async () => {
    mockGetFinancialData.mockResolvedValue({
      questions: [{ key: 'text', title: 'Text', description: 'Enter text', type: 'Text' }],
      responses: [],
    });
    await renderStep('FinancialData');
    await screen.findByText('Text', undefined, { timeout: 10000 });

    await act(async () => {
      fireEvent.submit(screen.getByTestId('form'));
      await Promise.resolve();
    });
    expect(mockSetFinancialData).not.toHaveBeenCalled();
  });

  it('submits existing responses and completes when the API marks the step done', async () => {
    mockGetFinancialData.mockResolvedValue({
      questions: [{ key: 'answered', title: 'Answered', description: 'Answered', type: 'Text' }],
      responses: [{ key: 'answered', value: 'existing' }],
    });
    mockSetFinancialData.mockResolvedValue({ status: 'Completed' });
    await renderStep('FinancialData');

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    await waitFor(
      () =>
        expect(mockSetFinancialData).toHaveBeenCalledWith('TESTCODE', 'step-session', {
          responses: [{ key: 'answered', value: 'existing' }],
        }),
      { timeout: 10000 },
    );
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
  });

  it.each([
    [{ message: 'Question loading failed' }, 'Question loading failed'],
    [{}, 'Unknown error'],
  ])('shows financial loading errors and supports returning from them', async (rejection, expected) => {
    mockGetFinancialData.mockRejectedValue(rejection);
    await renderStep('FinancialData');

    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent(expected);
    fireEvent.click(screen.getByRole('button', { name: 'Error back' }));
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
  });

  it.each([
    [{ message: 'Response saving failed' }, 'Response saving failed'],
    [{}, 'Unknown error'],
  ])('shows financial response errors with the expected fallback', async (rejection, expected) => {
    mockGetFinancialData.mockResolvedValue({
      questions: [
        { key: 'answered', title: 'Answered', description: 'Answered', type: 'Text' },
        { key: 'open', title: 'Open', description: 'Open', type: 'Text' },
      ],
      responses: [{ key: 'answered', value: 'existing' }],
    });
    mockSetFinancialData.mockRejectedValue(rejection);
    await renderStep('FinancialData');

    expect(await screen.findByRole('alert', undefined, { timeout: 10000 })).toHaveTextContent(expected);
  });

  it('passes an absent language symbol and does not load without a session', async () => {
    mockSettings.language = undefined;
    const languageView = await renderStep('FinancialData');
    await waitFor(() => expect(mockGetFinancialData).toHaveBeenCalledWith('TESTCODE', 'step-session', undefined), {
      timeout: 10000,
    });
    languageView.unmount();

    jest.clearAllMocks();
    await renderStep('FinancialData', { noSession: true });
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(mockGetFinancialData).not.toHaveBeenCalled();
    expect(mockSetFinancialData).not.toHaveBeenCalled();
  });
});
