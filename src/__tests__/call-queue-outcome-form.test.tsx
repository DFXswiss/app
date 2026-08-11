// Component tests for the call-queue outcome form: Completed and Failed decide the transaction on
// their own, so the AmlCheck selector disappears and the save sends an automatic Reset — but only
// for the queues the API excludes from its AML recheck. Every other outcome keeps the selector.

jest.mock('@dfx.swiss/react-components', () => ({
  StyledButton: ({ label, onClick, disabled }: any) => (
    <button disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonWidth: { FULL: 'full' },
}));
jest.mock('src/components/error-hint', () => ({ ErrorHint: () => null }));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

const mockSaveCallOutcome = jest.fn();
// The hook module is mocked wholesale (importing it for real pulls @dfx.swiss/react into the test
// runtime). The queue mapping itself is pinned against the real implementation in
// compliance-call-outcome.hook.test.ts.
jest.mock('src/hooks/compliance.hook', () => ({
  CallOutcome: {
    COMPLETED: 'Completed',
    UNAVAILABLE: 'Unavailable',
    SUSPICIOUS: 'Suspicious',
    FAILED: 'Failed',
    REPEAT: 'Repeat',
  },
  needsExplicitAmlReset: (queue: string) => queue === 'ManualCheckIpCountryPhone',
  useCompliance: () => ({ saveCallOutcome: mockSaveCallOutcome }),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CallQueueOutcomeForm } from 'src/components/compliance/call-queue/call-queue-outcome-form';
import { CallOutcome } from 'src/hooks/compliance.hook';

const OUTCOMES = [
  CallOutcome.COMPLETED,
  CallOutcome.UNAVAILABLE,
  CallOutcome.SUSPICIOUS,
  CallOutcome.FAILED,
  CallOutcome.REPEAT,
];

// ManualCheckIpCountryPhone is the queue whose AML reason the cron skips — the one that needs the
// automatic reset. ManualCheckPhone is re-evaluated by the cron, so nothing must be sent there.
const TX_CONTEXT = {
  queue: 'ManualCheckIpCountryPhone',
  userDataId: 1,
  txId: 42,
  sourceType: 'BuyCrypto',
  amlCheck: 'Pass',
  amlReason: 'NA',
  buyCryptoResetEligible: true,
} as any;
const PLAIN_PHONE_TX_CONTEXT = { ...TX_CONTEXT, queue: 'ManualCheckPhone' };
const INELIGIBLE_TX_CONTEXT = { ...TX_CONTEXT, buyCryptoResetEligible: false };
const USER_CONTEXT = { queue: 'UnavailableSuspicious', userDataId: 1 } as any;

function renderForm(context: any) {
  return render(
    <CallQueueOutcomeForm
      context={context}
      availableOutcomes={OUTCOMES}
      clerks={['JR']}
      onSaved={jest.fn()}
      title="Save Outcome"
    />,
  );
}

function fillAndSubmit(outcome: CallOutcome, amlAction?: string) {
  const selects = screen.getAllByRole('combobox');
  fireEvent.change(selects[1], { target: { value: outcome } });
  if (amlAction !== undefined) fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: amlAction } });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'called' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Outcome' }));
}

function submittedAmlAction(): string | undefined {
  return mockSaveCallOutcome.mock.calls[0][2].amlAction;
}

