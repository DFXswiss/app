import { StyledButton, StyledButtonColor, StyledButtonSize, StyledButtonWidth } from '@dfx.swiss/react-components';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { useRealunitApi } from 'src/hooks/realunit-api.hook';

interface TransferCostLimitPanelProps {
  translate: (ns: string, key: string) => string;
}

const LIMIT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const ETH_MAX_FRACTION_DIGITS = 18;
const CHF_MAX_FRACTION_DIGITS = 2;

function isValidLimit(raw: string, maxFractionDigits: number): boolean {
  const trimmed = raw.trim();
  if (!LIMIT_PATTERN.test(trimmed)) return false;
  const dotIndex = trimmed.indexOf('.');
  if (dotIndex !== -1 && trimmed.length - dotIndex - 1 > maxFractionDigits) return false;
  return Number(trimmed) >= 0;
}

function displayAmount(value: string | null): string {
  return value == null ? '' : value;
}

export function RealunitTransferCostLimitPanel({ translate }: TransferCostLimitPanelProps): JSX.Element {
  const { getTransferCostLimit, updateTransferCostLimit } = useRealunitApi();

  const [ethInput, setEthInput] = useState('');
  const [chfInput, setChfInput] = useState('');
  const [loadError, setLoadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const isSubmittingRef = useRef(false);
  const loadGenRef = useRef(0);

  useEffect(() => {
    loadLimit();
  }, []);

  function loadLimit(): void {
    const gen = ++loadGenRef.current;
    setIsLoading(true);
    setLoadError(undefined);
    getTransferCostLimit()
      .then((limit) => {
        if (gen !== loadGenRef.current) return;
        setHasLoaded(true);
        setEthInput(displayAmount(limit.maxEthPerTransfer));
        setChfInput(displayAmount(limit.maxChfPerCustomerMonth));
      })
      .catch((e: Error) => {
        if (gen !== loadGenRef.current) return;
        setHasLoaded(false);
        setEthInput('');
        setChfInput('');
        setLoadError(e.message ?? translate('screens/realunit', 'Failed to load transfer cost limits.'));
      })
      .finally(() => {
        if (gen !== loadGenRef.current) return;
        setIsLoading(false);
      });
  }

  const canSave =
    !isLoading &&
    !isSubmitting &&
    !loadError &&
    hasLoaded &&
    isValidLimit(ethInput, ETH_MAX_FRACTION_DIGITS) &&
    isValidLimit(chfInput, CHF_MAX_FRACTION_DIGITS);

  function onSubmit(event?: FormEvent): void {
    event?.preventDefault();
    if (isSubmittingRef.current) return;
    const ethRaw = ethInput.trim();
    const chfRaw = chfInput.trim();
    if (
      isLoading ||
      isSubmitting ||
      loadError ||
      !hasLoaded ||
      !isValidLimit(ethRaw, ETH_MAX_FRACTION_DIGITS) ||
      !isValidLimit(chfRaw, CHF_MAX_FRACTION_DIGITS)
    ) {
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSaveError(undefined);
    updateTransferCostLimit({ maxEthPerTransfer: ethRaw, maxChfPerCustomerMonth: chfRaw })
      .then((saved) => {
        setEthInput(displayAmount(saved.maxEthPerTransfer));
        setChfInput(displayAmount(saved.maxChfPerCustomerMonth));
        setLoadError(undefined);
      })
      .catch((e: Error) => setSaveError(e.message ?? translate('screens/realunit', 'Unknown error')))
      .finally(() => {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      });
  }

  return (
    <div
      className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-3 text-left w-full"
      data-testid="transfer-cost-limit-panel"
    >
      <p className="text-sm text-dfxGray-700">
        {translate(
          'screens/realunit',
          'Both values are required. Until they are saved, transfers are not possible.',
        )}
      </p>

      {isLoading && (
        <div data-testid="transfer-cost-limit-loading">{translate('screens/realunit', 'Loading')}</div>
      )}
      {loadError && !isLoading && (
        <div className="flex flex-wrap items-center gap-3">
          <ErrorHint message={loadError} />
          <StyledButton
            label={translate('general/actions', 'Retry')}
            onClick={loadLimit}
            size={StyledButtonSize.SMALL}
            width={StyledButtonWidth.MIN}
            color={StyledButtonColor.BLUE}
            deactivateMargin
            caps={false}
            disabled={isSubmitting}
          />
        </div>
      )}
      {saveError && <ErrorHint message={saveError} />}

      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-dfxBlue-800">
            {translate('screens/realunit', 'Max ETH per transfer')}
          </h2>
          <p className="text-sm text-dfxGray-700">
            {translate('screens/realunit', 'If the current Ethereum fee is higher, the transfer is refused.')}
          </p>
          <label className="flex flex-col gap-1 text-sm text-dfxBlue-800 w-full max-w-xs">
            {translate('screens/realunit', 'Max ETH per transfer')}
            <input
              className="h-10 border border-dfxGray-400 rounded-md px-3 bg-white disabled:opacity-60"
              type="text"
              inputMode="decimal"
              value={ethInput}
              onChange={(e) => setEthInput(e.target.value)}
              disabled={isLoading}
            />
          </label>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-dfxBlue-800">
            {translate('screens/realunit', 'Max CHF per customer per month')}
          </h2>
          <p className="text-sm text-dfxGray-700">
            {translate(
              'screens/realunit',
              'Cap on what transfer gas may cost this customer in a calendar month. Pay is not included.',
            )}
          </p>
          <label className="flex flex-col gap-1 text-sm text-dfxBlue-800 w-full max-w-xs">
            {translate('screens/realunit', 'Max CHF per customer per month')}
            <input
              className="h-10 border border-dfxGray-400 rounded-md px-3 bg-white disabled:opacity-60"
              type="text"
              inputMode="decimal"
              value={chfInput}
              onChange={(e) => setChfInput(e.target.value)}
              disabled={isLoading}
            />
          </label>
        </div>
        <StyledButton
          label={translate('screens/realunit', 'Save')}
          onClick={() => onSubmit()}
          size={StyledButtonSize.SMALL}
          width={StyledButtonWidth.MIN}
          color={StyledButtonColor.BLUE}
          deactivateMargin
          caps={false}
          className="h-10"
          disabled={!canSave}
          isLoading={isSubmitting}
        />
      </form>
    </div>
  );
}
