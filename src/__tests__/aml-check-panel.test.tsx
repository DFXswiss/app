const mockAuth = { session: { role: 'Compliance' as string } };

jest.mock('@dfx.swiss/react', () => ({
  AmlReason: {
    NA: 'NA',
    MANUAL_CHECK_PHONE_FAILED: 'ManualCheckPhoneFailed',
    MANUAL_CHECK: 'ManualCheck',
  },
  CallQueue: { MANUAL_CHECK_PHONE: 'ManualCheckPhone' },
  CheckStatus: {
    PASS: 'Pass',
    FAIL: 'Fail',
    PENDING: 'Pending',
  },
  KycStatus: {
    CHECK: 'Check',
  },
  UserRole: { ADMIN: 'Admin', COMPLIANCE: 'Compliance' },
  useAuthContext: () => mockAuth,
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => mockStaffName,
}));

jest.mock('src/components/error-hint', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    ErrorHint: ({ message }: { message: string }) =>
      React.createElement('div', { 'data-testid': 'error-hint' }, message),
  };
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AmlCheckPendingPanel } from 'src/components/compliance/aml-check-panel';
import { ComplianceUserData, TransactionInfo } from 'src/hooks/compliance.hook';

const mockNavigate = jest.fn();
const mockStaffName: { name: string | undefined; isLoading: boolean } = {
  name: 'Alice',
  isLoading: false,
};

const buyCrypto: TransactionInfo = {
  id: 326324,
  uid: 'transaction-326324',
  buyCryptoId: 130504,
  type: 'Buy',
  sourceType: 'BuyCrypto',
  inputAmount: 300000,
  inputAsset: 'EUR',
  amlCheck: 'Pass',
  amlReason: 'NA',
  buyCryptoIsComplete: false,
  buyCryptoStatus: 'MissingLiquidity',
  buyCryptoHasBatch: false,
  buyCryptoHasChargeback: false,
  buyCryptoReviewResetBlocked: false,
  isCompleted: false,
  created: '2026-08-01T00:00:00.000Z',
};

const data = {
  userData: { id: 322190, kycStatus: 'Check', kycLevel: 50 },
  kycSteps: [],
  transactions: [buyCrypto],
  bankTxs: [],
  cryptoInputs: [],
  users: [],
  bankDatas: [],
  buyRoutes: [],
  sellRoutes: [],
  swapRoutes: [],
  virtualIbans: [],
  refRewards: [],
  notifications: [],
  notes: [],
  permissions: {
    viewKycFiles: true,
    viewKycLogs: true,
    viewIpLogs: true,
    viewSupportIssues: true,
    canRequestLimit: true,
    canPerformTransactionActions: true,
    viewRecommendation: true,
  },
} as ComplianceUserData;

