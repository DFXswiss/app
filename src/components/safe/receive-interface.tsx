import { Asset, CustodyOrder, Utils, Validations } from '@dfx.swiss/react';
import {
  AlignContent,
  CopyButton,
  Form,
  IconColor,
  StyledButton,
  StyledButtonWidth,
  StyledDataTable,
  StyledDataTableExpandableRow,
  StyledDataTableRow,
  StyledInfoText,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import copy from 'copy-to-clipboard';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useOrderUIContext } from 'src/contexts/order-ui.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useWindowContext } from 'src/contexts/window.context';
import { SafeOperationType } from 'src/dto/safe.dto';
import { useBlockchain } from 'src/hooks/blockchain.hook';
import useDebounce from 'src/hooks/debounce.hook';
import { useSafe } from 'src/hooks/safe.hook';
import { Evm } from 'src/util/evm';
import { blankedAddress } from 'src/util/utils';
import { AssetInput } from '../order/asset-input';
import { QrBasic } from '../payment/qr-code';

interface ReceiveFormData {
  receiveAsset: Asset;
  receiveAmount?: string;
}

export const ReceiveInterface = () => {
  const { width } = useWindowContext();
  const { toString } = useBlockchain();
  const { translate, translateError } = useSettingsContext();
  const { setCompletionType } = useOrderUIContext();
  const { receiveableAssets, fetchReceiveInfo, confirmReceive } = useSafe();

  const [isLoading, setIsLoading] = useState(false);
  const [receiveAddress, setReceiveAddress] = useState<string>();
  const [_error, setError] = useState<string>();

  const {
    watch,
    control,
    formState: { errors, isValid },
  } = useForm<ReceiveFormData>({ mode: 'onChange' });

  const data = watch();
  const debouncedData = useDebounce(data, 500);

  const isReceiveDataValid = () => {
    return isValid && debouncedData?.receiveAsset && Number(debouncedData.receiveAmount) > 0;
  };

  useEffect(() => {
    if (isValid && debouncedData?.receiveAsset && debouncedData.receiveAmount) onCreateReceiveOrder(debouncedData);
  }, [isValid, debouncedData]);

  async function onCreateReceiveOrder(data: ReceiveFormData): Promise<void> {
    setError(undefined);
    setReceiveAddress(undefined);

    setIsLoading(true);
    fetchReceiveInfo({
      sourceAsset: data.receiveAsset,
      targetAsset: data.receiveAsset,
      sourceAmount: data.receiveAmount,
      targetAmount: undefined,
      paymentMethod: undefined,
      bankAccount: undefined,
      address: undefined,
    })
      .then((response: CustodyOrder) => {
        if (!response.paymentInfo.paymentRequest) throw new Error('No payment request received');
        setReceiveAddress(Evm.decodeUri(response.paymentInfo.paymentRequest)?.address);
      })
      .catch((err: any) => setError(err.message || 'Failed to create receive order'))
      .finally(() => setIsLoading(false));
  }

  const rules = Utils.createRules({
    receiveAsset: Validations.Required,
    receiveAmount: Validations.Required,
  });

  const handleConfirmReceive = () => {
    setCompletionType(SafeOperationType.RECEIVE);
    confirmReceive();
  };

  return (
    <Form control={control} rules={rules} errors={errors} hasFormElement={false} translate={translateError}>
      <StyledVerticalStack gap={4} full className="pt-2">
        <AssetInput
          control={control}
          name="receiveAsset"
          label={translate('screens/payment', 'Asset')}
          placeholder="0.00"
          availableItems={receiveableAssets ?? []}
          selectedItem={data.receiveAsset}
          assetRules={rules.receiveAsset}
          amountRules={rules.receiveAmount}
          balanceFunc={() => ''}
        />

        {data.receiveAsset && data.receiveAmount && receiveAddress && (
          <StyledVerticalStack gap={3} full>
            <h2 className="text-dfxBlue-800 text-center">{translate('screens/payment', 'Payment Information')}</h2>

            <StyledInfoText iconColor={IconColor.BLUE}>
              {translate('screens/safe', 'Send your {{asset}} to the address below to deposit into your DFX Safe', {
                asset: data.receiveAsset.name,
              })}
            </StyledInfoText>

            <StyledDataTable alignContent={AlignContent.RIGHT} showBorder minWidth={false}>
              <StyledDataTableExpandableRow
                label={translate('screens/safe', 'Receive Address')}
                expansionContent={
                  <div className="flex w-full items-center justify-center">
                    <div className="w-48 my-3">
                      <QrBasic data={receiveAddress} />
                    </div>
                  </div>
                }
              >
                <div className="flex items-center gap-2">
                  <span>{blankedAddress(receiveAddress, { width })}</span>
                  <CopyButton onCopy={() => copy(receiveAddress)} />
                </div>
              </StyledDataTableExpandableRow>

              <StyledDataTableRow label={translate('screens/sell', 'Blockchain')}>
                <p>{toString(data.receiveAsset.blockchain)}</p>
              </StyledDataTableRow>
            </StyledDataTable>
          </StyledVerticalStack>
        )}

        <div className="w-full">
          <StyledButton
            type="button"
            isLoading={isLoading}
            label={translate('general/actions', 'Next')}
            width={StyledButtonWidth.FULL}
            disabled={isLoading || !isReceiveDataValid()}
            onClick={handleConfirmReceive}
          />
        </div>
      </StyledVerticalStack>
    </Form>
  );
};
