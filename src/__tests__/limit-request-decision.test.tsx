// jest.mock factories may only reference variables whose name starts with `mock`.
const mockDecideLimitRequest = jest.fn();
const mockFileLimitRequestNote = jest.fn();
const mockToBase64 = jest.fn();

// Mocked wholesale rather than via requireActual: the real module pulls in @dfx.swiss/react, which
// ships ESM that this Jest setup cannot parse. The two exports the component reads at runtime are
// restated here; their values are the API's and are pinned by the hook test next to this one, which
// covers the call sequence itself. This file covers what the form is responsible for: which values
// reach the hook, and what the clerk is shown afterwards.
jest.mock('src/hooks/compliance.hook', () => ({
  LimitRequestDecision: { ACCEPTED: 'Accepted', PARTIALLY_ACCEPTED: 'PartiallyAccepted', REJECTED: 'Rejected' },
  LimitRequestGrantingDecisions: ['Accepted', 'PartiallyAccepted'],
  useCompliance: () => ({
    decideLimitRequest: mockDecideLimitRequest,
    fileLimitRequestNote: mockFileLimitRequestNote,
  }),
}));

// The component reads the picked file through this helper; jsdom's FileReader is stubbed out here so
// the test controls the encoded result.
jest.mock('src/util/utils', () => ({ toBase64: (file: File) => mockToBase64(file) }));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string, params?: Record<string, string | number>) =>
      params ? Object.entries(params).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(String(v)), key) : key,
  }),
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => ({ name: 'JR', isLoading: false }),
}));

jest.mock('src/components/error-hint', () => {
  // The factory runs before this file's imports, so React has to be required here.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    ErrorHint: ({ message }: { message: string }) =>
      React.createElement('div', { 'data-testid': 'error-hint' }, message),
  };
});

import { act, fireEvent, render, screen } from '@testing-library/react';
import { LimitRequestDecisionForm } from 'src/components/compliance/limit-request-decision-form';

const LIMIT_REQUEST_ID = 42;
const USER_DATA_ID = 397328;
const REQUESTED = 500000;
const CURRENT_LIMIT = 100000;
const CONTEXT = { limitRequestId: LIMIT_REQUEST_ID, userDataId: USER_DATA_ID };

function renderForm(overrides: Partial<Parameters<typeof LimitRequestDecisionForm>[0]> = {}) {
  const onDecided = jest.fn();
  render(
    <LimitRequestDecisionForm
      limitRequestId={LIMIT_REQUEST_ID}
      userDataId={USER_DATA_ID}
      requestedLimit={REQUESTED}
      fundOrigin="Savings"
      investmentDate="Now"
      currentDepositLimit={CURRENT_LIMIT}
      onDecided={onDecided}
      {...overrides}
    />,
  );
  return onDecided;
}

function selectDecision(value: string) {
  fireEvent.change(screen.getByLabelText('Decision', { selector: 'select' }), { target: { value } });
}

function saveButton(name = 'Save decision'): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

async function clickSave() {
  await act(async () => {
    fireEvent.click(saveButton());
  });
}

