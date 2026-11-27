import {
  AccountType,
  DocumentType,
  GenderType,
  GoodsCategory,
  KycStepName,
  KycStepType,
  LegalEntity,
  LimitPeriod,
  MerchantCategory,
  SignatoryPower,
  StoreType,
} from '@dfx.swiss/react';
import { renderHook } from '@testing-library/react';
import { useKycHelper } from '../hooks/kyc-helper.hook';

const mockNavigate = jest.fn();
const mockUserContext: { user?: { tradingLimit: { limit: number; period: string }; kyc: { level: number } } } = {};

// The SDK ships ES modules that Jest does not transform, so its enums are mirrored here.
jest.mock('@dfx.swiss/react', () => ({
  AccountType: { PERSONAL: 'Personal', ORGANIZATION: 'Organization', SOLE_PROPRIETORSHIP: 'SoleProprietorship' },
  DocumentType: { PASSPORT: 'Passport', IDCARD: 'IdCard', DRIVERS_LICENSE: 'DriversLicense', RESIDENCE_PERMIT: 'RP' },
  GenderType: { FEMALE: 'Female', MALE: 'Male' },
  GoodsCategory: { JEWELRY: 'Jewelry', OTHERS: 'Others' },
  KycLevel: { Completed: 50 },
  KycStepName: { PERSONAL_DATA: 'PersonalData', IDENT: 'Ident' },
  KycStepType: {
    AUTO: 'Auto',
    VIDEO: 'Video',
    MANUAL: 'Manual',
    SUMSUB_AUTO: 'SumsubAuto',
    SUMSUB_VIDEO: 'SumsubVideo',
  },
  LegalEntity: { AG: 'AG', OTHER: 'Other' },
  LimitPeriod: { DAY: 'Day', MONTH: 'Month', YEAR: 'Year' },
  MerchantCategory: { BANK: 'Bank', OTHER: 'Other' },
  SignatoryPower: { SINGLE: 'Single', DOUBLE: 'Double', NONE: 'None' },
  StoreType: { ONLINE: 'Online', PHYSICAL: 'Physical', ONLINE_AND_PHYSICAL: 'OnlineAndPhysical' },
  Utils: { formatAmount: (amount: number) => `${amount}` },
  useUserContext: () => mockUserContext,
}));
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, text: string, values?: Record<string, unknown>) =>
      values
        ? Object.entries(values).reduce((result, [key, value]) => result.replace(`{{${key}}}`, `${value}`), text)
        : text,
  }),
}));
jest.mock('../hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

function helper() {
  return renderHook(() => useKycHelper()).result.current;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserContext.user = undefined;
});

describe('useKycHelper navigation', () => {
  it('opens the KYC overview', () => {
    helper().start();
    expect(mockNavigate).toHaveBeenCalledWith('/kyc');
  });

  it('starts a step with the step in the router state', () => {
    helper().startStep(KycStepName.PERSONAL_DATA);
    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: '/kyc', search: 'step=PersonalData' },
      { state: { kycStep: 'PersonalData' } },
    );
  });

  it('starts a step with a type and keeps the type in the router state', () => {
    helper().startStep(KycStepName.IDENT, KycStepType.SUMSUB_VIDEO);
    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: '/kyc', search: `step=Ident/${KycStepType.SUMSUB_VIDEO}` },
      { state: { kycStep: `Ident/${KycStepType.SUMSUB_VIDEO}` } },
    );
  });
});

describe('useKycHelper user values', () => {
  it('has no limit and no completion without a user', () => {
    const result = helper();
    expect(result.limit).toBeUndefined();
    expect(result.isComplete).toBeUndefined();
    expect(result.defaultLimit).toEqual({ limit: 1000, period: LimitPeriod.MONTH });
  });

  it.each([
    [50, true],
    [30, false],
  ])('formats the limit and completion for level %s', (level, complete) => {
    mockUserContext.user = { tradingLimit: { limit: 5000, period: LimitPeriod.YEAR }, kyc: { level } };
    const result = helper();
    expect(result.limit).toBe('5000 CHF per year');
    expect(result.isComplete).toBe(complete);
  });
});

describe('useKycHelper formatting', () => {
  it.each([
    [-10, 'Terminated'],
    [-20, 'Rejected'],
    [20, 'Level 20'],
  ])('formats level %s', (level, expected) => {
    expect(helper().levelToString(level)).toBe(expected);
  });

  it.each([
    [LimitPeriod.DAY, 'per 24h'],
    [LimitPeriod.MONTH, 'per 30 days'],
  ])('formats the %s limit period', (period, text) => {
    expect(helper().limitToString({ limit: 100, period })).toBe(`100 CHF ${text}`);
  });

  it('formats account types, step names and step types', () => {
    const result = helper();
    expect(result.accountTypeToString(AccountType.ORGANIZATION)).toBe('Organization / company');
    expect(result.nameToString(KycStepName.IDENT)).toBe('Identification');
    expect(result.typeToString(KycStepType.SUMSUB_VIDEO)).toBe('video');
  });

  it('formats legal entities with and without a description', () => {
    const result = helper();
    expect(result.legalEntityToString(LegalEntity.AG)).toBe('Stock corporation (AG, Ltd, SA)');
    expect(result.legalEntityToDescription(LegalEntity.AG)).toBe('Organization with shareholders');
    expect(result.legalEntityToDescription(LegalEntity.OTHER)).toBeUndefined();
  });

  it('formats gender and document types', () => {
    const result = helper();
    expect(result.genderTypeToString(GenderType.FEMALE)).toBe('Female');
    expect(result.documentTypeToString(DocumentType.IDCARD)).toBe('ID card');
  });

  it.each([
    [SignatoryPower.SINGLE, 'Authorized to sign individually'],
    [SignatoryPower.DOUBLE, 'Authorized to sign jointly'],
    [SignatoryPower.NONE, 'No signing authorization'],
  ])('formats signatory power %s', (power, expected) => {
    expect(helper().signatoryPowerToString(power)).toBe(expected);
  });

  it('formats goods categories, store types and merchant categories', () => {
    const result = helper();
    expect(result.goodsCategoryToString(GoodsCategory.JEWELRY)).toBe('Jewelry');
    expect(result.storeTypeToString(StoreType.ONLINE_AND_PHYSICAL)).toBe('Online and physical');
    expect(result.merchantCategoryToString(MerchantCategory.BANK)).toBe('Bank');
  });
});
