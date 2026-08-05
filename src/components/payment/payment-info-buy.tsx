import { Buy, Utils } from '@dfx.swiss/react';
import {
  AlignContent,
  CopyButton,
  DfxIcon,
  IconColor,
  IconVariant,
  StyledDataTable,
  StyledDataTableRow,
  StyledInfoText,
  StyledTabContainer,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useState } from 'react';
import { useSettingsContext } from '../../contexts/settings.context';
import { useClipboard } from '../../hooks/clipboard.hook';
import {
  FRICK_EUR_COLLECTION_IBAN,
  canOfferCollectionIban,
  toCollectionIbanGiroCode,
} from '../../util/personal-iban';
import { PaymentQrCode } from './payment-qr-code';

interface PaymentInformationContentProps {
  info: Buy;
  /**
   * Show the Bank row only for a verified Bank Frick personal-IBAN offer.
   * Must not be derived from generic `isPersonalIban` — legacy Yapeal virtual IBANs also set
   * that flag, and selector-free customers must keep the pre-change presentation.
   */
  showBank?: boolean;
}

interface PaymentInformationTextProps extends PaymentInformationContentProps {
  showCollectionIban: boolean;
  offerCollectionIban: boolean;
  onToggleCollectionIban: () => void;
}

export function PaymentInformationContent({ info, showBank }: PaymentInformationContentProps): JSX.Element {
  const { translate } = useSettingsContext();
  const [showCollectionIban, setShowCollectionIban] = useState(false);
  const offerCollectionIban = canOfferCollectionIban(info);

  const textContent = (
    <PaymentInformationText
      info={info}
      showBank={showBank}
      showCollectionIban={showCollectionIban}
      offerCollectionIban={offerCollectionIban}
      onToggleCollectionIban={() => setShowCollectionIban((current) => !current)}
    />
  );

  // Same expression as the Text-branch display: QR image and invoice must not diverge.
  const showCollectionAccount = offerCollectionIban && showCollectionIban;

  const qrTabContent = (() => {
    if (!info.paymentRequest) return null;
    if (!showCollectionAccount) {
      return <PaymentQrCode value={info.paymentRequest} txId={info.id} />;
    }

    const collectionGiroCode =
      info.iban !== undefined ? toCollectionIbanGiroCode(info.paymentRequest, info.iban) : undefined;
    if (collectionGiroCode) {
      return <PaymentQrCode value={collectionGiroCode} txId={info.id} collectionAccount />;
    }

    return (
      <StyledInfoText iconColor={IconColor.BLUE}>
        {translate(
          'screens/payment',
          'No QR code is available for the collection account. Please enter the IBAN and the remittance info manually.',
        )}
      </StyledInfoText>
    );
  })();

  return (
    <>
      <StyledVerticalStack gap={3}>
        <h2 className="text-dfxBlue-800 text-center">{translate('screens/payment', 'Payment Information')}</h2>

        <StyledInfoText iconColor={IconColor.BLUE}>
          {info.remittanceInfo
            ? translate(
                'screens/buy',
                'Please transfer the purchase amount using this information via your banking application. The remittance info is important!',
              )
            : translate(
                'screens/buy',
                'Please transfer the purchase amount using this information via your banking application. This IBAN is unique to this asset, no remittance info is required.',
              )}
        </StyledInfoText>

        {info.paymentRequest ? (
          <StyledTabContainer
            tabs={[
              {
                title: translate('screens/payment', 'Text'),
                content: textContent,
              },
              {
                title: translate('screens/payment', 'QR Code'),
                content: qrTabContent,
              },
            ]}
            darkTheme
            spread
            small
          />
        ) : (
          textContent
        )}
      </StyledVerticalStack>
    </>
  );
}

