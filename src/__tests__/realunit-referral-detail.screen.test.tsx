// Component tests for the RealUnit referral admin detail screen: action-button gating against the
// backend state machine, the required-reason guard, a successful action updating local state, and
// the not-found path. ConfirmationOverlay and StyledButton are replaced with minimal test doubles so
// the screen's own action logic can be driven directly.

let mockId = '1';
let mockPathname = '/realunit/referral/1';
jest.mock('react-router-dom', () => ({
  useParams: () => ({ id: mockId }),
  useLocation: () => ({ pathname: mockPathname }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: () => null,
  StyledButtonWidth: { FULL: 'full', MIN: 'min' },
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div>{message}</div>,
}));
jest.mock('src/components/overlay/confirmation-overlay', () => ({
  ConfirmationOverlay: ({
    messageContent,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
  }: {
    messageContent?: JSX.Element;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => Promise<void>;
    onCancel: () => void;
  }) => (
    <div>
      {messageContent}
      <button onClick={() => onConfirm().catch(() => undefined)}>{`confirm:${confirmLabel}`}</button>
      <button onClick={onCancel}>{`cancel:${cancelLabel}`}</button>
    </div>
  ),
}));
jest.mock('src/hooks/guard.hook', () => ({ useRealunitGuard: () => undefined }));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));
const mockLayoutOptions = jest.fn();
jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: unknown) => mockLayoutOptions(options),
}));

const mockNavigate = jest.fn();
jest.mock('src/hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

const mockGetRelations = jest.fn();
const mockApprove = jest.fn();
const mockReject = jest.fn();
const mockManualPrize = jest.fn();
jest.mock('src/hooks/realunit-referral.hook', () => ({
  useRealunitReferral: () => ({
    getRelations: mockGetRelations,
    approveRelation: mockApprove,
    rejectRelation: mockReject,
    createManualPrize: mockManualPrize,
  }),
}));
jest.mock('src/util/utils', () => ({ formatSwissDateTimeWithSeconds: (v: string) => v }));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RealUnitCodeKind, RealUnitManualReviewStatus } from 'src/dto/realunit-referral.dto';
import RealunitReferralDetailScreen from 'src/screens/realunit-referral-detail.screen';

const PENDING = {
  id: 1,
  kind: RealUnitCodeKind.INVITE,
  userId: 10,
  code: 'AB12CD',
  credited: false,
  created: '2026-09-01T10:00:00Z',
  reviewStatus: RealUnitManualReviewStatus.PENDING,
};
const APPROVED = { ...PENDING, id: 2, reviewStatus: RealUnitManualReviewStatus.APPROVED };

