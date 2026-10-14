import { act, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import KycScreen from '../screens/kyc.screen';

// The redirects callKyc performs for a merged account, a missing 2FA and a merge conflict must not
// also surface the API message: the real router and the real ErrorHint run here, and only the
// reporter behind ErrorHint is replaced, so a report proves the hint was displayed.

jest.setTimeout(30000);

const mockGetKycInfo = jest.fn();
const mockContinueKyc = jest.fn();
const mockStartStep = jest.fn();
const mockLogout = jest.fn();
const mockReportClientError = jest.fn();

const mockKyc = {
  getKycInfo: mockGetKycInfo,
  continueKyc: mockContinueKyc,
  startStep: mockStartStep,
  addTransferClient: jest.fn(),
  cancelStep: jest.fn(),
};

const mockUser = { user: undefined, reloadUser: jest.fn() };
const mockApp = {
  isInitialized: true,
  isWidget: false,
  params: {},
  setParams: jest.fn(),
  redirectPath: undefined,
  setRedirectPath: jest.fn(),
};
const mockSettings = {
  translate: (_namespace: string, text: string) => text,
  changeLanguage: jest.fn(),
  processingKycData: false,
};

jest.mock('@dfx.swiss/react', () => ({
  KycLevel: { Link: 10, Sell: 30, Completed: 50 },
  KycStepName: { CONTACT_DATA: 'ContactData', IDENT: 'Ident' },
  KycStepStatus: { NOT_STARTED: 'NotStarted', IN_PROGRESS: 'InProgress', FAILED: 'Failed', COMPLETED: 'Completed' },
  KycStepType: { VIDEO: 'Video', AUTO: 'Auto', SUMSUB_VIDEO: 'SumsubVideo', SUMSUB_AUTO: 'SumsubAuto' },
  KycStepCancelable: [],
  KycStepReason: { ACCOUNT_MERGE_REQUESTED: 'AccountMergeRequested' },
  UrlType: { BROWSER: 'Browser' },
  Utils: { createRules: (rules: Record<string, unknown>) => rules },
  Validations: {},
  isStepDone: (value: { status: string }) => value.status === 'Completed',
  useKyc: () => mockKyc,
  useSessionContext: () => ({ logout: mockLogout }),
  useUserContext: () => mockUser,
}));

jest.mock('@dfx.swiss/react-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const Stack = ({ children }: any) => React.createElement('div', null, children);
  return {
    SpinnerSize: { LG: 'lg' },
    StyledButton: ({ label, onClick }: any) => React.createElement('button', { type: 'button', onClick }, label),
    StyledButtonColor: { GRAY_OUTLINE: 'gray' },
    StyledButtonWidth: { MIN: 'min' },
    StyledLoadingSpinner: () => React.createElement('div', { 'data-testid': 'loading-spinner' }),
    StyledVerticalStack: Stack,
  };
});

jest.mock('@sumsub/websdk-react', () => () => null);
jest.mock('react-device-detect', () => ({ isMobile: false }));
jest.mock('react-i18next', () => ({ Trans: ({ children }: any) => children }));
jest.mock('src/contexts/app-handling.context', () => ({ useAppHandlingContext: () => mockApp }));
jest.mock('src/contexts/layout.context', () => ({ useLayoutContext: () => ({ rootRef: { current: null } }) }));
jest.mock('src/hooks/app-params.hook', () => ({ useAppParams: () => ({ lang: 'EN' }) }));
jest.mock('src/util/client-error', () => ({
  reportClientError: (...args: unknown[]) => mockReportClientError(...args),
}));
jest.mock('../components/kyc-status', () => ({ KycStatusTable: () => <div data-testid="kyc-status" /> }));
jest.mock('../contexts/settings.context', () => ({ useSettingsContext: () => mockSettings }));
jest.mock('../hooks/guard.hook', () => ({ useUserGuard: jest.fn() }));
jest.mock('../hooks/kyc-helper.hook', () => ({ useKycHelper: () => ({ nameToString: (value: string) => value }) }));
jest.mock('../hooks/layout-config.hook', () => ({ useLayoutOptions: jest.fn() }));
jest.mock('../screens/kyc-redirect.screen', () => ({ IframeMessageType: 'kyc-message' }));
jest.mock('../util/validation-rules', () => ({}));

const GENERIC_HINT = 'Something went wrong. Please try again. If the issue persists please reach out to our support.';

function info() {
  return { kycLevel: 0, language: { symbol: 'EN' }, kycClients: [], kycSteps: [], tradingLimit: 1000 };
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/kyc', element: <KycScreen /> },
      { path: '/profile', element: <KycScreen /> },
      { path: '/2fa', element: <div data-testid="tfa-screen" /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

async function settle() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

function expectNothingShownOrReported(message: string) {
  expect(screen.queryByText(message)).not.toBeInTheDocument();
  expect(screen.queryByText(GENERIC_HINT)).not.toBeInTheDocument();
  expect(mockReportClientError).not.toHaveBeenCalled();
}

function expectShownAndReported(message: string, path: string) {
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(screen.getByText(GENERIC_HINT)).toBeInTheDocument();
  expect(mockReportClientError).toHaveBeenCalledTimes(1);
  expect(mockReportClientError).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'HandledError', message }),
    path,
    undefined,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApp.params = {};
  mockGetKycInfo.mockResolvedValue(info());
  mockContinueKyc.mockResolvedValue(info());
  mockStartStep.mockResolvedValue(info());
});

