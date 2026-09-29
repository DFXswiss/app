// Component tests for RecommendationPanel: the recommendation steps, the referrer box of the account,
// and that a saved code updates the box from the PUT response. Wallets for the box come from an
// in-panel getUserData fetch for userDataId — not from the parent users prop.

const mockNavigate = jest.fn();
const mockUpdateUsedRef = jest.fn();
const mockGetUserData = jest.fn();

// recommendation-graph.util imports compliance.hook, which loads a few @dfx.swiss/react enum values at
// module scope (ESM this Jest setup cannot parse), so the mock must provide them.
const mockSession: { role?: string } = { role: 'Compliance' };

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: jest.fn() }),
  useAuthContext: () => ({ session: mockSession }),
  UserRole: { USER: 'User', SUPPORT: 'Support', MARKETING: 'Marketing', COMPLIANCE: 'Compliance', ADMIN: 'Admin' },
  PhoneCallStatus: {
    COMPLETED: 'Completed',
    UNAVAILABLE: 'Unavailable',
    SUSPICIOUS: 'Suspicious',
    FAILED: 'Failed',
    REPEAT: 'Repeat',
  },
  CallQueue: {
    MANUAL_CHECK_PHONE: 'ManualCheckPhone',
    MANUAL_CHECK_IP_PHONE: 'ManualCheckIpPhone',
    MANUAL_CHECK_IP_COUNTRY_PHONE: 'ManualCheckIpCountryPhone',
    MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE: 'ManualCheckExternalAccountPhone',
    UNAVAILABLE_SUSPICIOUS: 'UnavailableSuspicious',
  },
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ getUserData: mockGetUserData }),
}));

jest.mock('src/hooks/used-ref.hook', () => ({
  USED_REF_PATTERN: /^\w{1,3}-\w{1,3}$/,
  useUsedRef: () => ({ updateUsedRef: mockUpdateUsedRef }),
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => ({ name: 'JR', isLoading: false }),
}));

jest.mock('src/components/error-hint', () => ({ ErrorHint: () => null }));

// The reset form has its own tests; here only the hand-over matters: which step it gets and what the
// panel does with the outcome it reports.
jest.mock('src/components/compliance/recommendation-reset', () => ({
  RecommendationReset: ({
    step,
    onClose,
    onReset,
  }: {
    step: { id: number };
    onClose: () => void;
    onReset: (stepId: number, logWarning?: string) => void;
  }) => (
    <div data-testid="reset-form">
      <span>reset step {step.id}</span>
      <button onClick={onClose}>stub-close</button>
      <button onClick={() => onReset(step.id)}>stub-reset</button>
      <button onClick={() => onReset(step.id, 'log down')}>stub-reset-warn</button>
    </div>
  ),
}));

jest.mock('src/util/compliance-helpers', () => ({
  DEFAULT_REF: '000-000',
  formatDate: (value: string) => `d:${value}`,
  statusBadge: (status: string) => <span>{status}</span>,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NavigateFunction } from 'react-router-dom';
import { RecommendationPanel } from 'src/components/compliance/recommendation-panel';
import type { KycStepInfo, UserInfo } from 'src/hooks/compliance.hook';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function wallet(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1,
    address: '0xabc',
    usedRef: '000-000',
    role: 'User',
    status: 'Active',
    walletName: 'DFX',
    created: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function fillOpenedRefForm(code: string, reason: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /^Set$/ }));
  const codeField = await screen.findByRole('textbox', { name: 'Ref-Code' });
  fireEvent.change(codeField, { target: { value: code } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: reason } });
}

function renderPanel(props: Partial<{ kycSteps: KycStepInfo[]; users: UserInfo[]; userDataId: string }> = {}) {
  if (props.users !== undefined) {
    mockGetUserData.mockResolvedValue({ users: props.users });
  }
  return render(
    <RecommendationPanel
      kycSteps={props.kycSteps ?? []}
      users={props.users ?? []}
      userDataId={props.userDataId ?? '408808'}
      navigate={mockNavigate as unknown as NavigateFunction}
    />,
  );
}

