// Frontend mirror of the api RealUnit reduced-compliance DTOs
// (api: src/subdomains/supporting/realunit/dto/realunit-compliance.dto.ts).
// Every field is a whitelist copy of the api DTO; Date fields arrive as ISO strings over the wire. This is the
// REDUCED tenant view — it structurally contains NO DFX AML work product (no amlCheck/amlReason, no compliance
// notes, no limitRequest, no recommendation graph), with one deliberate exception: the mandatory check evidences
// (ident + Dilisense name check, `checks`). Do not add other such fields here or render them.

export interface CountrySupportInfo {
  name: string;
  symbol?: string;
}

export interface LanguageSupportInfo {
  name: string;
  symbol?: string;
}

export interface OrganizationSupportInfo {
  id: number;
  name?: string;
  street?: string;
  houseNumber?: string;
  zip?: string;
  location?: string;
  country?: CountrySupportInfo;
  legalEntity?: string;
  signatoryPower?: string;
  complexOrgStructure?: boolean;
  allBeneficialOwnersName?: string;
  allBeneficialOwnersDomicile?: string;
  accountOpenerAuthorization?: string;
}

export interface RealUnitDossierMessage {
  author: string;
  message?: string;
  created: string;
}

// RealUnit-app wallet row from the user table (filtered api-side to this customer's wallets).
export interface RealUnitWalletAddress {
  id: number;
  address: string;
  status: string;
  created: string; // ISO over the wire
}

export interface RealUnitBuyRoute {
  id: number;
  iban?: string;
  bankUsage: string;
  assetName: string;
  blockchain: string;
  targetAddress?: string;
  targetAddressExplorerUrl?: string;
  volume: number;
  active: boolean;
  created: string;
}

export interface RealUnitSellRoute {
  id: number;
  iban: string;
  fiatName?: string;
  depositAddress?: string;
  depositBlockchains?: string[];
  depositAddressExplorerUrl?: string;
  volume: number;
  active: boolean;
  created: string;
}

export interface RealUnitSwapRoute {
  id: number;
  assetName?: string;
  blockchain?: string;
  depositAddress?: string;
  depositAddressExplorerUrl?: string;
  volume: number;
  annualVolume: number;
  active: boolean;
  created: string;
}

export interface RealUnitVirtualIban {
  id: number;
  iban: string;
  bban?: string;
  currency?: string;
  bank?: string;
  status?: string;
  active: boolean;
  label?: string;
  buyId?: number;
  reservedUntil?: string;
  activatedAt?: string;
  deactivatedAt?: string;
  created: string;
}

export interface RealUnitCustomerListDto {
  // current REALU holdings (share count, summed over all wallet addresses); undefined = could not be resolved
  balance?: number;
  id: number;
  kycStatus: string;
  kycLevel?: string;
  accountType?: string;
  mail?: string;
  name?: string;
}

export interface RealUnitKycFileDto {
  uid: string;
  type: string;
  name: string;
  // Optional: for legacy documents catalogued from the Spider era the real document date cannot be established, so
  // the api omits the field instead of substituting the day of the catalogue run — that would present a years-old
  // document as brand new, and a wrong date is worse than a visible gap.
  created?: string;
}

// Reduced KYC step: raw result/comment and the recommendation/referral graph are omitted by the api.
// One resolved check evidence, decided by the api (which step/file counts). `status`/`type` only for step-backed
// checks (ident; type = KycStepType, e.g. SumsubAuto/SumsubVideo/Video/Manual); `fileUid`/`fileName` point at the
// downloadable evidence when one exists.
export interface RealUnitCheckEvidenceDto {
  status?: string;
  type?: string;
  date: string;
  fileUid?: string;
  fileName?: string;
}

// Mandatory checks of the dossier. An absent member = check missing — render as a finding, never hide the row.
export interface RealUnitChecksDto {
  identCheck?: RealUnitCheckEvidenceDto;
  nameCheck?: RealUnitCheckEvidenceDto;
}

export interface RealUnitDossierKycStepDto {
  id: number;
  name: string;
  type?: string;
  status: string;
  sequenceNumber: number;
  created: string;
}

// Reduced transaction: amlCheck/amlReason (DFX AML verdict) and comment are omitted by the api.
export interface RealUnitDossierTxDto {
  id: number;
  uid: string;
  buyCryptoId?: number;
  buyFiatId?: number;
  bankDataId?: number;
  type?: string;
  sourceType: string;
  inputAmount?: number;
  inputAsset?: string;
  inputTxId?: string;
  outputAmount?: number;
  outputAsset?: string;
  amountInChf?: number;
  amountInEur?: number;
  chargebackDate?: string;
  isCompleted: boolean;
  created: string;
}

// Reduced bank data: comment and the cross-customer alternatives list are omitted by the api.
export interface RealUnitDossierBankDataDto {
  id: number;
  iban: string;
  name: string;
  type?: string;
  status?: string;
  approved: boolean;
  manualApproved?: boolean;
  active: boolean;
  created: string;
}

export interface RealUnitDossierSupportIssueTxDto {
  id: number;
  uid: string;
  type?: string;
  sourceType: string;
  amountInChf?: number;
}

// Reduced support issue: no limitRequest and no transaction.amlCheck.
export interface RealUnitDossierSupportIssueDto {
  id: number;
  uid: string;
  type: string;
  state: string;
  reason: string;
  name: string;
  clerk?: string;
  department?: string;
  information?: string;
  messages: RealUnitDossierMessage[];
  transaction?: RealUnitDossierSupportIssueTxDto;
  created: string;
}

export interface RealUnitCustomerDetailDto {
  // --- Identity / PII --- //
  id: number;
  created: string;
  accountType?: string;
  mail?: string;
  firstname?: string;
  surname?: string;
  verifiedName?: string;
  street?: string;
  houseNumber?: string;
  zip?: string;
  location?: string;
  country?: CountrySupportInfo;
  nationality?: CountrySupportInfo;
  language?: LanguageSupportInfo;
  birthday?: string;
  phone?: string;
  organization?: OrganizationSupportInfo;

  // --- KYC / compliance status (no DFX-generated AML work products) --- //
  kycStatus: string;
  kycLevel?: string;
  kycType?: string;
  highRisk?: boolean;
  pep?: boolean;

  // current REALU holdings (share count, summed over all wallet addresses); undefined = could not be resolved
  balance?: number;

  // --- Mandatory checks, resolved by the api (absent member = check missing) --- //
  checks: RealUnitChecksDto;

  // --- Customer-scoped slices (reduced, AML work products structurally omitted) --- //
  kycFiles: RealUnitKycFileDto[];
  kycSteps: RealUnitDossierKycStepDto[];
  transactions: RealUnitDossierTxDto[];
  bankDatas: RealUnitDossierBankDataDto[];
  addresses: RealUnitWalletAddress[];
  buyRoutes: RealUnitBuyRoute[];
  sellRoutes: RealUnitSellRoute[];
  swapRoutes: RealUnitSwapRoute[];
  virtualIbans: RealUnitVirtualIban[];
  supportIssues: RealUnitDossierSupportIssueDto[];
}

// KYC file download payload (api KycFileDataDto). The Node Buffer serializes to { type: 'Buffer', data: number[] }.
export interface RealUnitKycFileDownloadDto {
  name: string;
  type: string;
  uid: string;
  contentType: string;
  content: { type: string; data: number[] };
}