function PaymentInformationText({
  info,
  showBank,
  showCollectionIban,
  offerCollectionIban,
  onToggleCollectionIban,
}: PaymentInformationTextProps): JSX.Element {
  const { translate } = useSettingsContext();
  const { copy } = useClipboard();
  const displayedIban = offerCollectionIban && showCollectionIban ? FRICK_EUR_COLLECTION_IBAN : info.iban;

  return (
    <>
      <StyledDataTable alignContent={AlignContent.RIGHT} showBorder minWidth={false}>
        <StyledDataTableRow
          label={translate('screens/payment', 'Amount in {{currency}}', { currency: info.currency.name })}
        >
          {info.amount}
          <CopyButton onCopy={() => copy(`${info.amount}`)} />
        </StyledDataTableRow>
        <StyledDataTableRow
          label={translate('screens/payment', 'IBAN')}
          infoText={
            offerCollectionIban
              ? showCollectionIban
                ? translate(
                    'screens/payment',
                    'This is the collection account of DFX AG. Please be sure to enter the remittance info below, otherwise we cannot assign your payment.',
                  )
                : translate(
                    'screens/payment',
                    'Your bank does not accept this IBAN? Use the swap symbol to switch to our collection account.',
                  )
              : undefined
          }
        >
          <div>
            <p>{Utils.formatIban(displayedIban)}</p>
            {info.sepaInstant && (
              <div className="text-white">
                <DfxIcon icon={IconVariant.SEPA_INSTANT} color={IconColor.RED} />
              </div>
            )}
          </div>
          {offerCollectionIban && (
            <button
              type="button"
              className="inline-block flex h-full align-top hover:scale-110 transition ease-in-out delay-100 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dfxRed-100"
              onClick={onToggleCollectionIban}
              aria-pressed={showCollectionIban}
              aria-label={translate(
                'screens/payment',
                showCollectionIban ? 'Show personal IBAN' : 'Show collection IBAN',
              )}
              title={translate('screens/payment', showCollectionIban ? 'Show personal IBAN' : 'Show collection IBAN')}
            >
              <DfxIcon icon={IconVariant.SWAP} />
            </button>
          )}
          <CopyButton onCopy={() => copy(displayedIban)} />
        </StyledDataTableRow>
        <StyledDataTableRow label={translate('screens/payment', 'BIC')}>
          {info.bic}
          <CopyButton onCopy={() => copy(info.bic)} />
        </StyledDataTableRow>
        {showBank && info.bank && (
          <StyledDataTableRow label={translate('screens/payment', 'Bank')}>
            {info.bank}
            <CopyButton onCopy={() => copy(info.bank)} />
          </StyledDataTableRow>
        )}
        {info.remittanceInfo && (
          <StyledDataTableRow
            label={translate('screens/payment', 'Remittance info')}
            infoText={translate(
              'screens/buy',
              'The remittance info remains identical for the selected asset and can be used for recurring payments and standing orders',
            )}
          >
            {info.remittanceInfo}
            <CopyButton onCopy={() => copy(info.remittanceInfo)} />
          </StyledDataTableRow>
        )}
      </StyledDataTable>

      <div className="mt-3">
        <StyledDataTable
          label={translate('screens/payment', 'Recipient')}
          alignContent={AlignContent.RIGHT}
          showBorder
          minWidth={false}
        >
          <StyledDataTableRow label={translate('screens/buy', 'Name')}>
            {info.name}
            <CopyButton onCopy={() => copy(`${info.name}`)} />
          </StyledDataTableRow>
          <StyledDataTableRow label={translate('screens/buy', 'Address')}>
            {`${info.street} ${info.number}`}
            <CopyButton onCopy={() => copy(`${info.street} ${info.number}`)} />
          </StyledDataTableRow>
          <StyledDataTableRow label={translate('screens/kyc', 'ZIP code')}>
            {info.zip}
            <CopyButton onCopy={() => copy(`${info.zip}`)} />
          </StyledDataTableRow>
          <StyledDataTableRow label={translate('screens/kyc', 'City')}>
            {info.city}
            <CopyButton onCopy={() => copy(`${info.city}`)} />
          </StyledDataTableRow>
          <StyledDataTableRow label={translate('screens/kyc', 'Country')}>
            {info.country}
            <CopyButton onCopy={() => copy(`${info.country}`)} />
          </StyledDataTableRow>
        </StyledDataTable>
      </div>
    </>
  );
}
