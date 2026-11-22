const SIGNIFICANT_DIGITS = 5;

// At and above 0.001 this matches Utils.formatAmountCrypto: five significant digits, then at most
// five decimal places, without trailing zeros. Below that, all five significant digits stay.
export function formatSignificantAmount(amount: number): string {
  if (!Number.isFinite(amount)) return String(amount);
  if (amount === 0) return '0';

  const sign = amount < 0 ? '-' : '';
  const precise = Math.abs(amount).toPrecision(SIGNIFICANT_DIGITS);
  if (Number(precise) >= 0.001) {
    return (
      sign +
      Number(precise)
        .toFixed(SIGNIFICANT_DIGITS)
        .replace(/\.?0+$/, '')
    );
  }
  return sign + plainSmallAmount(precise);
}

function plainSmallAmount(precise: string): string {
  const exponential = /^(\d)\.(\d+)[eE]([+-]?\d+)$/.exec(precise);
  if (!exponential) return precise.replace(/(\.\d*?)0+$/, '$1');

  const digits = `${exponential[1]}${exponential[2]}`;
  const zeros = -Number(exponential[3]) - 1;
  return `0.${'0'.repeat(zeros)}${digits}`.replace(/0+$/, '');
}

// Fiat per asset on the sell payment page. At and above 1, and for 0 and non-finite values, this is
// Utils.formatAmount: two decimals and a space as the thousands separator (utils.js). Below 1,
// five significant digits, same as formatSignificantAmount.
export function formatFiatRate(amount: number): string {
  // Sell shows 1/rate. When the target amount is 0 the API sets rate to Number.MAX_VALUE
  // (transaction-helper.ts). 1/Number.MAX_VALUE (~5.56e-309) is that placeholder, not a price;
  // two decimals show 0.00, as before. A real small rate (for example 1.6667e-10) is larger
  // and keeps five significant digits.
  const apiZeroTargetPlaceholder = Number.isFinite(amount) && Math.abs(amount) <= 1 / Number.MAX_VALUE;
  if (!Number.isFinite(amount) || apiZeroTargetPlaceholder || Math.abs(amount) >= 1) {
    return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  return formatSignificantAmount(amount);
}