describe('KycScreen redirects that handle an API error', () => {
  it('switches to the main account code without showing or reporting the merged account', async () => {
    mockGetKycInfo.mockRejectedValueOnce({ statusCode: 401, switchToCode: 'MAIN', message: 'User is merged' });
    const router = renderAt('/kyc?code=MERGED');

    await screen.findByTestId('kyc-status', undefined, { timeout: 10000 });
    await settle();

    expect(router.state.location.search).toBe('?code=MAIN');
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockGetKycInfo).toHaveBeenLastCalledWith('MAIN');
    expectNothingShownOrReported('User is merged');
  });

  it('switches to the main account code from the profile continuation without showing or reporting it', async () => {
    mockContinueKyc.mockRejectedValueOnce({ statusCode: 401, switchToCode: 'MAIN', message: 'User is merged' });
    const router = renderAt('/profile?code=MERGED');

    await waitFor(() => expect(router.state.location.search).toBe('?code=MAIN'), { timeout: 10000 });
    await waitFor(() => expect(mockContinueKyc).toHaveBeenLastCalledWith('MAIN'), { timeout: 10000 });
    await settle();

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expectNothingShownOrReported('User is merged');
  });

  it('switches to the main account code when starting a step without showing or reporting it', async () => {
    mockStartStep.mockRejectedValueOnce({ statusCode: 401, switchToCode: 'MAIN', message: 'User is merged' });
    const router = renderAt('/kyc?code=MERGED&step=Ident');

    await waitFor(() => expect(mockStartStep).toHaveBeenLastCalledWith('MAIN', 'Ident', undefined, undefined), {
      timeout: 10000,
    });
    await settle();

    expect(router.state.location.search).toBe('?code=MAIN');
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expectNothingShownOrReported('User is merged');
  });

  it('opens 2FA without showing or reporting the requirement', async () => {
    mockGetKycInfo.mockRejectedValueOnce({ statusCode: 403, code: 'TFA_REQUIRED', message: '2FA required (strict)' });
    const router = renderAt('/kyc?code=CODE');

    await screen.findByTestId('tfa-screen', undefined, { timeout: 10000 });
    await settle();

    expect(router.state.location.pathname).toBe('/2fa');
    expect(mockApp.setParams).toHaveBeenCalledWith({ autoStart: 'true' });
    expect(mockApp.setRedirectPath).toHaveBeenCalledWith('/kyc');
    expectNothingShownOrReported('2FA required (strict)');
  });

  it('opens 2FA from the profile continuation without showing or reporting the requirement', async () => {
    mockContinueKyc.mockRejectedValueOnce({ statusCode: 403, code: 'TFA_REQUIRED', message: '2FA required (strict)' });
    const router = renderAt('/profile?code=CODE');

    await screen.findByTestId('tfa-screen', undefined, { timeout: 10000 });
    await settle();

    expect(router.state.location.pathname).toBe('/2fa');
    expect(mockApp.setRedirectPath).toHaveBeenCalledWith('/profile');
    expectNothingShownOrReported('2FA required (strict)');
  });

  it('shows the link hint for a merge conflict without showing or reporting the conflict', async () => {
    mockGetKycInfo.mockRejectedValueOnce({ statusCode: 409, message: 'User already exists, merge requested' });
    renderAt('/kyc?code=CODE');

    await screen.findByText(
      'It looks like you already have an account with DFX.',
      { exact: false },
      { timeout: 10000 },
    );
    await settle();

    expectNothingShownOrReported('User already exists, merge requested');
  });
});

describe('KycScreen API errors that stay visible', () => {
  it('shows and reports an error it does not handle', async () => {
    mockGetKycInfo.mockRejectedValueOnce({ statusCode: 500, message: 'Internal server error' });
    renderAt('/kyc?code=CODE');

    await screen.findByText('Internal server error', undefined, { timeout: 10000 });
    await settle();

    expectShownAndReported('Internal server error', '/kyc');
  });

  it('reports a 401 whose switch code the SDK left undefined', async () => {
    mockGetKycInfo.mockRejectedValueOnce({ statusCode: 401, switchToCode: undefined, message: 'Unauthorized' });
    renderAt('/kyc?code=CODE');

    await waitFor(() => expect(mockReportClientError).toHaveBeenCalled(), { timeout: 10000 });
    await settle();

    expect(mockReportClientError).toHaveBeenCalledTimes(1);
    expect(mockReportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'HandledError', message: 'Unauthorized' }),
      '/kyc',
      undefined,
    );
  });

  it('shows and reports a merged account without a main account', async () => {
    mockContinueKyc.mockRejectedValueOnce({ statusCode: 400, message: 'User is merged' });
    const router = renderAt('/profile?code=MERGED');

    await screen.findByText('User is merged', undefined, { timeout: 10000 });
    await settle();

    expect(router.state.location.search).toBe('?code=MERGED');
    expect(mockLogout).not.toHaveBeenCalled();
    expectShownAndReported('User is merged', '/profile');
  });

  it('shows and reports a conflict that is not a merge', async () => {
    mockGetKycInfo.mockRejectedValueOnce({ statusCode: 409, message: 'Mail already exists' });
    renderAt('/kyc?code=CODE');

    await screen.findByText('Mail already exists', undefined, { timeout: 10000 });
    await settle();

    expectShownAndReported('Mail already exists', '/kyc');
  });
});