describe('AmlCheckPendingPanel AML reset', () => {
  beforeEach(() => {
    mockAuth.session = { role: 'Compliance' };
    mockStaffName.name = 'Alice';
    mockStaffName.isLoading = false;
  });

  afterEach(() => jest.restoreAllMocks());

  it('resets a non-completed BuyCrypto with an existing AML result after confirmation', async () => {
    const onReviewReset = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <AmlCheckPendingPanel
        data={data}
        isSaving={false}
        onUpdate={jest.fn()}
        onReset={jest.fn()}
        onReviewReset={onReviewReset}
      />,
    );

    expect(screen.getByText('BuyCrypto 130504')).toBeInTheDocument();
    expect(screen.getByText('Transaction 326324 · AML Pass · NA · Status MissingLiquidity')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AML-Check zurücksetzen' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'AML-Check für BuyCrypto 130504 wirklich zurücksetzen?\n\nDer Status Pass wird entfernt und die Transaktion erneut durch den AML-Check verarbeitet.',
    );
    await waitFor(() => expect(onReviewReset).toHaveBeenCalledWith(buyCrypto));
    await waitFor(() => expect(screen.getByRole('button', { name: 'AML-Check zurücksetzen' })).toBeEnabled());
  });

  it('does not reset when confirmation is rejected', () => {
    const onReviewReset = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <AmlCheckPendingPanel
        data={data}
        isSaving={false}
        onUpdate={jest.fn()}
        onReset={jest.fn()}
        onReviewReset={onReviewReset}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'AML-Check zurücksetzen' }));

    expect(onReviewReset).not.toHaveBeenCalled();
  });

  it('allows review reset when KYC is not Check', () => {
    render(
      <AmlCheckPendingPanel
        data={{ ...data, userData: { ...data.userData, kycStatus: 'Completed' } } as ComplianceUserData}
        isSaving={false}
        onUpdate={jest.fn()}
        onReset={jest.fn()}
        onReviewReset={jest.fn()}
      />,
    );

    expect(screen.queryByText(/KYC-Status auf Check/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AML-Check zurücksetzen' })).toBeEnabled();
  });

  it.each([
    ['completed', { buyCryptoIsComplete: true }],
    ['stopped', { buyCryptoStatus: 'Stopped' }],
    ['assigned to a batch', { buyCryptoHasBatch: true }],
    ['assigned to a chargeback', { buyCryptoHasChargeback: true }],
    ['blocked by a payout or return', { buyCryptoReviewResetBlocked: true }],
  ])('does not offer review reset when BuyCrypto is %s', (_case, txOverride) => {
    render(
      <AmlCheckPendingPanel
        data={{ ...data, transactions: [{ ...buyCrypto, ...txOverride }] } as ComplianceUserData}
        isSaving={false}
        onUpdate={jest.fn()}
        onReset={jest.fn()}
        onReviewReset={jest.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'AML-Check zurücksetzen' })).not.toBeInTheDocument();
  });

  it('keeps the legacy Reset decision when KYC is not Check', () => {
    const pendingManualTx = {
      ...buyCrypto,
      amlCheck: 'Pending',
      amlReason: 'ManualCheck',
    };

    render(
      <AmlCheckPendingPanel
        data={
          {
            ...data,
            userData: { ...data.userData, kycStatus: 'Completed' },
            transactions: [pendingManualTx],
          } as ComplianceUserData
        }
        isSaving={false}
        onUpdate={jest.fn()}
        onReset={jest.fn()}
        onReviewReset={jest.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: 'Reset' })).toBeInTheDocument();
  });

  it('hides the legacy Reset decision when BuyCrypto is stopped', () => {
    const pendingManualTx = {
      ...buyCrypto,
      buyCryptoStatus: 'Stopped',
      amlCheck: 'Pending',
      amlReason: 'ManualCheck',
    };

    render(
      <AmlCheckPendingPanel
        data={{ ...data, transactions: [pendingManualTx] } as ComplianceUserData}
        isSaving={false}
        onUpdate={jest.fn()}
        onReset={jest.fn()}
        onReviewReset={jest.fn()}
      />,
    );

    expect(screen.queryByRole('option', { name: 'Reset' })).not.toBeInTheDocument();
    expect(screen.getByText(/Reset ist erst verfügbar/)).toBeInTheDocument();
  });

  it('keeps the legacy Reset decision for an eligible pending BuyCrypto', () => {
    render(
      <AmlCheckPendingPanel
        data={{
          ...data,
          transactions: [{ ...buyCrypto, amlCheck: 'Pending', amlReason: 'ManualCheck' }],
        }}
        isSaving={false}
        onUpdate={jest.fn()}
        onReset={jest.fn()}
        onReviewReset={jest.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: 'Reset' })).toBeInTheDocument();
  });

  it('hides Pass for Compliance on the pending AML decision form', () => {
    render(
      <AmlCheckPendingPanel
        data={{
          ...data,
          transactions: [{ ...buyCrypto, amlCheck: 'Pending', amlReason: 'ManualCheck' }],
        }}
        isSaving={false}
        onUpdate={jest.fn()}
        onReset={jest.fn()}
        onReviewReset={jest.fn()}
      />,
    );

    expect(screen.queryByRole('option', { name: 'Pass' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Fail' })).toBeInTheDocument();
    expect(screen.getByText(/Pass setzt nur die automatische AML-Prüfung/)).toBeInTheDocument();
  });

  it('offers Pass for Admin on the pending AML decision form', () => {
    mockAuth.session = { role: 'Admin' };

    render(
      <AmlCheckPendingPanel
        data={{
          ...data,
          transactions: [{ ...buyCrypto, amlCheck: 'Pending', amlReason: 'ManualCheck' }],
        }}
        isSaving={false}
        onUpdate={jest.fn()}
        onReset={jest.fn()}
        onReviewReset={jest.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: 'Pass' })).toBeInTheDocument();
    expect(screen.queryByText(/Pass setzt nur die automatische AML-Prüfung/)).not.toBeInTheDocument();
  });
});

const pendingTx: TransactionInfo = {
  ...buyCrypto,
  amlCheck: 'Pending',
  amlReason: 'ManualCheck',
  comment: 'ScorechainHighRisk',
  inputTxId: '0xabc',
  amountInChf: 1234.5,
};

