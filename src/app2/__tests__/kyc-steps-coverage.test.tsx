// KYC responses and country lists are mocked; green tests do not prove backend DTO acceptance.
// Sumsub is a props probe; green tests do not prove real widget token renewal or portal completion.
const mockSetContact = jest.fn();
const mockSetPersonal = jest.fn();
const mockSetNationality = jest.fn();
const mockSetLegal = jest.fn();
const mockSetSignatory = jest.fn();
const mockSetOperational = jest.fn();
const mockSetRecommendation = jest.fn();
const mockSetRecall = jest.fn();
const mockSetFile = jest.fn();
const mockSetBeneficial = jest.fn();
const mockGetFinancial = jest.fn();
const mockSetFinancial = jest.fn();
const mockContinueKyc = jest.fn();
const mockGetCountries = jest.fn();
const mockSumsub = { props: undefined as undefined | Record<string, unknown> };
const mockUserMail: { user: { mail?: string } | undefined } = { user: { mail: 'prefill@example.com' } };

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { BITCOIN: 'Bitcoin', ETHEREUM: 'Ethereum' },
  AccountType: { PERSONAL: 'Personal', ORGANIZATION: 'Organization', SOLE_PROPRIETORSHIP: 'SoleProprietorship' },
  LegalEntity: {
    AG: 'AG',
    GMBH: 'GmbH',
    UG: 'UG',
    GBR: 'GbR',
    OHG: 'OHG',
    KG: 'KG',
    GMBH_CO_KG: 'GmbHCoKg',
    COOPERATIVE: 'Cooperative',
    ASSOCIATION: 'Association',
    FOUNDATION: 'Foundation',
    TRUST: 'Trust',
    COLLECTIVE_COMPANY: 'CollectiveCompany',
    LISTED_AG: 'ListedAG',
    PUBLIC_INSTITUTION: 'PublicInstitution',
    LIFE_INSURANCE: 'LifeInsurance',
    OTHER: 'Other',
  },
  SignatoryPower: { SINGLE: 'Single', DOUBLE: 'Double', NONE: 'None' },
  QuestionType: {
    CONFIRMATION: 'Confirmation',
    SINGLE_CHOICE: 'SingleChoice',
    MULTIPLE_CHOICE: 'MultipleChoice',
    TEXT: 'Text',
  },
  UrlType: { BROWSER: 'Browser', API: 'API', TOKEN: 'Token', NONE: 'None' },
  KycStepReason: {
    ACCOUNT_MERGE_REQUESTED: 'AccountMergeRequested',
    ACCOUNT_EXISTS: 'AccountExists',
  },
  KycStepName: {
    CONTACT_DATA: 'ContactData',
    PERSONAL_DATA: 'PersonalData',
    NATIONALITY_DATA: 'NationalityData',
    IDENT: 'Ident',
    FINANCIAL_DATA: 'FinancialData',
    LEGAL_ENTITY: 'LegalEntity',
    SIGNATORY_POWER: 'SignatoryPower',
    OPERATIONAL_ACTIVITY: 'OperationalActivity',
    RECOMMENDATION: 'Recommendation',
    BENEFICIAL_OWNER: 'BeneficialOwner',
    RECALL_AGREEMENT: 'RecallAgreement',
    SOLE_PROPRIETORSHIP_CONFIRMATION: 'SoleProprietorshipConfirmation',
    OWNER_DIRECTORY: 'OwnerDirectory',
    AUTHORITY: 'Authority',
    ADDITIONAL_DOCUMENTS: 'AdditionalDocuments',
    RESIDENCE_PERMIT: 'ResidencePermit',
    STATUTES: 'Statutes',
    PAYMENT_AGREEMENT: 'PaymentAgreement',
  },
  KycStepStatus: { NOT_STARTED: 'NotStarted', IN_PROGRESS: 'InProgress', FAILED: 'Failed', COMPLETED: 'Completed' },
  isStepDone: (step: { status?: string } | undefined) => step?.status === 'Completed',
  useKyc: () => ({
    setContactData: mockSetContact,
    setPersonalData: mockSetPersonal,
    setNationalityData: mockSetNationality,
    setLegalEntityData: mockSetLegal,
    setSignatoryPowerData: mockSetSignatory,
    setOperationalData: mockSetOperational,
    setRecommendationData: mockSetRecommendation,
    setRecallData: mockSetRecall,
    setFileData: mockSetFile,
    setBeneficialData: mockSetBeneficial,
    getFinancialData: mockGetFinancial,
    setFinancialData: mockSetFinancial,
    continueKyc: mockContinueKyc,
  }),
  useUserContext: () => ({ user: mockUserMail.user }),
  useCountry: () => ({ getCountries: mockGetCountries }),
}));

