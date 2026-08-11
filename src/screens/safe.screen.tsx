import { ApiError, CustodyValueCurrency } from '@dfx.swiss/react';
import {
  DfxIcon,
  Form,
  IconColor,
  IconSize,
  IconVariant,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledInput,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { NameEdit } from 'src/components/edit/name.edit';
import { ErrorHint } from 'src/components/error-hint';
import { Modal } from 'src/components/modal';
import { SafeCompletion } from 'src/components/payment/safe-completion';
import { AccountSelector } from 'src/components/safe/account-selector';
import { ButtonGroup, ButtonGroupSize } from 'src/components/safe/button-group';
import { PriceChart } from 'src/components/safe/chart';
import { Portfolio } from 'src/components/safe/portfolio';
import { SafeTransactionInterface } from 'src/components/safe/safe-transaction-interface';
import { TransactionHistory } from 'src/components/safe/transaction-history';
import { useOrderUIContext } from 'src/contexts/order-ui.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { FiatCurrency, SafeOperationType } from 'src/dto/safe.dto';
import { useUserGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useSafe } from 'src/hooks/safe.hook';
import { formatCurrency } from 'src/util/utils';

interface PdfFormData {
  date: string;
}

export default function SafeScreen(): JSX.Element {
  useUserGuard('/login');

  const {
    isInitialized,
    portfolio,
    history,
    orderHistory,
    isLoadingPortfolio,
    isLoadingHistory,
    isLoadingOrderHistory,
    error,
    reloadOrderHistory,
    downloadPdf,
    custodyAccounts,
    selectedAccount,
    selectAccount,
    canTransact,
  } = useSafe();
  const { currency: userCurrency, translate } = useSettingsContext();
  const {
    completionType,
    showPaymentNameForm,
    bankAccountSelection,
    setCompletionType,
    setPaymentNameForm,
    setBankAccountSelection,
  } = useOrderUIContext();

  const [currency, setCurrency] = useState<FiatCurrency>(FiatCurrency.CHF);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string>();

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue: setPdfValue,
    reset: resetPdfForm,
  } = useForm<PdfFormData>();

  function openPdfModal(): void {
    setPdfError(undefined);
    setPdfValue('date', new Date().toISOString().split('T')[0]);
    setIsPdfModalOpen(true);
  }

  function closePdfModal(): void {
    setIsPdfModalOpen(false);
    resetPdfForm();
    setPdfError(undefined);
  }

  const onPdfSubmit = async (data: PdfFormData) => {
    setIsPdfLoading(true);
    setPdfError(undefined);

    try {
      await downloadPdf({
        date: data.date,
        currency: currency.toUpperCase() as CustodyValueCurrency,
      });
      closePdfModal();
    } catch (e) {
      setPdfError((e as ApiError).message ?? 'Unknown error');
    } finally {
      setIsPdfLoading(false);
    }
  };

  useEffect(() => {
    userCurrency && setCurrency(userCurrency?.name.toLowerCase() as FiatCurrency);
  }, [userCurrency]);

  const showChart = history.length > 1;

  const getTitle = () => {
    if (completionType) {
      switch (completionType) {
        case SafeOperationType.DEPOSIT:
          return translate('screens/safe', 'Deposit Complete');
        case SafeOperationType.RECEIVE:
          return translate('screens/safe', 'Receive Complete');
        case SafeOperationType.WITHDRAW:
          return translate('screens/safe', 'Withdraw Complete');
        case SafeOperationType.SEND:
          return translate('screens/safe', 'Send Complete');
        case SafeOperationType.SWAP:
          return translate('screens/safe', 'Swap Complete');
      }
    }
    if (bankAccountSelection) return translate('screens/sell', 'Select payment account');
    return translate('screens/safe', 'My DFX Safe');
  };

  const getBackHandler = () => {
    if (completionType) return () => setCompletionType();
    if (bankAccountSelection) return () => setBankAccountSelection(false);
    if (showPaymentNameForm) return () => setPaymentNameForm(false);
    return undefined;
  };

  useLayoutOptions({ title: getTitle(), onBack: getBackHandler() });

  return (
    <>
      {error ? (
        <div>
          <ErrorHint message={error} />
        </div>
      ) : !isInitialized ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : completionType ? (
        <SafeCompletion
          type={completionType}
          onClose={() => {
            setCompletionType();
            reloadOrderHistory();
          }}
        />
      ) : showPaymentNameForm ? (
        // TODO (later?): Retrigger payment execution after name edit
        <NameEdit onSuccess={() => setPaymentNameForm(false)} />
      ) : (
        <StyledVerticalStack full gap={10} className="p-4">
          {custodyAccounts.length > 1 && selectedAccount && (
            // The same condition the selector applies internally. Rendering the wrapper anyway
            // would leave an empty flex child behind and push everything below it down by the
            // stack's gap — a layout shift for every user with a single account.
            //
            // z-20 sits above the portfolio block's z-10; without it the open list would
            // disappear behind the chart.
            <div className="relative z-20">
              <AccountSelector accounts={custodyAccounts} selected={selectedAccount} onSelect={selectAccount} />
            </div>
          )}
          <div className="shadow-card rounded-xl">
            <div id="chart-timeline" className="relative">
              <div className="p-2 gap-2 flex flex-col items-start">
                <div className="relative w-full" style={{ height: showChart ? '350px' : 'auto' }}>
                  <div className="w-full flex flex-col gap-3 text-left leading-none z-10">
                    <h2 className="text-dfxBlue-800">{translate('screens/safe', 'Portfolio')}</h2>
                    <div className="flex flex-row justify-between items-center">
                      <p className="text-dfxGray-700">{translate('screens/safe', 'Total portfolio value')}</p>
                      <button
                        className="p-2 rounded-lg hover:bg-dfxBlue-800/10 transition-colors cursor-pointer z-20"
                        onClick={openPdfModal}
                        title={translate('screens/safe', 'Download PDF')}
                      >
                        <DfxIcon icon={IconVariant.FILE} color={IconColor.BLUE} size={IconSize.MD} />
                      </button>
                    </div>
                    <div className="flex flex-row items-center gap-3 z-10">
                      <ButtonGroup<FiatCurrency>
                        items={Object.values(FiatCurrency)}
                        selected={currency}
                        onClick={setCurrency}
                        buttonLabel={(currency) => currency.toUpperCase()}
                        size={ButtonGroupSize.SM}
                      />
                      {isLoadingPortfolio ? (
                        <div>
                          <StyledLoadingSpinner size={SpinnerSize.MD} />
                        </div>
                      ) : (
                        <div className="text-dfxBlue-800">
                          <span className="text-lg font-bold">
                            {formatCurrency(portfolio.totalValue[currency], 2, 2)}
                          </span>{' '}
                          <span className="text-base">{currency.toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="absolute inset-0">
                    {showChart && <PriceChart history={history} currency={currency} isLoading={isLoadingHistory} />}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Portfolio
            portfolio={portfolio.balances.filter((b) => b.balance > 0)}
            currency={currency}
            isLoading={isLoadingPortfolio}
          />
          {canTransact && (
            <>
              <hr className="border-dfxGray-400" />
              <SafeTransactionInterface />
            </>
          )}
          <hr className="border-dfxGray-400" />
          <TransactionHistory transactions={orderHistory} isLoading={isLoadingOrderHistory} />
        </StyledVerticalStack>
      )}

      <Modal isOpen={isPdfModalOpen} onClose={closePdfModal}>
        <StyledVerticalStack gap={6} full>
          <h2 className="text-dfxBlue-800 text-xl font-bold">{translate('screens/safe', 'Download PDF')}</h2>

          <p className="text-dfxGray-700">{translate('screens/safe', 'Select a date for your portfolio report')}</p>
          <Form control={control} errors={errors} onSubmit={handleSubmit(onPdfSubmit)}>
            <StyledVerticalStack gap={4} full>
              <StyledInput name="date" type="date" label={translate('screens/payment', 'Date')} full />

              {pdfError && <p className="text-dfxRed-100 text-sm">{pdfError}</p>}

              <StyledButton
                type="submit"
                label={translate('general/actions', 'Download')}
                onClick={handleSubmit(onPdfSubmit)}
                width={StyledButtonWidth.FULL}
                isLoading={isPdfLoading}
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
