// Component tests for the RealUnit promo-code screen: the promo panel plus the redeemed promo codes.
// Only promo redemptions are listed, without the review filter and review column (promo redemptions
// are never held for review), and a row opens the promo redemption detail.

jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: () => <div data-testid="spinner" />,
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));
jest.mock('src/components/realunit/promo-panel', () => ({
  RealunitPromoPanel: () => <div data-testid="promo-panel" />,
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
jest.mock('src/hooks/realunit-referral.hook', () => ({
  useRealunitReferral: () => ({ getRelations: mockGetRelations }),
}));

jest.mock('src/util/utils', () => ({ formatSwissDateTimeWithSeconds: (v: string) => v }));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RealUnitCodeKind, RealUnitManualReviewStatus } from 'src/dto/realunit-referral.dto';
import RealunitPromoScreen from 'src/screens/realunit-promo.screen';

const PROMO = {
  id: 5,
  kind: RealUnitCodeKind.PROMO,
  userId: 14,
  code: 'WOV2026',
  credited: true,
  created: '2026-10-01T10:00:00Z',
};
const INVITE = {
  id: 1,
  kind: RealUnitCodeKind.INVITE,
  userId: 10,
  code: 'AB12CD',
  credited: false,
  created: '2026-09-01T10:00:00Z',
  reviewStatus: RealUnitManualReviewStatus.PENDING,
};

describe('RealunitPromoScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the promo panel and only promo redemptions, without review filter or column', async () => {
    mockGetRelations.mockResolvedValue([PROMO, INVITE]);
    render(<RealunitPromoScreen />);

    await waitFor(() => expect(screen.getByText('WOV2026')).toBeInTheDocument());

    expect(mockLayoutOptions).toHaveBeenCalledWith({ title: 'Promo codes', backButton: true, noMaxWidth: true });
    expect(screen.getByTestId('promo-panel')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Redeemed promo codes' })).toBeInTheDocument();
    expect(screen.getByText(/Redemptions/)).toHaveTextContent('Redemptions: 1');
    expect(screen.queryByText('AB12CD')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Review Status' })).not.toBeInTheDocument();
  });

  it('opens the promo redemption detail on row click', async () => {
    mockGetRelations.mockResolvedValue([PROMO]);
    render(<RealunitPromoScreen />);
    await waitFor(() => expect(screen.getByText('WOV2026')).toBeInTheDocument());

    fireEvent.click(screen.getByText('WOV2026'));

    expect(mockNavigate).toHaveBeenCalledWith('/realunit/promo/5');
  });
});
