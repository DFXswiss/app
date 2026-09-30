import { ApiError } from '@dfx.swiss/react';
import { StyledButton, StyledButtonWidth, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useState } from 'react';
import { useSettingsContext } from '../contexts/settings.context';
import { ErrorHint } from './error-hint';

interface DeactivatedAddressProps {
  address: string;
  onReactivate: (address: string) => Promise<void>;
}

export function DeactivatedAddress({ address, onReactivate }: DeactivatedAddressProps): JSX.Element {
  const { translate } = useSettingsContext();
  const [isReactivating, setIsReactivating] = useState(false);
  const [error, setError] = useState<string>();

  function reactivate(): void {
    setIsReactivating(true);
    setError(undefined);
    onReactivate(address)
      .catch((e: ApiError) => setError(e.message ?? 'Unknown error'))
      .finally(() => setIsReactivating(false));
  }

  return (
    <StyledVerticalStack gap={6} full center marginY={4}>
      <p className="text-dfxBlue-800">{translate('screens/home', 'This address is deactivated in DFX.')}</p>
      <StyledButton
        label={translate('general/actions', 'Reactivate address')}
        onClick={reactivate}
        isLoading={isReactivating}
        width={StyledButtonWidth.FULL}
      />
      {error && <ErrorHint message={error} />}
    </StyledVerticalStack>
  );
}
