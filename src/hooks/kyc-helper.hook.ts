import {
  AccountType,
  DocumentType,
  GenderType,
  GoodsCategory,
  KycLevel,
  KycStepName,
  KycStepType,
  LegalEntity,
  LimitPeriod,
  MerchantCategory,
  SignatoryPower,
  StoreType,
  TradingLimit,
  Utils,
  useUserContext,
} from '@dfx.swiss/react';
import { useMemo } from 'react';
import { useSettingsContext } from '../contexts/settings.context';
import { useNavigation } from './navigation.hook';

interface KycHelperInterface {
  defaultLimit: TradingLimit;
  limit: string | undefined;
  isComplete: boolean | undefined;
  start: () => void;
  startStep: (stepName: KycStepName, stepType?: KycStepType) => void;

  levelToString: (level: number) => string;
  limitToString: (limit: TradingLimit) => string;
  accountTypeToString: (accountType: AccountType) => string;
  nameToString: (stepName: KycStepName) => string;
  typeToString: (stepType: KycStepType) => string;
  legalEntityToString: (entity: LegalEntity) => string;
  legalEntityToDescription: (entity: LegalEntity) => string | undefined;
  genderTypeToString: (genderType: GenderType) => string;
  documentTypeToString: (documentType: DocumentType) => string;
  signatoryPowerToString: (power: SignatoryPower) => string;
  goodsCategoryToString: (goodsCategory: GoodsCategory) => string;
  storeTypeToString: (storeType: StoreType) => string;
  merchantCategoryToString: (merchantCategory: MerchantCategory) => string;
}

