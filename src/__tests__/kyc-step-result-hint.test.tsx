import { render, screen } from '@testing-library/react';
import { KycStepBase, KycStepName, KycStepReason, KycStepStatus } from '@dfx.swiss/react';

jest.mock('@dfx.swiss/react', () => ({
  KycStepName: {
    RECOMMENDATION: 'Recommendation',
    IDENT: 'Ident',
  },
  KycStepStatus: {
    IN_REVIEW: 'InReview',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
  },
  KycStepReason: {
    ACCOUNT_EXISTS: 'AccountExists',
  },
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_scope: string, key: string) => key,
  }),
}));

import { KycStepResultHint } from '../components/kyc-step-result-hint';

const PENDING =
  'Your recommendation request has been sent. Your contact person has to confirm it before you can continue.';
const FINISHED = 'This step has already been finished.';
const FAILED = 'This step has failed.';

function step(partial: Pick<KycStepBase, 'name' | 'status'> & Partial<KycStepBase>): KycStepBase {
  return {
    sequenceNumber: 1,
    ...partial,
  };
}

describe('KycStepResultHint', () => {
  it('shows the pending recommendation text when Recommendation is InReview', () => {
    render(<KycStepResultHint step={step({ name: KycStepName.RECOMMENDATION, status: KycStepStatus.IN_REVIEW })} />);

    expect(screen.getByText(PENDING)).toBeInTheDocument();
    expect(screen.queryByText(FINISHED)).toBeNull();
    expect(screen.queryByText(FAILED)).toBeNull();
  });

  it('shows the finished text when Recommendation is Completed', () => {
    render(<KycStepResultHint step={step({ name: KycStepName.RECOMMENDATION, status: KycStepStatus.COMPLETED })} />);

    expect(screen.getByText(FINISHED)).toBeInTheDocument();
    expect(screen.queryByText(PENDING)).toBeNull();
    expect(screen.queryByText(FAILED)).toBeNull();
  });

  it('shows the finished text when Ident is InReview', () => {
    render(<KycStepResultHint step={step({ name: KycStepName.IDENT, status: KycStepStatus.IN_REVIEW })} />);

    expect(screen.getByText(FINISHED)).toBeInTheDocument();
    expect(screen.queryByText(PENDING)).toBeNull();
    expect(screen.queryByText(FAILED)).toBeNull();
  });

  it('shows the failed text and reason when Recommendation is Failed', () => {
    render(
      <KycStepResultHint
        step={step({
          name: KycStepName.RECOMMENDATION,
          status: KycStepStatus.FAILED,
          reason: KycStepReason.ACCOUNT_EXISTS,
        })}
      />,
    );

    expect(screen.getByText(FAILED)).toBeInTheDocument();
    expect(screen.getByText(KycStepReason.ACCOUNT_EXISTS)).toBeInTheDocument();
    expect(screen.queryByText(PENDING)).toBeNull();
    expect(screen.queryByText(FINISHED)).toBeNull();
  });
});
