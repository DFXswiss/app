const mockSession = { isLoggedIn: false };
const mockGetKycInfo = jest.fn();
const mockContinueKyc = jest.fn();
const mockSetup2fa = jest.fn();
const mockVerify2fa = jest.fn();
const mockInApp = { allow: new Set<string>(['ContactData']) };
const mockKycForm: { props?: Record<string, unknown> } = {};
const mockUser: {
  user?: { kyc?: { hash?: string; level: number }; tradingLimit?: { limit: number; period: string } };
  isUserLoading: boolean;
} = {
  user: { kyc: { hash: 'abc', level: 0 } },
  isUserLoading: false,
};

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    ETHEREUM: 'Ethereum',
    SEPOLIA: 'Sepolia',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    OPTIMISM: 'Optimism',
    ARBITRUM: 'Arbitrum',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    SOLANA: 'Solana',
    TRON: 'Tron',
    CARDANO: 'Cardano',
    DEFICHAIN: 'DeFiChain',
    LIGHTNING: 'Lightning',
  },
  KycLevel: { Completed: 50, Sell: 30 },
  KycStepStatus: {
    NOT_STARTED: 'NotStarted',
    IN_PROGRESS: 'InProgress',
    IN_REVIEW: 'InReview',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
    OUTDATED: 'Outdated',
    DATA_REQUESTED: 'DataRequested',
  },
  KycStepName: {
    CONTACT_DATA: 'ContactData',
    PERSONAL_DATA: 'PersonalData',
    DFX_APPROVAL: 'DfxApproval',
    COMMERCIAL_REGISTER: 'CommercialRegister',
    PAYMENT_AGREEMENT: 'PaymentAgreement',
    IDENT: 'Ident',
  },
  KycStepReason: { ACCOUNT_EXISTS: 'AccountExists', ACCOUNT_MERGE_REQUESTED: 'AccountMergeRequested' },
  TfaType: { APP: 'App', MAIL: 'Mail' },
  isStepDone: (step: { status?: string }) => step.status === 'Completed',
  useKyc: () => ({
    getKycInfo: mockGetKycInfo,
    continueKyc: mockContinueKyc,
    setup2fa: mockSetup2fa,
    verify2fa: mockVerify2fa,
  }),
  useUserContext: () => ({
    user: mockUser.user,
    isUserLoading: mockUser.isUserLoading,
  }),
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => mockSession,
}));

jest.mock('../screens/kyc-steps', () => ({
  isInAppStep: (name: string) => mockInApp.allow.has(name),
  KycStepForm: (props: Record<string, unknown>) => {
    mockKycForm.props = props;
    return <div data-testid="kyc-step-form" />;
  },
}));