describe('CallQueueOutcomeForm AmlCheck action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveCallOutcome.mockResolvedValue({ success: true, completedSteps: ['transaction', 'userData', 'log'] });
  });

  it.each([[CallOutcome.COMPLETED], [CallOutcome.FAILED]])(
    'hides the AmlCheck action on %s and resets the transaction on a recheck-blocked queue',
    async (outcome) => {
      renderForm(TX_CONTEXT);
      expect(screen.getAllByRole('combobox')).toHaveLength(3);

      fillAndSubmit(outcome);

      expect(screen.getAllByRole('combobox')).toHaveLength(2);
      await waitFor(() => expect(mockSaveCallOutcome).toHaveBeenCalledTimes(1));
      expect(mockSaveCallOutcome).toHaveBeenCalledWith(TX_CONTEXT, outcome, {
        signature: 'JR',
        comment: 'called',
        amlAction: 'Reset',
      });
    },
  );

  // The plain phone queue is picked up by the AML recheck cron once the check date is written, so
  // touching the transaction from here would only pre-empt the API's own decision.
  it.each([[CallOutcome.COMPLETED], [CallOutcome.FAILED]])(
    'hides the AmlCheck action on %s and sends nothing for a queue the cron re-evaluates',
    async (outcome) => {
      renderForm(PLAIN_PHONE_TX_CONTEXT);

      fillAndSubmit(outcome);

      expect(screen.getAllByRole('combobox')).toHaveLength(2);
      await waitFor(() => expect(mockSaveCallOutcome).toHaveBeenCalledTimes(1));
      expect(submittedAmlAction()).toBeUndefined();
    },
  );

  it('keeps the selector for open-ended outcomes and submits the choice', async () => {
    renderForm(TX_CONTEXT);

    fillAndSubmit(CallOutcome.UNAVAILABLE, 'Pass');

    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    await waitFor(() => expect(mockSaveCallOutcome).toHaveBeenCalledTimes(1));
    expect(mockSaveCallOutcome.mock.calls[0][1]).toBe(CallOutcome.UNAVAILABLE);
    expect(submittedAmlAction()).toBe('Pass');
  });

  it('defaults an open-ended outcome to no change', async () => {
    renderForm(TX_CONTEXT);

    fillAndSubmit(CallOutcome.REPEAT);

    await waitFor(() => expect(mockSaveCallOutcome).toHaveBeenCalledTimes(1));
    expect(submittedAmlAction()).toBeUndefined();
  });

  // A choice made before switching to Completed/Failed is not submitted; switching back must not
  // silently re-arm it either.
  it('drops a previous selection when the outcome changes', async () => {
    renderForm(TX_CONTEXT);
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: CallOutcome.UNAVAILABLE } });
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'Fail' } });

    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: CallOutcome.COMPLETED } });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: CallOutcome.UNAVAILABLE } });
    expect((screen.getAllByRole('combobox')[2] as HTMLSelectElement).value).toBe('');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'called' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Outcome' }));

    await waitFor(() => expect(mockSaveCallOutcome).toHaveBeenCalledTimes(1));
    expect(submittedAmlAction()).toBeUndefined();
  });

  it('does not offer an AmlCheck action for user-based queue items', async () => {
    renderForm(USER_CONTEXT);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: CallOutcome.COMPLETED } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'called' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Outcome' }));

    await waitFor(() => expect(mockSaveCallOutcome).toHaveBeenCalledTimes(1));
    expect(submittedAmlAction()).toBeUndefined();
  });

  it('hides Reset and explains the prerequisite when BuyCrypto is ineligible', () => {
    renderForm(INELIGIBLE_TX_CONTEXT);

    expect(screen.queryByRole('option', { name: 'Reset' })).not.toBeInTheDocument();
    expect(screen.getByText(/Reset is available only after KYC is set to Check/)).toBeInTheDocument();
  });

  // Fail-closed: an ineligible BuyCrypto must not silently swallow the automatic reset. Saving a
  // no-op would report success and navigate away while the transaction stays pending, so the form
  // blocks the save until KYC is set to Check.
  it('disables the save and explains why when the automatic reset is unavailable', async () => {
    renderForm(INELIGIBLE_TX_CONTEXT);

    fillAndSubmit(CallOutcome.COMPLETED);

    expect(screen.getByText(/Saving is disabled/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Outcome' })).toBeDisabled();
    await waitFor(() => expect(mockSaveCallOutcome).not.toHaveBeenCalled());
  });

  // The block is specific to the recheck-excluded queue: on a cron-re-evaluated queue the save
  // legitimately sends nothing, so an ineligible BuyCrypto must not get in the way there.
  it('keeps the save enabled for an ineligible BuyCrypto on a cron-re-evaluated queue', async () => {
    renderForm({ ...INELIGIBLE_TX_CONTEXT, queue: 'ManualCheckPhone' });

    fillAndSubmit(CallOutcome.COMPLETED);

    await waitFor(() => expect(mockSaveCallOutcome).toHaveBeenCalledTimes(1));
    expect(submittedAmlAction()).toBeUndefined();
  });

  it('offers Reset when BuyCrypto is eligible', () => {
    renderForm(TX_CONTEXT);

    expect(screen.getByRole('option', { name: 'Reset' })).toBeInTheDocument();
  });
});
