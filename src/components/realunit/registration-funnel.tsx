import { useSettingsContext } from 'src/contexts/settings.context';
import { RealUnitRegistrationStats } from 'src/dto/realunit.dto';

interface RegistrationFunnelProps {
  stats: RealUnitRegistrationStats;
}

interface FunnelStage {
  key: string;
  value: number;
}

function pct(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}

function FunnelConnector({ fromPct, toPct }: { fromPct: number; toPct: number }) {
  const topLeft = (100 - fromPct) / 2;
  const topRight = topLeft + fromPct;
  const botLeft = (100 - toPct) / 2;
  const botRight = botLeft + toPct;

  return (
    <svg viewBox="0 0 100 20" className="w-full h-6" preserveAspectRatio="none" aria-hidden>
      <polygon points={`${topLeft},0 ${topRight},0 ${botRight},20 ${botLeft},20`} fill="#5A81BB" />
    </svg>
  );
}

export const RegistrationFunnel = ({ stats }: RegistrationFunnelProps) => {
  const { translate } = useSettingsContext();
  const { completed, manualReview, confirmed } = stats.snapshot;
  const registered = completed + manualReview;
  const head = Math.max(registered, 1);
  const stages: FunnelStage[] = [
    { key: 'Registered', value: registered },
    { key: 'Completed', value: completed },
  ];

  return (
    <div className="flex flex-col items-center text-dfxBlue-500 w-full">
      {stages.map((stage, index) => {
        const previous = index > 0 ? stages[index - 1] : stage;
        const drop = previous.value - stage.value;
        const widthPct = Math.min(100, (stage.value / head) * 100);
        const prevWidthPct = Math.min(100, (previous.value / head) * 100);

        return (
          <div key={stage.key} className="w-full flex flex-col items-center">
            {index > 0 && (
              <div className="relative w-full">
                <FunnelConnector fromPct={prevWidthPct} toPct={widthPct} />
                {drop > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-white text-dfxBlue-800 text-xs px-2 py-0.5 text-center leading-tight">
                      <div>
                        −{drop.toLocaleString()} (−{pct(drop, previous.value)}%)
                      </div>
                      <div>{translate('screens/realunit', 'Manual review')}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="bg-dfxBlue-800 text-white py-4 px-4 text-center" style={{ width: `${widthPct}%` }}>
              <div className="text-xs opacity-90">{translate('screens/realunit', stage.key)}</div>
              <div className="text-lg font-semibold">
                {stage.value.toLocaleString()}
                <span className="text-sm font-normal ml-2">{pct(stage.value, head)}%</span>
              </div>
            </div>
          </div>
        );
      })}
      <div className="mt-4 text-sm text-dfxGray-800">
        {translate('screens/realunit', 'Confirmed')}{' '}
        <span className="font-semibold text-dfxBlue-800">{confirmed.toLocaleString()}</span>
        <span className="ml-2">{pct(confirmed, head)}%</span>
      </div>
    </div>
  );
};
