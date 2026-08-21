// Wiring test: stop/resume keep the action result when only the detail refresh fails.

const mockGetTransactionByUid = jest.fn();
const mockStopTransaction = jest.fn();
const mockResumeTransaction = jest.fn();
const mockRootRef: { current: HTMLElement | null } = { current: null };

jest.mock('@dfx.swiss/react', () => ({
  TransactionState: {
    FAILED: 'Failed',
    CHECK_PENDING: 'CheckPending',
    KYC_REQUIRED: 'KycRequired',
    LIMIT_EXCEEDED: 'LimitExceeded',
    UNASSIGNED: 'Unassigned',
    COMPLETED: 'Completed',
  },
  useTransaction: () => ({
    getTransactionByUid: mockGetTransactionByUid,
  }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledButton: ({ label, onClick, disabled, isLoading }: any) => (
    <button type="button" onClick={onClick} disabled={disabled || isLoading}>
      {label}
    </button>
  ),
  StyledLoadingSpinner: () => <div>Loading</div>,
  SpinnerSize: { SM: 'sm' },
  StyledButtonWidth: { FULL: 'full' },
  StyledButtonColor: { STURDY_WHITE: 'white', BLUE: 'blue', RED: 'red' },
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({
    downloadTransactionPdf: jest.fn(),
    stopTransaction: mockStopTransaction,
    resumeTransaction: mockResumeTransaction,
  }),
}));

jest.mock('src/util/compliance-helpers', () => ({
  statusBadge: (v: unknown) => v,
  boolBadge: (v: unknown) => String(v),
  formatDate: (v: string) => v,
  DetailRow: () => null,
  TransactionDetailRows: () => null,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_key: string, value: string) => value,
  }),
}));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({
    rootRef: mockRootRef,
    modalRootRef: { current: null },
  }),
}));

jest.mock('src/components/compliance/chargeback-modal', () => ({
  ChargebackModal: () => null,
}));

jest.mock('src/components/compliance/recall-modal', () => ({
  RecallModal: () => null,
}));

jest.mock('src/components/compliance/recall-details-modal', () => ({
  RecallDetailsModal: () => null,
}));

import type { Transaction } from '@dfx.swiss/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { TransactionsTable } from 'src/components/compliance/transactions-tab';
import type { TransactionInfo } from 'src/hooks/compliance.hook';

const tx = {
  id: 130504,
  uid: 'T2AC46F80RESUME01',
  type: 'BuyCrypto',
  sourceType: 'Bank',
  isCompleted: false,
  created: '2026-08-01T10:00:00Z',
} as unknown as TransactionInfo;

const otherTx = {
  id: 130505,
  uid: 'T2AC46F80RESUME02',
  type: 'BuyCrypto',
  sourceType: 'Bank',
  isCompleted: false,
  created: '2026-08-01T11:00:00Z',
} as unknown as TransactionInfo;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

function createDeferred<T>(): Deferred<T> {
  const controls = {
    resolve: (_value: T) => {
      throw new Error('deferred not initialized');
    },
    reject: (_reason: Error) => {
      throw new Error('deferred not initialized');
    },
  };
  const promise = new Promise<T>((resolve, reject) => {
    controls.resolve = resolve;
    controls.reject = reject;
  });
  return { promise, resolve: controls.resolve, reject: controls.reject };
}

function renderTable(onStatusChanged?: () => void, rows: TransactionInfo[] = [tx]) {
  function Wrapper() {
    const [expandedTxUid, setExpandedTxUid] = useState<string | undefined>();
    return (
      <TransactionsTable
        transactions={rows}
        bankTxs={[]}
        cryptoInputs={[]}
        bankDatas={[]}
        userData={{ id: 1 } as any}
        userDataId={1}
        onExpandBankTx={jest.fn()}
        onExpandCryptoInput={jest.fn()}
        onExpandBankData={jest.fn()}
        onExpandFiatOutput={jest.fn()}
        onExpandTxUid={setExpandedTxUid}
        expandedTxUid={expandedTxUid}
        onStatusChanged={onStatusChanged}
      />
    );
  }

  return render(<Wrapper />);
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    userEvent.click(element);
  });
}

