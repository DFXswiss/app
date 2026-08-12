const mockAuth = { session: { role: 'Compliance' as string } };

jest.mock('@dfx.swiss/react', () => ({
  AmlReason: {
    NA: 'NA',
    MANUAL_CHECK: 'ManualCheck',
  },
  CallQueue: {},
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
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AmlCheckPendingPanel } from 'src/components/compliance/aml-check-panel';
import { ComplianceUserData, TransactionInfo } from 'src/hooks/compliance.hook';

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
  });

  afterEach(() => jest.restoreAllMocks());

  it('resets a non-completed BuyCrypto with an existing AML result after confirmation', async () => {
    const onReviewReset = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <AmlCheckPendingPanel
        data={data}
        clerks={['Alice']}
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
        clerks={['Alice']}
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
        clerks={['Alice']}
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
        clerks={['Alice']}
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
        clerks={['Alice']}
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
        clerks={['Alice']}
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
        clerks={['Alice']}
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
        clerks={['Alice']}
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
        clerks={['Alice']}
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