jest.mock('react-qr-code', () => ({
  __esModule: true,
  default: () => <div data-testid="qr" />,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import KycScreen from '../screens/kyc';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

function renderKyc() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <KycScreen />
      </ToastProvider>
    </LanguageProvider>,
  );
}

describe('KycScreen', () => {
  beforeEach(() => {
    mockSession.isLoggedIn = false;
    mockUser.user = { kyc: { hash: 'abc', level: 0 } };
    mockUser.isUserLoading = false;
    mockGetKycInfo.mockReset();
    mockContinueKyc.mockReset();
    mockSetup2fa.mockReset();
    mockVerify2fa.mockReset();
    mockGetKycInfo.mockResolvedValue({
      kycLevel: 0,
      kycSteps: [{ name: 'ContactData', status: 'NotStarted' }],
    });
  });

  it('asks a logged-out visitor to connect', () => {
    renderKyc();
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('shows a load failure when the account has no KYC hash', () => {
    mockSession.isLoggedIn = true;
    mockUser.user = { kyc: { level: 0 } };
    renderKyc();
    expect(screen.getByText(/couldn't load|nicht laden|caricare|charger/i)).toBeInTheDocument();
  });

  it('loads the overview and retries after an error', async () => {
    mockSession.isLoggedIn = true;
    mockGetKycInfo.mockRejectedValueOnce(new Error('down'));
    renderKyc();
    expect(await screen.findByText(/something went wrong|fehler|errore|erreur|couldn't load/i)).toBeInTheDocument();
    mockGetKycInfo.mockResolvedValueOnce({
      kycLevel: 30,
      tradingLimit: { limit: 1000, period: 'Month' },
      kycSteps: [
        { name: 'ContactData', status: 'Completed' },
        { name: 'PersonalData', status: 'Failed' },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    await waitFor(() => expect(mockGetKycInfo).toHaveBeenCalledTimes(2));
  });

  it('shows a loading row while the user context is still resolving', () => {
    mockSession.isLoggedIn = true;
    mockUser.user = undefined;
    mockUser.isUserLoading = true;
    renderKyc();
    expect(screen.getByText(/loading|laden|caricamento|chargement/i)).toBeInTheDocument();
  });

  it('starts verification from the overview and opens an in-app step', async () => {
    mockSession.isLoggedIn = true;
    mockContinueKyc.mockResolvedValue({
      currentStep: { name: 'ContactData', status: 'InProgress', sequenceNumber: 1 },
    });
    renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByTestId('kyc-step-form')).toBeInTheDocument();
  });

  it('shows the fully-verified overview when every step is done', async () => {
    mockSession.isLoggedIn = true;
    mockGetKycInfo.mockImplementation(() =>
      Promise.resolve({
        kycLevel: 50,
        tradingLimit: { limit: 100000, period: 'Year' },
        kycSteps: [{ name: 'ContactData', status: 'Completed' }],
      }),
    );
    renderKyc();
    expect(await screen.findByText(/all done|alles erledigt|tutto fatto|tout est fait/i)).toBeInTheDocument();
  });

  it('renders a failed step with the server reason', async () => {
    mockSession.isLoggedIn = true;
    mockContinueKyc.mockResolvedValue({
      currentStep: { name: 'PersonalData', status: 'Failed', reason: 'mismatch', sequenceNumber: 2 },
    });
    renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/this step has failed|fehlgeschlagen|non è riuscito|échoué/i)).toBeInTheDocument();
    expect(screen.getByText('mismatch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /continue|weiter|continua|continuer/i }));
    fireEvent.click(screen.getByRole('button', { name: /overview|übersicht|panoramica|aperçu/i }));
  });

  it('renders an in-review approval step', async () => {
    mockSession.isLoggedIn = true;
    mockContinueKyc.mockResolvedValue({
      currentStep: { name: 'DfxApproval', status: 'InProgress', sequenceNumber: 3 },
    });
    renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/reviewing this step|prüft diesen schritt|esaminando|examine cette/i)).toBeInTheDocument();
  });

  it('renders a portal-only legacy step', async () => {
    mockSession.isLoggedIn = true;
    mockContinueKyc.mockResolvedValue({
      currentStep: { name: 'PaymentAgreement', status: 'InProgress', sequenceNumber: 4 },
    });
    renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/completed in the dfx portal|dfx-portal|portale dfx|portail dfx/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /completed it|erledigt|fatto|c'est fait/i }));
  });

  it('starts 2FA from a required continue and verifies an app code', async () => {
    mockSession.isLoggedIn = true;
    mockContinueKyc.mockRejectedValueOnce({ code: 'TFA_REQUIRED' });
    mockSetup2fa.mockResolvedValue({ type: 'App', uri: 'otpauth://x', secret: 'SECRET' });
    mockVerify2fa.mockResolvedValue(undefined);
    mockContinueKyc.mockResolvedValueOnce({ currentStep: undefined, kycSteps: [] });
    renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByTestId('qr')).toBeInTheDocument();
    const write = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    await waitFor(() => expect(write).toHaveBeenCalledWith('SECRET'));
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mockVerify2fa).toHaveBeenCalledWith('abc', '123456'));
  });

  it('handles mail 2FA, a wrong code, an already-enrolled setup and a setup failure', async () => {
    mockSession.isLoggedIn = true;
    mockContinueKyc.mockRejectedValue({ code: 'TFA_REQUIRED' });
    mockSetup2fa.mockResolvedValueOnce({ type: 'Mail' });
    const view = renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/emailed you a 6-digit code|per e-mail geschickt|inviato.*codice|envoyé.*code/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '000000' } });
    mockVerify2fa.mockRejectedValueOnce(new Error('bad'));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/invalid or expired|ungültig|non valido|expiré/i)).toBeInTheDocument();
    view.unmount();

    mockSetup2fa.mockRejectedValueOnce({ statusCode: 409 });
    const enrolled = renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/current 6-digit code|aktuellen 6-stelligen|codice a 6|code à 6/i)).toBeInTheDocument();
    enrolled.unmount();

    mockSetup2fa.mockRejectedValueOnce({ statusCode: 500 });
    const failed = renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/could not be prepared|nicht vorbereitet|preparata|préparée/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /overview|übersicht|panoramica|aperçu/i }));
    failed.unmount();
  });

  it('routes continue errors to merge, switch and generic failure', async () => {
    mockSession.isLoggedIn = true;
    mockContinueKyc
      .mockRejectedValueOnce({ code: 'ACCOUNT_MERGE_REQUESTED' })
      .mockRejectedValueOnce({ statusCode: 401, switchToCode: 'other-hash' })
      .mockRejectedValueOnce({ statusCode: 0 });
    const view = renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/account merge is in progress|kontozusammenführung|unione|fusion/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /overview|übersicht|panoramica|aperçu/i }));
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/account was merged|konto wurde zusammengeführt|account è stato|compte a été/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /overview|übersicht|panoramica|aperçu/i }));
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/couldn't load|nicht laden|caricare|charger/i)).toBeInTheDocument();
    view.unmount();
  });

  it('shows continue when a step already started and labels unknown chips', async () => {
    mockSession.isLoggedIn = true;
    mockUser.user = { kyc: { hash: 'abc', level: undefined as unknown as number }, tradingLimit: { limit: 50, period: 'Week' } };
    mockGetKycInfo.mockResolvedValueOnce({
      kycSteps: [
        { name: 'FutureStep', status: 'Outdated' },
        { name: 'ContactData', status: 'DataRequested' },
        { name: 'PersonalData', status: 'NoSuchKycStatus' },
      ],
    });
    renderKyc();
    expect(await screen.findByText('FutureStep')).toBeInTheDocument();
    expect(screen.getByText('Outdated')).toBeInTheDocument();
    expect(screen.getByText(/data requested|daten angefragt|dati richiesti|données demandées/i)).toBeInTheDocument();
    expect(screen.getByText(/level —|level -|stufe —/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue|weiter|continua|continuer/i })).toBeInTheDocument();
  });

  it('lands on the overview when continue returns no current step', async () => {
    mockSession.isLoggedIn = true;
    mockContinueKyc.mockResolvedValue({ currentStep: undefined, kycSteps: [] });
    renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled());
    expect(screen.queryByTestId('kyc-step-form')).not.toBeInTheDocument();
  });

  it('renders failed merge/exists steps, in-review and commercial register', async () => {
    mockSession.isLoggedIn = true;
    mockContinueKyc.mockResolvedValueOnce({
      currentStep: { name: 'PersonalData', status: 'Failed', reason: 'AccountMergeRequested', sequenceNumber: 1 },
    });
    const merge = renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/account merge is in progress|kontozusammenführung|unione|fusion/i)).toBeInTheDocument();
    merge.unmount();

    mockContinueKyc.mockResolvedValueOnce({
      currentStep: { name: 'PersonalData', status: 'Failed', reason: 'AccountExists', sequenceNumber: 1 },
    });
    const exists = renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/existing account|bestehendes konto|account esistente|compte existant/i)).toBeInTheDocument();
    exists.unmount();

    mockContinueKyc.mockResolvedValueOnce({
      currentStep: { name: 'Ident', status: 'InReview', sequenceNumber: 1 },
    });
    const review = renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/reviewing this step|prüft diesen schritt|esaminando|examine cette/i)).toBeInTheDocument();
    review.unmount();

    mockContinueKyc.mockResolvedValueOnce({
      currentStep: { name: 'CommercialRegister', status: 'InProgress', sequenceNumber: 1 },
    });
    renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/reviewing this step|prüft diesen schritt|esaminando|examine cette/i)).toBeInTheDocument();
  });

  it('forwards in-app form callbacks and retries a failed 2FA setup', async () => {
    mockSession.isLoggedIn = true;
    mockContinueKyc.mockResolvedValue({
      currentStep: { name: 'ContactData', status: 'InProgress', sequenceNumber: 1 },
    });
    renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByTestId('kyc-step-form')).toBeInTheDocument();

    const props = mockKycForm.props as {
      onAdvance: (session: { currentStep?: unknown }) => void;
      onFailed: (result: { status: string }) => void;
      onTfaRequired: () => void;
      onHandoff: (handoff: { kind: string }) => void;
      onBack: () => void;
    };
    props.onFailed({ status: 'Failed' });
    expect(await screen.findByText(/this step has failed|fehlgeschlagen|non è riuscito|échoué/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /overview|übersicht|panoramica|aperçu/i }));
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    await screen.findByTestId('kyc-step-form');
    props.onAdvance({ currentStep: { name: 'ContactData', status: 'InProgress', sequenceNumber: 2 } });
    expect(await screen.findByTestId('kyc-step-form')).toBeInTheDocument();

    (mockKycForm.props as typeof props).onAdvance({});
    await waitFor(() => expect(screen.queryByTestId('kyc-step-form')).not.toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    await screen.findByTestId('kyc-step-form');
    (mockKycForm.props as typeof props).onHandoff({ kind: 'account-exists' });
    expect(await screen.findByText(/existing account|bestehendes konto|account esistente|compte existant/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /overview|übersicht|panoramica|aperçu/i }));
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    await screen.findByTestId('kyc-step-form');
    mockSetup2fa.mockResolvedValueOnce({ type: 'Mail' });
    (mockKycForm.props as typeof props).onTfaRequired();
    expect(await screen.findByText(/emailed you a 6-digit code|per e-mail geschickt|inviato.*codice|envoyé.*code/i)).toBeInTheDocument();
  });

  it('returns to the overview from an in-app step', async () => {
    mockSession.isLoggedIn = true;
    mockContinueKyc.mockResolvedValue({
      currentStep: { name: 'ContactData', status: 'InProgress', sequenceNumber: 1 },
    });
    renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    await screen.findByTestId('kyc-step-form');
    (mockKycForm.props as { onBack: () => void }).onBack();
    await waitFor(() => expect(screen.queryByTestId('kyc-step-form')).not.toBeInTheDocument());
  });

  it('copies a 2FA secret through success, missing clipboard and a write failure', async () => {
    mockSession.isLoggedIn = true;
    mockContinueKyc.mockRejectedValue({ code: 'TFA_REQUIRED' });
    mockSetup2fa.mockResolvedValue({ type: 'App', uri: 'otpauth://x', secret: 'SECRET' });
    renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    await screen.findByTestId('qr');

    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('blocked')) } });
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());

    Object.assign(navigator, { clipboard: undefined });
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '12' } });
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('retries a failed 2FA setup', async () => {
    mockSession.isLoggedIn = true;
    mockContinueKyc.mockRejectedValue({ code: 'TFA_REQUIRED' });
    mockSetup2fa.mockRejectedValueOnce({ statusCode: 500 }).mockResolvedValueOnce({ type: 'Mail' });
    renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/could not be prepared|nicht vorbereitet|preparata|préparée/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    expect(await screen.findByText(/emailed you a 6-digit code|per e-mail geschickt|inviato.*codice|envoyé.*code/i)).toBeInTheDocument();
  });

  it('ignores a second continue, a short 2FA submit and an unsafe portal link', async () => {
    mockSession.isLoggedIn = true;
    let resolveContinue!: (value: { currentStep?: unknown }) => void;
    mockContinueKyc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveContinue = resolve;
        }),
    );
    const busy = renderKyc();
    const start = await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i });
    fireEvent.click(start);
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledTimes(1));
    (start as HTMLButtonElement).disabled = false;
    fireEvent.click(start);
    expect(mockContinueKyc).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveContinue({ currentStep: undefined, kycSteps: [] });
    });
    busy.unmount();

    mockContinueKyc.mockRejectedValueOnce({ code: 'TFA_REQUIRED' });
    mockSetup2fa.mockResolvedValueOnce({ type: 'App', uri: 'otpauth://x', secret: 'SECRET' });
    renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    await screen.findByTestId('qr');
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockVerify2fa).not.toHaveBeenCalled();

    const prev = process.env.REACT_APP_PUBLIC_URL;
    process.env.REACT_APP_PUBLIC_URL = 'http://evil.example';
    mockContinueKyc.mockRejectedValueOnce({ code: 'ACCOUNT_MERGE_REQUESTED' });
    const handoff = renderKyc();
    fireEvent.click(await screen.findByRole('button', { name: /start verification|verifizierung starten|avvia|démarrer/i }));
    expect(await screen.findByText(/account merge is in progress|kontozusammenführung|unione|fusion/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    handoff.unmount();
    process.env.REACT_APP_PUBLIC_URL = prev;
  });
});
