import { useSettingsContext } from '../../../contexts/settings.context';

export type WalletAction = 'Buy' | 'Sell' | 'Swap' | 'Send' | 'Receive' | 'Pay';

interface PasskeyWalletActionsProps {
  unlocked: boolean;
  busy?: boolean;
  onAction: (action: WalletAction) => void;
}

const actions: WalletAction[] = ['Buy', 'Sell', 'Swap', 'Send', 'Receive', 'Pay'];
const icons: Record<WalletAction, string> = {
  Buy: 'M12 5v14M5 12h14',
  Sell: 'M3 8a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2zM12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM6.5 9.5h.01M17.5 14.5h.01',
  Swap: 'M5 8h13l-3-3M19 16H6l3 3',
  Send: 'M7 17L17 7M9 7h8v8',
  Receive: 'M17 7L7 17M15 17H7V9',
  Pay: 'M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M7 12h10',
};

export default function PasskeyWalletActions({ unlocked, busy, onAction }: PasskeyWalletActionsProps): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <nav aria-label={translate('screens/home', 'Actions')} className="mt-5 grid grid-cols-3 gap-y-4 sm:grid-cols-6">
      {actions.map((action, index) => (
        <button
          key={action}
          disabled={busy && index < 3}
          className="flex min-h-[80px] flex-col items-center gap-2 rounded font-semibold focus-visible:outline focus-visible:outline-2"
          onClick={() => onAction(action)}
        >
          <span
            className={`relative grid h-14 w-14 place-items-center rounded-[16px] text-2xl ${
              action === 'Pay' ? 'bg-dfxRed-100 text-white' : 'bg-dfxGray-300'
            }`}
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={icons[action]} />
            </svg>
            {index >= 3 && !unlocked && (
              <span className="absolute -right-1 -top-1 grid h-[22px] w-[22px] place-items-center rounded-full border border-dfxGray-500 bg-white text-dfxBlue-800">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="6" y="11" width="12" height="9" rx="2" />
                  <path d="M9 11V8a3 3 0 016 0v3" />
                </svg>
              </span>
            )}
          </span>
          <span className="text-sm">{translate('screens/home', action)}</span>
        </button>
      ))}
    </nav>
  );
}
