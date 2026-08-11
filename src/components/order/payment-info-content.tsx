import { CustodyOrderPaymentInfo, Utils } from '@dfx.swiss/react';
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
import { useSettingsContext } from '../../contexts/settings.context';
import { useClipboard } from '../../hooks/clipboard.hook';
import { PaymentQrCode } from '../payment/payment-qr-code';

interface PaymentInfoContentProps {
  info: CustodyOrderPaymentInfo;
}

export function PaymentInfoContent({ info }: PaymentInfoContentProps): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <>
      <StyledVerticalStack gap={3}>
        <h2 className="text-dfxBlue-800 text-center">{translate('screens/payment', 'Payment Information')}</h2>

        <StyledInfoText iconColor={IconColor.BLUE}>
          {info.buyInfos?.remittanceInfo
            ? translate(
                'screens/buy',
                'Please transfer the purchase amount using this information via your banking application. The remittance info is important!',
              )
            : translate(
                'screens/buy',
                'Please transfer the purchase amount using this information via your banking application. This IBAN is unique to this asset, no remittance info is required.',
              )}
        </StyledInfoText>

        {/* The invoice tab needs a transaction request to fetch; an order priced without one has none. */}
        {info.paymentRequest && info.id !== undefined ? (
          <StyledTabContainer
            tabs={[
              { title: translate('screens/payment', 'Text'), content: <PaymentInformationText info={info} /> },
              {
                title: translate('screens/payment', 'QR Code'),
                content: <PaymentQrCode value={info.paymentRequest} txId={info.id} />,
              },
            ]}
            darkTheme
            spread
            small
          />
        ) : (
          <PaymentInformationText info={info} />
        )}
      </StyledVerticalStack>
    </>
  );
}

function PaymentInformationText({ info }: PaymentInfoContentProps): JSX.Element {
  const { translate } = useSettingsContext();
  const { copy } = useClipboard();
  const { buyInfos } = info;

  return (
    <>
      <StyledDataTable alignContent={AlignContent.RIGHT} showBorder minWidth={false}>
        <StyledDataTableRow
          label={translate('screens/payment', 'Amount in {{currency}}', { currency: info.sourceAsset })}
        >
          {info.amount}
          <CopyButton onCopy={() => copy(`${info.amount}`)} />
        </StyledDataTableRow>
        <StyledDataTableRow label={translate('screens/payment', 'IBAN')}>
          <div>
            <p>{Utils.formatIban(buyInfos?.iban)}</p>
            {buyInfos?.sepaInstant && (
              <div className="text-white">
                <DfxIcon icon={IconVariant.SEPA_INSTANT} color={IconColor.RED} />
              </div>
            )}
          </div>
          <CopyButton onCopy={() => copy(buyInfos?.iban)} />
        </StyledDataTableRow>
        <StyledDataTableRow label={translate('screens/payment', 'BIC')}>
          {buyInfos?.bic}
          <CopyButton onCopy={() => copy(buyInfos?.bic)} />
        </StyledDataTableRow>
        {buyInfos?.remittanceInfo && (
          <StyledDataTableRow
            label={translate('screens/payment', 'Remittance info')}
            infoText={translate(
              'screens/buy',
              'The remittance info remains identical for the selected asset and can be used for recurring payments and standing orders',
            )}
          >
            {buyInfos.remittanceInfo}
            <CopyButton onCopy={() => copy(buyInfos.remittanceInfo)} />
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
            {buyInfos?.name}
            <CopyButton onCopy={() => copy(`${buyInfos?.name}`)} />
          </StyledDataTableRow>
          <StyledDataTableRow label={translate('screens/buy', 'Address')}>
            {`${buyInfos?.street} ${buyInfos?.number}`}
            <CopyButton onCopy={() => copy(`${buyInfos?.street} ${buyInfos?.number}`)} />
          </StyledDataTableRow>
          <StyledDataTableRow label={translate('screens/kyc', 'ZIP code')}>
            {buyInfos?.zip}
            <CopyButton onCopy={() => copy(`${buyInfos?.zip}`)} />
          </StyledDataTableRow>
          <StyledDataTableRow label={translate('screens/kyc', 'City')}>
            {buyInfos?.city}
            <CopyButton onCopy={() => copy(`${buyInfos?.city}`)} />
          </StyledDataTableRow>
          <StyledDataTableRow label={translate('screens/kyc', 'Country')}>
            {buyInfos?.country}
            <CopyButton onCopy={() => copy(`${buyInfos?.country}`)} />
          </StyledDataTableRow>
        </StyledDataTable>
      </div>
    </>
  );
}
