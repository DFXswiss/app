import {
  ApiError,
  CreateSupportIssue,
  FundOrigin,
  InvestmentDate,
  KycLevel,
  Limit,
  ReceiveIbanStatus,
  SupportIssueReason,
  SupportIssueType,
  TransactionState,
  Utils,
  Validations,
  useBank,
  useBankAccountContext,
  useSessionContext,
  useSupportChatContext,
  useUserContext,
} from '@dfx.swiss/react';
import {
  Form,
  SpinnerSize,
  StyledButton,
  StyledButtonWidth,
  StyledDropdown,
  StyledFileUpload,
  StyledInput,
  StyledLink,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Trans } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { AddBankAccount } from 'src/components/payment/add-bank-account';
import { LimitRequestFields } from 'src/components/support-issue/limit-request-fields';
import { DefaultFileTypes } from 'src/config/file-types';
import { useLayoutContext } from 'src/contexts/layout.context';
import useDebounce from 'src/hooks/debounce.hook';
import { ErrorHint } from '../components/error-hint';
import { IssueReasonLabels, IssueTypeLabels } from '../config/labels';
import { useSettingsContext } from '../contexts/settings.context';
import { useKycLevelGuard, useUserGuard } from '../hooks/guard.hook';
import { useLayoutOptions } from '../hooks/layout-config.hook';
import { useNavigation } from '../hooks/navigation.hook';
import { blankedAddress, toBase64 } from '../util/utils';
import { TransactionList } from './transaction.screen';

const IssueReasons: { [t in SupportIssueType]: SupportIssueReason[] } = {
  [SupportIssueType.GENERIC_ISSUE]: [SupportIssueReason.OTHER],
  [SupportIssueType.TRANSACTION_ISSUE]: [
    SupportIssueReason.FUNDS_NOT_RECEIVED,
    SupportIssueReason.TRANSACTION_MISSING,
    SupportIssueReason.OTHER,
  ],
  [SupportIssueType.KYC_ISSUE]: [SupportIssueReason.OTHER],
  [SupportIssueType.LIMIT_REQUEST]: [SupportIssueReason.OTHER],
  [SupportIssueType.PARTNERSHIP_REQUEST]: [SupportIssueReason.OTHER],
  [SupportIssueType.NOTIFICATION_OF_CHANGES]: [SupportIssueReason.CIVIL_STATUS_CHANGED, SupportIssueReason.OTHER],
  [SupportIssueType.BUG_REPORT]: [SupportIssueReason.OTHER],
  [SupportIssueType.VERIFICATION_CALL]: [
    SupportIssueReason.REJECT_CALL,
    SupportIssueReason.REPEAT_CALL,
    SupportIssueReason.OTHER,
  ],
};

interface FormData {
  type: SupportIssueType;
  senderIban: string;
  receiverIban: string;
  date: string;
  name: string;
  transaction?: SelectTransactionFormData;
  reason: SupportIssueReason;
  message: string;
  limit: Limit;
  investmentDate: InvestmentDate;
  fundOrigin: FundOrigin;
  file?: File;
}

interface SelectTransactionFormData {
  uid: string;
  description: string;
}

const NoIban = 'No IBAN, only account number';
const AddAccount = 'Add bank account';
const selectTxButtonLabel = 'Select transaction';

const ReceiverIbanCheckDelay = 500;
// Shortest IBAN in use is 15 characters. Below that the input is still incomplete and must not be judged.
const ReceiverIbanCheckMinLength = 15;

// Strip everything except letters and digits so the length threshold and the value sent
// to the check count the same characters.
function normalizeIban(iban?: string): string {
  return iban?.replace(/[^A-Za-z0-9]/g, '') ?? '';
}

type ReceiverIbanResult = { iban: string; status: ReceiveIbanStatus } | { iban: string; unavailable: true };