jest.mock('@sumsub/websdk-react', () => (props: Record<string, unknown>) => {
  mockSumsub.props = props;
  return <div data-testid="sumsub" />;
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KycStepName, KycStepStatus, UrlType } from '@dfx.swiss/react';
import type { KycStepSession } from '@dfx.swiss/react';
import { LanguageProvider } from '../i18n';
import { isInAppStep, KycStepForm, nextIdentPollDelay, IDENT_POLL } from '../screens/kyc-steps';

const COUNTRIES = [
  { id: 2, name: 'Germany', symbol: 'DE' },
  { id: 1, name: 'Switzerland', symbol: 'CH' },
];

function makeStep(name: KycStepName, extras: Partial<KycStepSession> = {}): KycStepSession {
  return {
    name,
    status: KycStepStatus.IN_PROGRESS,
    sequenceNumber: 1,
    session: { url: `https://api.example/kyc/${name}`, type: UrlType.BROWSER as never },
    ...extras,
  };
}

const handlers = {
  onAdvance: jest.fn(),
  onFailed: jest.fn(),
  onTfaRequired: jest.fn(),
  onHandoff: jest.fn(),
  onBack: jest.fn(),
};

function renderStep(name: KycStepName, extras?: Partial<KycStepSession>) {
  return render(
    <LanguageProvider>
      <KycStepForm code="code-1" step={makeStep(name, extras)} {...handlers} />
    </LanguageProvider>,
  );
}

function orgNameBox() {
  return screen.getByRole('textbox', { name: /^organization name$/i });
}

function orgAddressBox(part: RegExp) {
  return screen.getByRole('textbox', { name: part });
}

function orgCountryBox() {
  return screen.getByRole('combobox', { name: /organization address country/i });
}

function done(name: string) {
  return { name, status: 'Completed', sequenceNumber: 1 };
}

describe('isInAppStep and ident poll helper', () => {
  it('recognizes in-app steps and rejects portal-only ones', () => {
    expect(isInAppStep(KycStepName.CONTACT_DATA)).toBe(true);
    expect(isInAppStep(KycStepName.PERSONAL_DATA)).toBe(true);
    expect(isInAppStep(KycStepName.IDENT)).toBe(true);
    expect(isInAppStep(KycStepName.STATUTES)).toBe(true);
    expect(isInAppStep(KycStepName.PAYMENT_AGREEMENT)).toBe(false);
  });

  it('grows the ident poll delay and caps it', () => {
    expect(nextIdentPollDelay(IDENT_POLL.initialDelayMs)).toBe(2700);
    expect(nextIdentPollDelay(IDENT_POLL.maxDelayMs)).toBe(IDENT_POLL.maxDelayMs);
  });
});

describe('KycStepForm steps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.setItem('dfx_lang', 'en');
    mockSumsub.props = undefined;
    mockGetCountries.mockResolvedValue(COUNTRIES);
    mockSetContact.mockResolvedValue(done('ContactData'));
    mockSetPersonal.mockResolvedValue(done('PersonalData'));
    mockSetNationality.mockResolvedValue(done('NationalityData'));
    mockSetLegal.mockResolvedValue(done('LegalEntity'));
    mockSetSignatory.mockResolvedValue(done('SignatoryPower'));
    mockSetOperational.mockResolvedValue(done('OperationalActivity'));
    mockSetRecommendation.mockResolvedValue(done('Recommendation'));
    mockSetRecall.mockResolvedValue(done('RecallAgreement'));
    mockSetFile.mockResolvedValue(done('AdditionalDocuments'));
    mockSetBeneficial.mockResolvedValue(done('BeneficialOwner'));
    mockUserMail.user = { mail: 'prefill@example.com' };
    mockGetFinancial.mockResolvedValue({ questions: [], responses: [] });
    mockSetFinancial.mockResolvedValue(done('FinancialData'));
    mockContinueKyc.mockResolvedValue({ currentStep: undefined });
  });

  it('submits contact data from the prefilled mail', async () => {
    const view = renderStep(KycStepName.CONTACT_DATA);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mockSetContact).toHaveBeenCalledWith('code-1', 'https://api.example/kyc/ContactData', { mail: 'prefill@example.com' }));
    await waitFor(() => expect(handlers.onAdvance).toHaveBeenCalled());
    view.unmount();
  });

  it('starts contact mail empty when the user has none', async () => {
    mockUserMail.user = { mail: undefined };
    const view = renderStep(KycStepName.CONTACT_DATA);
    expect(screen.getByRole('textbox')).toHaveValue('');
    view.unmount();
  });

  it('matches a country prefill against a list with missing symbols', async () => {
    mockGetCountries.mockResolvedValueOnce([{ id: 9 }, { id: 2, name: 'Germany', symbol: 'DE' }]);
    window.history.replaceState({}, '', '/?country=de');
    const view = renderStep(KycStepName.PERSONAL_DATA);
    await screen.findByText(/first name/i);
    view.unmount();
    window.history.replaceState({}, '', '/');
  });

  it('labels a step that has no translation key', async () => {
    mockGetCountries.mockReturnValueOnce(new Promise(() => undefined));
    const view = renderStep('NoSuchKycStep' as never);
    expect(screen.getByText('NoSuchKycStep')).toBeInTheDocument();
    view.unmount();
  });

  it('ignores a contact submit without an email', async () => {
    const view = renderStep(KycStepName.CONTACT_DATA);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not-an-email' } });
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    view.unmount();
  });

  it('submits personal data for a private person', async () => {
    const view = renderStep(KycStepName.PERSONAL_DATA);
    await screen.findByText(/first name/i);
    const boxes = screen.getAllByRole('textbox');
    fireEvent.change(boxes[0], { target: { value: 'Ada' } });
    fireEvent.change(boxes[1], { target: { value: 'Lovelace' } });
    fireEvent.change(boxes[2], { target: { value: 'Bahnhofstrasse' } });
    fireEvent.change(boxes[3], { target: { value: '1' } });
    fireEvent.change(boxes[4], { target: { value: '8001' } });
    fireEvent.change(boxes[5], { target: { value: 'Zurich' } });
    fireEvent.change(boxes[6], { target: { value: '+41 791234567' } });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mockSetPersonal).toHaveBeenCalled());
    const payload = mockSetPersonal.mock.calls[0][2];
    expect(payload.accountType).toBe('Personal');
    expect(payload.phone).toBe('+41791234567');
    expect(payload.address.country.symbol).toBe('DE');
    view.unmount();
  });

  it('submits organization personal data and honors URL prefill', async () => {
    const search = '?account-type=Organization&first-name=Org&last-name=Admin&street=Main&house-number=9&zip=8000&city=Zuerich&phone=%2B41790000000&country=ch';
    window.history.replaceState({}, '', `/${search}`);
    const view = renderStep(KycStepName.PERSONAL_DATA);
    await screen.findByText(/organization name/i);
    const boxes = screen.getAllByRole('textbox');
    fireEvent.change(boxes[7], { target: { value: 'DFX AG' } });
    fireEvent.change(boxes[8], { target: { value: 'Bahnhof' } });
    fireEvent.change(boxes[9], { target: { value: '2' } });
    fireEvent.change(boxes[10], { target: { value: '8001' } });
    fireEvent.change(boxes[11], { target: { value: 'Zurich' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mockSetPersonal).toHaveBeenCalled());
    expect(mockSetPersonal.mock.calls[0][2].organizationName).toBe('DFX AG');
    view.unmount();
    window.history.replaceState({}, '', '/');
  });

  it.each(['personal', 'organization'])(
    'does not submit a %s address whose selected country disappeared during reload',
    async (addressType) => {
      const view = renderStep(KycStepName.NATIONALITY_DATA);
      await screen.findByRole('combobox');
      let reload!: (countries: typeof COUNTRIES) => void;
      mockGetCountries.mockReturnValueOnce(
        new Promise<typeof COUNTRIES>((resolve) => {
          reload = resolve;
        }),
      );
      view.rerender(
        <LanguageProvider>
          <KycStepForm code="code-1" step={makeStep(KycStepName.PERSONAL_DATA)} {...handlers} />
        </LanguageProvider>,
      );
      const boxes = screen.getAllByRole('textbox');
      ['Ada', 'Lovelace', 'Main Street', '', '8000', 'Zurich', '+41791234567'].forEach((value, index) => {
        fireEvent.change(boxes[index], { target: { value } });
      });
      if (addressType === 'organization') {
        fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Organization' } });
        fireEvent.change(screen.getByRole('combobox', { name: /^country$/i }), { target: { value: '2' } });
        fireEvent.change(orgNameBox(), { target: { value: 'DFX AG' } });
        fireEvent.change(orgAddressBox(/organization address street/i), { target: { value: 'Other Street' } });
        fireEvent.change(orgAddressBox(/organization address zip/i), { target: { value: '3000' } });
        fireEvent.change(orgAddressBox(/organization address city/i), { target: { value: 'Bern' } });
      }
      expect(mockGetCountries).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
      await act(async () => reload([COUNTRIES[0]]));
      expect(screen.queryByRole('option', { name: 'Switzerland' })).not.toBeInTheDocument();
      fireEvent.submit(document.querySelector('form') as HTMLFormElement);
      expect(mockSetPersonal).not.toHaveBeenCalled();

      const country =
        addressType === 'organization' ? orgCountryBox() : screen.getByRole('combobox', { name: /^country$/i });
      fireEvent.change(country, { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
      await waitFor(() => expect(mockSetPersonal).toHaveBeenCalledTimes(1));
      const payload = mockSetPersonal.mock.calls[0][2];
      expect(payload.address.country).toEqual(COUNTRIES[0]);
      if (addressType === 'organization') expect(payload.organizationAddress.country).toEqual(COUNTRIES[0]);
    },
  );

  it('prefills organization name and address from URL when organization-name is set', async () => {
    const search =
      '?account-type=Organization&organization-name=DFX%20AG&organization-street=Bahnhof&organization-house-number=12&organization-zip=8001&organization-city=Zurich&organization-country=CH';
    window.history.replaceState({}, '', `/${search}`);
    const view = renderStep(KycStepName.PERSONAL_DATA);
    await screen.findByText(/organization name/i);
    expect(orgNameBox()).toHaveValue('DFX AG');
    expect(orgAddressBox(/organization address street/i)).toHaveValue('Bahnhof');
    expect(orgAddressBox(/organization address no/i)).toHaveValue('12');
    expect(orgAddressBox(/organization address zip/i)).toHaveValue('8001');
    expect(orgAddressBox(/organization address city/i)).toHaveValue('Zurich');
    expect(orgCountryBox()).toHaveValue('1');
    view.unmount();
    window.history.replaceState({}, '', '/');
  });

  it('does not prefill organization address when organization-name is absent', async () => {
    const search =
      '?account-type=Organization&organization-street=Secret&organization-house-number=9&organization-zip=0000&organization-city=Nowhere&organization-country=DE';
    window.history.replaceState({}, '', `/${search}`);
    const view = renderStep(KycStepName.PERSONAL_DATA);
    await screen.findByText(/organization name/i);
    expect(orgNameBox()).toHaveValue('');
    expect(orgAddressBox(/organization address street/i)).toHaveValue('');
    expect(orgAddressBox(/organization address no/i)).toHaveValue('');
    expect(orgAddressBox(/organization address zip/i)).toHaveValue('');
    expect(orgAddressBox(/organization address city/i)).toHaveValue('');
    expect(orgCountryBox()).not.toHaveValue('2');
    view.unmount();
    window.history.replaceState({}, '', '/');
  });

  it('leaves organization country empty when the param does not match the list', async () => {
    window.history.replaceState({}, '', '/?account-type=Organization&organization-name=DFX&organization-country=Atlantis');
    const view = renderStep(KycStepName.PERSONAL_DATA);
    await screen.findByText(/organization name/i);
    expect(orgCountryBox()).toHaveValue('');
    view.unmount();
    window.history.replaceState({}, '', '/');
  });

  it('does not overwrite a prefilled organization field after the user edits it', async () => {
    window.history.replaceState({}, '', '/?account-type=Organization&organization-name=DFX%20AG');
    const view = renderStep(KycStepName.PERSONAL_DATA);
    await screen.findByText(/organization name/i);
    const name = orgNameBox();
    expect(name).toHaveValue('DFX AG');
    fireEvent.change(name, { target: { value: 'Other GmbH' } });
    expect(name).toHaveValue('Other GmbH');
    view.unmount();
    window.history.replaceState({}, '', '/');
  });

  it('falls back to Personal for an unknown account-type prefill', async () => {
    window.history.replaceState({}, '', '/?account-type=unknown&country=Atlantis');
    const view = renderStep(KycStepName.PERSONAL_DATA);
    await screen.findByText(/first name/i);
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('Personal');
    view.unmount();
    window.history.replaceState({}, '', '/');
  });

  it('shows a spinner while countries load', () => {
    mockGetCountries.mockReturnValue(new Promise(() => undefined));
    const view = renderStep(KycStepName.PERSONAL_DATA);
    expect(screen.getByText(/loading|laden|caricamento|chargement/i)).toBeInTheDocument();
    view.unmount();
  });

  it('waits for countries when a reused form transitions from a step without countries', async () => {
    let resolveCountries!: (countries: typeof COUNTRIES) => void;
    mockGetCountries.mockReturnValue(new Promise((resolve) => { resolveCountries = resolve; }));
    const view = renderStep(KycStepName.CONTACT_DATA);
    view.rerender(
      <LanguageProvider>
        <KycStepForm code="code-1" step={makeStep(KycStepName.PERSONAL_DATA)} {...handlers} />
      </LanguageProvider>,
    );

    expect(screen.getByText(/loading|laden|caricamento|chargement/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^country$/i })).not.toBeInTheDocument();
    await waitFor(() => expect(mockGetCountries).toHaveBeenCalledTimes(1));
    await act(async () => resolveCountries(COUNTRIES));
    expect(await screen.findByRole('combobox', { name: /^country$/i })).toBeInTheDocument();
    view.unmount();
  });

  it('ignores a stale country success while the next country step is still loading', async () => {
    const requests: Array<{
      resolve: (countries: typeof COUNTRIES) => void;
      reject: (reason: Error) => void;
    }> = [];
    mockGetCountries.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          requests.push({ resolve, reject });
        }),
    );
    const view = renderStep(KycStepName.PERSONAL_DATA);
    view.rerender(
      <LanguageProvider>
        <KycStepForm code="code-1" step={makeStep(KycStepName.NATIONALITY_DATA)} {...handlers} />
      </LanguageProvider>,
    );
    await waitFor(() => expect(requests).toHaveLength(2));

    await act(async () => requests[0].resolve(COUNTRIES));
    expect(screen.getByText(/loading|laden|caricamento|chargement/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await act(async () => requests[1].resolve(COUNTRIES));
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    view.unmount();
  });

  it('ignores a stale country failure while the next country step is still loading', async () => {
    const requests: Array<{
      resolve: (countries: typeof COUNTRIES) => void;
      reject: (reason: Error) => void;
    }> = [];
    mockGetCountries.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          requests.push({ resolve, reject });
        }),
    );
    const view = renderStep(KycStepName.PERSONAL_DATA);
    view.rerender(
      <LanguageProvider>
        <KycStepForm code="code-1" step={makeStep(KycStepName.NATIONALITY_DATA)} {...handlers} />
      </LanguageProvider>,
    );
    await waitFor(() => expect(requests).toHaveLength(2));

    await act(async () => requests[0].reject(new Error('stale outage')));
    expect(screen.getByText(/loading|laden|caricamento|chargement/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/couldn't load|konnte nicht laden|impossibile caricare|chargement impossible/i),
    ).not.toBeInTheDocument();

    await act(async () => requests[1].resolve(COUNTRIES));
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    view.unmount();
  });

  it('shows a retry after country loading fails and preserves partner-prefilled country', async () => {
    window.history.replaceState({}, '', '/?country=de');
    mockGetCountries.mockRejectedValueOnce(new Error('down'));
    const view = renderStep(KycStepName.PERSONAL_DATA);
    expect(
      await screen.findByText(/couldn't load|konnte nicht laden|impossibile caricare|chargement impossible/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry|erneut versuchen|riprova|réessayer/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /country/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry|erneut versuchen|riprova|réessayer/i }));
    const country = await screen.findByRole('combobox', { name: /^country$/i });
    expect(country).toHaveValue('2');
    expect(screen.queryByText(/couldn't load|konnte nicht laden|impossibile caricare|chargement impossible/i)).not.toBeInTheDocument();
    view.unmount();
    window.history.replaceState({}, '', '/');
  });

  it('keeps loaded country choices and the selected country when a later fetch fails', async () => {
    const view = renderStep(KycStepName.PERSONAL_DATA);
    await screen.findByText(/first name/i);

    mockGetCountries.mockRejectedValueOnce(new Error('temporary outage'));
    view.rerender(
      <LanguageProvider>
        <KycStepForm code="code-1" step={makeStep(KycStepName.NATIONALITY_DATA)} {...handlers} />
      </LanguageProvider>,
    );
    const country = screen.getByRole('combobox');
    fireEvent.change(country, { target: { value: '2' } });
    expect(country).toHaveValue('2');

    expect(
      await screen.findByText(/couldn't load|konnte nicht laden|impossibile caricare|chargement impossible/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('2');
    expect(screen.getByRole('option', { name: 'Germany' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry|erneut versuchen|riprova|réessayer/i }));
    await waitFor(() =>
      expect(
        screen.queryByText(/couldn't load|konnte nicht laden|impossibile caricare|chargement impossible/i),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('combobox')).toHaveValue('2');
    view.unmount();
  });

  it('submits the selected Swiss nationality in the API payload', async () => {
    const view = renderStep(KycStepName.NATIONALITY_DATA);
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mockSetNationality).toHaveBeenCalled());
    expect(mockSetNationality.mock.calls[0][2]).toEqual({ nationality: expect.objectContaining({ symbol: 'CH' }) });
    view.unmount();
  });

  it('submits a legal entity with the uploaded file', async () => {
    const view = renderStep(KycStepName.LEGAL_ENTITY);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'GmbH' } });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['pdf'], 'statutes.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: /submit|senden|invia|envoyer/i }));
    await waitFor(() => expect(mockSetLegal).toHaveBeenCalled());
    expect(mockSetLegal.mock.calls[0][2].legalEntity).toBe('GmbH');
    view.unmount();
  });

  it('submits signatory power and operational activity', async () => {
    const first = renderStep(KycStepName.SIGNATORY_POWER);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Double' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mockSetSignatory).toHaveBeenCalledWith('code-1', expect.any(String), { signatoryPower: 'Double' }));
    first.unmount();

    const second = renderStep(KycStepName.OPERATIONAL_ACTIVITY);
    const selects = second.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'false' } });
    fireEvent.change(second.getByRole('textbox'), { target: { value: 'https://dfx.swiss' } });
    fireEvent.click(second.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(mockSetOperational).toHaveBeenCalledWith('code-1', expect.any(String), {
        isOperational: false,
        websiteUrl: 'https://dfx.swiss',
      }),
    );
    second.unmount();
  });

  it('submits a recommendation code', async () => {
    const view = renderStep(KycStepName.RECOMMENDATION);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'XY-AB12-CD34-EF' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mockSetRecommendation).toHaveBeenCalledWith('code-1', expect.any(String), { key: 'XY-AB12-CD34-EF' }));
    view.unmount();
  });

  it('submits a recall agreement after accept', async () => {
    const view = renderStep(KycStepName.RECALL_AGREEMENT);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mockSetRecall).toHaveBeenCalledWith('code-1', expect.any(String), { accepted: true }));
    view.unmount();
  });

  it('uploads a document for a file-only step and ignores an empty pick', async () => {
    const view = renderStep(KycStepName.ADDITIONAL_DOCUMENTS);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(screen.getByRole('button', { name: /submit|senden|invia|envoyer/i })).toBeDisabled();
    fireEvent.change(input, { target: { files: [new File(['pdf'], 'doc.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: /submit|senden|invia|envoyer/i }));
    await waitFor(() => expect(mockSetFile).toHaveBeenCalled());
    view.unmount();
  });

  it('submits beneficial owners including an added person', async () => {
    const view = renderStep(KycStepName.BENEFICIAL_OWNER);
    const selects = await screen.findAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: /add person|person hinzufügen|aggiungi|ajouter/i }));
    const boxes = screen.getAllByRole('textbox');
    fireEvent.change(boxes[0], { target: { value: 'Ann' } });
    fireEvent.change(boxes[1], { target: { value: 'Owner' } });
    fireEvent.change(boxes[2], { target: { value: 'Street' } });
    fireEvent.change(boxes[4], { target: { value: '8000' } });
    fireEvent.change(boxes[5], { target: { value: 'Zurich' } });
    fireEvent.change(boxes[3], { target: { value: '9' } });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'false' } });
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: '2' } });
    fireEvent.change(boxes[6], { target: { value: 'Bob' } });
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSetBeneficial).not.toHaveBeenCalled();
    fireEvent.change(boxes[7], { target: { value: 'Second' } });
    fireEvent.change(boxes[8], { target: { value: 'Other Street' } });
    fireEvent.change(boxes[10], { target: { value: '3000' } });
    fireEvent.change(boxes[11], { target: { value: 'Bern' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mockSetBeneficial).toHaveBeenCalled());
    const data = mockSetBeneficial.mock.calls[0][2];
    expect(data.hasBeneficialOwners).toBe(true);
    expect(data.beneficialOwners).toEqual([
      {
        firstName: 'Ann',
        lastName: 'Owner',
        street: 'Street',
        houseNumber: '9',
        zip: '8000',
        city: 'Zurich',
        country: COUNTRIES[0],
      },
      {
        firstName: 'Bob',
        lastName: 'Second',
        street: 'Other Street',
        houseNumber: undefined,
        zip: '3000',
        city: 'Bern',
        country: COUNTRIES[1],
      },
    ]);
    expect(data.managingDirector).toBeUndefined();
    view.unmount();
  });

  it.each([
    [0, ''],
    [3, '   '],
  ] as const)(
    'submits only completed owner %s and ignores added rows containing %j',
    async (filledIndex, blank) => {
      renderStep(KycStepName.BENEFICIAL_OWNER);
      fireEvent.change((await screen.findAllByRole('combobox'))[0], { target: { value: 'true' } });
      for (let index = 0; index < 3; index += 1) {
        fireEvent.click(screen.getByRole('button', { name: /add person/i }));
      }
      expect(screen.queryByRole('button', { name: /add person/i })).not.toBeInTheDocument();
      const boxes = screen.getAllByRole('textbox');
      boxes.forEach((box) => fireEvent.change(box, { target: { value: blank } }));
      expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
      fireEvent.submit(document.querySelector('form') as HTMLFormElement);
      expect(mockSetBeneficial).not.toHaveBeenCalled();

      ['Ann', 'Owner', 'Main Street', '', '8000', 'Zurich'].forEach((value, index) => {
        fireEvent.change(boxes[filledIndex * 6 + index], { target: { value } });
      });
      expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
      await waitFor(() => expect(mockSetBeneficial).toHaveBeenCalledTimes(1));
      expect(mockSetBeneficial).toHaveBeenCalledWith('code-1', expect.any(String), {
        hasBeneficialOwners: true,
        isAccountHolderInvolved: true,
        beneficialOwners: [
          {
            firstName: 'Ann',
            lastName: 'Owner',
            street: 'Main Street',
            houseNumber: undefined,
            zip: '8000',
            city: 'Zurich',
            country: COUNTRIES[1],
          },
        ],
      });
    },
  );

  it.each([0, 1, 2, 3, 4, 5, 'country'])(
    'blocks a partially filled added owner (%s) until that row is cleared',
    async (field) => {
      renderStep(KycStepName.BENEFICIAL_OWNER);
      fireEvent.change((await screen.findAllByRole('combobox'))[0], { target: { value: 'true' } });
      const boxes = screen.getAllByRole('textbox');
      ['Ann', 'Owner', 'Main Street', '', '8000', 'Zurich'].forEach((value, index) => {
        fireEvent.change(boxes[index], { target: { value } });
      });
      fireEvent.click(screen.getByRole('button', { name: /add person/i }));
      const input =
        field === 'country' ? screen.getAllByRole('combobox')[3] : screen.getAllByRole('textbox')[6 + Number(field)];
      fireEvent.change(input, { target: { value: field === 'country' ? '2' : 'Partial' } });
      expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
      fireEvent.submit(document.querySelector('form') as HTMLFormElement);
      expect(mockSetBeneficial).not.toHaveBeenCalled();

      fireEvent.change(input, { target: { value: field === 'country' ? '1' : '   ' } });
      expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
      await waitFor(() => expect(mockSetBeneficial).toHaveBeenCalledTimes(1));
      expect(mockSetBeneficial.mock.calls[0][2].beneficialOwners).toEqual([
        expect.objectContaining({ firstName: 'Ann', lastName: 'Owner', country: COUNTRIES[1] }),
      ]);
    },
  );

  it.each([0, 1, 2, 4, 5, 'country'])('blocks an owner with a missing required field (%s)', async (missing) => {
    renderStep(KycStepName.BENEFICIAL_OWNER);
    const selects = await screen.findAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'true' } });
    const boxes = screen.getAllByRole('textbox');
    ['Ann', 'Owner', 'Main Street', '', '8000', 'Zurich'].forEach((value, index) => {
      fireEvent.change(boxes[index], { target: { value: index === missing ? '  ' : value } });
    });
    if (missing === 'country') {
      fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: '' } });
    }
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSetBeneficial).not.toHaveBeenCalled();
  });

  it('rejects a country id outside the loaded country list', async () => {
    renderStep(KycStepName.BENEFICIAL_OWNER);
    const selects = await screen.findAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'true' } });
    const boxes = screen.getAllByRole('textbox');
    ['Ann', 'Owner', 'Main Street', '', '8000', 'Zurich'].forEach((value, index) => {
      fireEvent.change(boxes[index], { target: { value } });
    });
    // Injected option exercises the stale-id guard; it does not prove the country API's data integrity.
    const country = screen.getAllByRole('combobox')[2] as HTMLSelectElement;
    country.add(new Option('Stale country', '999'));
    fireEvent.change(country, { target: { value: '999' } });
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSetBeneficial).not.toHaveBeenCalled();
  });

  it('requires and submits a managing director when there are no owners and the account holder is uninvolved', async () => {
    renderStep(KycStepName.BENEFICIAL_OWNER);
    const selects = await screen.findAllByRole('combobox');
    expect(screen.queryByText('Managing director')).not.toBeInTheDocument();
    fireEvent.change(selects[1], { target: { value: 'false' } });
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSetBeneficial).not.toHaveBeenCalled();
    const fields = [
      [/managing director first name/i, ' Ada '],
      [/managing director last name/i, ' Lovelace '],
      [/managing director street/i, ' Rue de l’Église '],
      [/managing director no\./i, ' 1‘A '],
      [/managing director zip/i, ' 8’000 '],
      [/managing director city/i, ' L’Isle '],
    ] as const;
    fields.forEach(([name, value]) => {
      expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
      fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } });
    });
    const country = screen.getByRole('combobox', { name: /managing director country/i });
    fireEvent.change(country, { target: { value: '' } });
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    fireEvent.change(country, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(mockSetBeneficial).toHaveBeenCalledWith('code-1', expect.any(String), {
        hasBeneficialOwners: false,
        isAccountHolderInvolved: false,
        managingDirector: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          street: "Rue de l'Église",
          houseNumber: "1'A",
          zip: "8'000",
          city: "L'Isle",
          country: COUNTRIES[0],
        },
      }),
    );
  });

  it('omits hidden director data when the account holder becomes involved', async () => {
    renderStep(KycStepName.BENEFICIAL_OWNER);
    const selects = await screen.findAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'false' } });
    fireEvent.change(screen.getByRole('textbox', { name: /managing director first name/i }), {
      target: { value: 'Ada' },
    });
    fireEvent.change(selects[1], { target: { value: 'true' } });
    expect(screen.queryByText('Managing director')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(mockSetBeneficial).toHaveBeenCalledWith('code-1', expect.any(String), {
        hasBeneficialOwners: false,
        isAccountHolderInvolved: true,
      }),
    );
  });

  it('submits beneficial data when there are no extra owners', async () => {
    const view = renderStep(KycStepName.BENEFICIAL_OWNER);
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mockSetBeneficial).toHaveBeenCalledWith('code-1', expect.any(String), {
      hasBeneficialOwners: false,
      isAccountHolderInvolved: true,
    }));
    view.unmount();
  });

  it('routes a failed step, a TFA error, a switch hand-off and a generic error', async () => {
    mockSetContact.mockResolvedValueOnce({ name: 'ContactData', status: 'Failed', sequenceNumber: 1 });
    const first = renderStep(KycStepName.CONTACT_DATA);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(handlers.onFailed).toHaveBeenCalled());
    first.unmount();

    const tfa = renderStep(KycStepName.CONTACT_DATA);
    mockSetContact.mockRejectedValueOnce({ code: 'TFA_REQUIRED' });
    fireEvent.click(tfa.getAllByRole('button', { name: /continue/i })[0]);
    await waitFor(() => expect(handlers.onTfaRequired).toHaveBeenCalled());
    tfa.unmount();

    const handoff = renderStep(KycStepName.CONTACT_DATA);
    mockSetContact.mockRejectedValueOnce({ statusCode: 401, switchToCode: 'other-hash' });
    fireEvent.click(handoff.getAllByRole('button', { name: /continue/i })[0]);
    await waitFor(() => expect(handlers.onHandoff).toHaveBeenCalledWith({ kind: 'switch', code: 'other-hash' }));
    handoff.unmount();

    const merge = renderStep(KycStepName.CONTACT_DATA);
    mockSetContact.mockRejectedValueOnce({ code: 'ACCOUNT_MERGE_REQUESTED' });
    fireEvent.click(merge.getAllByRole('button', { name: /continue/i })[0]);
    await waitFor(() => expect(handlers.onHandoff).toHaveBeenCalledWith({ kind: 'merge' }));
    merge.unmount();

    const exists = renderStep(KycStepName.CONTACT_DATA);
    mockSetContact.mockRejectedValueOnce({ code: 'ACCOUNT_EXISTS' });
    fireEvent.click(exists.getAllByRole('button', { name: /continue/i })[0]);
    await waitFor(() => expect(handlers.onHandoff).toHaveBeenCalledWith({ kind: 'account-exists' }));
    exists.unmount();

    const conflict = renderStep(KycStepName.CONTACT_DATA);
    mockSetContact.mockRejectedValueOnce({ statusCode: 409 });
    fireEvent.click(conflict.getAllByRole('button', { name: /continue/i })[0]);
    await waitFor(() => expect(handlers.onHandoff).toHaveBeenCalledWith({ kind: 'conflict' }));
    conflict.unmount();

    const offline = renderStep(KycStepName.CONTACT_DATA);
    mockSetContact.mockRejectedValueOnce({ statusCode: 0 });
    fireEvent.click(offline.getAllByRole('button', { name: /continue/i })[0]);
    await waitFor(() => expect(screen.getByText(/couldn't load|nicht laden|caricare|charger/i)).toBeInTheDocument());
    offline.unmount();

    const generic = renderStep(KycStepName.CONTACT_DATA);
    mockSetContact.mockRejectedValueOnce({ statusCode: 500 });
    fireEvent.click(generic.getAllByRole('button', { name: /continue/i })[0]);
    await waitFor(() => expect(screen.getByText(/something went wrong|schiefgelaufen|storto|produite/i)).toBeInTheDocument());
    generic.unmount();
  });
});

