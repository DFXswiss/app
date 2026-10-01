import { ApiError, useApi, useAuthContext, UserAddress, useUserContext } from '@dfx.swiss/react';
import {
  Form,
  SpinnerSize,
  StyledButton,
  StyledButtonWidth,
  StyledDropdown,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ErrorHint } from 'src/components/error-hint';
import { ConnectProps } from 'src/components/home/connect-shared';
import { addressLabel } from 'src/config/labels';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useWalletContext } from 'src/contexts/wallet.context';
import { useWindowContext } from 'src/contexts/window.context';
import { useAppParams } from 'src/hooks/app-params.hook';
import { useReportDisplayedError } from 'src/hooks/report-displayed-error.hook';
import { KnownRejectionType } from 'src/util/known-rejections';
import { blankedAddress, sortAddressesByBlockchain } from 'src/util/utils';

export const CustodyAssets = ['ZCHF', 'FPS', 'DEPSPresale'];

// The API rejected the switch for this session, so another attempt cannot succeed.
const SwitchRejectionStatusCodes = [400, 401, 403, 404];

interface FormData {
  address: UserAddress;
}

export default function ConnectAddress({ onLogin, onCancel }: ConnectProps): JSX.Element {
  const { translate } = useSettingsContext();
  const { user, isUserLoading, hasAddress, userAddresses } = useUserContext();
  const { width } = useWindowContext();
  const { setWallet, setSession } = useWalletContext();
  const { changeAddress } = useUserContext();
  const { session } = useAuthContext();
  const { call } = useApi();
  const { assetOut } = useAppParams();
  const { rootRef } = useLayoutContext();

  const sessionHasNoAddress = !session?.address;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [switchError, setSwitchError] = useState<{ message: string; isRejection: boolean }>();
  useReportDisplayedError(switchError?.isRejection ? switchError.message : undefined, KnownRejectionType);
  const attemptedAddress = useRef<string>();

  const isCustodySignup = !hasAddress && CustodyAssets.includes(assetOut ?? '');

  const {
    control,
    formState: { errors },
    setValue,
    resetField,
  } = useForm<FormData>();

  const selectedAddress = useWatch({ control, name: 'address' });

  const preselectedAddress = user?.activeAddress ?? (userAddresses.length === 1 ? userAddresses[0] : undefined);

  useEffect(() => {
    if (preselectedAddress) setValue('address', preselectedAddress);
  }, [preselectedAddress?.address]);

  useEffect(() => {
    const address = selectedAddress?.address;
    const isAddressChange = user?.activeAddress?.address !== address;
    if (!address || !(isAddressChange || sessionHasNoAddress) || isUserLoading) return;
    if (attemptedAddress.current === address) return;

    attemptedAddress.current = address;
    setSwitchError(undefined);
    setIsLoading(true);
    changeAddress(address)
      .then(() => {
        setWallet();
        onLogin();
      })
      .catch((e: ApiError) => {
        // wait for the user to select an address again instead of retrying
        attemptedAddress.current = undefined;
        resetField('address');
        setSwitchError({
          message: e.message ?? 'Unknown error',
          isRejection: SwitchRejectionStatusCodes.includes(e.statusCode),
        });
        setIsLoading(false);
      });
  }, [selectedAddress, user?.activeAddress, isUserLoading, sessionHasNoAddress]);

  useEffect(() => {
    if (!isUserLoading && isCustodySignup) {
      call<{ accessToken: string }>({
        url: 'custody',
        method: 'POST',
        data: {
          addressType: 'EVM',
        },
      })
        .then(({ accessToken }) => {
          setSession(accessToken);
          onLogin();
        })
        .catch((error: ApiError) => setError(error.message ?? 'Unknown error'));
    }
  }, [assetOut, hasAddress, isUserLoading]);

  return (isLoading || isUserLoading || isCustodySignup) && !error ? (
    <StyledLoadingSpinner size={SpinnerSize.LG} />
  ) : error ? (
    <div>
      <ErrorHint message={error} />
    </div>
  ) : (
    <StyledVerticalStack gap={4} center full marginY={4} className="z-10">
      {switchError &&
        (switchError.isRejection ? (
          <p className="text-dfxRed-100">
            {translate(
              'screens/home',
              'This address could not be selected. Please use another address or contact our support.',
            )}
          </p>
        ) : (
          <ErrorHint message={switchError.message} />
        ))}
      {userAddresses.length > 0 && (
        <>
          <p className="text-dfxGray-700">
            {translate('screens/home', 'Please select an address or add a new one to continue.')}
          </p>

          <Form control={control} errors={errors}>
            <StyledDropdown
              rootRef={rootRef}
              name="address"
              placeholder={translate('general/actions', 'Select') + '...'}
              items={userAddresses.sort(sortAddressesByBlockchain)}
              labelFunc={(item) => blankedAddress(addressLabel(item), { width })}
              descriptionFunc={(item) => item.label ?? item.wallet}
              forceEnable={user?.activeAddress === undefined || sessionHasNoAddress}
            />
          </Form>
        </>
      )}
      <StyledButton
        label={translate('general/actions', 'Add new address')}
        width={StyledButtonWidth.FULL}
        onClick={onCancel}
      />
    </StyledVerticalStack>
  );
}