describe('RealunitReferralDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockId = '1';
    mockPathname = '/realunit/referral/1';
  });

  it('shows Approve/Reject (not manual prize) for a pending, uncredited relation', async () => {
    mockGetRelations.mockResolvedValue([PENDING]);
    render(<RealunitReferralDetailScreen />);

    await waitFor(() => expect(screen.getByText('AB12CD')).toBeInTheDocument());
    expect(screen.getByText('Invite')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Referrer account')).toBeInTheDocument();
    expect(mockLayoutOptions).toHaveBeenCalledWith({ title: 'Referral Detail', backButton: true });
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
    expect(screen.queryByText('Award manual prize')).not.toBeInTheDocument();
  });

  it('shows only Award manual prize for an approved, uncredited relation', async () => {
    mockId = '2';
    mockGetRelations.mockResolvedValue([APPROVED]);
    render(<RealunitReferralDetailScreen />);

    await waitFor(() => expect(screen.getByText('Award manual prize')).toBeInTheDocument());
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
    expect(screen.queryByText('Reject')).not.toBeInTheDocument();
  });

  it('requires a non-empty reason before calling the action', async () => {
    mockGetRelations.mockResolvedValue([PENDING]);
    render(<RealunitReferralDetailScreen />);
    await waitFor(() => expect(screen.getByText('Approve')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Approve'));
    fireEvent.click(screen.getByText('confirm:Approve')); // reason still empty

    await waitFor(() => expect(mockApprove).not.toHaveBeenCalled());
  });

  it('approves with the entered reason and updates local state', async () => {
    mockGetRelations.mockResolvedValue([PENDING]);
    mockApprove.mockResolvedValue({ ...PENDING, reviewStatus: RealUnitManualReviewStatus.APPROVED });
    render(<RealunitReferralDetailScreen />);
    await waitFor(() => expect(screen.getByText('Approve')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Approve'));
    fireEvent.change(screen.getByPlaceholderText('Enter a reason'), { target: { value: 'looks legit' } });
    fireEvent.click(screen.getByText('confirm:Approve'));

    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith(1, 'looks legit'));
    // after approval the relation is Approved+uncredited → manual prize becomes available
    await waitFor(() => expect(screen.getByText('Award manual prize')).toBeInTheDocument());
  });

  it('renders all optional fields and the review/reward history when present', async () => {
    const FULL = {
      ...PENDING,
      guestAccountId: 501,
      referrerAccountId: 777,
      consumedAt: '2026-09-03T12:00:00Z',
      reviewStatus: RealUnitManualReviewStatus.APPROVED,
      credited: true,
      reviewedBy: 'clerk-a',
      reviewedAt: '2026-09-02T09:00:00Z',
      reviewReason: 'ok',
      manualRewardedBy: 'clerk-b',
      manualRewardedAt: '2026-09-04T08:00:00Z',
      manualRewardReason: 'paid',
    };
    mockGetRelations.mockResolvedValue([FULL]);
    render(<RealunitReferralDetailScreen />);

    await waitFor(() => expect(screen.getByText('AB12CD')).toBeInTheDocument());
    expect(screen.getByText('501')).toBeInTheDocument();
    expect(screen.getByText('777')).toBeInTheDocument();
    expect(screen.getByText('clerk-a')).toBeInTheDocument();
    expect(screen.getByText('clerk-b')).toBeInTheDocument();
    // credited + already rewarded → no action buttons
    expect(screen.queryByText('Award manual prize')).not.toBeInTheDocument();
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
  });

  it('rejects with the entered reason', async () => {
    mockGetRelations.mockResolvedValue([PENDING]);
    mockReject.mockResolvedValue({ ...PENDING, reviewStatus: RealUnitManualReviewStatus.REJECTED });
    render(<RealunitReferralDetailScreen />);
    await waitFor(() => expect(screen.getByText('Reject')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Reject'));
    fireEvent.change(screen.getByPlaceholderText('Enter a reason'), { target: { value: 'fraud' } });
    fireEvent.click(screen.getByText('confirm:Reject'));

    await waitFor(() => expect(mockReject).toHaveBeenCalledWith(1, 'fraud'));
  });

  it('awards a manual prize with the entered reason', async () => {
    mockId = '2';
    mockGetRelations.mockResolvedValue([APPROVED]);
    mockManualPrize.mockResolvedValue({ ...APPROVED, credited: true });
    render(<RealunitReferralDetailScreen />);
    await waitFor(() => expect(screen.getByText('Award manual prize')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Award manual prize'));
    fireEvent.change(screen.getByPlaceholderText('Enter a reason'), { target: { value: 'manual payout' } });
    fireEvent.click(screen.getByText('confirm:Award manual prize'));

    await waitFor(() => expect(mockManualPrize).toHaveBeenCalledWith(2, 'manual payout'));
    // credited now → no action buttons remain
    await waitFor(() => expect(screen.queryByText('Award manual prize')).not.toBeInTheDocument());
  });

  it('closes the overlay on cancel without calling an action', async () => {
    mockGetRelations.mockResolvedValue([PENDING]);
    render(<RealunitReferralDetailScreen />);
    await waitFor(() => expect(screen.getByText('Approve')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Approve'));
    expect(screen.getByText('cancel:Cancel')).toBeInTheDocument();
    fireEvent.click(screen.getByText('cancel:Cancel'));

    await waitFor(() => expect(screen.queryByText('cancel:Cancel')).not.toBeInTheDocument());
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('navigates back to the list', async () => {
    mockGetRelations.mockResolvedValue([PENDING]);
    render(<RealunitReferralDetailScreen />);
    await waitFor(() => expect(screen.getByText('AB12CD')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Back'));

    expect(mockNavigate).toHaveBeenCalledWith('/realunit/referral');
  });

  it('shows a promo redemption with its own title, no referrer row and back to the promo list', async () => {
    mockId = '3';
    mockPathname = '/realunit/promo/3';
    mockGetRelations.mockResolvedValue([
      {
        id: 3,
        kind: RealUnitCodeKind.PROMO,
        userId: 20,
        code: 'WOV2026',
        credited: true,
        created: '2026-10-01T10:00:00Z',
      },
    ]);
    render(<RealunitReferralDetailScreen />);

    await waitFor(() => expect(screen.getByText('WOV2026')).toBeInTheDocument());
    expect(mockLayoutOptions).toHaveBeenCalledWith({ title: 'Promo redemption', backButton: true });
    expect(screen.getAllByText('Promo redemption').length).toBeGreaterThan(0);
    expect(screen.getByText('Promo')).toBeInTheDocument();
    expect(screen.queryByText('Referrer account')).not.toBeInTheDocument();
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Back'));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/promo');
  });

  it('moves an old referral link of a promo redemption to the promo route', async () => {
    mockId = '3';
    mockPathname = '/realunit/referral/3';
    mockGetRelations.mockResolvedValue([
      {
        id: 3,
        kind: RealUnitCodeKind.PROMO,
        userId: 20,
        code: 'WOV2026',
        credited: true,
        created: '2026-10-01T10:00:00Z',
      },
    ]);
    render(<RealunitReferralDetailScreen />);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/realunit/promo/3', { replace: true }));
  });

  it('moves an invite opened under the promo route to the referral route', async () => {
    mockId = String(PENDING.id);
    mockPathname = `/realunit/promo/${PENDING.id}`;
    mockGetRelations.mockResolvedValue([PENDING]);
    render(<RealunitReferralDetailScreen />);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(`/realunit/referral/${PENDING.id}`, { replace: true }),
    );
  });

  it('translates a rejected review status', async () => {
    mockGetRelations.mockResolvedValue([{ ...PENDING, reviewStatus: RealUnitManualReviewStatus.REJECTED }]);
    render(<RealunitReferralDetailScreen />);

    await waitFor(() => expect(screen.getByText('Rejected')).toBeInTheDocument());
  });

  it('shows an error when the list load fails', async () => {
    mockGetRelations.mockRejectedValue(new Error('boom'));
    render(<RealunitReferralDetailScreen />);

    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
  });

  it('falls back to Unknown error when the list load rejects without a message', async () => {
    mockGetRelations.mockRejectedValue({ message: undefined });
    render(<RealunitReferralDetailScreen />);

    await waitFor(() => expect(screen.getByText('Unknown error')).toBeInTheDocument());
  });

  it('keeps the overlay open when cancel is pressed while the action is still running', async () => {
    mockGetRelations.mockResolvedValue([PENDING]);
    mockApprove.mockReturnValue(new Promise(() => undefined));
    render(<RealunitReferralDetailScreen />);
    await waitFor(() => expect(screen.getByText('Approve')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Approve'));
    fireEvent.change(screen.getByPlaceholderText('Enter a reason'), { target: { value: 'looks legit' } });
    fireEvent.click(screen.getByText('confirm:Approve'));
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith(1, 'looks legit'));

    fireEvent.click(screen.getByText('cancel:Cancel'));

    expect(screen.getByText('cancel:Cancel')).toBeInTheDocument();
  });

  it('shows a not-found message when the id is absent from the list', async () => {
    mockId = '999';
    mockGetRelations.mockResolvedValue([PENDING]);
    render(<RealunitReferralDetailScreen />);

    await waitFor(() => expect(screen.getByText('Relation not found')).toBeInTheDocument());
  });
});
