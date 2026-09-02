import { Form, StyledDropdown } from '@dfx.swiss/react-components';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useSettingsContext } from 'src/contexts/settings.context';
import { CustodyAccount } from 'src/dto/safe.dto';
import { canActOn } from 'src/util/safe-account';

interface AccountSelectorFormData {
  account: CustodyAccount;
}

interface AccountSelectorProps {
  accounts: CustodyAccount[];
  selected: CustodyAccount;
  onSelect: (account: CustodyAccount) => void;
}

export function AccountSelector({ accounts, selected, onSelect }: AccountSelectorProps): JSX.Element | null {
  const { translate } = useSettingsContext();
  const {
    control,
    setValue,
    formState: { errors },
  } = useForm<AccountSelectorFormData>({ defaultValues: { account: selected } });
  const selectedValue = useWatch({ control, name: 'account' });

  useEffect(() => {
    setValue('account', selected);
  }, [selected, setValue]);

  useEffect(() => {
    if (selectedValue && selectedValue !== selected) onSelect(selectedValue);
  }, [selectedValue, selected, onSelect]);

  if (accounts.length <= 1) return null;

  return (
    <Form control={control} errors={errors}>
      <StyledDropdown<CustodyAccount>
        name="account"
        label={translate('screens/safe', 'Account')}
        smallLabel
        items={accounts}
        labelFunc={(account) => account.title}
        // Labelled by the same predicate the screen acts on: View only when the caller cannot
        // act (Read, own or foreign). A write mandate is no longer View only, because orders
        // now go through the account resource.
        descriptionFunc={(account) => (canActOn(account) ? '' : translate('screens/safe', 'View only'))}
      />
    </Form>
  );
}