describe('KycStepForm financial questionnaire', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCountries.mockResolvedValue(COUNTRIES);
    mockContinueKyc.mockResolvedValue({ currentStep: undefined });
    mockSetFinancial.mockResolvedValue({ name: 'FinancialData', status: 'Completed', sequenceNumber: 1 });
  });

  it('keeps going when a financial save is not yet done and a choice has no options', async () => {
    mockGetFinancial.mockResolvedValue({
      questions: [{ key: 's1', type: 'SingleChoice', title: 'Pick one' }],
      responses: [],
    });
    mockSetFinancial.mockResolvedValueOnce({ name: 'FinancialData', status: 'InProgress', sequenceNumber: 1 });
    const view = renderStep(KycStepName.FINANCIAL_DATA);
    expect(await screen.findByText('Pick one')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    view.unmount();

    mockGetFinancial.mockResolvedValue({
      questions: [{ key: 'm1', type: 'MultipleChoice', title: 'Pick many' }],
      responses: [],
    });
    const multi = renderStep(KycStepName.FINANCIAL_DATA);
    expect(await screen.findByText('Pick many')).toBeInTheDocument();
    multi.unmount();
  });

  it('answers confirmation, single, multi and text questions then advances', async () => {
    mockGetFinancial.mockResolvedValue({
      questions: [
        {
          key: 'c1',
          type: 'Confirmation',
          title: 'Confirm this',
          description: 'Yes?',
          options: [{ key: 'accept', text: 'Accept' }],
        },
        {
          key: 'gated',
          type: 'Text',
          title: 'How much?',
          conditions: [{ question: 'c1', response: 'accept' }],
        },
        {
          key: 'hidden',
          type: 'Text',
          title: 'Hidden forever',
          conditions: [{ question: 'c1', response: 'never' }],
        },
        {
          key: 's1',
          type: 'SingleChoice',
          title: 'Pick one',
          description: 'choose',
          conditions: [],
          options: [
            { key: 'a', text: 'Alpha' },
            { key: 'b', text: 'Beta' },
          ],
        },
        { key: 'm1', type: 'MultipleChoice', title: 'Pick many', options: [{ key: 'x', text: 'X-ray' }, { key: 'y', text: 'Yankee' }] },
        { key: 't1', type: 'Text', title: 'Tell us' },
      ],
      responses: [{ key: 'other', value: 'x' }],
    });
    mockSetFinancial
      .mockResolvedValueOnce({ name: 'FinancialData', status: 'Completed', sequenceNumber: 1 })
      .mockResolvedValue({ name: 'FinancialData', status: 'InProgress', sequenceNumber: 1 });
    const view = renderStep(KycStepName.FINANCIAL_DATA);
    expect(await screen.findByText('Confirm this')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    const continueButton = () => screen.getByRole('button', { name: /continue/i });
    const waitForSavedResponses = (call: number, responses: Array<{ key: string; value: string }>) =>
      waitFor(() => expect(mockSetFinancial).toHaveBeenNthCalledWith(
        call,
        expect.anything(),
        expect.anything(),
        { responses },
      ));
    const saveAnswer = async (call: number, responses: Array<{ key: string; value: string }>) => {
      await act(async () => {
        fireEvent.click(continueButton());
        // FinancialFields applies the saved responses in the request's .then()
        // before its current-question effect resets the next answer controls.
        await mockSetFinancial.mock.results[call - 1].value;
      });
      await waitForSavedResponses(call, responses);
    };

    expect(continueButton()).toBeEnabled();
    await saveAnswer(1, [{ key: 'other', value: 'x' }, { key: 'c1', value: 'accept' }]);
    expect(await screen.findByText('How much?')).toBeInTheDocument();
    expect(screen.queryByText('Hidden forever')).not.toBeInTheDocument();
    const answer = screen.getByRole('textbox');
    fireEvent.change(answer, { target: { value: '10k' } });
    await waitFor(() => {
      expect(answer).toHaveValue('10k');
      expect(continueButton()).toBeEnabled();
    });
    await saveAnswer(2, [
      { key: 'other', value: 'x' },
      { key: 'c1', value: 'accept' },
      { key: 'gated', value: '10k' },
    ]);
    expect(await screen.findByText('Pick one')).toBeInTheDocument();
    const singleChoice = screen.getByRole('combobox');
    fireEvent.change(singleChoice, { target: { value: 'b' } });
    await waitFor(() => {
      expect(singleChoice).toHaveValue('b');
      expect(continueButton()).toBeEnabled();
    });
    await saveAnswer(3, [
      { key: 'other', value: 'x' },
      { key: 'c1', value: 'accept' },
      { key: 'gated', value: '10k' },
      { key: 's1', value: 'b' },
    ]);
    expect(await screen.findByText('Pick many')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('X-ray'));
    fireEvent.click(screen.getByLabelText('Yankee'));
    fireEvent.click(screen.getByLabelText('Yankee')); // toggle off then on again
    fireEvent.click(screen.getByLabelText('Yankee'));
    expect(continueButton()).toBeEnabled();
    await saveAnswer(4, [
      { key: 'other', value: 'x' },
      { key: 'c1', value: 'accept' },
      { key: 'gated', value: '10k' },
      { key: 's1', value: 'b' },
      { key: 'm1', value: 'x,y' },
    ]);
    expect(await screen.findByText('Tell us')).toBeInTheDocument();
    const finalAnswer = screen.getByRole('textbox');
    fireEvent.change(finalAnswer, { target: { value: 'because' } });
    await waitFor(() => {
      expect(finalAnswer).toHaveValue('because');
      expect(continueButton()).toBeEnabled();
    });
    await saveAnswer(5, [
      { key: 'other', value: 'x' },
      { key: 'c1', value: 'accept' },
      { key: 'gated', value: '10k' },
      { key: 's1', value: 'b' },
      { key: 'm1', value: 'x,y' },
      { key: 't1', value: 'because' },
    ]);
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled());
    view.unmount();
  });

  it('auto-advances when the server already stored every answer', async () => {
    mockGetFinancial.mockResolvedValue({
      questions: [{ key: 'q1', type: 'Text', title: 'Done' }],
      responses: [{ key: 'q1', value: 'yes' }],
    });
    const view = renderStep(KycStepName.FINANCIAL_DATA);
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled());
    view.unmount();
  });

  it('routes a financial load failure through the shared error handler', async () => {
    mockGetFinancial.mockRejectedValue({ statusCode: 500 });
    const load = renderStep(KycStepName.FINANCIAL_DATA);
    await waitFor(() => expect(mockGetFinancial).toHaveBeenCalled());
    // The questionnaire keeps the spinner when no question is current, but the
    // catch still runs handleError (generic / TFA / hand-off).
    await waitFor(() => expect(screen.getByText(/loading|laden|caricamento|chargement/i)).toBeInTheDocument());
    load.unmount();

    mockGetFinancial.mockRejectedValue({ code: 'TFA_REQUIRED' });
    const tfa = renderStep(KycStepName.FINANCIAL_DATA);
    await waitFor(() => expect(handlers.onTfaRequired).toHaveBeenCalled());
    tfa.unmount();
  });

  it('surfaces a financial save error', async () => {
    mockGetFinancial.mockResolvedValue({
      questions: [{ key: 'q1', type: 'Text', title: 'Income' }],
      responses: [],
    });
    mockSetFinancial.mockRejectedValue({ statusCode: 0 });
    const save = renderStep(KycStepName.FINANCIAL_DATA);
    expect(await screen.findByText('Income')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/couldn't load|nicht laden|caricare|charger/i)).toBeInTheDocument();
    save.unmount();
  });
});

