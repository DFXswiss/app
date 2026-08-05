import { KycStepBase, KycStepName, KycStepStatus } from '@dfx.swiss/react';
import { useSettingsContext } from '../contexts/settings.context';

export function KycStepResultHint({ step }: { step: KycStepBase }): JSX.Element {
  const { translate } = useSettingsContext();

  if (step.status === KycStepStatus.FAILED) {
    return (
      <>
        <p className="text-dfxRed-100">{translate('screens/kyc', 'This step has failed.')}</p>
        {step.reason && <p className="text-dfxGray-800 text-sm">{step.reason}</p>}
      </>
    );
  }

  if (step.status === KycStepStatus.IN_REVIEW && step.name === KycStepName.RECOMMENDATION) {
    return (
      <p className="text-dfxGray-700">
        {translate(
          'screens/kyc',
          'Your recommendation request has been sent. Your contact person has to confirm it before you can continue.',
        )}
      </p>
    );
  }

  return <p className="text-dfxGray-700">{translate('screens/kyc', 'This step has already been finished.')}</p>;
}
