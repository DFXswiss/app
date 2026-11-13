import { Asset, Blockchain, Fees, Fiat, PriceStep, TransactionType, Utils, useFiat } from '@dfx.swiss/react';
import { IconColor, StyledCollapsible, StyledInfoText, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useSettingsContext } from '../contexts/settings.context';
import { ReactComponent as PathArrow } from '../static/assets/path-arrow.svg';

interface ExchangeRateProps {
  exchangeRate: number;
  rate: number;
  fees: Fees;
  feeCurrency: Fiat | Asset;
  from: Fiat | Asset;
  to: Fiat | Asset;
  steps: PriceStep[];
  amountIn: number;
  amountOut: number;
  type: TransactionType;
}

export function ExchangeRate({
  exchangeRate,
  rate,
  fees,
  feeCurrency,
  from,
  to,
  steps,
  amountIn,
  amountOut,
  type,
}: ExchangeRateProps): JSX.Element {
  const { translate } = useSettingsContext();
  const { toSymbol } = useFiat();

  const feeSymbol = 'blockchain' in feeCurrency ? ` ${feeCurrency.name}` : toSymbol(feeCurrency);

  const baseRate = `${
    'blockchain' in from ? Utils.formatAmountCrypto(exchangeRate) : Utils.formatAmount(exchangeRate)
  } ${from.name}/${to.name}`;
  const minFee = `, min. ${fees.min}${feeSymbol}`;
  const totalFee = `${fees.total}${feeSymbol}`;
  const dfxFee = `${fees.dfx}${feeSymbol} (${(fees.rate * 100).toFixed(2)}%${fees.min ? minFee : ''})`;
  const networkFee = `${fees.network}${feeSymbol}`;
  const bankFixedFee = type !== TransactionType.SWAP && fees.bankFixed ? `${fees.bankFixed}${feeSymbol}` : undefined;
  const bankPercentFee =
    type !== TransactionType.SWAP && fees.bankVariable ? `${fees.bankVariable}${feeSymbol}` : undefined;
  const bankFee =
    type !== TransactionType.SWAP && !bankFixedFee && !bankPercentFee && fees.bank ? `${fees.bank}${feeSymbol}` : false;
  const networkStartFee = fees?.networkStart ? `${fees?.networkStart}${feeSymbol}` : undefined;
  const platformFee = fees.platform ? `${fees.platform}${feeSymbol}` : undefined;

  const l1Replacement =
    'blockchain' in to &&
    (to.blockchain === Blockchain.BITCOIN
      ? 'Lightning'
      : to.blockchain === Blockchain.ETHEREUM
        ? 'Arbitrum / Optimism'
        : undefined);

  const outputInfo =
    type === TransactionType.BUY
      ? 'The output amount is computed as the input amount minus the DFX fee, bank fee and the network fee over the base rate. That is, {{output}} {{outputSymbol}} = ({{input}} {{inputSymbol}} - {{dfxFee}} {{feeSymbol}} - {{bankFee}} {{feeSymbol}} - {{networkFee}} {{feeSymbol}}) ÷ {{baseRate}}.'
      : type === TransactionType.SWAP
        ? 'The output amount is computed as the input amount minus the DFX fee and the network fee over the base rate. That is, {{output}} {{outputSymbol}} = ({{input}} {{inputSymbol}} - {{dfxFee}} {{feeSymbol}} - {{networkFee}} {{feeSymbol}}) ÷ {{baseRate}}.'
        : 'The output amount is computed as the input amount times the base rate minus the DFX fee, bank fee and the network fee. That is, {{output}} {{inputSymbol}} = {{input}} {{outputSymbol}} × {{baseRate}} - {{dfxFee}} {{feeSymbol}} - {{bankFee}} {{feeSymbol}} - {{networkFee}} {{feeSymbol}}.';

  return (
    <StyledCollapsible
      full
      label={translate('screens/payment', 'Exchange rate')}
      title={`${
        rate === Number.MAX_VALUE
          ? '∞'
          : 'blockchain' in from
            ? Utils.formatAmountCrypto(rate)
            : Utils.formatAmount(rate)
      } ${from.name}/${to.name}`}
    >
      <StyledVerticalStack gap={2}>
        <div className="grid gap-1 w-full text-sm grid-cols-[10rem_1fr]">
          <div className="text-dfxGray-800">{translate('screens/payment', 'Base rate')}</div>
          <StyledVerticalStack gap={1}>
            <div>{baseRate}</div>
            {steps.map((step, index) => {
              const inverse = 1 / step.price;
              const inverted =
                type === TransactionType.SELL &&
                step.price !== 0 &&
                Number.isFinite(step.price) &&
                Number.isFinite(inverse);
              return (
                <div key={index} className="flex flex-row gap-1 text-xs text-dfxGray-700 leading-tight">
                  <PathArrow className="w-2.5 h-2.5" />
                  {translate(
                    'screens/payment',
                    inverted
                      ? '{{from}} to {{to}} at {{price}} {{to}}/{{from}} on {{source}}'
                      : '{{from}} to {{to}} at {{price}} {{from}}/{{to}} on {{source}}',
                    {
                      source: step.source,
                      from: step.from,
                      to: step.to,
                      price: inverted ? Utils.formatAmountCrypto(inverse) : step.price,
                    },
                  )}
                </div>
              );
            })}
          </StyledVerticalStack>
          <div className="text-dfxGray-800">{translate('screens/payment', 'Total fee')}</div>
          <div>{totalFee}</div>
          <div className="text-dfxGray-800">{translate('screens/payment', 'DFX fee')}</div>
          <div>{dfxFee}</div>
          {platformFee && (
            <>
              <div className="text-dfxGray-800">{translate('screens/payment', 'Platform fee')}</div>
              <div>{platformFee}</div>
            </>
          )}
          {bankFixedFee && (
            <>
              <div className="text-dfxGray-800">{translate('screens/payment', 'Bank fee (fixed)')}</div>
              <div>{bankFixedFee}</div>
            </>
          )}
          {bankPercentFee && (
            <>
              <div className="text-dfxGray-800">{translate('screens/payment', 'Bank fee (percent)')}</div>
              <div>{bankPercentFee}</div>
            </>
          )}
          {bankFee && (
            <>
              <div className="text-dfxGray-800">{translate('screens/payment', 'Bank fee')}</div>
              <div>{bankFee}</div>
            </>
          )}
          <div className="text-dfxGray-800">{translate('screens/payment', 'Network fee')}</div>
          <StyledVerticalStack>
            <div>{networkFee}</div>
            {l1Replacement && (
              <div className="mt-1 text-xs text-dfxGray-700 leading-tight">
                {translate(
                  'screens/buy',
                  'Use {{chain}} as a Layer 2 solution to benefit from lower transaction fees',
                  { chain: l1Replacement },
                )}
              </div>
            )}
          </StyledVerticalStack>

          {networkStartFee && (
            <>
              <div className="text-dfxGray-800">{translate('screens/payment', 'Network start fee')}</div>
              <div>{networkStartFee}</div>
            </>
          )}
        </div>
        <StyledInfoText iconColor={IconColor.GRAY} discreet>
          {translate(`screens/${type.toLowerCase()}`, outputInfo, {
            input: amountIn,
            inputSymbol: from.name,
            output: amountOut,
            outputSymbol: to.name,
            dfxFee: fees.dfx,
            bankFee: fees.bank,
            networkFee: fees.network,
            feeSymbol,
            baseRate,
          })}
        </StyledInfoText>
        <StyledInfoText iconColor={IconColor.GRAY} discreet>
          {translate(
            'screens/payment',
            'This exchange rate is not guaranteed. The effective rate will be determined once the transactions have been received by DFX and the crypto assets can be delivered.',
          )}
        </StyledInfoText>
      </StyledVerticalStack>
    </StyledCollapsible>
  );
}