function renderPanel(
  overrides: Partial<ComplianceUserData> = {},
  handlers: Partial<{
    onUpdate: (...args: never[]) => Promise<void>;
    onReset: (...args: never[]) => Promise<void>;
    onReviewReset: (...args: never[]) => Promise<void>;
    isSaving: boolean;
  }> = {},
) {
  const props = {
    data: { ...data, transactions: [pendingTx], ...overrides } as ComplianceUserData,
    isSaving: handlers.isSaving ?? false,
    onUpdate: handlers.onUpdate ?? jest.fn().mockResolvedValue(undefined),
    onReset: handlers.onReset ?? jest.fn().mockResolvedValue(undefined),
    onReviewReset: handlers.onReviewReset ?? jest.fn().mockResolvedValue(undefined),
  };
  const view = render(<AmlCheckPendingPanel {...props} />);
  return { ...view, props };
}

function amlCheckSelect(): HTMLSelectElement {
  return screen.getAllByRole('combobox')[0] as HTMLSelectElement;
}

describe('AmlCheckPendingPanel pending decision form', () => {
  beforeEach(() => {
    mockAuth.session = { role: 'Compliance' };
    mockNavigate.mockReset();
    mockStaffName.name = 'Alice';
    mockStaffName.isLoading = false;
  });

  afterEach(() => jest.restoreAllMocks());

  it('disables saving while the clerk name is loading', () => {
    mockStaffName.isLoading = true;
    renderPanel();

    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('disables saving when the clerk name is missing', () => {
    mockStaffName.isLoading = false;
    mockStaffName.name = undefined;
    renderPanel();

    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('hides AmlReason and priceDefinitionAllowedDate once Reset is selected and saves through onReset', async () => {
    const onReset = jest.fn().mockResolvedValue(undefined);
    const onUpdate = jest.fn().mockResolvedValue(undefined);
    const { props } = renderPanel({}, { onReset, onUpdate });

    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByText('priceDefinitionAllowedDate setzen')).toBeInTheDocument();

    fireEvent.change(amlCheckSelect(), { target: { value: 'Reset' } });

    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('priceDefinitionAllowedDate setzen')).not.toBeInTheDocument();
    expect(screen.getByText(/Reset entfernt AmlCheck, AmlReason und priceDefinitionAllowedDate/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onReset).toHaveBeenCalledWith(props.data.transactions[0], 'Alice'));
    expect(onUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Speichern' })).toBeEnabled());
  });

  it('lists NA first and the remaining AmlReasons alphabetically', () => {
    renderPanel();

    const options = Array.from((screen.getAllByRole('combobox')[1] as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(['NA', 'ManualCheck', 'ManualCheckPhoneFailed']);
  });

  it('shows the decision inputs again when switching away from Reset', () => {
    renderPanel();

    fireEvent.change(amlCheckSelect(), { target: { value: 'Reset' } });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    fireEvent.change(amlCheckSelect(), { target: { value: 'Fail' } });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.queryByText(/Reset entfernt AmlCheck/)).not.toBeInTheDocument();
  });

  it('hides priceDefinitionAllowedDate for Fail but keeps AmlReason', () => {
    renderPanel();

    fireEvent.change(amlCheckSelect(), { target: { value: 'Fail' } });

    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('priceDefinitionAllowedDate setzen')).not.toBeInTheDocument();
  });

  it('saves Fail with the chosen AmlReason and without a priceDefinitionAllowedDate', async () => {
    const onUpdate = jest.fn().mockResolvedValue(undefined);
    const onReset = jest.fn().mockResolvedValue(undefined);
    const { props } = renderPanel({}, { onUpdate, onReset });

    fireEvent.change(amlCheckSelect(), { target: { value: 'Fail' } });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'NA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith(
      props.data.transactions[0],
      { amlCheck: 'Fail', amlReason: 'NA', priceDefinitionAllowedDate: undefined },
      'Alice',
    );
    expect(onReset).not.toHaveBeenCalled();
  });

  it('drops a previously ticked priceDefinitionAllowedDate when saving as Fail', async () => {
    const onUpdate = jest.fn().mockResolvedValue(undefined);
    renderPanel({}, { onUpdate });

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(amlCheckSelect(), { target: { value: 'Fail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0][1]).toEqual({
      amlCheck: 'Fail',
      amlReason: 'ManualCheck',
      priceDefinitionAllowedDate: undefined,
    });
  });

  it('saves Pass with a priceDefinitionAllowedDate when Admin ticks the checkbox', async () => {
    mockAuth.session = { role: 'Admin' };
    const onUpdate = jest.fn().mockResolvedValue(undefined);
    const { props } = renderPanel({}, { onUpdate });

    fireEvent.change(amlCheckSelect(), { target: { value: 'Pass' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith(
      props.data.transactions[0],
      {
        amlCheck: 'Pass',
        amlReason: 'ManualCheck',
        priceDefinitionAllowedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
      'Alice',
    );
  });

  it('saves without a priceDefinitionAllowedDate when the checkbox stays unticked', async () => {
    const onUpdate = jest.fn().mockResolvedValue(undefined);
    renderPanel({}, { onUpdate });

    fireEvent.change(amlCheckSelect(), { target: { value: 'Fail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0][1]).toEqual({
      amlCheck: 'Fail',
      amlReason: 'ManualCheck',
      priceDefinitionAllowedDate: undefined,
    });
  });

  it('shows the saving state while the update is running', async () => {
    let resolveUpdate: () => void = () => undefined;
    const onUpdate = jest.fn().mockImplementation(() => new Promise<void>((resolve) => (resolveUpdate = resolve)));
    renderPanel({}, { onUpdate });

    fireEvent.change(amlCheckSelect(), { target: { value: 'Fail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByRole('button', { name: 'Speichern...' })).toBeDisabled();
    resolveUpdate();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Speichern' })).toBeEnabled());
  });

  it('disables saving while the parent is saving', () => {
    renderPanel({}, { isSaving: true });

    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('disables saving when no decision is selected', () => {
    renderPanel();

    fireEvent.change(amlCheckSelect(), { target: { value: '' } });

    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('blocks a manual Pass when the role drops below Admin before saving', async () => {
    mockAuth.session = { role: 'Admin' };
    const onUpdate = jest.fn().mockResolvedValue(undefined);
    const { rerender, props } = renderPanel({}, { onUpdate });

    fireEvent.change(amlCheckSelect(), { target: { value: 'Pass' } });
    mockAuth.session = { role: 'Compliance' };
    rerender(<AmlCheckPendingPanel {...props} />);

    const button = screen.getByRole('button', { name: 'Speichern' });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Speichern' })).toBeEnabled());
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('renders the transaction details and links a Scorechain high-risk comment to the screening', () => {
    renderPanel();

    expect(screen.getByText('Eingangsdatum: 01.08.2026')).toBeInTheDocument();
    expect(screen.getByText('0xabc')).toBeInTheDocument();
    expect(screen.getByText('1234.50')).toBeInTheDocument();
    expect(screen.getByText('300000 EUR')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ScorechainHighRisk' }));

    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: '/compliance/scorechain/user/322190', search: '?highlight=buyCrypto:130504' },
      { clearParams: ['status', 'search'] },
    );
  });

  it('links a Scorechain high-risk comment without a highlight when the transaction has no related id', () => {
    renderPanel({
      transactions: [{ ...pendingTx, buyCryptoId: undefined, buyFiatId: undefined, buyCryptoStatus: undefined }],
    });

    // Without a BuyCrypto the Reset decision is not gated by BuyCrypto state.
    expect(screen.getByRole('option', { name: 'Reset' })).toBeInTheDocument();
    expect(screen.queryByText(/Reset ist erst verfügbar/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ScorechainHighRisk' }));

    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: '/compliance/scorechain/user/322190', search: '' },
      { clearParams: ['status', 'search'] },
    );
  });

  it('renders a plain comment when it is not a Scorechain high-risk token', () => {
    renderPanel({ transactions: [{ ...pendingTx, comment: 'Manual note' }] });

    expect(screen.getByText('Manual note')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manual note' })).not.toBeInTheDocument();
  });

  it('renders a plain Scorechain comment without a user data id', () => {
    renderPanel({ userData: { kycStatus: 'Check' } as ComplianceUserData['userData'] });

    expect(screen.getByText('ScorechainHighRisk')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ScorechainHighRisk' })).not.toBeInTheDocument();
  });

  it('renders dashes for missing transaction and user fields', () => {
    renderPanel({
      userData: { nationality: 'DE' } as unknown as ComplianceUserData['userData'],
      users: [
        { id: 1, address: 'a', created: '' },
        { id: 2, address: 'b', walletName: 'DFX', created: '' },
      ],
      kycLogs: undefined,
      transactions: [
        { ...pendingTx, comment: undefined, inputAmount: undefined, inputTxId: undefined, amountInChf: undefined },
      ],
    } as Partial<ComplianceUserData>);

    expect(screen.getByText('DE')).toBeInTheDocument();
    expect(screen.getByText('DFX')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(10);
  });

  it('renders an input amount without an asset', () => {
    renderPanel({ transactions: [{ ...pendingTx, inputAsset: undefined }] });

    expect(screen.getByText('300000')).toBeInTheDocument();
  });

  it.each([
    ['a nationality object with a name', { name: 'Switzerland' }, 'Switzerland'],
    ['a nationality object without a name', {}, '-'],
    ['no nationality', undefined, '-'],
  ])('renders %s', (_case: string, nationality: unknown, expected: string) => {
    renderPanel({
      userData: { ...data.userData, nationality } as unknown as ComplianceUserData['userData'],
      transactions: [],
    });

    const row = screen.getByText('Nationality').parentElement as HTMLElement;
    expect(row).toHaveTextContent(expected);
  });

  it('shows the latest manual KycLog comment', () => {
    renderPanel({
      transactions: [],
      kycLogs: [
        { id: 1, type: 'ManualLog', comment: 'older', created: '2026-01-01T00:00:00.000Z' },
        { id: 2, type: 'ManualLog', comment: 'newest', created: '2026-03-01T00:00:00.000Z' },
        { id: 3, type: 'ManualLog', created: '2026-04-01T00:00:00.000Z' },
        { id: 4, type: 'Other', comment: 'ignored', created: '2026-05-01T00:00:00.000Z' },
      ],
    });

    expect(screen.getByText('newest')).toBeInTheDocument();
    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
    expect(screen.getByText('Keine pendenten AML-Prüfungen vorhanden.')).toBeInTheDocument();
  });

  it('lists call-queue transactions with a deep link to the queue', () => {
    renderPanel({
      transactions: [
        { ...buyCrypto, id: 1, amlCheck: 'Pending', amlReason: 'ManualCheckPhone' },
        { ...buyCrypto, id: 2, amlCheck: 'Pending', amlReason: undefined },
      ],
    });

    expect(screen.getByText('Weitere AML-Prüfungen über Call-Queue')).toBeInTheDocument();
    expect(screen.getByText('ManualCheckPhone')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zur Call-Queue' }));

    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: '/compliance/call-queues/ManualCheckPhone/322190', search: '?txId=1' },
      { clearParams: ['status', 'search'] },
    );
  });

  it('lists call-queue transactions without a deep link when the user data id is missing', () => {
    renderPanel({
      userData: {} as ComplianceUserData['userData'],
      transactions: [{ ...buyCrypto, amlCheck: 'Pending', amlReason: 'ManualCheckPhone' }],
    });

    expect(screen.getByText('ManualCheckPhone')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zur Call-Queue' })).not.toBeInTheDocument();
  });

  it('renders the call-queue list next to a pending manual check', () => {
    renderPanel({
      transactions: [pendingTx, { ...buyCrypto, id: 2, amlCheck: 'Pending', amlReason: 'ManualCheckPhone' }],
    });

    expect(screen.getByText('Weitere AML-Prüfungen über Call-Queue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
  });
});

describe('AmlCheckPendingPanel review reset entry', () => {
  beforeEach(() => {
    mockStaffName.name = 'Alice';
    mockStaffName.isLoading = false;
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows the processing state while the review reset is running', async () => {
    let resolveReset: () => void = () => undefined;
    const onReviewReset = jest.fn().mockImplementation(() => new Promise<void>((resolve) => (resolveReset = resolve)));
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderPanel({ transactions: [{ ...buyCrypto, amlReason: undefined }] }, { onReviewReset });

    expect(screen.getByText('Transaction 326324 · AML Pass · Status MissingLiquidity')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AML-Check zurücksetzen' }));

    expect(await screen.findByRole('button', { name: 'Wird zurückgesetzt...' })).toBeDisabled();
    resolveReset();
    await waitFor(() => expect(screen.getByRole('button', { name: 'AML-Check zurücksetzen' })).toBeEnabled());
  });

  it('disables the review reset while the parent is saving', () => {
    renderPanel({ transactions: [buyCrypto] }, { isSaving: true });

    expect(screen.getByRole('button', { name: 'AML-Check zurücksetzen' })).toBeDisabled();
  });
});
