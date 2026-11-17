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