beforeEach(() => {
  mockRootRef.current = document.body;
  jest.clearAllMocks();
  mockGetTransactionByUid.mockResolvedValue({
    uid: tx.uid,
    state: 'Stopped',
  } as unknown as Transaction);
  mockStopTransaction.mockReset();
  mockResumeTransaction.mockReset();
});

describe('TransactionsTable stop/resume refresh handling', () => {
  it('keeps the resume result when only the detail refresh fails', async () => {
    const onStatusChanged = jest.fn();
    const refresh = createDeferred<Transaction>();
    mockResumeTransaction.mockResolvedValue(undefined);
    mockGetTransactionByUid
      .mockResolvedValueOnce({ uid: tx.uid, state: 'Stopped' } as unknown as Transaction)
      .mockReturnValueOnce(refresh.promise);

    renderTable(onStatusChanged);

    await click(screen.getByText(tx.uid));
    const resumeAction = await screen.findByRole('button', { name: 'Resume' });
    await click(resumeAction);
    await waitFor(() => {
      expect(screen.getByText('Transaktion fortsetzen')).toBeInTheDocument();
    });
    const resumeButtons = screen.getAllByRole('button', { name: 'Resume' });
    await click(resumeButtons[resumeButtons.length - 1]);

    await waitFor(() => {
      expect(mockResumeTransaction).toHaveBeenCalledTimes(1);
      expect(onStatusChanged).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Transaktion fortsetzen')).not.toBeInTheDocument();
    expect(screen.queryByText('Resume failed')).not.toBeInTheDocument();
    expect(mockGetTransactionByUid).toHaveBeenCalledTimes(2);

    await act(async () => {
      refresh.reject(new Error('Network error'));
      await refresh.promise.catch(() => undefined);
    });

    const refreshError = await screen.findByText('Network error');
    expect(refreshError).toBeInTheDocument();
    expect(refreshError.closest('td')).not.toBeNull();
    expect(screen.queryByText('Resume failed')).not.toBeInTheDocument();
  });

  it('reports a failed resume and keeps the dialog open', async () => {
    const onStatusChanged = jest.fn();
    mockResumeTransaction.mockRejectedValue(new Error('Transaction is not stopped'));

    renderTable(onStatusChanged);

    await click(screen.getByText(tx.uid));
    const resumeAction = await screen.findByRole('button', { name: 'Resume' });
    await click(resumeAction);
    await waitFor(() => {
      expect(screen.getByText('Transaktion fortsetzen')).toBeInTheDocument();
    });
    const resumeButtons = screen.getAllByRole('button', { name: 'Resume' });
    await click(resumeButtons[resumeButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('Transaction is not stopped')).toBeInTheDocument();
    });
    expect(screen.getByText('Transaktion fortsetzen')).toBeInTheDocument();
    expect(onStatusChanged).not.toHaveBeenCalled();
    expect(mockGetTransactionByUid).toHaveBeenCalledTimes(1);
  });

  it('keeps the stop result when only the detail refresh fails', async () => {
    const onStatusChanged = jest.fn();
    const refresh = createDeferred<Transaction>();
    mockStopTransaction.mockResolvedValue(undefined);
    mockGetTransactionByUid
      .mockResolvedValueOnce({ uid: tx.uid, state: 'Created' } as unknown as Transaction)
      .mockReturnValueOnce(refresh.promise);

    renderTable(onStatusChanged);

    await click(screen.getByText(tx.uid));
    const stopAction = await screen.findByRole('button', { name: 'Stop' });
    await click(stopAction);
    await waitFor(() => {
      expect(screen.getByText('Transaktion stoppen')).toBeInTheDocument();
    });
    const stopButtons = screen.getAllByRole('button', { name: 'Stop' });
    await click(stopButtons[stopButtons.length - 1]);

    await waitFor(() => {
      expect(mockStopTransaction).toHaveBeenCalledTimes(1);
      expect(onStatusChanged).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Transaktion stoppen')).not.toBeInTheDocument();
    expect(screen.queryByText('Stop failed')).not.toBeInTheDocument();
    expect(mockGetTransactionByUid).toHaveBeenCalledTimes(2);

    await act(async () => {
      refresh.reject(new Error('Network error'));
      await refresh.promise.catch(() => undefined);
    });

    const refreshError = await screen.findByText('Network error');
    expect(refreshError).toBeInTheDocument();
    expect(refreshError.closest('td')).not.toBeNull();
    expect(screen.queryByText('Stop failed')).not.toBeInTheDocument();
  });

  it('does not leak the loading state into a dialog for another transaction', async () => {
    const onStatusChanged = jest.fn();
    const refresh = createDeferred<Transaction>();
    mockResumeTransaction.mockResolvedValue(undefined);
    mockGetTransactionByUid
      .mockResolvedValueOnce({ uid: tx.uid, state: 'Stopped' } as unknown as Transaction)
      .mockReturnValueOnce(refresh.promise)
      .mockResolvedValueOnce({ uid: otherTx.uid, state: 'Stopped' } as unknown as Transaction);

    renderTable(onStatusChanged, [tx, otherTx]);

    await click(screen.getByText(tx.uid));
    const resumeAction = await screen.findByRole('button', { name: 'Resume' });
    await click(resumeAction);
    await waitFor(() => {
      expect(screen.getByText('Transaktion fortsetzen')).toBeInTheDocument();
    });
    const resumeButtons = screen.getAllByRole('button', { name: 'Resume' });
    await click(resumeButtons[resumeButtons.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText('Transaktion fortsetzen')).not.toBeInTheDocument();
    });

    await click(screen.getByText(otherTx.uid));
    const otherResumeAction = await screen.findByRole('button', { name: 'Resume' });
    await click(otherResumeAction);
    await waitFor(() => {
      expect(screen.getByText('Transaktion fortsetzen')).toBeInTheDocument();
    });

    const dialogResumeButtons = screen.getAllByRole('button', { name: 'Resume' });
    expect(dialogResumeButtons[dialogResumeButtons.length - 1]).toBeEnabled();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    await waitFor(() => {
      expect(screen.queryByText('Transaktion fortsetzen')).not.toBeInTheDocument();
    });

    await act(async () => {
      refresh.resolve({ uid: tx.uid, state: 'Created' } as unknown as Transaction);
    });
  });

  it('keeps the loading state of a second action when the first refresh settles', async () => {
    const onStatusChanged = jest.fn();
    const refreshA = createDeferred<Transaction>();
    const postB = createDeferred<void>();
    mockResumeTransaction.mockResolvedValueOnce(undefined).mockReturnValueOnce(postB.promise);
    mockGetTransactionByUid
      .mockResolvedValueOnce({ uid: tx.uid, state: 'Stopped' } as unknown as Transaction)
      .mockReturnValueOnce(refreshA.promise)
      .mockResolvedValueOnce({ uid: otherTx.uid, state: 'Stopped' } as unknown as Transaction);

    renderTable(onStatusChanged, [tx, otherTx]);

    await click(screen.getByText(tx.uid));
    const resumeAction = await screen.findByRole('button', { name: 'Resume' });
    await click(resumeAction);
    await waitFor(() => {
      expect(screen.getByText('Transaktion fortsetzen')).toBeInTheDocument();
    });
    const resumeButtons = screen.getAllByRole('button', { name: 'Resume' });
    await click(resumeButtons[resumeButtons.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText('Transaktion fortsetzen')).not.toBeInTheDocument();
    });

    await click(screen.getByText(otherTx.uid));
    const otherResumeAction = await screen.findByRole('button', { name: 'Resume' });
    await click(otherResumeAction);
    await waitFor(() => {
      expect(screen.getByText('Transaktion fortsetzen')).toBeInTheDocument();
    });

    const dialogResumeButtons = screen.getAllByRole('button', { name: 'Resume' });
    await click(dialogResumeButtons[dialogResumeButtons.length - 1]);

    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: 'Resume' });
      expect(buttons[buttons.length - 1]).toBeDisabled();
    });

    await act(async () => {
      refreshA.resolve({ uid: tx.uid, state: 'Created' } as unknown as Transaction);
    });

    const buttonsAfterRefreshA = screen.getAllByRole('button', { name: 'Resume' });
    expect(buttonsAfterRefreshA[buttonsAfterRefreshA.length - 1]).toBeDisabled();
    expect(screen.getByText('Transaktion fortsetzen')).toBeInTheDocument();

    await act(async () => {
      postB.resolve(undefined);
    });
  });

  it('keeps a detail error of another transaction when a refresh succeeds', async () => {
    const onStatusChanged = jest.fn();
    const refreshA = createDeferred<Transaction>();
    mockResumeTransaction.mockResolvedValue(undefined);
    mockGetTransactionByUid
      .mockResolvedValueOnce({ uid: tx.uid, state: 'Stopped' } as unknown as Transaction)
      .mockReturnValueOnce(refreshA.promise)
      .mockRejectedValueOnce(new Error('Detail load failed'));

    renderTable(onStatusChanged, [tx, otherTx]);

    await click(screen.getByText(tx.uid));
    const resumeAction = await screen.findByRole('button', { name: 'Resume' });
    await click(resumeAction);
    await waitFor(() => {
      expect(screen.getByText('Transaktion fortsetzen')).toBeInTheDocument();
    });
    const resumeButtons = screen.getAllByRole('button', { name: 'Resume' });
    await click(resumeButtons[resumeButtons.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText('Transaktion fortsetzen')).not.toBeInTheDocument();
    });

    await click(screen.getByText(otherTx.uid));
    const detailError = await screen.findByText('Detail load failed');
    expect(detailError).toBeInTheDocument();

    await act(async () => {
      refreshA.resolve({ uid: tx.uid, state: 'Created' } as unknown as Transaction);
    });

    const detailErrorAfterRefreshA = screen.getByText('Detail load failed');
    expect(detailErrorAfterRefreshA).toBeInTheDocument();
    expect(detailErrorAfterRefreshA.closest('td')).not.toBeNull();
  });

  it('keeps a detail error of another transaction when a refresh fails', async () => {
    const onStatusChanged = jest.fn();
    const refreshA = createDeferred<Transaction>();
    mockResumeTransaction.mockResolvedValue(undefined);
    mockGetTransactionByUid
      .mockResolvedValueOnce({ uid: tx.uid, state: 'Stopped' } as unknown as Transaction)
      .mockReturnValueOnce(refreshA.promise)
      .mockRejectedValueOnce(new Error('Detail load failed'));

    renderTable(onStatusChanged, [tx, otherTx]);

    await click(screen.getByText(tx.uid));
    const resumeAction = await screen.findByRole('button', { name: 'Resume' });
    await click(resumeAction);
    await waitFor(() => {
      expect(screen.getByText('Transaktion fortsetzen')).toBeInTheDocument();
    });
    const resumeButtons = screen.getAllByRole('button', { name: 'Resume' });
    await click(resumeButtons[resumeButtons.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText('Transaktion fortsetzen')).not.toBeInTheDocument();
    });

    await click(screen.getByText(otherTx.uid));
    const detailError = await screen.findByText('Detail load failed');
    expect(detailError).toBeInTheDocument();

    await act(async () => {
      refreshA.reject(new Error('Refresh failed'));
      await refreshA.promise.catch(() => undefined);
    });

    const detailErrorAfterRefreshA = screen.getByText('Detail load failed');
    expect(detailErrorAfterRefreshA).toBeInTheDocument();
    expect(detailErrorAfterRefreshA.closest('td')).not.toBeNull();
    expect(screen.queryByText('Refresh failed')).not.toBeInTheDocument();
  });
});