export function useKycHelper(): KycHelperInterface {
  const { translate } = useSettingsContext();
  const { user } = useUserContext();
  const { navigate } = useNavigation();

  const periodMap: Record<LimitPeriod, string> = {
    [LimitPeriod.DAY]: 'per 24h',
    [LimitPeriod.MONTH]: 'per 30 days',
    [LimitPeriod.YEAR]: 'per year',
  };

  const accountTypeMap: Record<AccountType, string> = {
    [AccountType.PERSONAL]: 'Personal',
    [AccountType.ORGANIZATION]: 'Organization / company',
    [AccountType.SOLE_PROPRIETORSHIP]: 'Sole proprietorship',
  };

  const stepMap: Record<KycStepName, string> = {
    [KycStepName.CONTACT_DATA]: 'Contact data',
    [KycStepName.PERSONAL_DATA]: 'Personal data',
    [KycStepName.LEGAL_ENTITY]: 'Legal entity',
    [KycStepName.OWNER_DIRECTORY]: 'Owner directory',
    [KycStepName.NATIONALITY_DATA]: 'Nationality',
    [KycStepName.RECOMMENDATION]: 'Recommendation',
    [KycStepName.COMMERCIAL_REGISTER]: 'Commercial register',
    [KycStepName.SOLE_PROPRIETORSHIP_CONFIRMATION]: 'Sole proprietorship confirmation',
    [KycStepName.SIGNATORY_POWER]: 'Signatory power',
    [KycStepName.AUTHORITY]: 'Power of Attorney',
    [KycStepName.BENEFICIAL_OWNER]: 'Beneficial owners',
    [KycStepName.OPERATIONAL_ACTIVITY]: 'Operational activity',
    [KycStepName.IDENT]: 'Identification',
    [KycStepName.FINANCIAL_DATA]: 'Additional data',
    [KycStepName.ADDITIONAL_DOCUMENTS]: 'Additional documents',
    [KycStepName.RESIDENCE_PERMIT]: 'Residence permit',
    [KycStepName.STATUTES]: 'Association statutes',
    [KycStepName.DFX_APPROVAL]: 'DFX approval',
    [KycStepName.PAYMENT_AGREEMENT]: 'Assignment agreement',
    [KycStepName.RECALL_AGREEMENT]: 'Recall agreement',
    [KycStepName.PHONE_CHANGE]: 'Phone number change',
    [KycStepName.ADDRESS_CHANGE]: 'Address change',
    [KycStepName.NAME_CHANGE]: 'Name change',
  };

  const typeMap: Record<KycStepType, string> = {
    [KycStepType.AUTO]: 'auto',
    [KycStepType.VIDEO]: 'video',
    [KycStepType.MANUAL]: 'manual',
    [KycStepType.SUMSUB_AUTO]: 'auto',
    [KycStepType.SUMSUB_VIDEO]: 'video',
  };

  const legalEntityMap: Record<LegalEntity, string> = {
    [LegalEntity.AG]: 'Stock corporation (AG, Ltd, SA)',
    [LegalEntity.GMBH]: 'Limited liability company under Swiss/German/Austrian law (GmbH, LLC, Sàrl)',
    [LegalEntity.UG]: 'Entrepreneurial company (UG)',
    [LegalEntity.GBR]: 'Company under civil law (GbR)',
    [LegalEntity.LIFE_INSURANCE]: 'Life insurance',
    [LegalEntity.PUBLIC_INSTITUTION]: 'Public law institution',
    [LegalEntity.OHG]: 'General partnership (OHG)',
    [LegalEntity.KG]: 'Limited partnership (KG)',
    [LegalEntity.GMBH_CO_KG]: 'Limited partnership with limited liability company (GmbH & Co. KG)',
    [LegalEntity.COOPERATIVE]: 'Cooperative',
    [LegalEntity.COLLECTIVE_COMPANY]: 'Collective company',
    [LegalEntity.LISTED_AG]: 'Listed stock corporation',
    [LegalEntity.ASSOCIATION]: 'Association',
    [LegalEntity.FOUNDATION]: 'Foundation',
    [LegalEntity.TRUST]: 'Trust',
    [LegalEntity.OTHER]: 'Other',
  };

  const legalEntityDescriptionMap: { [e in LegalEntity]?: string } = {
    [LegalEntity.AG]: 'Organization with shareholders',
    [LegalEntity.GMBH]: 'Organization with partners',
    [LegalEntity.UG]: 'Privately held with limited liability, low capital requirement',
    [LegalEntity.GBR]:
      'Simple and flexible form of cooperation between two or more people who join forces for a common purpose',
  };

  const genderTypeMap: Record<GenderType, string> = {
    [GenderType.FEMALE]: 'Female',
    [GenderType.MALE]: 'Male',
  };

  const manualIdentDocumentTypeMap: Record<DocumentType, string> = {
    [DocumentType.PASSPORT]: 'Passport',
    [DocumentType.IDCARD]: 'ID card',
    [DocumentType.DRIVERS_LICENSE]: "Driver's license",
    [DocumentType.RESIDENCE_PERMIT]: 'Residence permit',
  };

  const limit = user && limitToString(user.tradingLimit);

  const isComplete = user && user.kyc.level >= KycLevel.Completed;

  function start() {
    navigate('/kyc');
  }

  function startStep(stepName: KycStepName, stepType?: KycStepType) {
    const step = stepName + (stepType ? `/${stepType}` : '');
    // the router state marks the step as started inside the app, so the KYC screen does not ask again
    navigate({ pathname: '/kyc', search: `step=${step}` }, { state: { kycStep: step } });
  }

  // formatting
  function levelToString(level: number): string {
    switch (level) {
      case -10:
        return translate('screens/kyc', 'Terminated');
      case -20:
        return translate('screens/kyc', 'Rejected');
      default:
        return translate('screens/kyc', `Level {{level}}`, { level });
    }
  }

  function limitToString({ limit, period }: TradingLimit): string {
    return `${Utils.formatAmount(limit, 0)} CHF ${translate('screens/kyc', periodMap[period])}`;
  }

  function accountTypeToString(accountType: AccountType): string {
    return translate('screens/kyc', accountTypeMap[accountType]);
  }

  function nameToString(stepName: KycStepName): string {
    return translate('screens/kyc', stepMap[stepName]);
  }

  function typeToString(stepType: KycStepType): string {
    return translate('screens/kyc', typeMap[stepType]);
  }

  const legalEntityToString = (entity: LegalEntity): string => {
    return translate('screens/kyc', legalEntityMap[entity]);
  };

  const legalEntityToDescription = (entity: LegalEntity): string | undefined => {
    const description = legalEntityDescriptionMap[entity];
    return description ? translate('screens/kyc', description) : undefined;
  };

  const genderTypeToString = (genderType: GenderType): string => {
    return translate('screens/kyc', genderTypeMap[genderType]);
  };

  const documentTypeToString = (documentType: DocumentType): string => {
    return translate('screens/kyc', manualIdentDocumentTypeMap[documentType]);
  };

  function signatoryPowerToString(power: SignatoryPower): string {
    switch (power) {
      case SignatoryPower.SINGLE:
        return translate('screens/kyc', 'Authorized to sign individually');
      case SignatoryPower.DOUBLE:
        return translate('screens/kyc', 'Authorized to sign jointly');
      case SignatoryPower.NONE:
        return translate('screens/kyc', 'No signing authorization');
    }
  }

  const goodsCategoryMap: Record<GoodsCategory, string> = {
    [GoodsCategory.ELECTRONICS_COMPUTERS]: 'Electronics & computers',
    [GoodsCategory.BOOKS_MUSIC_MOVIES]: 'Books, music & movies',
    [GoodsCategory.HOME_GARDEN_TOOLS]: 'Home, garden & tools',
    [GoodsCategory.CLOTHES_SHOES_BAGS]: 'Clothes, shoes & bags',
    [GoodsCategory.TOYS_KIDS_BABY]: 'Toys, kids & baby',
    [GoodsCategory.AUTOMOTIVE_ACCESSORIES]: 'Automotive accessories',
    [GoodsCategory.GAME_RECHARGE]: 'Game recharge',
    [GoodsCategory.ENTERTAINMENT_COLLECTION]: 'Entertainment & collection',
    [GoodsCategory.JEWELRY]: 'Jewelry',
    [GoodsCategory.DOMESTIC_SERVICE]: 'Domestic service',
    [GoodsCategory.BEAUTY_CARE]: 'Beauty & care',
    [GoodsCategory.PHARMACY]: 'Pharmacy',
    [GoodsCategory.SPORTS_OUTDOORS]: 'Sports & outdoors',
    [GoodsCategory.FOOD_GROCERY_HEALTH_PRODUCTS]: 'Food, grocery & health products',
    [GoodsCategory.PET_SUPPLIES]: 'Pet supplies',
    [GoodsCategory.INDUSTRY_SCIENCE]: 'Industry & science',
    [GoodsCategory.OTHERS]: 'Other',
  };

  const storeTypeMap: Record<StoreType, string> = {
    [StoreType.ONLINE]: 'Online',
    [StoreType.PHYSICAL]: 'Physical',
    [StoreType.ONLINE_AND_PHYSICAL]: 'Online and physical',
  };

  const merchantCategoryMap: Record<MerchantCategory, string> = {
    [MerchantCategory.ACCOMMODATION_AND_FOOD_SERVICES]: 'Accommodation and food services',
    [MerchantCategory.ADMINISTRATIVE_SUPPORT_WASTE_MANAGEMENT]: 'Administrative support & waste management',
    [MerchantCategory.AGRICULTURE_FORESTRY_FISHING_HUNTING]: 'Agriculture, forestry, fishing & hunting',
    [MerchantCategory.ARTS_ENTERTAINMENT_RECREATION]: 'Arts, entertainment & recreation',
    [MerchantCategory.CONSTRUCTION]: 'Construction',
    [MerchantCategory.BROKER]: 'Broker',
    [MerchantCategory.CRYPTO_ATM]: 'Crypto ATM',
    [MerchantCategory.CRYPTO_MINING]: 'Crypto mining',
    [MerchantCategory.PROPRIETARY_CRYPTO_TRADERS]: 'Proprietary crypto traders',
    [MerchantCategory.ALGORITHM_CRYPTO_TRADERS]: 'Algorithm crypto traders',
    [MerchantCategory.P2P_MERCHANTS]: 'P2P merchants',
    [MerchantCategory.OTHER_DIGITAL_ASSET_SERVICES_PROVIDER]: 'Other digital asset services provider',
    [MerchantCategory.BANK]: 'Bank',
    [MerchantCategory.NON_BANK_FINANCIAL_INSTITUTION]: 'Non-bank financial institution',
    [MerchantCategory.MONEY_SERVICES_BUSINESS_PAYMENT_SERVICE_PROVIDERS]:
      'Money services business & payment service providers',
    [MerchantCategory.FAMILY_OFFICE]: 'Family office',
    [MerchantCategory.PERSONAL_INVESTMENT_COMPANIES]: 'Personal investment companies',
    [MerchantCategory.SUPERANNUATION_FUND]: 'Superannuation fund',
    [MerchantCategory.SOVEREIGN_WEALTH_FUND]: 'Sovereign wealth fund',
    [MerchantCategory.INVESTMENT_FUNDS]: 'Investment funds',
    [MerchantCategory.EDUCATIONAL_SERVICES]: 'Educational services',
    [MerchantCategory.BETTING]: 'Betting',
    [MerchantCategory.HEALTH_CARE_SOCIAL_ASSISTANCE]: 'Health care & social assistance',
    [MerchantCategory.INFORMATION]: 'Information',
    [MerchantCategory.GENERAL_WHOLESALERS]: 'General wholesalers',
    [MerchantCategory.MANAGEMENT_OF_COMPANIES_ENTERPRISES]: 'Management of companies & enterprises',
    [MerchantCategory.PRECIOUS_STONES_PRECIOUS_METALS_DEALERS]: 'Precious stones & precious metals dealers',
    [MerchantCategory.CRUDE_OIL_NATURAL_GAS_DEALERS]: 'Crude oil & natural gas dealers',
    [MerchantCategory.GENERAL_MANUFACTURING]: 'General manufacturing',
    [MerchantCategory.MARIJUANA]: 'Marijuana',
    [MerchantCategory.MINING_EXTRACTION]: 'Mining & extraction',
    [MerchantCategory.PAWN_SHOPS]: 'Pawn shops',
    [MerchantCategory.PROFESSIONAL_SERVICES]: 'Professional services',
    [MerchantCategory.SCIENTIFIC_TECHNICAL_SERVICES]: 'Scientific & technical services',
    [MerchantCategory.PUBLIC_ADMINISTRATION]: 'Public administration',
    [MerchantCategory.REAL_ESTATE_RENTAL_LEASING]: 'Real estate, rental & leasing',
    [MerchantCategory.RETAIL_STORES_ELECTRONICS]: 'Retail stores (electronics)',
    [MerchantCategory.RETAIL_STORES_FB]: 'Retail stores (food & beverage)',
    [MerchantCategory.RETAIL_STORES_JEWELRY]: 'Retail stores (jewelry)',
    [MerchantCategory.RETAIL_TRADE_OTHERS]: 'Retail trade (others)',
    [MerchantCategory.SALE_OF_DRUGS_PHARMACEUTICAL_PRODUCTS]: 'Sale of drugs & pharmaceutical products',
    [MerchantCategory.TOBACCO]: 'Tobacco',
    [MerchantCategory.TRANSPORTATION_WAREHOUSING]: 'Transportation & warehousing',
    [MerchantCategory.UTILITIES]: 'Utilities',
    [MerchantCategory.OTHER_CRYPTO_WEB3_SERVICES]: 'Other crypto/Web3 services',
    [MerchantCategory.OTHER]: 'Other',
  };

  const goodsCategoryToString = (goodsCategory: GoodsCategory): string => {
    return translate('screens/kyc', goodsCategoryMap[goodsCategory]);
  };

  const storeTypeToString = (storeType: StoreType): string => {
    return translate('screens/kyc', storeTypeMap[storeType]);
  };

  const merchantCategoryToString = (merchantCategory: MerchantCategory): string => {
    return translate('screens/kyc', merchantCategoryMap[merchantCategory]);
  };

  return useMemo(
    () => ({
      start,
      startStep,
      isComplete,
      defaultLimit: { limit: 1000, period: LimitPeriod.MONTH },
      limit,
      levelToString,
      limitToString,
      accountTypeToString,
      nameToString,
      typeToString,
      legalEntityToString,
      legalEntityToDescription,
      genderTypeToString,
      documentTypeToString,
      signatoryPowerToString,
      goodsCategoryToString,
      storeTypeToString,
      merchantCategoryToString,
    }),
    [user, translate],
  );
}
