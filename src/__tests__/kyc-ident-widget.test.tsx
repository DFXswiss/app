const mockStartStep = jest.fn();
const mockGetKycInfo = jest.fn();
const mockContinueKyc = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  KycLevel: { Link: 10, Sell: 30, Completed: 50 },
  KycStepName: { CONTACT_DATA: 'ContactData', IDENT: 'Ident' },
  KycStepStatus: { NOT_STARTED: 'NotStarted', IN_PROGRESS: 'InProgress', FAILED: 'Failed' },
  KycStepType: {
    MANUAL: 'Manual',
    VIDEO: 'Video',
    AUTO: 'Auto',
    SUMSUB_VIDEO: 'SumsubVideo',
    SUMSUB_AUTO: 'SumsubAuto',
  },
  KycStepCancelable: [],
  KycStepReason: {},
  UrlType: { TOKEN: 'Token', BROWSER: 'Browser' },
  isStepDone: () => false,
  Utils: { createRules: () => ({}) },
  Validations: { Custom: () => ({}) },
  useKyc: () => ({
    getKycInfo: mockGetKycInfo,
    continueKyc: mockContinueKyc,
    startStep: mockStartStep,
  }),
  useUserContext: () => ({ user: undefined, reloadUser: jest.fn() }),
  useSessionContext: () => ({ logout: jest.fn() }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  // babel-plugin-jest-hoist runs this factory before file imports.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');

  const StyledButton = ({ label, onClick, disabled, isLoading }: any) =>
    React.createElement('button', { type: 'button', onClick, disabled: disabled || isLoading }, label);
  const Stack = ({ children }: any) => React.createElement('div', null, children);

  return {
    StyledButton,
    StyledVerticalStack: Stack,
    StyledHorizontalStack: Stack,
    StyledLoadingSpinner: () => React.createElement('div', { 'data-testid': 'loading-spinner' }),
    SpinnerSize: { LG: 'lg' },
    StyledButtonColor: { GRAY_OUTLINE: 'gray-outline' },
    StyledButtonWidth: { FULL: 'full', MIN: 'min' },
  };
});

jest.mock('@sumsub/websdk-react', () => () => <div data-testid="sumsub-sdk" />);

const mockAppHandling = {
  isInitialized: true,
  isWidget: true,
  params: {},
  setParams: jest.fn(),
};
jest.mock('src/contexts/app-handling.context', () => ({ useAppHandlingContext: () => mockAppHandling }));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('src/hooks/app-params.hook', () => ({
  useAppParams: () => ({ lang: 'EN' }),
}));

const mockSettings = {
  translate: (_namespace: string, text: string) => text,
  changeLanguage: jest.fn(),
  processingKycData: false,
};
jest.mock('../contexts/settings.context', () => ({ useSettingsContext: () => mockSettings }));

jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div>{message}</div>,
}));
jest.mock('../components/kyc-status', () => ({ KycStatusTable: () => null }));
jest.mock('../hooks/geo-location.hook', () => ({ useGeoLocation: () => ({ countryCode: 'CH' }) }));
jest.mock('../hooks/guard.hook', () => ({ useUserGuard: () => undefined }));
jest.mock('../hooks/kyc-helper.hook', () => ({
  useKycHelper: () => ({ nameToString: (name: string) => name, accountTypeToString: (type: string) => type }),
}));
jest.mock('../hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), clearParams: jest.fn() };
jest.mock('../hooks/navigation.hook', () => ({ useNavigation: () => mockNavigation }));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import KycScreen from '../screens/kyc.screen';

const originalPublicUrl = process.env.REACT_APP_PUBLIC_URL;
let openSpy: jest.SpyInstance;

function kycSession(sessionType: 'Token' | 'Browser') {
  return {
    kycLevel: 0,
    language: { symbol: 'EN' },
    kycClients: [],
    kycSteps: [],
    currentStep: {
      name: 'Ident',
      type: 'SumsubAuto',
      status: 'InProgress',
      session: { url: 'https://provider.example/session', type: sessionType },
    },
  };
}

function renderIdent(sessionType: 'Token' | 'Browser', isWidget: boolean) {
  const session = kycSession(sessionType);
  mockAppHandling.isWidget = isWidget;
  mockStartStep.mockResolvedValue(session);
  mockGetKycInfo.mockResolvedValue(session);

  return render(
    <MemoryRouter initialEntries={['/kyc?code=TESTCODE&step=Ident/SumsubAuto']}>
      <Routes>
        <Route path="/kyc" element={<KycScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.REACT_APP_PUBLIC_URL = 'https://app.example/';
  openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  openSpy.mockRestore();

  if (originalPublicUrl === undefined) {
    delete process.env.REACT_APP_PUBLIC_URL;
  } else {
    process.env.REACT_APP_PUBLIC_URL = originalPublicUrl;
  }
});

it('shows the new-tab identification flow for a token session in widget mode', async () => {
  renderIdent('Token', true);

  expect(await screen.findByText('Identification continues in a new tab')).toBeInTheDocument();
  expect(screen.queryByTestId('sumsub-sdk')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Open identification' }));
  expect(openSpy).toHaveBeenCalledWith('https://app.example/kyc?code=TESTCODE', '_blank', 'noopener,noreferrer');
});

it('keeps browser sessions in an iframe in widget mode', async () => {
  const { container } = renderIdent('Browser', true);

  await waitFor(() =>
    expect(container.querySelector('iframe')).toHaveAttribute('src', 'https://provider.example/session'),
  );
  expect(screen.queryByText('Identification continues in a new tab')).not.toBeInTheDocument();
});

it('keeps token sessions in Sumsub outside widget mode', async () => {
  renderIdent('Token', false);

  expect(await screen.findByTestId('sumsub-sdk')).toBeInTheDocument();
  expect(screen.queryByText('Identification continues in a new tab')).not.toBeInTheDocument();
});

it('reloads KYC information when Continue is clicked in widget mode', async () => {
  renderIdent('Token', true);

  expect(mockGetKycInfo).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

  await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledWith('TESTCODE'));
  expect(mockGetKycInfo).toHaveBeenCalledTimes(1);
});
