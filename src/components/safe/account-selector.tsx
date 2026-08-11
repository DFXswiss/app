import { CustodyAccount } from '@dfx.swiss/react';
import { Form, StyledDropdown } from '@dfx.swiss/react-components';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useSettingsContext } from 'src/contexts/settings.context';
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
        // Labelled by the same predicate the screen acts on: a mandate over someone else's
        // account cannot transact either, and an entry that looks fully usable but silently
        // drops the transaction area on selection is worse than one that says so upfront.
        descriptionFunc={(account) => (canActOn(account) ? '' : translate('screens/safe', 'View only'))}
      />
    </Form>
  );
}
