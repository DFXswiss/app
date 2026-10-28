import {
  ApiError,
  Blockchain,
  DetailTransaction,
  KycStepName,
  PdfDocument,
  Referral,
  UserAddress,
  UserProfile,
  Utils,
  useApi,
  useSessionContext,
  useTransaction,
  useUser,
  useUserContext,
} from '@dfx.swiss/react';
import { ConfirmationOverlay } from 'src/components/overlay/confirmation-overlay';
import {
  AlignContent,
  CopyButton,
  Form,
  IconVariant,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledDataTable,
  StyledDataTableExpandableRow,
  StyledDataTableRow,
  StyledDropdown,
  StyledIconButton,
  StyledInput,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import copy from 'copy-to-clipboard';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { RecommendationsSection } from 'src/components/account/recommendations-section';
import { KycStatus } from 'src/components/kyc-status';
import { Modal } from 'src/components/modal';
import { addressLabel } from 'src/config/labels';
import { Urls } from 'src/config/urls';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useWindowContext } from 'src/contexts/window.context';
import { useAnchor } from 'src/hooks/anchor.hook';
import { useUserGuard } from 'src/hooks/guard.hook';
import { useKycHelper } from 'src/hooks/kyc-helper.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { displayWalletAddress } from 'src/util/lnurl';
import {
  downloadPdfFromString,
  formatSwissDateTimeWithSeconds,
  sortAddressesByBlockchain,
  url,
} from 'src/util/utils';
import { useAppHandlingContext } from '../contexts/app-handling.context';
import { useSettingsContext } from '../contexts/settings.context';
import { useWalletContext } from '../contexts/wallet.context';

function formatAddress(address: NonNullable<UserProfile['address']>): string {
  return [
    [address.street, address.houseNumber].filter(Boolean).join(' '),
    [address.zip, address.city].filter(Boolean).join(' '),
    address.country?.name,
  ]
    .filter(Boolean)
    .join(', ');
}

enum FiatCurrency {
  CHF = 'CHF',
  EUR = 'EUR',
  USD = 'USD',
}

interface FormData {
  address: UserAddress;
}

interface PdfFormData {
  blockchain: Blockchain;
  currency: FiatCurrency;
  date: string;
}

