import { StyledButton, StyledButtonColor, StyledButtonSize, StyledButtonWidth } from '@dfx.swiss/react-components';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { useRealunitApi } from 'src/hooks/realunit-api.hook';

interface BuyLimitPanelProps {
  translate: (ns: string, key: string) => string;
}

function isValidMaxTokens(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return true;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 1;
}

export function RealunitBuyLimitPanel({ translate }: BuyLimitPanelProps): JSX.Element {
  const { getBuyLimit, updateBuyLimit } = useRealunitApi();

  const [tokensInput, setTokensInput] = useState('');
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
    getBuyLimit()
      .then((limit) => {
        if (gen !== loadGenRef.current) return;
        const maxTokens = limit.maxTokensPerTx;
        setHasLoaded(true);
        setTokensInput(maxTokens == null ? '' : String(maxTokens));
      })
      .catch((e: Error) => {
        if (gen !== loadGenRef.current) return;
        setHasLoaded(false);
        setTokensInput('');
        setLoadError(e.message ?? translate('screens/realunit', 'Failed to load buy limit.'));
      })
      .finally(() => {
        if (gen !== loadGenRef.current) return;
        setIsLoading(false);
      });
  }

  const canSave = !isLoading && !isSubmitting && !loadError && hasLoaded && isValidMaxTokens(tokensInput);

  function onSubmit(event?: FormEvent): void {
    event?.preventDefault();
    if (isSubmittingRef.current) return;
    const raw = tokensInput.trim();
    if (isLoading || isSubmitting || loadError || !hasLoaded || !isValidMaxTokens(raw)) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSaveError(undefined);
    const maxTokensPerTx = raw === '' ? null : Number(raw);
    updateBuyLimit(maxTokensPerTx)
      .then((saved) => {
        const next = saved.maxTokensPerTx;
        setTokensInput(next == null ? '' : String(next));
        setLoadError(undefined);
      })
      .catch((e: Error) => setSaveError(e.message ?? translate('screens/realunit', 'Unknown error')))
      .finally(() => {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      });
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-3 text-left w-full">
      <h2 className="text-base font-semibold text-dfxBlue-800">{translate('screens/realunit', 'Max tokens per buy')}</h2>
      <p className="text-sm text-dfxGray-700 -mt-1">
        {translate('screens/realunit', 'Leave empty for no limit. Applies to each bank buy.')}
      </p>

      {isLoading && <div data-testid="buy-limit-loading">{translate('screens/realunit', 'Loading')}</div>}
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

      <form className="flex flex-wrap items-end gap-3" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-sm text-dfxBlue-800 w-full max-w-xs">
          {translate('screens/realunit', 'Max tokens per buy')}
          <input
            className="h-10 border border-dfxGray-400 rounded-md px-3 bg-white disabled:opacity-60"
            type="number"
            min={1}
            step={1}
            value={tokensInput}
            onChange={(e) => setTokensInput(e.target.value)}
            disabled={isLoading}
          />
        </label>
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
