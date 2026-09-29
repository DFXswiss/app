// The review screen must not paint the previous account on the route the clerk just opened,
// and a reload that started on that account must not write it back.

const route: { id: string; bump: () => void } = { id: '325674', bump: () => undefined };
const mockGetUserData = jest.fn();

jest.mock('react-router-dom', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    useNavigate: () => jest.fn(),
    useSearchParams: () => [new URLSearchParams('tab=amlPending'), jest.fn()],
    useParams: () => {
      const [, setTick] = React.useState(0);
      React.useEffect(() => {
        route.bump = () => setTick((n: number) => n + 1);
        return () => {
          route.bump = () => undefined;
        };
      }, []);
      return { id: route.id };
    },
  };
});

jest.mock('@dfx.swiss/react', () => ({
  KycStatus: { CHECK: 'Check' },
  CheckStatus: { PENDING: 'Pending' },
  AmlReason: { MANUAL_CHECK: 'ManualCheck' },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'LG' },
  StyledLoadingSpinner: () => <div>loading</div>,
}));

jest.mock('src/hooks/guard.hook', () => ({ useComplianceGuard: () => undefined }));
jest.mock('src/hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));
jest.mock('src/hooks/split-pane.hook', () => ({
  useSplitPane: () => ({ containerRef: { current: null }, splitPercent: 50, handleSplitDrag: () => undefined }),
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({
    getUserData: mockGetUserData,
    setKycStatusCheck: jest.fn(),
    updateKycStep: jest.fn(),
    updateUserData: jest.fn(),
    updateBankData: jest.fn(),
    updateBuyCrypto: jest.fn(),
    updateBuyFiat: jest.fn(),
    resetBuyCryptoReviewAml: jest.fn(),
    resetBuyFiatAml: jest.fn(),
    generateOnboardingPdf: jest.fn(),
    createKycLog: jest.fn(),
    getKycFile: jest.fn(),
  }),
}));

jest.mock('src/components/compliance/compliance-review-header', () => ({
  ComplianceReviewHeader: ({ userData }: { userData: { id: number } }) => <div>account-{userData.id}</div>,
}));

jest.mock('src/components/compliance/aml-check-panel', () => ({
  AmlCheckPendingPanel: ({
    data,
    onRefUserKycCleared,
  }: {
    data: { userData: { id: number } };
    onRefUserKycCleared?: () => Promise<void>;
  }) => (
    <button type="button" onClick={() => void onRefUserKycCleared?.()}>
      reload-{data.userData.id}
    </button>
  ),
}));

jest.mock('src/components/compliance/freigabe-panel', () => ({ ComplianceReviewFreigabePanel: () => null }));
jest.mock('src/components/compliance/compliance-review-panel', () => ({ ComplianceReviewPanel: () => null }));
jest.mock('src/components/compliance/file-preview-panel', () => ({ FilePreviewPanel: () => null }));
jest.mock('src/components/compliance/stammdaten-panel', () => ({ StammdatenPanel: () => null }));
jest.mock('src/components/compliance/bank-data-panel', () => ({ BankDataReviewPanel: () => null }));
jest.mock('src/components/compliance/ident-panel', () => ({ IdentPanel: () => null }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ComplianceReviewScreen from 'src/screens/compliance-review.screen';

function account(id: number) {
  return {
    userData: { id, accountType: 'Personal', kycStatus: 'Completed' },
    kycSteps: [],
    kycFiles: [],
    bankDatas: [],
    transactions: [],
    users: [],
  };
}

describe('ComplianceReviewScreen route change', () => {
  const pending: { id: number; resolve: (value: ReturnType<typeof account>) => void }[] = [];

  beforeEach(() => {
    route.id = '325674';
    pending.length = 0;
    mockGetUserData.mockImplementation(
      (id: number) =>
        new Promise((resolve) => {
          pending.push({ id, resolve });
        }),
    );
  });

  it('drops the previous account before paint and ignores its late reload', async () => {
    render(<ComplianceReviewScreen />);

    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0].resolve(account(325674)));
    expect(await screen.findByText('account-325674')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'reload-325674' }));
    await waitFor(() => expect(pending).toHaveLength(2));

    route.id = '999';
    act(() => route.bump());

    expect(screen.queryByText('account-325674')).not.toBeInTheDocument();
    expect(screen.getByText('loading')).toBeInTheDocument();

    await act(async () => pending[1].resolve(account(325674)));
    expect(screen.queryByText('account-325674')).not.toBeInTheDocument();

    await waitFor(() => expect(pending.some((call) => call.id === 999)).toBe(true));
    const next = pending.find((call) => call.id === 999);
    await act(async () => next?.resolve(account(999)));
    expect(await screen.findByText('account-999')).toBeInTheDocument();
  });
});
