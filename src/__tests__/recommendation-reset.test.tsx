// Component tests for RecommendationReset: which values reach the API and the KYC log, the guards around
// the request, and what the clerk sees when the API refuses or the clerk has no verified name.

const mockStaffName: { name?: string; isLoading: boolean; error?: string } = { name: 'JR', isLoading: false };
const mockUpdateKycStep = jest.fn();
const mockCreateKycLog = jest.fn();

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ updateKycStep: mockUpdateKycStep, createKycLog: mockCreateKycLog }),
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => mockStaffName,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <p data-testid="error-hint">{message}</p>,
}));

// The helper module pulls in @dfx.swiss/react (ESM this Jest setup cannot parse); the one function the
// form uses is the log message builder, replaced by a readable stand-in.
jest.mock('src/util/compliance-helpers', () => ({
  buildKycLogMessage: (parts: { description: string; clerk: string; results: { value: string }[]; comment?: string }) =>
    `${parts.description}|${parts.clerk}|${parts.results.map((r) => r.value).join(',')}|${parts.comment}`,
}));
jest.mock('@dfx.swiss/react', () => ({ UserRole: {} }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecommendationReset } from 'src/components/compliance/recommendation-reset';
import type { KycStepInfo } from 'src/hooks/compliance.hook';

const step: KycStepInfo = {
  id: 838917,
  name: 'Recommendation',
  status: 'InternalReview',
  sequenceNumber: 0,
  created: '2026-09-17T12:07:48.196Z',
  recommender: { id: 302951, firstname: 'Manfred', surname: 'Patzwahl' },
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderForm(props: Partial<{ onClose: jest.Mock; onReset: jest.Mock }> = {}) {
  return render(
    <RecommendationReset
      userDataId="425053"
      step={step}
      onClose={props.onClose ?? jest.fn()}
      onReset={props.onReset ?? jest.fn()}
    />,
  );
}

function fillReason(reason: string): void {
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: reason } });
}

describe('RecommendationReset', () => {
  beforeEach(() => {
    mockUpdateKycStep.mockReset();
    mockCreateKycLog.mockReset();
    mockStaffName.name = 'JR';
    mockStaffName.isLoading = false;
    mockStaffName.error = undefined;
  });

  it('disables Save until a reason is entered and shows the clerk', () => {
    renderForm();

    expect(screen.getByText('JR')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fillReason('   ');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fillReason('wrong code');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('closes the step as Canceled with the reason, writes the log entry and reports the reset', async () => {
    mockUpdateKycStep.mockResolvedValue(undefined);
    mockCreateKycLog.mockResolvedValue(undefined);
    const onReset = jest.fn();
    renderForm({ onReset });

    fillReason('wrong code; typo');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onReset).toHaveBeenCalledWith(838917, undefined));
    expect(mockUpdateKycStep).toHaveBeenCalledWith(838917, { status: 'Canceled', comment: 'Reset: wrong code, typo' });
    expect(mockCreateKycLog).toHaveBeenCalledWith(425053, 'Recommendation|JR|Canceled|Reset: wrong code, typo');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('starts one update for two clicks in the same tick and locks the form while it runs', async () => {
    const deferred = createDeferred<void>();
    mockUpdateKycStep.mockReturnValue(deferred.promise);
    mockCreateKycLog.mockResolvedValue(undefined);
    const onReset = jest.fn();
    renderForm({ onReset });

    fillReason('typo');
    const save = screen.getByRole('button', { name: 'Save' });
    await act(async () => {
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockUpdateKycStep).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Reason')).toBeDisabled();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1));
  });

  it('still reports a reset that finishes after the form is gone, without touching the form', async () => {
    const deferred = createDeferred<void>();
    mockUpdateKycStep.mockReturnValue(deferred.promise);
    mockCreateKycLog.mockResolvedValue(undefined);
    const onReset = jest.fn();
    const { unmount } = renderForm({ onReset });

    fillReason('typo');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    unmount();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
    await waitFor(() => expect(onReset).toHaveBeenCalledWith(838917, undefined));
  });

  it('reports the reset with a warning when the log entry fails', async () => {
    mockUpdateKycStep.mockResolvedValue(undefined);
    mockCreateKycLog.mockRejectedValue(new Error('log down'));
    const onReset = jest.fn();
    renderForm({ onReset });

    fillReason('typo');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onReset).toHaveBeenCalledWith(838917, 'log down'));
    expect(mockUpdateKycStep).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic log warning when the failure is not an Error', async () => {
    mockUpdateKycStep.mockResolvedValue(undefined);
    mockCreateKycLog.mockRejectedValue('nope');
    const onReset = jest.fn();
    renderForm({ onReset });

    fillReason('typo');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onReset).toHaveBeenCalledWith(838917, 'Failed to write the KYC log entry'));
  });

  it('shows the API message when the reset is refused, keeps the form open and does not log', async () => {
    mockUpdateKycStep.mockRejectedValue(new Error('Step not found'));
    const onReset = jest.fn();
    renderForm({ onReset });

    fillReason('typo');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Step not found')).toBeInTheDocument());
    expect(mockCreateKycLog).not.toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('falls back to a generic message when the refusal is not an Error', async () => {
    mockUpdateKycStep.mockRejectedValue('nope');
    renderForm();

    fillReason('typo');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Failed to reset the recommendation')).toBeInTheDocument());
  });

  it('drops a refusal that arrives after the form is gone', async () => {
    const deferred = createDeferred<void>();
    mockUpdateKycStep.mockReturnValue(deferred.promise);
    const onReset = jest.fn();
    const { unmount } = renderForm({ onReset });

    fillReason('typo');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    unmount();

    await act(async () => {
      deferred.reject(new Error('late'));
      await deferred.promise.catch(() => undefined);
    });
    expect(onReset).not.toHaveBeenCalled();
    expect(mockCreateKycLog).not.toHaveBeenCalled();
  });

  it('closes on Cancel', () => {
    const onClose = jest.fn();
    renderForm({ onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('refuses to save without a verified clerk name and says why', () => {
    mockStaffName.name = undefined;
    renderForm();

    fillReason('typo');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Staff identification requires a verified name');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('names the load error when the clerk name could not be fetched', () => {
    mockStaffName.name = undefined;
    mockStaffName.error = 'network';
    renderForm();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('Could not load your verified name: network');
  });

  it('waits while the clerk name is loading', () => {
    mockStaffName.name = undefined;
    mockStaffName.isLoading = true;
    renderForm();

    fillReason('typo');
    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });
});