const ReceiverIbanHints: { [s in ReceiveIbanStatus]: string } = {
  [ReceiveIbanStatus.DFX_IBAN]: 'We have recognized this IBAN.',
  [ReceiveIbanStatus.NOT_MATCHED]:
    'We could not recognize this IBAN with the information available to us. You can submit your request anyway.',
  [ReceiveIbanStatus.INVALID_IBAN]: 'This does not look like a valid IBAN.',
  [ReceiveIbanStatus.LOGIN_REQUIRED]: 'Please log in so that we can also check your personal IBAN.',
};

const ReceiverIbanCheckUnavailable = 'We could not check this IBAN at the moment. You can submit your request anyway.';

const formDefaultValues = {
  type: undefined,
  senderIban: undefined,
  receiverIban: undefined,
  date: undefined,
  name: undefined,
  transaction: undefined,
  reason: undefined,
  message: undefined,
  limit: undefined,
  investmentDate: undefined,
  fundOrigin: undefined,
  file: undefined,
};

export default function SupportIssueScreen(): JSX.Element {
  const { navigate, clearParams } = useNavigation();
  const { rootRef } = useLayoutContext();
  const { translate, translateError, allowedCountries } = useSettingsContext();
  const { user, isUserLoading } = useUserContext();
  const { isLoggedIn, logout } = useSessionContext();
  const { checkReceiveIban } = useBank();
  const { bankAccounts } = useBankAccountContext();
  const [urlParams] = useSearchParams();
  const {
    createSupportIssue,
    loadSupportIssue,
    isLoading: isIssueLoading,
    supportIssue: existingIssue,
  } = useSupportChatContext();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [selectTransaction, setSelectTransaction] = useState(false);
  const [isKycComplete, setIsKycComplete] = useState<boolean>();
  const [selectedTxState, setSelectedTxState] = useState<TransactionState>();
  const [receiverIbanResult, setReceiverIbanResult] = useState<ReceiverIbanResult>();
  const [isCheckingReceiverIban, setIsCheckingReceiverIban] = useState(false);
  const [isReceiverIbanFocused, setIsReceiverIbanFocused] = useState(false);
  const receiverIbanCheckId = useRef(0);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
    reset,
    setValue,
  } = useForm<FormData>({ mode: 'all', defaultValues: formDefaultValues });
  const selectedType = useWatch({ control, name: 'type' });
  const investmentDate = useWatch({ control, name: 'investmentDate' });
  const selectedReason = useWatch({ control, name: 'reason' });
  const selectedTransaction = useWatch({ control, name: 'transaction' });
  const selectedSender = useWatch({ control, name: 'senderIban' });
  const selectedReceiver = useWatch({ control, name: 'receiverIban' });
  // Debouncing the normalized value keeps formatting-only edits (a space, a dash) from costing a request.
  const normalizedReceiver = normalizeIban(selectedReceiver);
  const debouncedReceiver = useDebounce(normalizedReceiver, ReceiverIbanCheckDelay);

  const issues = Object.values(SupportIssueType);
  const reasons = IssueReasons[selectedType] ?? [];
  const isRequestOnly = selectedTxState === TransactionState.WAITING_FOR_PAYMENT;

  const orderParam = urlParams.get('quote') ?? urlParams.get('order');
  // Latch the guest/quote path on first render. clearParams drops quote/order from the URL
  // before logout finishes, which would otherwise trip the mail gate mid-transition.
  const isQuotePath = useRef(Boolean(orderParam || urlParams.get('tx'))).current;
  const issueTypeParam = urlParams.get('issue-type');
  const reasonParam = urlParams.get('reason');
  const [txParam] = useState(() => urlParams.get('tx'));

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (orderParam || issueTypeParam || reasonParam || txParam) {
        clearParams([...Array.from(urlParams.keys())]);
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const issueType = issueTypeParam && issues.find((t) => t === issueTypeParam);
    if (issueType) {
      setValue('type', issueType);
    }

    const reasonEnum = issueType && reasonParam && IssueReasons[issueType].find((r) => r === reasonParam);
    if (reasonEnum) {
      setValue('reason', reasonEnum);
    }

    if (txParam) {
      setValue('type', SupportIssueType.TRANSACTION_ISSUE);
      setValue('transaction', { uid: txParam, description: 'Transaction ID' });
    }
  }, [issueTypeParam, reasonParam, txParam]);

  useUserGuard('/login', !orderParam && !txParam);
  useKycLevelGuard(KycLevel.Link, '/contact');

  function startChat(issueUid: string) {
    navigate({ pathname: `/support/chat/${issueUid}` });
  }

  useEffect(() => {
    const kycCompleted = user && user.kyc.level >= KycLevel.Completed;

    if (kycCompleted === false && selectedType === SupportIssueType.LIMIT_REQUEST) {
      navigate('/kyc');
      return;
    }

    setIsKycComplete(kycCompleted);
  }, [user, selectedType]);

  useEffect(() => {
    if (!isQuotePath && isLoggedIn && !isUserLoading && user && !user.mail) {
      navigate('/account/mail', { setRedirect: true });
    }
  }, [isLoggedIn, isUserLoading, user, navigate, isQuotePath]);

  useEffect(() => {
    if (orderParam) {
      const issueType = SupportIssueType.TRANSACTION_ISSUE;
      setValue('type', issueType);

      loadSupportIssue(orderParam).catch(() => undefined); // ignore error
    }
  }, [orderParam]);

  useEffect(() => {
    if ((orderParam || txParam) && isLoggedIn) logout();
  }, [orderParam, txParam, isLoggedIn]);

  useEffect(() => {
    if (orderParam && !isLoading && existingIssue) {
      startChat(existingIssue.uid);
    }
  }, [isIssueLoading, existingIssue]);

  useEffect(() => {
    if (selectedTransaction?.uid === selectTxButtonLabel) {
      setSelectTransaction(true);
    }
  }, [selectedTransaction?.uid]);

  useEffect(() => {
    if (selectTransaction && selectedReason === SupportIssueReason.TRANSACTION_MISSING) {
      setSelectTransaction(false);
    }
  }, [selectedReason, selectTransaction]);

  useEffect(() => {
    if (txParam) return;
    setSelectedTxState(undefined);
    setValue('transaction', undefined);
  }, [selectedReason, txParam]);

  // Invalidate in-flight checks and stop the spinner when the normalized value changes. Hint staleness is
  // handled by binding the stored result to the IBAN it was computed for (see getReceiverIbanHint).
  useEffect(() => {
    receiverIbanCheckId.current++;
    setIsCheckingReceiverIban(false);
  }, [normalizedReceiver]);

  useEffect(() => {
    const iban = debouncedReceiver ?? '';

    // The check is purely advisory, so any request that is no longer relevant is simply skipped. Two are:
    // an input that is still incomplete, which should not be checked; and a debounced value the customer has
    // meanwhile changed, which must never be requested no matter how the two updates were committed.
    if (
      selectedReason !== SupportIssueReason.TRANSACTION_MISSING ||
      iban.length < ReceiverIbanCheckMinLength ||
      iban !== normalizedReceiver
    ) {
      receiverIbanCheckId.current++;
      setIsCheckingReceiverIban(false);
      return;
    }

    const checkId = ++receiverIbanCheckId.current;
    const isCurrent = () => checkId === receiverIbanCheckId.current;

    setIsCheckingReceiverIban(true);

    checkReceiveIban(iban)
      .then((check) => {
        // A slow answer to an earlier input must not overwrite the answer to the current one.
        if (!isCurrent()) return;
        setReceiverIbanResult({ iban, status: check.status });
      })
      .catch(() => {
        // Any failure, including rate limiting (HTTP 429), means the check is unavailable - never a form error.
        if (!isCurrent()) return;
        setReceiverIbanResult({ iban, unavailable: true });
      })
      .finally(() => {
        if (isCurrent()) setIsCheckingReceiverIban(false);
      });
  }, [debouncedReceiver, normalizedReceiver, selectedReason]);

  async function onSubmit(data: FormData) {
    setIsLoading(true);

    try {
      const request: CreateSupportIssue = {
        type: data.type,
        name: data.name,
        reason: data.reason ?? SupportIssueReason.OTHER,
        message: data.message,
        file: data.file && (await toBase64(data.file)),
        fileName: data.file?.name,
      };

      if (data.type === SupportIssueType.TRANSACTION_ISSUE) {
        if (data.reason === SupportIssueReason.TRANSACTION_MISSING) {
          request.transaction = {
            senderIban: data.senderIban,
            receiverIban: data.receiverIban,
            date: new Date(data.date),
          };
        } else if (data.reason === SupportIssueReason.FUNDS_NOT_RECEIVED && isRequestOnly) {
          request.transaction = {
            uid: data.transaction?.uid,
            senderIban: data.senderIban,
            date: new Date(data.date),
          };
        } else {
          request.transaction = { uid: data.transaction?.uid };
        }
        orderParam && (request.transaction.orderUid = orderParam);
      }

      if (data.type === SupportIssueType.LIMIT_REQUEST && data.limit) {
        request.limitRequest = {
          limit: data.limit,
          investmentDate: data.investmentDate,
          fundOrigin: data.fundOrigin,
          fundOriginText: data.message,
        };
      }

      await createSupportIssue(request, data.file)
        .then((response) => startChat(response))
        .catch((e: ApiError) => setError(e.message ?? 'Unknown error'));
    } catch (e) {
      setError((e as ApiError).message ?? 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }

  function onSelectTransaction(uid: string, state: TransactionState) {
    setValue('transaction', { uid, description: 'Transaction ID' });
    setSelectedTxState(state);
    setSelectTransaction(false);
  }

  const isFundsNotReceivedRequest = selectedReason === SupportIssueReason.FUNDS_NOT_RECEIVED && isRequestOnly === true;

  // Only show a hint that was computed for the value currently in the field.
  const result = receiverIbanResult?.iban === normalizedReceiver ? receiverIbanResult : undefined;

  function getReceiverIbanHint(): string | undefined {
    if (!result) return undefined;
    // A positive confirmation can only mean the IBAN is complete and matched, so it may appear right away.
    if ('status' in result && result.status === ReceiveIbanStatus.DFX_IBAN) return ReceiverIbanHints[result.status];
    // Everything else waits until the field is left: the threshold proves length, not completeness, and a verdict
    // on a half-typed IBAN would be wrong and would make the form jump.
    if (isReceiverIbanFocused) return undefined;
    if ('status' in result) return ReceiverIbanHints[result.status];
    if ('unavailable' in result) return ReceiverIbanCheckUnavailable;
    return undefined;
  }

  const receiverIbanHint = getReceiverIbanHint();
  const receiverIbanHintColor =
    result && 'status' in result && result.status === ReceiveIbanStatus.DFX_IBAN
      ? 'text-dfxGreen-100'
      : 'text-dfxGray-800';

  const rules = Utils.createRules({
    type: Validations.Required,
    senderIban: [
      (selectedReason === SupportIssueReason.TRANSACTION_MISSING || isFundsNotReceivedRequest) && Validations.Required,
      !!orderParam && Validations.Iban(allowedCountries),
    ],
    receiverIban: [
      selectedReason === SupportIssueReason.TRANSACTION_MISSING && Validations.Required,
      // Emptiness check only - a blank-only entry is no entry. Never a judgement on the IBAN itself.
      selectedReason === SupportIssueReason.TRANSACTION_MISSING &&
        Validations.Custom((iban) => (!iban || iban.trim().length > 0 ? true : 'required')),
    ],
    date: [
      (selectedReason === SupportIssueReason.TRANSACTION_MISSING || isFundsNotReceivedRequest) && Validations.Required,
      Validations.Custom((date) => (!date || /\d{4}-\d{2}-\d{2}/g.test(date) ? true : 'pattern')),
    ],
    name: Validations.Required,
    transaction: Validations.Required,
    reason: Validations.Required,
    message: [Validations.Required, Validations.Custom((message) => message.length <= 4000 || 'message_length')],
    limit: Validations.Required,
    investmentDate: Validations.Required,
    fundOrigin: Validations.Required,
    file: [
      selectedType === SupportIssueType.NOTIFICATION_OF_CHANGES && Validations.Required,
      Validations.Custom((file) => (!file || DefaultFileTypes.includes(file.type) ? true : 'file_type')),
    ],
  });

  useLayoutOptions({
    title: translate('screens/support', 'Support issue'),
    onBack: selectTransaction
      ? () => {
          setSelectTransaction(false);
          reset({ ...formDefaultValues, type: selectedType, reason: selectedReason });
        }
      : undefined,
  });

  return (
    <>
      {(selectedType === SupportIssueType.LIMIT_REQUEST && isKycComplete === undefined) ||
      isIssueLoading ||
      (!isQuotePath && isLoggedIn && (isUserLoading || !user || !user.mail)) ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : selectTransaction ? (
        <>
          <p className="text-dfxGray-700">
            {translate('screens/support', 'Select the transaction for which you would like to create an issue.')}
          </p>
          <TransactionList isSupport={true} onSelectTransaction={onSelectTransaction} setError={setError} />
        </>
      ) : selectedSender === AddAccount ? (
        <AddBankAccount
          onSubmit={(account) => {
            setValue('senderIban', account.iban);
          }}
          confirmationText={translate(
            'screens/iban',
            'The bank account has been added, all transactions from this IBAN will now be associated with your account.',
          )}
        />
      ) : (
        <Form
          control={control}
          rules={rules}
          errors={errors}
          onSubmit={handleSubmit(onSubmit)}
          translate={translateError}
        >
          <StyledVerticalStack gap={6} full center>
            <StyledDropdown<SupportIssueType>
              rootRef={rootRef}
              label={translate('screens/support', 'Issue type')}
              items={issues.filter((t) => t !== SupportIssueType.LIMIT_REQUEST || isKycComplete)}
              labelFunc={(item) => item && translate('screens/support', IssueTypeLabels[item])}
              name="type"
              placeholder={translate('general/actions', 'Select') + '...'}
              disabled={!!orderParam || !!txParam}
              full
            />

            {reasons.length > 1 && (
              <StyledVerticalStack gap={2} full center>
                <StyledDropdown<SupportIssueReason>
                  rootRef={rootRef}
                  label={translate('screens/support', 'Reason')}
                  items={reasons.filter((r) => r !== SupportIssueReason.FUNDS_NOT_RECEIVED || !orderParam)}
                  labelFunc={(item) => translate('screens/support', IssueReasonLabels[item])}
                  name="reason"
                  placeholder={translate('general/actions', 'Select') + '...'}
                  full
                />
                {selectedType === SupportIssueType.NOTIFICATION_OF_CHANGES && (
                  <p className="text-dfxGray-700 text-sm">
                    <Trans i18nKey="screens/support.contactDataChangeHint">
                      Name, address, phone number and email address can be changed directly in your{' '}
                      <StyledLink label={translate('screens/home', 'Account')} url="/account" target="_self" dark />.
                    </Trans>
                  </p>
                )}
              </StyledVerticalStack>
            )}

            {selectedType === SupportIssueType.TRANSACTION_ISSUE && selectedReason && (
              <>
                {selectedReason !== SupportIssueReason.TRANSACTION_MISSING && !orderParam && !txParam && (
                  <StyledVerticalStack gap={3.5} full center>
                    <p className="w-full text-left text-dfxBlue-800 text-base font-semibold pl-3.5 -mb-1">
                      {translate('screens/payment', 'Transaction')}
                    </p>
                    <StyledDropdown<SelectTransactionFormData>
                      rootRef={rootRef}
                      name="transaction"
                      items={[{ uid: selectTxButtonLabel, description: 'Select a transaction to proceed with' }]}
                      labelFunc={(item) => translate('general/actions', item.uid)}
                      descriptionFunc={(item) => translate('screens/support', item.description)}
                      full
                      forceEnable
                    />
                  </StyledVerticalStack>
                )}

                {(selectedReason === SupportIssueReason.TRANSACTION_MISSING || isFundsNotReceivedRequest) && (
                  <>
                    {bankAccounts && isLoggedIn ? (
                      <StyledDropdown<string>
                        rootRef={rootRef}
                        label={translate('screens/support', 'Sender IBAN')}
                        items={[...bankAccounts.map((a) => a.iban), AddAccount, NoIban]}
                        labelFunc={(item) =>
                          blankedAddress(
                            item === AddAccount
                              ? translate('general/actions', item)
                              : item === NoIban
                                ? translate('screens/iban', item)
                                : (Utils.formatIban(item) ?? ''),
                            { displayLength: 30 },
                          )
                        }
                        descriptionFunc={(item) => bankAccounts.find((a) => a.iban === item)?.label ?? ''}
                        name="senderIban"
                        placeholder={translate('general/actions', 'Select') + '...'}
                        full
                      />
                    ) : (
                      <StyledInput
                        name="senderIban"
                        autocomplete="iban"
                        label={translate('screens/support', 'Sender IBAN')}
                        placeholder="XX XXXX XXXX XXXX XXXX X"
                        full
                      />
                    )}

                    {selectedReason === SupportIssueReason.TRANSACTION_MISSING && (
                      <StyledVerticalStack gap={1} full center>
                        {/* Focus is tracked on the surrounding div so that the non-positive hints only appear after
                            the field has been left (blurred) — the positive confirmation hint is not gated this way
                            and can appear immediately. Autocomplete is intentionally omitted here because the sender
                            field above already claims the IBAN autofill. */}
                        <div
                          className="w-full"
                          onFocus={() => setIsReceiverIbanFocused(true)}
                          onBlur={() => setIsReceiverIbanFocused(false)}
                        >
                          <StyledInput
                            name="receiverIban"
                            label={translate('screens/support', 'Receiver IBAN')}
                            placeholder="XX XXXX XXXX XXXX XXXX X"
                            loading={isCheckingReceiverIban}
                            full
                          />
                        </div>
                        {receiverIbanHint && (
                          <p className={`w-full text-start text-sm pl-3 ${receiverIbanHintColor}`}>
                            {translate('screens/support', receiverIbanHint)}
                          </p>
                        )}
                      </StyledVerticalStack>
                    )}

                    <StyledInput
                      name="date"
                      label={translate('screens/support', 'Date of the transaction')}
                      placeholder={new Date().toISOString().split('T')[0]}
                      full
                    />
                  </>
                )}
              </>
            )}

            {selectedType === SupportIssueType.LIMIT_REQUEST ? (
              <LimitRequestFields
                rootRef={rootRef}
                control={control}
                rules={rules}
                errors={errors}
                investmentDate={investmentDate}
              />
            ) : (
              <>
                <StyledInput
                  name="name"
                  autocomplete="name"
                  label={translate('screens/support', 'Name')}
                  placeholder={`${translate('screens/kyc', 'John')} ${translate('screens/kyc', 'Doe')}`}
                  full
                />

                <StyledInput name="message" label={translate('screens/support', 'Description')} multiLine full />

                <StyledFileUpload
                  name="file"
                  label={translate('screens/support', 'File')}
                  placeholder={translate('general/actions', 'Drop files here')}
                  buttonLabel={translate('general/actions', 'Browse')}
                  full
                />
              </>
            )}

            {error && (
              <div>
                <ErrorHint message={error} />
              </div>
            )}

            <StyledButton
              type="submit"
              label={translate('general/actions', 'Next')}
              onClick={handleSubmit(onSubmit)}
              width={StyledButtonWidth.FULL}
              disabled={!isValid}
              isLoading={isLoading}
            />
          </StyledVerticalStack>
        </Form>
      )}
    </>
  );
}