describe('LimitRequestDecisionForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDecideLimitRequest.mockResolvedValue({ success: true, completedSteps: [] });
    mockFileLimitRequestNote.mockResolvedValue({ success: true, completedSteps: ['log'] });
    mockToBase64.mockImplementation(async (file: File) =>
      file.name === 'Kaufvertrag.pdf' ? 'data:application/pdf;base64,Y29udHJhY3Q=' : 'data:text/plain;base64,eA==',
    );
  });

  it('requires a decision before it can be saved', () => {
    renderForm();

    expect(saveButton()).toBeDisabled();

    selectDecision('Rejected');
    expect(saveButton()).not.toBeDisabled();
  });

  it('submits an acceptance with the requested amount prefilled', async () => {
    const onDecided = renderForm();

    selectDecision('Accepted');
    await clickSave();

    expect(mockDecideLimitRequest).toHaveBeenCalledWith(CONTEXT, 'Accepted', {
      clerk: 'JR',
      requestedLimit: REQUESTED,
      grantedLimit: REQUESTED,
      currentDepositLimit: CURRENT_LIMIT,
      comment: undefined,
      fundOrigin: 'Savings',
      investmentDate: 'Now',
    });
    expect(onDecided).toHaveBeenCalledTimes(1);
  });

  it('disables the amount field on full acceptance and keeps it at the requested amount', () => {
    renderForm();
    selectDecision('Accepted');

    const input = screen.getByLabelText('Accepted limit (CHF)', { selector: 'input' }) as HTMLInputElement;
    expect(input).toBeDisabled();
    expect(input.value).toBe(String(REQUESTED));
  });

  it('submits the edited amount for a partial acceptance', async () => {
    renderForm();

    selectDecision('PartiallyAccepted');
    fireEvent.change(screen.getByLabelText('Accepted limit (CHF)', { selector: 'input' }), {
      target: { value: '200000' },
    });
    await clickSave();

    expect(mockDecideLimitRequest).toHaveBeenCalledWith(
      CONTEXT,
      'PartiallyAccepted',
      expect.objectContaining({ grantedLimit: 200000 }),
    );
  });

  it('blocks an empty or non-positive amount on a granting decision', () => {
    renderForm();
    selectDecision('PartiallyAccepted');
    const input = screen.getByLabelText('Accepted limit (CHF)', { selector: 'input' });

    fireEvent.change(input, { target: { value: '' } });
    expect(saveButton()).toBeDisabled();

    fireEvent.change(input, { target: { value: '0' } });
    expect(saveButton()).toBeDisabled();

    fireEvent.change(input, { target: { value: '150000' } });
    expect(saveButton()).not.toBeDisabled();
  });

  // A partial amount must sit strictly between the current annual limit and the requested amount.
  it('enforces partial-acceptance bounds against the requested amount and the current limit', () => {
    renderForm();
    selectDecision('PartiallyAccepted');
    const input = screen.getByLabelText('Accepted limit (CHF)', { selector: 'input' }) as HTMLInputElement;

    // Field is cleared on selecting PartiallyAccepted.
    expect(input.value).toBe('');
    expect(saveButton()).toBeDisabled();

    // Equal to the requested amount is not a partial acceptance.
    fireEvent.change(input, { target: { value: String(REQUESTED) } });
    expect(saveButton()).toBeDisabled();
    expect(screen.getByTestId('accepted-limit-hint')).toBeInTheDocument();

    // Equal to (or below) the current limit would not raise anything.
    fireEvent.change(input, { target: { value: String(CURRENT_LIMIT) } });
    expect(saveButton()).toBeDisabled();
    expect(screen.getByTestId('accepted-limit-hint')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '150000' } });
    expect(saveButton()).not.toBeDisabled();
    expect(screen.queryByTestId('accepted-limit-hint')).not.toBeInTheDocument();
  });

  it('shows the accepted-limit hint only while a partial amount is invalid', () => {
    renderForm();
    selectDecision('PartiallyAccepted');
    const input = screen.getByLabelText('Accepted limit (CHF)', { selector: 'input' });

    expect(screen.queryByTestId('accepted-limit-hint')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: String(REQUESTED) } });
    expect(screen.getByTestId('accepted-limit-hint')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '150000' } });
    expect(screen.queryByTestId('accepted-limit-hint')).not.toBeInTheDocument();
  });

  // A rejection grants nothing, so the amount field has no meaning there and must not travel with it.
  it('hides the amount and grants none on a rejection', async () => {
    renderForm();

    selectDecision('Rejected');
    expect(screen.queryByLabelText('Accepted limit (CHF)', { selector: 'input' })).not.toBeInTheDocument();
    await clickSave();

    expect(mockDecideLimitRequest).toHaveBeenCalledWith(
      CONTEXT,
      'Rejected',
      expect.objectContaining({ grantedLimit: undefined, currentDepositLimit: CURRENT_LIMIT }),
    );
  });

  it('passes the optional file note along', async () => {
    renderForm();

    selectDecision('Rejected');
    fireEvent.change(screen.getByLabelText('Internal file note', { selector: 'input' }), {
      target: { value: 'Unterlagen nicht nachgereicht' },
    });
    await clickSave();

    expect(mockDecideLimitRequest).toHaveBeenCalledWith(
      CONTEXT,
      'Rejected',
      expect.objectContaining({ comment: 'Unterlagen nicht nachgereicht' }),
    );
  });

  // Partial application is the dangerous state: some steps already landed while later ones did not.
  // The clerk has to see that before retrying.
  it('names the steps that already landed when the sequence fails midway', async () => {
    const onDecided = renderForm();
    mockDecideLimitRequest.mockResolvedValue({
      success: false,
      failedStep: 'limitRequest',
      completedSteps: ['report'],
      message: 'Limit request already final',
    });

    selectDecision('Accepted');
    await clickSave();

    // Byte-exact: a regression in the parenthesis/space split between template and translation key
    // (double or missing brackets) must not survive a substring match.
    expect(screen.getByTestId('error-hint').textContent).toBe(
      'Limit request already final (failed at: limitRequest) (already applied: report)',
    );
    expect(onDecided).not.toHaveBeenCalled();
    // The form stays usable so the clerk can retry or pick another decision.
    expect(saveButton()).not.toBeDisabled();
  });

  it('reports a failure that landed nothing without naming any step', async () => {
    renderForm();
    mockDecideLimitRequest.mockResolvedValue({
      success: false,
      failedStep: 'report',
      completedSteps: [],
      message: 'nope',
    });

    selectDecision('Accepted');
    await clickSave();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('nope');
    expect(screen.getByTestId('error-hint')).toHaveTextContent('failed at: report');
    expect(screen.getByTestId('error-hint')).not.toHaveTextContent('already applied');
  });

  it('reads the selected customer document and passes it along', async () => {
    renderForm();

    const file = new File(['contract'], 'Kaufvertrag.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Customer document (optional)', { selector: 'input' }), {
      target: { files: [file] },
    });
    expect(screen.getByText(/Kaufvertrag\.pdf/)).toBeInTheDocument();

    selectDecision('Accepted');
    await clickSave();

    expect(mockDecideLimitRequest).toHaveBeenCalledWith(
      CONTEXT,
      'Accepted',
      expect.objectContaining({
        attachment: { data: 'data:application/pdf;base64,Y29udHJhY3Q=', name: 'Kaufvertrag.pdf' },
      }),
    );
  });

  // A document that cannot be read must stop the decision rather than record it without the proof the
  // clerk meant to file.
  it('reports an unreadable document and decides nothing', async () => {
    mockToBase64.mockResolvedValueOnce(undefined);
    renderForm();

    fireEvent.change(screen.getByLabelText('Customer document (optional)', { selector: 'input' }), {
      target: { files: [new File(['x'], 'broken.pdf', { type: 'application/pdf' })] },
    });
    selectDecision('Accepted');
    await clickSave();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('could not be read');
    expect(mockDecideLimitRequest).not.toHaveBeenCalled();
  });

  // The API validates both target columns with @IsInt, so a decimal would come back as a 400 rather
  // than being rounded. The form has to refuse it before the call.
  it('refuses a decimal amount', () => {
    renderForm();
    selectDecision('PartiallyAccepted');
    const input = screen.getByLabelText('Accepted limit (CHF)', { selector: 'input' });

    fireEvent.change(input, { target: { value: '150000.5' } });
    expect(saveButton()).toBeDisabled();

    fireEvent.change(input, { target: { value: '150000' } });
    expect(saveButton()).not.toBeDisabled();
  });

  describe('when the request is already decided', () => {
    // The API refuses to change a final decision. Without this mode a decision whose report or note
    // failed halfway could never be completed, and a document arriving later would have nowhere to go.
    it('offers filing a note instead of a decision', () => {
      renderForm({ decidedAs: 'Accepted' });

      expect(screen.queryByLabelText('Decision', { selector: 'select' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Accepted limit (CHF)', { selector: 'input' })).not.toBeInTheDocument();
      expect(screen.getByText(/already decided \(Accepted\)/)).toBeInTheDocument();
      // Nothing to file yet: neither a note nor a document.
      expect(saveButton('Save file note')).toBeDisabled();
    });

    it('files a note against the recorded decision', async () => {
      const onDecided = renderForm({ decidedAs: 'Rejected' });

      fireEvent.change(screen.getByLabelText('Internal file note', { selector: 'input' }), {
        target: { value: 'Beleg nachgereicht' },
      });
      await act(async () => {
        fireEvent.click(saveButton('Save file note'));
      });

      expect(mockFileLimitRequestNote).toHaveBeenCalledWith(CONTEXT, {
        clerk: 'JR',
        decision: 'Rejected',
        comment: 'Beleg nachgereicht',
        attachment: undefined,
      });
      expect(mockDecideLimitRequest).not.toHaveBeenCalled();
      expect(onDecided).toHaveBeenCalledTimes(1);
    });

    it('files a document alone, without a note', async () => {
      renderForm({ decidedAs: 'Accepted' });

      fireEvent.change(screen.getByLabelText('Customer document (optional)', { selector: 'input' }), {
        target: { files: [new File(['contract'], 'Kaufvertrag.pdf', { type: 'application/pdf' })] },
      });
      expect(saveButton('Save file note')).not.toBeDisabled();

      await act(async () => {
        fireEvent.click(saveButton('Save file note'));
      });

      expect(mockFileLimitRequestNote).toHaveBeenCalledWith(
        CONTEXT,
        expect.objectContaining({
          attachment: { data: 'data:application/pdf;base64,Y29udHJhY3Q=', name: 'Kaufvertrag.pdf' },
        }),
      );
    });
  });

  // FileReader can reject as well as resolve empty; an escaping rejection would leave the button stuck
  // on "Saving..." with no error and no way back except reloading the page.
  it('recovers when reading the document throws', async () => {
    mockToBase64.mockRejectedValueOnce(new Error('read failed'));
    renderForm();

    fireEvent.change(screen.getByLabelText('Customer document (optional)', { selector: 'input' }), {
      target: { files: [new File(['x'], 'broken.pdf', { type: 'application/pdf' })] },
    });
    selectDecision('Accepted');
    await clickSave();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('could not be read');
    expect(mockDecideLimitRequest).not.toHaveBeenCalled();
    expect(saveButton()).not.toBeDisabled();
  });

  it('clears the note and the document after a successful decision', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Internal file note', { selector: 'input' }), {
      target: { value: 'Hausverkauf' },
    });
    fireEvent.change(screen.getByLabelText('Customer document (optional)', { selector: 'input' }), {
      target: { files: [new File(['contract'], 'Kaufvertrag.pdf', { type: 'application/pdf' })] },
    });
    selectDecision('Accepted');
    await clickSave();

    expect(screen.getByLabelText('Internal file note', { selector: 'input' })).toHaveValue('');
    expect(screen.queryByText(/Kaufvertrag\.pdf/)).not.toBeInTheDocument();
  });

  it('blocks a second submit while the first is still running', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockDecideLimitRequest.mockReturnValue(new Promise((resolve) => (release = resolve)));
    renderForm();

    selectDecision('Rejected');
    await act(async () => {
      fireEvent.click(saveButton());
    });

    expect(saveButton('Saving...')).toBeDisabled();

    await act(async () => {
      release({ success: true, completedSteps: [] });
    });
    expect(mockDecideLimitRequest).toHaveBeenCalledTimes(1);
  });

  // Once the decision is recorded the API refuses to change it. Without switching modes right away, a
  // retry would re-fire the decision sequence and fail again.
  it('switches to note mode when the decision landed but a later step failed', async () => {
    renderForm();
    mockDecideLimitRequest.mockResolvedValue({
      success: false,
      failedStep: 'log',
      completedSteps: ['report', 'limitRequest'],
      message: 'log down',
    });

    selectDecision('Accepted');
    await clickSave();

    expect(screen.getByTestId('error-hint').textContent).toBe(
      'log down (failed at: log) (already applied: report, limitRequest)',
    );
    expect(screen.queryByLabelText('Decision', { selector: 'select' })).not.toBeInTheDocument();
    expect(screen.getByText(/already decided \(Accepted\)/)).toBeInTheDocument();
  });

  // Core race-window fix: after a successful decision the form must lock into note-only mode in the
  // same render cycle, before the parent reloads via onDecided. Without this a second click can re-
  // fire decideLimitRequest while the parent is still refreshing.
  it('locks into note mode immediately after a successful decision, before the parent reloads', async () => {
    renderForm();
    mockDecideLimitRequest.mockResolvedValue({ success: true, completedSteps: ['report', 'limitRequest', 'log'] });

    selectDecision('Rejected');
    await clickSave();

    expect(mockDecideLimitRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Save decision' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save file note' })).toBeInTheDocument();

    // a further click must not re-trigger the decision call
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save file note' }));
    });
    expect(mockDecideLimitRequest).toHaveBeenCalledTimes(1);
  });

  it('signs the decision with the loaded verified name and has no clerk select', async () => {
    renderForm();

    expect(screen.queryByRole('combobox', { name: 'Clerk' })).not.toBeInTheDocument();
    expect(screen.getByText('JR')).toBeInTheDocument();

    selectDecision('Rejected');
    await clickSave();
    expect(mockDecideLimitRequest).toHaveBeenCalledWith(CONTEXT, 'Rejected', expect.objectContaining({ clerk: 'JR' }));
  });
});