describe('KycStepForm ident', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.setItem('dfx_lang', 'en');
    mockSumsub.props = undefined;
    mockGetCountries.mockResolvedValue(COUNTRIES);
    mockContinueKyc.mockResolvedValue({ currentStep: { name: 'Ident', status: 'InProgress' } });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows the in-review state when the session is missing and goes back', () => {
    const view = renderStep(KycStepName.IDENT, { session: undefined });
    expect(screen.getByText(/reviewing this step|prüft diesen schritt|esaminando|examine cette/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /overview|übersicht|panoramica|aperçu/i }));
    expect(handlers.onBack).toHaveBeenCalled();
    view.unmount();
  });

  it('opens a hosted browser ident', () => {
    const view = renderStep(KycStepName.IDENT, {
      session: { url: 'https://ident.example/start', type: UrlType.BROWSER as never },
    });
    expect(screen.getByRole('link', { name: /start identification|identifikation|identificazione|identification/i })).toHaveAttribute(
      'href',
      'https://ident.example/start',
    );
    expect(screen.getByText(/waiting for confirmation|warte auf bestätigung|in attesa|en attente/i)).toBeInTheDocument();
    view.unmount();
  });

  it('finishes an API-only ident session manually', async () => {
    const view = renderStep(KycStepName.IDENT, {
      session: { url: 'https://api.example/kyc', type: UrlType.API as never },
    });
    fireEvent.click(screen.getByRole('button', { name: /completed it|erledigt|fatto|c'est fait/i }));
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled());
    view.unmount();
  });

  it('invokes the Sumsub status and expiration handlers', async () => {
    mockContinueKyc.mockResolvedValueOnce({
      currentStep: { name: 'Ident', session: { type: 'Token', url: 'fresh-sumsub-token' } },
    });
    const view = renderStep(KycStepName.IDENT, {
      session: { url: 'sumsub-token', type: UrlType.TOKEN as never },
    });
    expect(await screen.findByTestId('sumsub')).toBeInTheDocument();
    await act(async () => {
      const onMessage = mockSumsub.props?.onMessage as (type: string, payload: unknown) => void;
      const expiration = mockSumsub.props?.expirationHandler as () => Promise<string>;
      await expect(expiration()).resolves.toBe('fresh-sumsub-token');
      expect(mockContinueKyc).toHaveBeenCalledWith('code-1', true);
      onMessage?.('other.event', {});
      onMessage?.('idCheck.onApplicantStatusChanged', {
        reviewResult: { reviewAnswer: 'GREEN', reviewRejectType: 'RETRY' },
      });
      onMessage?.('idCheck.onApplicantStatusChanged', {
        reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'FINAL' },
      });
      onMessage?.('idCheck.onApplicantStatusChanged', {
        reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'FINAL', moderationComment: 'blurry' },
      });
    });
    view.unmount();
  });

  it.each([
    undefined,
    { name: 'PersonalData', session: { type: 'Token', url: 'wrong-step-token' } },
    { name: 'Ident' },
    { name: 'Ident', session: { type: 'Browser', url: 'https://ident.example' } },
    { name: 'Ident', session: { type: 'Token', url: '' } },
  ])('rejects token refresh without a current IDENT token (%j) and offers the portal', async (currentStep) => {
    mockContinueKyc.mockResolvedValueOnce({ currentStep });
    renderStep(KycStepName.IDENT, { session: { url: 'expired-token', type: UrlType.TOKEN as never } });
    const expiration = mockSumsub.props?.expirationHandler as () => Promise<string>;
    await act(async () => {
      await expect(expiration()).rejects.toThrow('No current identification token');
    });
    expect(mockContinueKyc).toHaveBeenCalledWith('code-1', true);
    expect(screen.queryByTestId('sumsub')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Finish setup on app.dfx.swiss' })).toBeInTheDocument();
  });

  it('rejects a failed token refresh instead of returning the expired token', async () => {
    const error = new Error('token refresh failed');
    mockContinueKyc.mockRejectedValueOnce(error);
    renderStep(KycStepName.IDENT, { session: { url: 'expired-token', type: UrlType.TOKEN as never } });
    const expiration = mockSumsub.props?.expirationHandler as () => Promise<string>;
    await act(async () => {
      await expect(expiration()).rejects.toBe(error);
    });
    expect(screen.getByRole('link', { name: 'Finish setup on app.dfx.swiss' })).toBeInTheDocument();
  });

  it('hides the portal link when the app origin is not a safe URL', async () => {
    const prev = process.env.REACT_APP_PUBLIC_URL;
    process.env.REACT_APP_PUBLIC_URL = 'http://evil.example';
    const view = renderStep(KycStepName.IDENT, {
      session: { url: 'sumsub-token', type: UrlType.TOKEN as never },
    });
    await screen.findByTestId('sumsub');
    await act(async () => {
      (mockSumsub.props?.onError as () => void)?.();
    });
    expect(await screen.findByText(/completed in the dfx portal|dfx-portal|portale dfx|portail dfx/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    view.unmount();
    if (prev === undefined) delete process.env.REACT_APP_PUBLIC_URL;
    else process.env.REACT_APP_PUBLIC_URL = prev;
  });

  it('falls back to the DFX portal when the Sumsub SDK errors', async () => {
    const fallback = renderStep(KycStepName.IDENT, {
      session: { url: 'sumsub-token', type: UrlType.TOKEN as never },
    });
    await screen.findByTestId('sumsub');
    await act(async () => {
      (mockSumsub.props?.onError as () => void)?.();
    });
    expect(await screen.findByText(/completed in the dfx portal|dfx-portal|portale dfx|portail dfx/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /finish|abschliessen|completa|terminer/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /completed it|erledigt|fatto|c'est fait/i }));
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled());
    fallback.unmount();
  });

  it('advances when the ident poll sees another step', async () => {
    jest.useFakeTimers();
    mockContinueKyc.mockResolvedValue({ currentStep: { name: 'ContactData', status: 'InProgress' } });
    const view = renderStep(KycStepName.IDENT, {
      session: { url: 'https://ident.example/start', type: UrlType.BROWSER as never },
    });
    await act(async () => {
      jest.advanceTimersByTime(IDENT_POLL.initialDelayMs);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(handlers.onAdvance).toHaveBeenCalled());
    view.unmount();
  });

  it('stops the ident poll at the deadline and retries', async () => {
    jest.useFakeTimers();
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    mockContinueKyc.mockResolvedValue({ currentStep: { name: 'Ident', status: 'InProgress' } });
    const view = renderStep(KycStepName.IDENT, {
      session: { url: 'https://ident.example/start', type: UrlType.BROWSER as never },
    });
    now = 1_000_000 + IDENT_POLL.deadlineMs + 1;
    await act(async () => {
      jest.advanceTimersByTime(IDENT_POLL.initialDelayMs);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/longer than expected|länger als erwartet|più tempo|plus de temps/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    view.unmount();
  });

  it('shows timeout for a pending ident request, ignores its late result, and restarts on retry', async () => {
    jest.useFakeTimers();
    let resolveContinue!: (value: { currentStep: { name: string; status: string } }) => void;
    mockContinueKyc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveContinue = resolve;
        }),
    );
    const view = renderStep(KycStepName.IDENT, {
      session: { url: 'https://ident.example/start', type: UrlType.BROWSER as never },
    });

    await act(async () => {
      jest.advanceTimersByTime(IDENT_POLL.initialDelayMs);
      await Promise.resolve();
    });
    expect(mockContinueKyc).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(IDENT_POLL.deadlineMs - IDENT_POLL.initialDelayMs);
    });
    expect(screen.getByText(/longer than expected|länger als erwartet|più tempo|plus de temps/i)).toBeInTheDocument();

    await act(async () => {
      resolveContinue({ currentStep: { name: 'ContactData', status: 'InProgress' } });
      await Promise.resolve();
    });
    expect(handlers.onAdvance).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    await act(async () => {
      jest.advanceTimersByTime(IDENT_POLL.initialDelayMs);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockContinueKyc).toHaveBeenCalledTimes(2);
    expect(handlers.onAdvance).not.toHaveBeenCalled();
    view.unmount();
  });

  it('does not advance when an ident request resolves after unmount', async () => {
    jest.useFakeTimers();
    let resolveContinue!: (value: { currentStep: { name: string; status: string } }) => void;
    mockContinueKyc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveContinue = resolve;
        }),
    );
    const view = renderStep(KycStepName.IDENT, {
      session: { url: 'https://ident.example/start', type: UrlType.BROWSER as never },
    });

    await act(async () => {
      jest.advanceTimersByTime(IDENT_POLL.initialDelayMs);
    });
    expect(mockContinueKyc).toHaveBeenCalledTimes(1);
    view.unmount();

    await act(async () => {
      resolveContinue({ currentStep: { name: 'ContactData', status: 'InProgress' } });
      await Promise.resolve();
    });
    expect(handlers.onAdvance).not.toHaveBeenCalled();
  });

  it('advances when the current ident step is already done and keeps polling after a transient error', async () => {
    jest.useFakeTimers();
    mockContinueKyc
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ currentStep: { name: 'Ident', status: 'Completed' } });
    const view = renderStep(KycStepName.IDENT, {
      session: { url: 'https://ident.example/start', type: UrlType.BROWSER as never },
    });
    await act(async () => {
      jest.advanceTimersByTime(IDENT_POLL.initialDelayMs);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(2700);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(handlers.onAdvance).toHaveBeenCalled());
    view.unmount();
  });

  it('treats an API/none ident session as in-review', () => {
    const view = renderStep(KycStepName.IDENT, {
      session: { url: 'https://api.example/kyc', type: UrlType.NONE as never },
    });
    expect(screen.getByText(/reviewing this step|prüft diesen schritt|esaminando|examine cette/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /completed it|erledigt|fatto|c'est fait/i }));
    view.unmount();
  });
});

