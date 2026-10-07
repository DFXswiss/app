const mockStartStep = jest.fn();
const mockGetKycInfo = jest.fn();
const mockContinueKyc = jest.fn();
const mockSetManualIdentData = jest.fn();
const mockToBase64 = jest.fn();
let mockCountryCode = 'CH';

const mockCountryCh = { id: 1, symbol: 'CH', name: 'Switzerland' };
const mockCountryDe = { id: 2, symbol: 'DE', name: 'Germany' };

jest.mock('@dfx.swiss/react', () => ({
  DocumentType: {
    IDCARD: 'IDCARD',
    PASSPORT: 'PASSPORT',
    DRIVERS_LICENSE: 'DRIVERS_LICENSE',
    RESIDENCE_PERMIT: 'RESIDENCE_PERMIT',
  },
  GenderType: { MALE: 'Male', FEMALE: 'Female' },
  KycLevel: { Link: 10, Sell: 30, Completed: 50 },
  KycStepName: { IDENT: 'Ident' },
  KycStepStatus: {
    NOT_STARTED: 'NotStarted',
    IN_PROGRESS: 'InProgress',
    FAILED: 'Failed',
    COMPLETED: 'Completed',
  },
  KycStepType: { VIDEO: 'Video', AUTO: 'Auto', MANUAL: 'Manual' },
  KycStepCancelable: [],
  KycStepReason: {},
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
    Custom: (validator: (value: any) => true | string) => ({ validate: validator }),
  },
  useKyc: () => ({
    getKycInfo: mockGetKycInfo,
    continueKyc: mockContinueKyc,
    startStep: mockStartStep,
    addTransferClient: jest.fn(),
    cancelStep: jest.fn(),
    setManualIdentData: mockSetManualIdentData,
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
    function Field({ control, name, rules, error, translate, items, labelFunc, filterFunc, matchFunc }: any) {
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
              filterFunc,
              matchFunc,
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

  const StyledFileUpload = field(({ name, onChange, onBlur, rules }) =>
    React.createElement('input', {
      'data-testid': name,
      'data-empty-valid': validationProbe(rules),
      type: 'file',
      onBlur,
      onChange: (event: any) => onChange(event.target.files[0]),
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
            'aria-pressed': value === item,
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

  const StyledSearchDropdown = field(({ name, value, onChange, onBlur, items, labelFunc, filterFunc, matchFunc }) =>
    React.createElement(
      'div',
      null,
      React.createElement('output', { 'data-testid': `${name}-value` }, value?.symbol ?? ''),
      (items ?? []).flatMap((item: any, index: number) => [
        React.createElement(
          'button',
          {
            key: `option-${index}`,
            type: 'button',
            'data-testid': `${name}-option-${index}`,
            onClick: () => {
              onChange(item);
              onBlur();
            },
          },
          labelFunc(item),
        ),
        React.createElement('span', { key: `filter-empty-${index}`, hidden: true }, String(filterFunc(item, ''))),
        React.createElement('span', { key: `filter-name-${index}`, hidden: true }, String(filterFunc(item, item.name))),
        React.createElement(
          'span',
          { key: `filter-symbol-${index}`, hidden: true },
          String(filterFunc(item, item.symbol)),
        ),
        React.createElement('span', { key: `filter-miss-${index}`, hidden: true }, String(filterFunc(item, 'missing'))),
        React.createElement('span', { key: `match-name-${index}`, hidden: true }, String(matchFunc(item, item.name))),
        React.createElement('span', { key: `match-empty-${index}`, hidden: true }, String(matchFunc(item, undefined))),
      ]),
    ),
  );

  const StyledButton = ({ label, onClick, disabled, isLoading }: any) =>
    React.createElement('button', { type: 'button', onClick, disabled: disabled || isLoading }, label);
  const Stack = ({ children }: any) => React.createElement('div', null, children);

  return {
    Form,
    StyledInput,
    StyledFileUpload,
    StyledDropdown,
    StyledSearchDropdown,
    StyledButton,
    StyledVerticalStack: Stack,
    StyledHorizontalStack: Stack,
    StyledLoadingSpinner: () => React.createElement('div', { 'data-testid': 'loading-spinner' }),
    SpinnerSize: { LG: 'lg' },
    StyledButtonWidth: { FULL: 'full' },
  };
});

jest.mock('@sumsub/websdk-react', () => () => null);
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
  nationalityCountries: [mockCountryCh, mockCountryDe],
};

jest.mock('../contexts/settings.context', () => ({ useSettingsContext: () => mockSettings }));
jest.mock('../components/error-hint', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    ErrorHint: ({ message }: any) => React.createElement('div', { role: 'alert' }, message),
  };
});
jest.mock('../components/kyc-status', () => ({ KycStatusTable: () => null }));
jest.mock('../hooks/geo-location.hook', () => ({ useGeoLocation: () => ({ countryCode: mockCountryCode }) }));
jest.mock('../hooks/guard.hook', () => ({ useUserGuard: () => undefined }));
jest.mock('../hooks/kyc-helper.hook', () => ({
  useKycHelper: () => ({
    nameToString: (name: string) => name,
    genderTypeToString: (type: string) => `gender:${type}`,
    documentTypeToString: (type: string) => `document:${type}`,
  }),
}));
jest.mock('../hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), clearParams: jest.fn() };
jest.mock('../hooks/navigation.hook', () => ({ useNavigation: () => mockNavigation }));

jest.mock('../util/utils', () => ({
  ...jest.requireActual('../util/utils'),
  toBase64: (...args: unknown[]) => mockToBase64(...args),
}));

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import KycScreen from '../screens/kyc.screen';

jest.setTimeout(30000);

interface RenderStepOptions {
  noSession?: boolean;
}

function createDeferred<T = void>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {
    throw new Error('Deferred promise was not initialized');
  };
  let reject: (reason?: unknown) => void = () => {
    throw new Error('Deferred promise was not initialized');
  };
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function kycSession(options: RenderStepOptions = {}) {
  const currentStep: any = {
    name: 'Ident',
    status: 'InProgress',
    type: 'Manual',
  };
  if (!options.noSession) {
    currentStep.session = {
      url: 'step-session',
      type: 'Browser',
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

async function renderStep(options: RenderStepOptions = {}) {
  const nextSession = kycSession(options);
  mockStartStep.mockResolvedValue(nextSession);
  mockContinueKyc.mockResolvedValue(nextSession);
  mockGetKycInfo.mockResolvedValue(kycInfo());
  const view = render(
    <MemoryRouter initialEntries={['/kyc?code=TESTCODE&step=Ident/Manual']}>
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

async function fillManualIdent() {
  await waitFor(() => expect(screen.getByTestId('nationality-value')).toHaveTextContent('CH'), { timeout: 10000 });
  await choose('gender', 0);
  await typeField('firstName', 'Alex');
  await typeField('lastName', 'Example');
  await typeField('birthName', 'Original');
  await typeField('birthday', '1990-05-06');
  await typeField('birthplace', 'Zurich');
  await choose('documentType', 1);
  await typeField('documentNumber', 'P-123');
  await act(async () => {
    fireEvent.change(screen.getByTestId('file'), {
      target: { files: [new File(['PDF'], 'identity.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.blur(screen.getByTestId('file'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCountryCode = 'CH';
  mockSettings.language = { symbol: 'EN' };
  mockSettings.nationalityCountries = [mockCountryCh, mockCountryDe];
  mockSetManualIdentData.mockResolvedValue(undefined);
  mockToBase64.mockResolvedValue('data:application/pdf;base64,UFZERg==');
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('KycScreen manual identification', () => {
  it('prefills nationality and exposes the supported labels and search behavior', async () => {
    await renderStep();

    await waitFor(() => expect(screen.getByTestId('nationality-value')).toHaveTextContent('CH'), { timeout: 10000 });
    expect(screen.getByRole('button', { name: 'gender:Male' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'gender:Female' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'document:IDCARD' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'document:PASSPORT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'document:DRIVERS_LICENSE' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'document:RESIDENCE_PERMIT' })).toBeInTheDocument();
    expect(screen.getByTestId('file')).toHaveAttribute('data-empty-valid', 'true');
  });

  it('keeps a dirty nationality selection when the detected country changes', async () => {
    const view = await renderStep();
    await waitFor(() => expect(screen.getByTestId('nationality-value')).toHaveTextContent('CH'), { timeout: 10000 });

    await typeField('firstName', 'Dirty');
    mockCountryCode = 'DE';
    mockSettings.nationalityCountries = [mockCountryCh, mockCountryDe];
    view.rerender(
      <MemoryRouter initialEntries={['/kyc?code=TESTCODE&step=Ident/Manual']}>
        <Routes>
          <Route path="/kyc" element={<KycScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('nationality-value')).toHaveTextContent('CH');
  });

  it('leaves nationality empty when countries are absent or the detected country is unknown', async () => {
    mockSettings.nationalityCountries = undefined;
    const absentView = await renderStep();
    expect(screen.getByTestId('nationality-value')).toBeEmptyDOMElement();
    absentView.unmount();

    jest.clearAllMocks();
    mockSettings.nationalityCountries = [mockCountryCh, mockCountryDe];
    mockCountryCode = 'XX';
    await renderStep();
    expect(screen.getByTestId('nationality-value')).toBeEmptyDOMElement();
  });

  it('validates dates and file types', async () => {
    await renderStep();

    await typeField('birthday', 'not-a-date');
    expect(await screen.findByText('error:date_format', undefined, { timeout: 10000 })).toBeInTheDocument();
    await typeField('birthday', '2000-01-02');
    expect(screen.queryByText('error:date_format')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByTestId('file'), {
        target: { files: [new File(['text'], 'identity.txt', { type: 'text/plain' })] },
      });
      fireEvent.blur(screen.getByTestId('file'));
    });
    expect(await screen.findByText('error:file_type', undefined, { timeout: 10000 })).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByTestId('file'), {
        target: { files: [new File(['PDF'], 'identity.pdf', { type: 'application/pdf' })] },
      });
      fireEvent.blur(screen.getByTestId('file'));
    });
    expect(screen.queryByText('error:file_type')).not.toBeInTheDocument();
  });

  it('submits the complete manual identification request and continues', async () => {
    await renderStep();
    await fillManualIdent();
    await clickNext();

    expect(mockToBase64).toHaveBeenCalledWith(expect.objectContaining({ name: 'identity.pdf' }));
    expect(mockSetManualIdentData).toHaveBeenCalledWith('TESTCODE', 'step-session', {
      firstName: 'Alex',
      lastName: 'Example',
      birthName: 'Original',
      birthday: new Date('1990-05-06'),
      nationality: mockCountryCh,
      birthplace: 'Zurich',
      gender: 'Male',
      documentType: 'PASSPORT',
      documentNumber: 'P-123',
      document: { file: 'data:application/pdf;base64,UFZERg==', fileName: 'identity.pdf' },
    });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
  });

  it('uses an empty document payload when base64 conversion has no result', async () => {
    mockToBase64.mockResolvedValue(undefined);
    await renderStep();
    await fillManualIdent();
    await clickNext();

    expect(mockSetManualIdentData.mock.calls[0][2].document).toEqual({ file: '', fileName: 'identity.pdf' });
  });

  it('does not submit manual identification without a session', async () => {
    await renderStep({ noSession: true });
    await fillManualIdent();
    await clickNext();

    expect(mockSetManualIdentData).not.toHaveBeenCalled();
  });

  it.each([
    [{ message: 'Manual review failed' }, 'Manual review failed'],
    [{}, 'Unknown error'],
  ])('shows manual identification API errors and permits retrying', async (rejection, expected) => {
    const firstUpdate = createDeferred();
    const retryUpdate = createDeferred();
    mockSetManualIdentData.mockReturnValueOnce(firstUpdate.promise).mockReturnValueOnce(retryUpdate.promise);
    await renderStep();
    await fillManualIdent();
    await clickNext();

    await waitFor(
      () => {
        expect(mockSetManualIdentData).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
      },
      { timeout: 10000 },
    );
    await act(async () => {
      firstUpdate.reject(rejection);
      await firstUpdate.promise.catch(() => undefined);
    });
    await waitFor(
      () => {
        expect(screen.getByRole('alert')).toHaveTextContent(expected);
        expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
      },
      { timeout: 10000 },
    );

    await clickNext();
    await waitFor(
      () => {
        expect(mockSetManualIdentData).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
      },
      { timeout: 10000 },
    );
    await act(async () => {
      retryUpdate.resolve();
      await retryUpdate.promise;
    });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument(), { timeout: 10000 });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('TESTCODE'), { timeout: 10000 });
  });

  it('disables the manual action while the update is pending', async () => {
    const update = createDeferred();
    mockSetManualIdentData.mockReturnValue(update.promise);
    await renderStep();
    await fillManualIdent();

    await clickNext();
    await waitFor(
      () => {
        expect(mockSetManualIdentData).toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
      },
      { timeout: 10000 },
    );

    await act(async () => {
      update.resolve();
      await update.promise;
    });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled(), { timeout: 10000 });
  });
});
