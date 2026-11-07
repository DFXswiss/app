import { useSettingsContext } from '../../../contexts/settings.context';

interface PasskeyWalletCardProps {
  balance?: { chf: number; eur: number };
  currency: 'CHF' | 'EUR';
  onCurrencyChange: (currency: 'CHF' | 'EUR') => void;
  expanded: boolean;
  busy?: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSettings: () => void;
  onHome: () => void;
}

export default function PasskeyWalletCard({
  balance,
  currency,
  onCurrencyChange,
  expanded,
  busy,
  onExpandedChange,
  onSettings,
  onHome,
}: PasskeyWalletCardProps): JSX.Element {
  const { translate, locale } = useSettingsContext();
  const t = (key: string) => translate('screens/home', key);
  const button =
    'min-h-[44px] rounded-lg px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
  const currentSymbol = currency;
  const value = balance?.[currentSymbol.toLowerCase() as 'chf' | 'eur'];
  const formatted =
    value === undefined
      ? undefined
      : new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const lastSeparator = formatted ? Math.max(formatted.lastIndexOf('.'), formatted.lastIndexOf(',')) : -1;
  return (
    <header
      className="overflow-hidden rounded-[20px] text-white shadow-[0_3px_20px_-10px_rgba(0,0,0,0.25),0_12px_32px_rgba(7,36,64,0.14)]"
      style={{
        backgroundImage:
          'linear-gradient(180deg, rgba(17,57,98,.92), rgba(7,36,64,.96)), url(https://dfx.swiss/images/app/berge.jpg)',
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
    >
      <div className="px-5 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-3 text-[18px] font-semibold">
            <a
              href="/"
              aria-label={t('DFX home')}
              onClick={(event) => {
                if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                  event.preventDefault();
                  onHome();
                }
              }}
              className="flex min-h-[44px] items-center focus-visible:outline focus-visible:outline-2"
            >
              <svg
                className="h-5 w-auto"
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 544 170"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g clipPath="url(#dfxw_clip)">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M61.5031 0H124.245C170.646 0 208.267 36.5427 208.267 84.0393C208.267 131.536 169.766 170.018 122.288 170.018H61.5031V135.504H114.046C141.825 135.504 164.541 112.789 164.541 85.009C164.541 57.2293 141.825 34.5136 114.046 34.5136H61.5031V0ZM266.25 31.5686V76.4973H338.294V108.066H266.25V170H226.906V0H355.389V31.5686H266.25ZM495.76 170L454.71 110.975L414.396 170H369.216L432.12 83.5365L372.395 0H417.072L456.182 55.1283L494.557 0H537.061L477.803 82.082L541.191 170H495.778H495.76Z"
                    fill="white"
                  />
                  <path
                    d="M86.1582 126.274C109.821 126.274 129.004 107.092 129.004 83.4287C129.004 59.7657 109.821 40.583 86.1582 40.583C62.4952 40.583 43.3126 59.7657 43.3126 83.4287C43.3126 107.092 62.4952 126.274 86.1582 126.274Z"
                    fill="url(#dfxw_p0)"
                  />
                  <path
                    d="M47.1374 132.146C73.1707 132.146 94.2748 111.042 94.2748 85.009C94.2748 58.9757 73.1707 37.8716 47.1374 37.8716C21.1041 37.8716 0 58.9757 0 85.009C0 111.042 21.1041 132.146 47.1374 132.146Z"
                    fill="url(#dfxw_p1)"
                  />
                </g>
                <defs>
                  <linearGradient
                    id="dfxw_p0"
                    x1="122.111"
                    y1="64.6777"
                    x2="45.9618"
                    y2="103.949"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0.04" stopColor="#F5516C" />
                    <stop offset="0.14" stopColor="#C74863" />
                    <stop offset="0.31" stopColor="#853B57" />
                    <stop offset="0.44" stopColor="#55324E" />
                    <stop offset="0.55" stopColor="#382D49" />
                    <stop offset="0.61" stopColor="#2D2B47" />
                  </linearGradient>
                  <linearGradient
                    id="dfxw_p1"
                    x1="75.8868"
                    y1="50.7468"
                    x2="15.2815"
                    y2="122.952"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0.2" stopColor="#F5516C" />
                    <stop offset="1" stopColor="#6B3753" />
                  </linearGradient>
                  <clipPath id="dfxw_clip">
                    <rect width="541.174" height="170" fill="white" />
                  </clipPath>
                </defs>
              </svg>
            </a>
            <span className="h-4 border-l border-white/30" />
            {t('Wallet')}
          </h1>
          <button
            className={`${button} inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 text-sm`}
            disabled={busy}
            onClick={onSettings}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
            </svg>{' '}
            {t('Settings')}
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-sm">{t('Total balance')}</span>
          <div className="flex rounded-lg bg-white/10 p-1" aria-label={t('Currency')}>
            {(['CHF', 'EUR'] as const).map((symbol) => (
              <button
                key={symbol}
                aria-pressed={currentSymbol === symbol}
                className={`min-h-[44px] min-w-[52px] rounded-md px-2 text-sm ${
                  currentSymbol === symbol ? 'bg-white text-dfxBlue-800' : ''
                }`}
                onClick={() => onCurrencyChange(symbol)}
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
        <button
          className="my-2 block min-h-[56px] max-w-full text-left focus-visible:outline focus-visible:outline-2"
          onClick={() => onExpandedChange(!expanded)}
          aria-label={t('Total balance')}
        >
          {formatted === undefined ? (
            <span aria-label={t('Loading balance')} className="block h-12 w-48 animate-pulse rounded bg-white/20" />
          ) : (
            <span className="whitespace-nowrap">
              <span className="mr-2 text-xl">{currentSymbol === 'EUR' ? '€' : 'CHF'}</span>
              <span className="text-4xl font-bold sm:text-5xl">{formatted.slice(0, lastSeparator)}</span>
              <span className="text-2xl">{formatted.slice(lastSeparator)}</span>
            </span>
          )}
        </button>
      </div>
      <button
        aria-expanded={expanded}
        aria-controls="passkey-wallet-details"
        className="flex min-h-[48px] w-full items-center justify-between border-t border-white/20 bg-black/20 px-5 font-semibold focus-visible:outline focus-visible:outline-2"
        onClick={() => onExpandedChange(!expanded)}
      >
        {t(expanded ? 'Hide wallet' : 'Show wallet')}
        <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-white/10">
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
    </header>
  );
}