describe('RecommendationPanel', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUpdateUsedRef.mockReset();
    mockGetUserData.mockReset();
    mockGetUserData.mockResolvedValue({ users: [] });
    mockSession.role = 'Compliance';
  });

  it('shows the empty state and links to the network', async () => {
    renderPanel();

    expect(screen.getByText('Recommendation (0)')).toBeInTheDocument();
    expect(screen.getByText('No recommendation')).toBeInTheDocument();
    expect(screen.queryByText('Referrer (Ref-Code)')).not.toBeInTheDocument();

    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledWith(408808));

    fireEvent.click(screen.getByRole('button', { name: 'View Network' }));
    expect(mockNavigate).toHaveBeenCalledWith('/compliance/recommendations/408808');
  });

  it('counts only Recommendation steps and opens a step on click', async () => {
    const step = { id: 5, name: 'Recommendation', status: 'Completed', created: '2026-02-02' } as KycStepInfo;
    renderPanel({
      kycSteps: [step, { id: 6, name: 'Ident', status: 'Completed', created: '2026-02-03' } as KycStepInfo],
    });

    expect(screen.getByText('Recommendation (1)')).toBeInTheDocument();
    expect(screen.getByText('d:2026-02-02')).toBeInTheDocument();

    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledWith(408808));

    fireEvent.click(screen.getByText('Completed'));
    expect(mockNavigate).toHaveBeenCalledWith('/compliance/user/408808/kyc-step/5', { state: { step } });
  });

  it('treats missing steps as none', async () => {
    render(
      <RecommendationPanel
        kycSteps={undefined as unknown as KycStepInfo[]}
        users={[]}
        userDataId="408808"
        navigate={mockNavigate as unknown as NavigateFunction}
      />,
    );
    expect(screen.getByText('Recommendation (0)')).toBeInTheDocument();
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledWith(408808));
  });

  it('shows the referrer box only after the fetch for the current id resolves', async () => {
    const deferred = createDeferred<{ users: UserInfo[] }>();
    mockGetUserData.mockReturnValue(deferred.promise);

    renderPanel();

    expect(screen.queryByText('Referrer (Ref-Code)')).not.toBeInTheDocument();
    expect(mockGetUserData).toHaveBeenCalledWith(408808);

    await act(async () => {
      deferred.resolve({
        users: [wallet({ id: 1, usedRef: '172-134', refUserName: 'Samuel Kullmann', refUserDataId: 328304 })],
      });
      await deferred.promise;
    });

    await waitFor(() => expect(screen.getByText('Referrer (Ref-Code)')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Samuel Kullmann #328304 (172-134)' })).toBeInTheDocument();
  });

  it('shows the referrer of the account once, linking to the referrer account where known', async () => {
    renderPanel({
      users: [
        wallet({ id: 1, usedRef: '172-134', refUserName: 'Samuel Kullmann', refUserDataId: 328304 }),
        wallet({ id: 2, address: '0xdef', usedRef: '172-134', refUserName: 'Samuel Kullmann', refUserDataId: 328304 }),
        wallet({ id: 3, address: '0x123', usedRef: '555-555' }),
      ],
    });

    await waitFor(() => expect(screen.getByText('Referrer (Ref-Code)')).toBeInTheDocument());
    const known = screen.getByRole('button', { name: 'Samuel Kullmann #328304 (172-134)' });
    expect(screen.getByRole('button', { name: '- (555-555)' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Change' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Set' })).not.toBeInTheDocument();

    fireEvent.click(known);
    expect(mockNavigate).toHaveBeenCalledWith('/compliance/user/328304');
  });

  it('shows one line and one Set for an account with many wallets and no code', async () => {
    renderPanel({ users: Array.from({ length: 42 }, (_, i) => wallet({ id: i + 1, address: `0x${i}` })) });

    await waitFor(() => expect(screen.getAllByText('No Ref-Code')).toHaveLength(1));
    expect(screen.getAllByRole('button', { name: 'Set' })).toHaveLength(1);
  });

  it('shows a load error when the fetch for the account fails', async () => {
    mockGetUserData.mockRejectedValue(new Error('network'));
    renderPanel();
    await waitFor(() => expect(screen.getByText('Could not load the referrer.')).toBeInTheDocument());
    expect(screen.getByText('Referrer (Ref-Code)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ref-Code')).not.toBeInTheDocument();
  });

  it('hides the referrer box when the account has no wallet', async () => {
    renderPanel({ users: [] });
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledWith(408808));
    expect(screen.queryByText('Referrer (Ref-Code)')).not.toBeInTheDocument();
  });

  it('applies the PUT response wallets after a saved code', async () => {
    renderPanel({ users: [wallet({ id: 1 }), wallet({ id: 2, address: '0xdef' })] });
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Set' })).toHaveLength(1));

    mockUpdateUsedRef.mockResolvedValue([
      wallet({ id: 1, usedRef: '194-687' }),
      wallet({ id: 2, address: '0xdef', usedRef: '194-687' }),
    ]);
    await fillOpenedRefForm('194-687', 'confirmed');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '- (194-687)' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(mockUpdateUsedRef).toHaveBeenCalledWith('408808', { usedRef: '194-687', reason: 'confirmed' });
    expect(screen.queryByLabelText('Ref-Code')).not.toBeInTheDocument();
  });

  it('clears saved PUT wallets when the account id changes', async () => {
    const deferredB = createDeferred<{ users: UserInfo[] }>();
    mockGetUserData.mockResolvedValue({
      users: [wallet({ id: 1 }), wallet({ id: 2, address: '0xdef' })],
    });

    const { rerender } = renderPanel({
      users: [wallet({ id: 1 }), wallet({ id: 2, address: '0xdef' })],
    });
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Set' })).toHaveLength(1));

    mockUpdateUsedRef.mockResolvedValue([
      wallet({ id: 1, usedRef: '194-687' }),
      wallet({ id: 2, address: '0xdef', usedRef: '194-687' }),
    ]);
    await fillOpenedRefForm('194-687', 'confirmed');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '- (194-687)' })).toBeInTheDocument());

    mockGetUserData.mockReturnValue(deferredB.promise);
    rerender(
      <RecommendationPanel
        kycSteps={[]}
        users={[]}
        userDataId="204824"
        navigate={mockNavigate as unknown as NavigateFunction}
      />,
    );

    expect(screen.queryByText('Referrer (Ref-Code)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '- (194-687)' })).not.toBeInTheDocument();
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledWith(204824));

    const deferredA = createDeferred<{ users: UserInfo[] }>();
    mockGetUserData.mockReturnValue(deferredA.promise);
    rerender(
      <RecommendationPanel
        kycSteps={[]}
        users={[]}
        userDataId="408808"
        navigate={mockNavigate as unknown as NavigateFunction}
      />,
    );
    expect(screen.queryByText('Referrer (Ref-Code)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '- (194-687)' })).not.toBeInTheDocument();

    await act(async () => {
      deferredA.resolve({
        users: [wallet({ id: 1, usedRef: '111-111', refUserName: 'Fresh A', refUserDataId: 1 })],
      });
      await deferredA.promise;
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fresh A #1 (111-111)' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '- (194-687)' })).not.toBeInTheDocument();
  });

  it('shows the referrer read-only for a support session', async () => {
    mockSession.role = 'Support';
    renderPanel({
      users: [wallet({ id: 1, usedRef: '172-134', refUserName: 'Samuel Kullmann', refUserDataId: 328304 })],
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Samuel Kullmann #328304 (172-134)' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Set' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });

  it('does not feed the referrer box from parent users after the fetch has landed', async () => {
    const fetched = [wallet({ id: 1 })];
    mockGetUserData.mockResolvedValue({ users: fetched });

    const { rerender } = renderPanel({ users: fetched });
    await waitFor(() => expect(screen.getByText('No Ref-Code')).toBeInTheDocument());

    rerender(
      <RecommendationPanel
        kycSteps={[]}
        users={[wallet({ id: 1, usedRef: '172-134', refUserName: 'Samuel Kullmann', refUserDataId: 328304 })]}
        userDataId="408808"
        navigate={mockNavigate as unknown as NavigateFunction}
      />,
    );

    expect(screen.getByText('No Ref-Code')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Samuel Kullmann #328304 (172-134)' })).not.toBeInTheDocument();
  });

  it('ignores a rejected fetch after the id has changed', async () => {
    const deferredA = createDeferred<{ users: UserInfo[] }>();
    mockGetUserData.mockReturnValueOnce(deferredA.promise).mockResolvedValue({ users: [] });

    const { rerender } = render(
      <RecommendationPanel
        kycSteps={[]}
        users={[]}
        userDataId="408808"
        navigate={mockNavigate as unknown as NavigateFunction}
      />,
    );

    rerender(
      <RecommendationPanel
        kycSteps={[]}
        users={[]}
        userDataId="204824"
        navigate={mockNavigate as unknown as NavigateFunction}
      />,
    );
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledWith(204824));

    await act(async () => {
      deferredA.reject(new Error('cancelled'));
      await deferredA.promise.catch(() => undefined);
    });

    expect(screen.queryByText('Could not load the referrer.')).not.toBeInTheDocument();
    expect(screen.queryByText('Referrer (Ref-Code)')).not.toBeInTheDocument();
  });

  it('discards an in-flight fetch for A when the id changes to B', async () => {
    const deferredA = createDeferred<{ users: UserInfo[] }>();
    const deferredB = createDeferred<{ users: UserInfo[] }>();
    mockGetUserData.mockReturnValueOnce(deferredA.promise).mockReturnValueOnce(deferredB.promise);

    const { rerender } = render(
      <RecommendationPanel
        kycSteps={[]}
        users={[]}
        userDataId="408808"
        navigate={mockNavigate as unknown as NavigateFunction}
      />,
    );

    expect(mockGetUserData).toHaveBeenCalledWith(408808);
    expect(screen.queryByText('Referrer (Ref-Code)')).not.toBeInTheDocument();

    rerender(
      <RecommendationPanel
        kycSteps={[]}
        users={[]}
        userDataId="204824"
        navigate={mockNavigate as unknown as NavigateFunction}
      />,
    );
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledWith(204824));

    await act(async () => {
      deferredA.resolve({
        users: [
          wallet({
            id: 1,
            usedRef: '172-134',
            refUserName: 'Samuel Kullmann',
            refUserDataId: 328304,
          }),
        ],
      });
      await deferredA.promise;
    });

    expect(screen.queryByRole('button', { name: 'Samuel Kullmann #328304 (172-134)' })).not.toBeInTheDocument();
    expect(screen.queryByText('Referrer (Ref-Code)')).not.toBeInTheDocument();

    await act(async () => {
      deferredB.resolve({
        users: [wallet({ id: 9, address: '0x999', usedRef: '204-824', refUserName: 'Account B', refUserDataId: 1 })],
      });
      await deferredB.promise;
    });

    await waitFor(() => expect(screen.getByText('Referrer (Ref-Code)')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Account B #1 (204-824)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Samuel Kullmann #328304 (172-134)' })).not.toBeInTheDocument();
  });

  describe('pending request', () => {
    const pending = {
      id: 838917,
      name: 'Recommendation',
      status: 'InternalReview',
      created: '2026-09-17',
      recommender: { id: 302951, firstname: 'Manfred', surname: 'Patzwahl' },
    } as KycStepInfo;
    const referrerWallet = wallet({ id: 1, usedRef: '176-769', refUserName: 'Gerd Dolling', refUserDataId: 359666 });

    it('shows the recipient of the request and opens their account without opening the step', async () => {
      renderPanel({ kycSteps: [pending], users: [referrerWallet] });
      await waitFor(() => expect(screen.getByText('Referrer (Ref-Code)')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Manfred Patzwahl #302951' }));
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/compliance/user/302951');
    });

    it('shows a dash for a step without recipient and no reset for a step that is not pending', async () => {
      renderPanel({
        kycSteps: [{ id: 5, name: 'Recommendation', status: 'Completed', created: '2026-02-02' } as KycStepInfo],
        users: [referrerWallet],
      });
      await waitFor(() => expect(screen.getByText('Referrer (Ref-Code)')).toBeInTheDocument());

      expect(screen.getByText('-')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
      expect(screen.queryByText('not the referrer')).not.toBeInTheDocument();
    });

    it('flags a request that went to somebody other than the referrer', async () => {
      renderPanel({ kycSteps: [pending], users: [referrerWallet] });
      await waitFor(() => expect(screen.getByText('not the referrer')).toBeInTheDocument());
    });

    it('does not flag a request to the referrer, nor one for an account without Ref-Code', async () => {
      const toReferrer = { ...pending, recommender: { id: 359666, firstname: 'Gerd', surname: 'Dolling' } };
      const { rerender } = renderPanel({ kycSteps: [toReferrer], users: [referrerWallet] });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Gerd Dolling #359666' })).toBeInTheDocument());
      expect(screen.queryByText('not the referrer')).not.toBeInTheDocument();

      mockGetUserData.mockResolvedValue({ users: [wallet({ id: 1 })] });
      rerender(
        <RecommendationPanel
          kycSteps={[pending]}
          users={[]}
          userDataId="425053"
          navigate={mockNavigate as unknown as NavigateFunction}
        />,
      );
      await waitFor(() => expect(screen.getByText('No Ref-Code')).toBeInTheDocument());
      expect(screen.queryByText('not the referrer')).not.toBeInTheDocument();
    });

    it('offers the reset only to a session that may reset', async () => {
      mockSession.role = 'Marketing';
      renderPanel({ kycSteps: [pending], users: [referrerWallet] });
      await waitFor(() => expect(screen.getByText('Referrer (Ref-Code)')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
    });

    it('opens the reset form for the step without opening the step, and closes it on cancel', async () => {
      renderPanel({ kycSteps: [pending], users: [referrerWallet] });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(screen.getByText('reset step 838917')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'stub-close' }));
      expect(screen.queryByTestId('reset-form')).not.toBeInTheDocument();
      expect(screen.getByText('InternalReview')).toBeInTheDocument();
    });

    it('shows the step as Canceled with a hint once the reset is done, and drops the reset offer', async () => {
      renderPanel({ kycSteps: [pending], users: [referrerWallet] });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      fireEvent.click(screen.getByRole('button', { name: 'stub-reset' }));

      expect(screen.queryByTestId('reset-form')).not.toBeInTheDocument();
      expect(screen.getByText('Canceled')).toBeInTheDocument();
      expect(screen.queryByText('InternalReview')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
      expect(screen.queryByText('not the referrer')).not.toBeInTheDocument();
      expect(screen.getByText(/The request was reset/)).toBeInTheDocument();
      expect(screen.queryByText(/KYC log entry could not be written/)).not.toBeInTheDocument();
    });

    it('shows the log warning the form reports next to the hint', async () => {
      renderPanel({ kycSteps: [pending], users: [referrerWallet] });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      fireEvent.click(screen.getByRole('button', { name: 'stub-reset-warn' }));

      expect(screen.getByText('The KYC log entry could not be written: log down')).toBeInTheDocument();
      expect(screen.getByText('Canceled')).toBeInTheDocument();
    });
  });
});