describe('KycStepForm remaining forms', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockGetFinancial.mockReset();
    mockGetCountries.mockResolvedValue(COUNTRIES);
    mockSetFile.mockResolvedValue(done('Statutes'));
    mockSetRecommendation.mockResolvedValue(done('Recommendation'));
    mockSetPersonal.mockResolvedValue(done('PersonalData'));
    mockSetOperational.mockResolvedValue(done('OperationalActivity'));
    mockContinueKyc.mockResolvedValue({ currentStep: undefined });
    mockSetFinancial.mockResolvedValue(done('FinancialData'));
  });

  function hangFinancialLoad() {
    let resolve!: (value: { questions: unknown[]; responses: unknown[] }) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<{ questions: unknown[]; responses: unknown[] }>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    mockGetFinancial.mockImplementation(() => promise);
    return { resolve, reject };
  }

  it('uploads a file-only statutes step', async () => {
    const view = renderStep(KycStepName.STATUTES);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['pdf'], 'statutes.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: /submit|senden|invia|envoyer/i }));
    await waitFor(() => expect(mockSetFile).toHaveBeenCalled());
    view.unmount();
  });

  it('ignores an empty recommendation and a recall without accept', () => {
    const rec = renderStep(KycStepName.RECOMMENDATION);
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    rec.unmount();
    const recall = renderStep(KycStepName.RECALL_AGREEMENT);
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    recall.unmount();
  });

  it('submits sole-proprietorship personal data and operational without a website', async () => {
    window.history.replaceState({}, '', '/?account-type=SoleProprietorship&country=Germany');
    const view = renderStep(KycStepName.PERSONAL_DATA);
    await screen.findByText(/organization name/i);
    const boxes = screen.getAllByRole('textbox');
    fireEvent.change(boxes[0], { target: { value: 'Ada' } });
    fireEvent.change(boxes[1], { target: { value: 'Lovelace' } });
    fireEvent.change(boxes[2], { target: { value: 'Street' } });
    fireEvent.change(boxes[4], { target: { value: '8000' } });
    fireEvent.change(boxes[5], { target: { value: 'Zurich' } });
    fireEvent.change(boxes[6], { target: { value: '+41791111111' } });
    fireEvent.change(boxes[7], { target: { value: 'Ada Shop' } });
    fireEvent.change(boxes[8], { target: { value: 'Main' } });
    fireEvent.change(boxes[10], { target: { value: '8001' } });
    fireEvent.change(boxes[11], { target: { value: 'Bern' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Organization' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mockSetPersonal).toHaveBeenCalled());
    expect(mockSetPersonal.mock.calls[0][2].accountType).toBe('Organization');
    expect(mockSetPersonal.mock.calls[0][2].address.country.symbol).toBe('DE');
    view.unmount();
    window.history.replaceState({}, '', '/');

    const op = renderStep(KycStepName.OPERATIONAL_ACTIVITY);
    fireEvent.click(op.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(mockSetOperational).toHaveBeenCalledWith('code-1', expect.any(String), {
        isOperational: true,
        websiteUrl: undefined,
      }),
    );
    op.unmount();
  });

  it('surfaces a financial auto-advance error and skips an empty questionnaire', async () => {
    mockGetFinancial.mockResolvedValueOnce({
      questions: [{ key: 'q1', type: 'Text', title: 'Done' }],
      responses: [{ key: 'q1', value: 'yes' }],
    });
    mockContinueKyc.mockRejectedValueOnce({ statusCode: 500 });
    const fail = renderStep(KycStepName.FINANCIAL_DATA);
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled());
    fail.unmount();

    mockGetFinancial.mockResolvedValueOnce({});
    const empty = renderStep(KycStepName.FINANCIAL_DATA);
    await waitFor(() => expect(mockGetFinancial).toHaveBeenCalled());
    expect(screen.getByText(/loading|laden|caricamento|chargement/i)).toBeInTheDocument();
    empty.unmount();
  });

  it('does not submit a confirmation or text question without an answer', async () => {
    mockGetFinancial.mockResolvedValue({
      questions: [
        {
          key: 'c1',
          type: 'Confirmation',
          title: 'Confirm this',
          options: [{ key: 'accept', text: 'Accept' }],
        },
        { key: 't1', type: 'Text', title: 'Tell us' },
      ],
      responses: [],
    });
    const view = renderStep(KycStepName.FINANCIAL_DATA);
    expect(await screen.findByRole('button', { name: /continue/i })).toBeDisabled();
    view.unmount();
  });

  it('ignores a second contact submit while the first is in flight', async () => {
    let resolveContact!: (value: { name: string; status: string; sequenceNumber: number }) => void;
    mockSetContact.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveContact = resolve;
        }),
    );
    const view = renderStep(KycStepName.CONTACT_DATA);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mockSetContact).toHaveBeenCalledTimes(1));
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSetContact).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveContact(done('ContactData'));
    });
    view.unmount();
  });

  it('ignores incomplete contact, personal, nationality, file, legal, recommendation and accept submits', async () => {
    const contact = renderStep(KycStepName.CONTACT_DATA);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not-an-email' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSetContact).not.toHaveBeenCalled();
    contact.unmount();

    const personal = renderStep(KycStepName.PERSONAL_DATA);
    await screen.findByText(/first name/i);
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSetPersonal).not.toHaveBeenCalled();
    personal.unmount();

    mockGetCountries.mockResolvedValueOnce([]);
    const nationality = renderStep(KycStepName.NATIONALITY_DATA);
    await screen.findByRole('button', { name: /continue/i });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSetNationality).not.toHaveBeenCalled();
    nationality.unmount();

    const file = renderStep(KycStepName.ADDITIONAL_DOCUMENTS);
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSetFile).not.toHaveBeenCalled();
    file.unmount();

    const legal = renderStep(KycStepName.LEGAL_ENTITY);
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSetLegal).not.toHaveBeenCalled();
    legal.unmount();

    const rec = renderStep(KycStepName.RECOMMENDATION);
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSetRecommendation).not.toHaveBeenCalled();
    rec.unmount();

    const recall = renderStep(KycStepName.RECALL_AGREEMENT);
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSetRecall).not.toHaveBeenCalled();
    recall.unmount();

    mockGetCountries.mockResolvedValueOnce([]);
    const beneficial = renderStep(KycStepName.BENEFICIAL_OWNER);
    const selects = await screen.findAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'true' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSetBeneficial).not.toHaveBeenCalled();
    const boxes = screen.getAllByRole('textbox');
    fireEvent.change(boxes[0], { target: { value: 'Ann' } });
    fireEvent.change(boxes[1], { target: { value: 'Owner' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
    expect(mockSetBeneficial).not.toHaveBeenCalled();
    beneficial.unmount();
  });

  it('drops a rejected financial load after unmount', async () => {
    const load = hangFinancialLoad();
    const pending = renderStep(KycStepName.FINANCIAL_DATA);
    await waitFor(() => expect(mockGetFinancial).toHaveBeenCalled());
    pending.unmount();
    await act(async () => {
      load.reject({ statusCode: 500 });
    });
  });

  it('drops a resolved financial load after unmount', async () => {
    const load = hangFinancialLoad();
    const late = renderStep(KycStepName.FINANCIAL_DATA);
    await waitFor(() => expect(mockGetFinancial).toHaveBeenCalled());
    late.unmount();
    await act(async () => {
      load.resolve({ questions: [], responses: [] });
    });
  });

  it('ignores a busy or empty financial answer', async () => {
    mockGetFinancial.mockResolvedValue({
      questions: [{
        key: 'c1',
        type: 'Confirmation',
        title: 'Confirm this',
        options: [{ key: 'accept', text: 'Accept' }],
      }],
      responses: [],
    });
    mockSetFinancial.mockImplementation(() => new Promise(() => undefined));
    const view = renderStep(KycStepName.FINANCIAL_DATA);
    expect(await screen.findByRole('checkbox')).toBeInTheDocument();
    const form = await waitFor(() => {
      const node = document.querySelector('form');
      expect(node).toBeTruthy();
      return node as HTMLFormElement;
    });
    fireEvent.submit(form);
    expect(mockSetFinancial).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('checkbox'));
    const continueBtn = await screen.findByRole('button', { name: /continue/i });
    await waitFor(() => expect(continueBtn).not.toBeDisabled());
    fireEvent.click(continueBtn);
    await waitFor(() => expect(mockSetFinancial).toHaveBeenCalledTimes(1));
    fireEvent.submit(form);
    expect(mockSetFinancial).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('drops an ident poll tick after unmount', async () => {
    jest.useFakeTimers();
    let resolvePoll!: (value: { currentStep: { name: string; status: string } }) => void;
    mockContinueKyc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePoll = resolve;
        }),
    );
    const view = renderStep(KycStepName.IDENT, {
      session: { url: 'https://ident.example/start', type: UrlType.BROWSER as never },
    });
    await act(async () => {
      jest.advanceTimersByTime(IDENT_POLL.initialDelayMs);
    });
    view.unmount();
    await act(async () => {
      resolvePoll({ currentStep: { name: 'ContactData', status: 'InProgress' } });
    });
    expect(handlers.onAdvance).not.toHaveBeenCalled();

    let rejectPoll!: (err: unknown) => void;
    mockContinueKyc.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectPoll = reject;
        }),
    );
    const failing = renderStep(KycStepName.IDENT, {
      session: { url: 'https://ident.example/start', type: UrlType.BROWSER as never },
    });
    await act(async () => {
      jest.advanceTimersByTime(IDENT_POLL.initialDelayMs);
    });
    failing.unmount();
    await act(async () => {
      rejectPoll(new Error('down'));
    });

    const early = renderStep(KycStepName.IDENT, {
      session: { url: 'https://ident.example/start', type: UrlType.BROWSER as never },
    });
    early.unmount();
    await act(async () => {
      jest.advanceTimersByTime(IDENT_POLL.initialDelayMs);
    });
    jest.useRealTimers();
  });
});