export default function AccountScreen(): JSX.Element {
  const { translate, language } = useSettingsContext();
  const { getDetailTransactions, getUnassignedTransactions } = useTransaction();
  const { navigate } = useNavigation();
  const { isLoggedIn } = useSessionContext();
  const { user, isUserLoading, userAddresses } = useUserContext();
  const { getRef, getProfile } = useUser();
  const { width } = useWindowContext();
  const { canClose, isEmbedded } = useAppHandlingContext();
  const { isInitialized, setWallet } = useWalletContext();
  const { changeAddress } = useUserContext();
  const { startStep } = useKycHelper();
  const { rootRef } = useLayoutContext();
  const { call } = useApi();
  const [transactions, setTransactions] = useState<Partial<DetailTransaction>[]>();
  const [referral, setReferral] = useState<Referral | undefined>();
  const [profile, setProfile] = useState<UserProfile | undefined>();
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string>();
  const [showRecommendationModal, setShowRecommendationModal] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [pdfBlockchains, setPdfBlockchains] = useState<Blockchain[]>([]);
  const [confirmEditStep, setConfirmEditStep] = useState<KycStepName>();

  const recommendationsRef = useRef<HTMLHeadingElement>(null);
  useAnchor('recommendation', recommendationsRef, !isUserLoading && !isDataLoading);

  const isKycLevel50 = user && user.kyc.level >= 50;

  useUserGuard('/login');

  const {
    control,
    formState: { errors },
    setValue,
  } = useForm<FormData>();

  const {
    control: pdfControl,
    formState: { errors: pdfErrors },
    handleSubmit: handlePdfSubmit,
    setValue: setPdfValue,
    reset: resetPdfForm,
  } = useForm<PdfFormData>();

  const selectedAddress = useWatch({ control, name: 'address' });
  const selectedPdfBlockchain = useWatch({ control: pdfControl, name: 'blockchain' });
  const selectedPdfCurrency = useWatch({ control: pdfControl, name: 'currency' });
  const selectedPdfDate = useWatch({ control: pdfControl, name: 'date' });

  const supportedBlockchains = selectedAddress?.blockchains.filter((b) => pdfBlockchains.includes(b)) ?? [];
  const canDownloadPdf = supportedBlockchains.length > 0;

  useEffect(() => {
    if (!isUserLoading && isLoggedIn) {
      loadInitialData();
      if (user?.activeAddress) {
        setValue('address', user.activeAddress);
      }
    }
  }, [user?.activeAddress, isUserLoading, isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) loadTransactions();
  }, [isLoggedIn]);

  useEffect(() => {
    loadPdfBlockchains();
  }, []);

  useEffect(() => {
    const nextAddress = selectedAddress?.address;
    if (nextAddress && user?.activeAddress?.address !== nextAddress && !isUserLoading) {
      changeAddress(nextAddress)
        .then(() => setWallet())
        .catch(() => {
          // ignore errors
        });
    }
  }, [selectedAddress, user?.activeAddress, !isUserLoading]);

  async function loadPdfBlockchains(): Promise<void> {
    return call<Blockchain[]>({ url: 'balance/pdf/blockchains', method: 'GET' })
      .then(setPdfBlockchains)
      .catch(() => {
        // ignore errors
      });
  }

  async function loadInitialData(): Promise<void> {
    setIsDataLoading(true);

    try {
      await Promise.allSettled([loadReferral(), loadProfile()]);
    } finally {
      setIsDataLoading(false);
    }
  }

  async function loadReferral(): Promise<void> {
    return getRef()
      .then(setReferral)
      .catch(() => {
        // ignore errors
      });
  }

  async function loadProfile(): Promise<void> {
    return getProfile()
      .then(setProfile)
      .catch(() => {
        // ignore errors
      });
  }

  async function loadTransactions(): Promise<void> {
    return Promise.all([getDetailTransactions(), getUnassignedTransactions()])
      .then((txs) => {
        const sorted = txs
          .flat()
          .sort((a, b) => (new Date(b.date) > new Date(a.date) ? 1 : -1))
          .slice(0, 5) as DetailTransaction[];
        setTransactions(
          sorted.map((t) => ({
            id: t.id,
            uid: t.uid,
            inputAsset: t.inputAsset,
            inputAmount: t.inputAmount,
            outputAsset: t.outputAsset,
            outputAmount: t.outputAmount,
            date: t.date,
          })),
        );
      })
      .catch(() => {
        // ignore errors
      });
  }

  function openPdfModal(): void {
    setPdfError(undefined);

    setPdfValue('blockchain', supportedBlockchains[0]);
    setPdfValue('currency', FiatCurrency.CHF);
    setPdfValue('date', new Date().toISOString().split('T')[0]);

    setShowPdfModal(true);
  }

  function closePdfModal(): void {
    setShowPdfModal(false);
    resetPdfForm();
    setPdfError(undefined);
  }

  async function downloadBalancePdf(data: PdfFormData): Promise<void> {
    if (!selectedAddress) return;

    const blockchain = supportedBlockchains.length === 1 ? supportedBlockchains[0] : data.blockchain;
    if (!blockchain) return;

    setIsPdfLoading(true);
    setPdfError(undefined);

    try {
      const params = new URLSearchParams({
        address: selectedAddress.address,
        blockchain: blockchain,
        currency: data.currency,
        date: data.date,
        language: language?.symbol ?? 'EN',
      });

      const response = await call<PdfDocument>({
        url: `balance/pdf?${params.toString()}`,
        method: 'GET',
      });

      const filename = `${data.date}_DFX_Balance_Report_${blockchain}.pdf`;
      downloadPdfFromString(response.pdfData, filename);
      closePdfModal();
    } catch (e) {
      setPdfError((e as ApiError).message ?? 'Unknown error');
    } finally {
      setIsPdfLoading(false);
    }
  }

  const transactionItems = transactions?.map((t) => ({
    label: formatSwissDateTimeWithSeconds(t.date as Date),
    text: `${t.inputAsset ? `${t.inputAmount ?? ''} ${t.inputAsset}` : ''} ${
      t.inputAsset && t.outputAsset ? ' → ' : ''
    } ${t.outputAsset ? `${t.outputAmount ?? ''} ${t.outputAsset}` : ''}`,
    icon: IconVariant.ARROW_RIGHT,
    onClick: () => navigate(`/tx/${t.id ?? t.uid}`),
  }));

  const referralCode = referral?.code ?? '';
  const referralItems = referral?.code
    ? [
        { label: translate('screens/home', 'Volume'), text: Utils.formatAmount(referral.volume) + ' EUR' },
        { label: translate('screens/home', 'Credit'), text: Utils.formatAmount(referral.credit) + ' EUR' },
        {
          label: translate('screens/home', 'Paid credit'),
          text: Utils.formatAmount(referral.paidCredit) + ' EUR',
        },
        { label: translate('screens/home', 'User count'), text: referral.userCount.toString() },
        { label: translate('screens/home', 'Active user count'), text: referral.activeUserCount.toString() },
      ]
    : [];

  const totalVolumeItems = user && [
    { label: translate('navigation/links', 'Buy'), value: user.volumes.buy.total },
    { label: translate('navigation/links', 'Sell'), value: user.volumes.sell.total },
    { label: translate('navigation/links', 'Swap'), value: user.volumes.swap.total },
  ];

  const annualVolumeItems = user && [
    { label: translate('navigation/links', 'Buy'), value: user.volumes.buy.annual },
    { label: translate('navigation/links', 'Sell'), value: user.volumes.sell.annual },
    { label: translate('navigation/links', 'Swap'), value: user.volumes.swap.annual },
  ];

  const totalVolumeSum = totalVolumeItems?.reduce((acc, item) => acc + item.value, 0);
  const annualVolumeSum = annualVolumeItems?.reduce((acc, item) => acc + item.value, 0);

  const confirmEditStepLabels: Record<string, string> = {
    [KycStepName.PHONE_CHANGE]: translate('screens/home', 'Change phone number'),
    [KycStepName.ADDRESS_CHANGE]: translate('screens/home', 'Change address'),
    [KycStepName.NAME_CHANGE]: translate('screens/home', 'Change name'),
  };

  const title = confirmEditStep
    ? confirmEditStepLabels[confirmEditStep]
    : showPdfModal
      ? translate('screens/home', 'PDF Download Address Report')
      : showRecommendationModal
        ? translate('screens/recommendation', 'Create Invitation')
        : isEmbedded
          ? translate('screens/home', 'DFX services')
          : translate('screens/home', 'Account');
  const hasBackButton = (canClose && !isEmbedded) || showPdfModal || showRecommendationModal || !!confirmEditStep;
  const onBack = confirmEditStep
    ? () => setConfirmEditStep(undefined)
    : showPdfModal
      ? closePdfModal
      : showRecommendationModal
        ? () => setShowRecommendationModal(false)
        : undefined;
  const image = 'https://dfx.swiss/images/app/berge.jpg';

  useLayoutOptions({ title, backButton: hasBackButton, onBack });

  const confirmEditStepMessages: Record<string, string> = {
    [KycStepName.PHONE_CHANGE]: translate('screens/home', 'Do you really want to change your phone number?'),
    [KycStepName.ADDRESS_CHANGE]: translate('screens/home', 'Do you really want to change your address?'),
    [KycStepName.NAME_CHANGE]: translate('screens/home', 'Do you really want to change your name?'),
  };

  return (
    <>
      {!isInitialized || !isLoggedIn || isUserLoading || isDataLoading ? (
        <div className="mt-4">
          <StyledLoadingSpinner size={SpinnerSize.LG} />
        </div>
      ) : confirmEditStep ? (
        <ConfirmationOverlay
          message={confirmEditStepMessages[confirmEditStep]}
          cancelLabel={translate('general/actions', 'Cancel')}
          confirmLabel={translate('general/actions', 'Continue')}
          onCancel={() => setConfirmEditStep(undefined)}
          onConfirm={async () => {
            startStep(confirmEditStep);
            setConfirmEditStep(undefined);
          }}
        />
      ) : (
        <StyledVerticalStack gap={4} center full marginY={4} className="z-10">
          {/* Profile Data */}
          {profile && (profile.firstName || profile.lastName || profile.mail || profile.address) && (
            <StyledDataTable
              label={translate('screens/home', 'Profile')}
              alignContent={AlignContent.RIGHT}
              showBorder
              minWidth={false}
            >
              {profile.mail && (
                <StyledDataTableRow label={translate('screens/home', 'Email')}>
                  <div className="flex items-center gap-2">
                    {profile.mail}
                    <StyledIconButton
                      icon={IconVariant.EDIT}
                      onClick={() => navigate('/account/mail', { setRedirect: true })}
                      inline
                    />
                  </div>
                </StyledDataTableRow>
              )}
              {profile.phone && (
                <StyledDataTableRow label={translate('screens/kyc', 'Phone number')}>
                  <div className="flex items-center gap-2">
                    {profile.phone}
                    <StyledIconButton
                      icon={IconVariant.EDIT}
                      onClick={() => setConfirmEditStep(KycStepName.PHONE_CHANGE)}
                      inline
                    />
                  </div>
                </StyledDataTableRow>
              )}
              {(profile.firstName || profile.lastName) && (
                <StyledDataTableRow label={translate('screens/home', 'Name')}>
                  <div className="flex items-center gap-2">
                    {[profile.firstName, profile.lastName].filter(Boolean).join(' ')}
                    <StyledIconButton
                      icon={IconVariant.EDIT}
                      onClick={() => setConfirmEditStep(KycStepName.NAME_CHANGE)}
                      inline
                    />
                  </div>
                </StyledDataTableRow>
              )}
              {profile.address && (
                <StyledDataTableRow label={translate('screens/home', 'Address')}>
                  <div className="flex items-center gap-2">
                    {formatAddress(profile.address)}
                    <StyledIconButton
                      icon={IconVariant.EDIT}
                      onClick={() => setConfirmEditStep(KycStepName.ADDRESS_CHANGE)}
                      inline
                    />
                  </div>
                </StyledDataTableRow>
              )}
              {profile.organizationName && (
                <StyledDataTableRow label={translate('screens/home', 'Organization')}>
                  {profile.organizationName}
                </StyledDataTableRow>
              )}
            </StyledDataTable>
          )}

          {/* User Data */}
          <StyledDataTable
            label={translate('screens/home', 'Activity')}
            alignContent={AlignContent.RIGHT}
            showBorder
            minWidth={false}
          >
            <StyledDataTableExpandableRow
              label={translate('screens/home', 'Total trading volume')}
              expansionItems={
                totalVolumeItems?.map(({ label, value }) => ({ label, text: Utils.formatAmount(value) + ' CHF' })) ?? []
              }
            >
              {Utils.formatAmount(totalVolumeSum) + ' CHF'}
            </StyledDataTableExpandableRow>
            <StyledDataTableExpandableRow
              label={translate('screens/home', 'Annual trading volume')}
              expansionItems={
                annualVolumeItems?.map(({ label, value }) => ({ label, text: Utils.formatAmount(value) + ' CHF' })) ??
                []
              }
            >
              {Utils.formatAmount(annualVolumeSum) + ' CHF'}
            </StyledDataTableExpandableRow>
            {transactionItems && transactionItems.length > 0 && (
              <StyledDataTableExpandableRow
                label={translate('screens/home', 'Latest transactions')}
                expansionItems={transactionItems}
              />
            )}
          </StyledDataTable>

          <KycStatus />

          {userAddresses.length > 0 && (
            <>
              <div className="border-b my-2.5 border-dfxGray-400 w-full"></div>

              <h2 className="text-dfxBlue-800 text-lg font-semibold w-full">
                {translate('screens/home', 'Active address')}
              </h2>

              <Form control={control} errors={errors}>
                <StyledDropdown
                  name="address"
                  rootRef={rootRef}
                  placeholder={translate('general/actions', 'Select') + '...'}
                  items={userAddresses.sort(sortAddressesByBlockchain)}
                  labelFunc={(item) => displayWalletAddress(addressLabel(item), { width })}
                  descriptionFunc={(item) => item.label ?? item.wallet}
                  forceEnable={user?.activeAddress === undefined}
                />
              </Form>

              {canDownloadPdf && (
                <StyledButton
                  label={translate('screens/home', 'PDF Download Address Report')}
                  onClick={openPdfModal}
                  width={StyledButtonWidth.FULL}
                  color={StyledButtonColor.STURDY_WHITE}
                />
              )}

              {referral?.code && (
                <StyledDataTable
                  label={translate('screens/home', 'Referral')}
                  alignContent={AlignContent.RIGHT}
                  showBorder
                  minWidth={false}
                >
                  <StyledDataTableRow label={translate('screens/home', 'Referral link')}>
                    {referral.code}
                    <CopyButton
                      onCopy={() =>
                        copy(
                          url({
                            base: Urls.referral,
                            params: new URLSearchParams({ code: referralCode }),
                          }),
                        )
                      }
                    />
                  </StyledDataTableRow>
                  <StyledDataTableRow label={translate('screens/home', 'Referral commission')}>
                    {(referral.commission * 100).toFixed(2)}%
                  </StyledDataTableRow>
                  <StyledDataTableExpandableRow
                    label={translate('screens/home', 'Your referral stats')}
                    expansionItems={referralItems}
                  />
                </StyledDataTable>
              )}
            </>
          )}

          {isKycLevel50 && (
            <>
              <div className="border-b my-2.5 border-dfxGray-400 w-full"></div>

              <h2 ref={recommendationsRef} className="text-dfxBlue-800 text-lg font-semibold w-full">
                {translate('screens/recommendation', 'Recommendations')}
              </h2>

              <RecommendationsSection
                showRecommendationModal={showRecommendationModal}
                setShowRecommendationModal={setShowRecommendationModal}
              />
            </>
          )}

          {/* Spacer for background image overlap */}
          <div className="h-32" />
        </StyledVerticalStack>
      )}
      <div className="absolute bottom-0 w-full pointer-events-none">
        <img src={image} className="w-full" />
      </div>

      {/* PDF Download Modal */}
      <Modal isOpen={showPdfModal} onClose={closePdfModal}>
        <StyledVerticalStack gap={6} full>
          <Form control={pdfControl} errors={pdfErrors} onSubmit={handlePdfSubmit(downloadBalancePdf)}>
            <StyledVerticalStack gap={4} full>
              {supportedBlockchains.length > 1 && (
                <StyledDropdown<Blockchain>
                  name="blockchain"
                  rootRef={rootRef}
                  label={translate('screens/home', 'Blockchain')}
                  placeholder={translate('general/actions', 'Select') + '...'}
                  items={supportedBlockchains}
                  labelFunc={(item) => item}
                  full
                />
              )}

              <StyledDropdown<FiatCurrency>
                name="currency"
                rootRef={rootRef}
                label={translate('screens/home', 'Currency')}
                placeholder={translate('general/actions', 'Select') + '...'}
                items={Object.values(FiatCurrency)}
                labelFunc={(item) => item}
                full
              />

              <StyledInput name="date" type="date" label={translate('screens/home', 'Date')} full />

              {pdfError && <p className="text-dfxRed-100 text-sm">{pdfError}</p>}

              <StyledButton
                type="submit"
                label={translate('general/actions', 'Download')}
                onClick={handlePdfSubmit(downloadBalancePdf)}
                width={StyledButtonWidth.FULL}
                isLoading={isPdfLoading}
                disabled={
                  (supportedBlockchains.length > 1 && !selectedPdfBlockchain) ||
                  !selectedPdfCurrency ||
                  !selectedPdfDate
                }
              />

              <StyledButton
                label={translate('general/actions', 'Cancel')}
                onClick={closePdfModal}
                width={StyledButtonWidth.FULL}
                color={StyledButtonColor.STURDY_WHITE}
              />
            </StyledVerticalStack>
          </Form>
        </StyledVerticalStack>
      </Modal>
    </>
  );
}
