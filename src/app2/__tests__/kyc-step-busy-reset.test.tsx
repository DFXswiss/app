// After a successful in-app KYC step, `busy` used to stay true: submit() only
// called setBusy(false) in .catch. The parent reuses KycStepForm when it only
// swaps the step prop, so the next step's SubmitButton stayed permanently
// disabled and a multi-step flow could not complete past step one.

const mockSetOperationalData = jest.fn();
const mockSetSignatoryPowerData = jest.fn();
const mockContinueKyc = jest.fn();

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
    LIGHTNING: 'Lightning',
    SOLANA: 'Solana',
    MONERO: 'Monero',
    TRON: 'Tron',
    CARDANO: 'Cardano',
    INTERNET_COMPUTER: 'InternetComputer',
    CITREA: 'Citrea',
    CITREA_TESTNET: 'CitreaTestnet',
    FIRO: 'Firo',
    ZANO: 'Zano',
    SPARK: 'Spark',
    ARKADE: 'Arkade',
    LIQUID: 'Liquid',
    ARWEAVE: 'Arweave',
    RAILGUN: 'Railgun',
    DEFICHAIN: 'DeFiChain',
  },
  AccountType: { PERSONAL: 'Personal', ORGANIZATION: 'Organization', SOLE_PROPRIETORSHIP: 'SoleProprietorship' },
  LegalEntity: { AG: 'AG', GMBH: 'GmbH', OTHER: 'Other' },
  SignatoryPower: { SINGLE: 'Single', DOUBLE: 'Double', NONE: 'None' },
  QuestionType: { SINGLE_CHOICE: 'SingleChoice', MULTIPLE_CHOICE: 'MultipleChoice', TEXT: 'Text' },
  UrlType: { BROWSER: 'Browser', API: 'API' },
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
  },
  KycStepStatus: {
    NOT_STARTED: 'NotStarted',
    IN_PROGRESS: 'InProgress',
    FAILED: 'Failed',
    COMPLETED: 'Completed',
  },
  isStepDone: () => false,
  useKyc: () => ({
    setOperationalData: mockSetOperationalData,
    setSignatoryPowerData: mockSetSignatoryPowerData,
    continueKyc: mockContinueKyc,
  }),
  useUserContext: () => ({ user: undefined }),
  useCountry: () => ({ getCountries: jest.fn().mockResolvedValue([]) }),
}));

jest.mock('@sumsub/websdk-react', () => () => null);

import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { KycSession, KycStepSession } from '@dfx.swiss/react';
import { KycStepName, KycStepStatus } from '@dfx.swiss/react';
import { LanguageProvider } from '../i18n';
import { KycStepForm } from '../screens/kyc-steps';

function step(name: KycStepName, sequenceNumber: number): KycStepSession {
  return {
    name,
    status: KycStepStatus.IN_PROGRESS,
    sequenceNumber,
    session: { url: `https://api.example/kyc/${name}`, type: 'Browser' as never },
  };
}

const operational = step(KycStepName.OPERATIONAL_ACTIVITY, 1);
const signatory = step(KycStepName.SIGNATORY_POWER, 2);

/** Mirrors the parent shell: swap the step prop after continueKyc without forcing a remount key. */
function TwoStepHarness() {
  const [current, setCurrent] = useState(operational);

  return (
    <KycStepForm
      code="test-code"
      step={current}
      onAdvance={() => setCurrent(signatory)}
      onFailed={jest.fn()}
      onTfaRequired={jest.fn()}
      onHandoff={jest.fn()}
      onBack={jest.fn()}
    />
  );
}

function renderHarness() {
  return render(
    <LanguageProvider>
      <TwoStepHarness />
    </LanguageProvider>,
  );
}

describe('KycStepForm multi-step busy reset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetOperationalData.mockResolvedValue({
      name: KycStepName.OPERATIONAL_ACTIVITY,
      status: KycStepStatus.COMPLETED,
      sequenceNumber: 1,
    });
    mockSetSignatoryPowerData.mockResolvedValue({
      name: KycStepName.SIGNATORY_POWER,
      status: KycStepStatus.COMPLETED,
      sequenceNumber: 2,
    });
    mockContinueKyc.mockResolvedValue({} as KycSession);
  });

  it('lets the second in-app step submit after the first continueKyc succeeds', async () => {
    renderHarness();

    // Step 1: OperationalActivity — SubmitButton is enabled by default.
    const firstSubmit = screen.getByRole('button', { name: /^Continue$/i });
    expect(firstSubmit).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(firstSubmit);
    });

    await waitFor(() => expect(mockSetOperationalData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledWith('test-code', true));

    // Step 2: SignatoryPower — must not inherit busy=true from step 1.
    const secondSubmit = await screen.findByRole('button', { name: /^Continue$/i });
    await waitFor(() => expect(secondSubmit).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(secondSubmit);
    });

    await waitFor(() => expect(mockSetSignatoryPowerData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalledTimes(2));
  });
});
