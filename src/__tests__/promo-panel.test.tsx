jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledButtonWidth: { MIN: 'min' },
  StyledLoadingSpinner: () => null,
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));
jest.mock('react-qr-code', () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => (
    <svg data-testid="qr-svg" data-value={value} viewBox="0 0 1 1" />
  ),
}));
const mockDownloadQrRaster = jest.fn();
const mockDownloadQrSvg = jest.fn();
jest.mock('src/util/promo-landing-url', () => {
  const actual = jest.requireActual('src/util/promo-landing-url') as typeof import('src/util/promo-landing-url');
  return {
    ...actual,
    downloadQrRaster: (...args: unknown[]) => mockDownloadQrRaster(...args),
    downloadQrSvg: (...args: unknown[]) => mockDownloadQrSvg(...args),
  };
});

const mockGetPromoCodes = jest.fn();
const mockCreatePromoCode = jest.fn();
const mockCreatePromoCodes = jest.fn();
const mockDeactivatePromoCode = jest.fn();
const mockActivatePromoCode = jest.fn();
const mockUpdatePromoCode = jest.fn();
jest.mock('src/hooks/realunit-referral.hook', () => ({
  useRealunitReferral: () => ({
    getPromoCodes: (...args: unknown[]) => mockGetPromoCodes(...args),
    createPromoCode: (...args: unknown[]) => mockCreatePromoCode(...args),
    createPromoCodes: (...args: unknown[]) => mockCreatePromoCodes(...args),
    deactivatePromoCode: (...args: unknown[]) => mockDeactivatePromoCode(...args),
    activatePromoCode: (...args: unknown[]) => mockActivatePromoCode(...args),
    updatePromoCode: (...args: unknown[]) => mockUpdatePromoCode(...args),
  }),
}));

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RealunitPromoPanel } from 'src/components/realunit/promo-panel';

const translate = (_ns: string, key: string) => key;

const ACTIVE = {
  id: 3,
  code: 'START2026',
  minBuyRealu: 200,
  redemptionCap: 50,
  validFrom: '2026-09-09T00:00:00.000Z',
  validUntil: '2026-12-31T23:59:59.000Z',
};

describe('RealunitPromoPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPromoCodes.mockResolvedValue([]);
    mockCreatePromoCode.mockResolvedValue(ACTIVE);
    mockCreatePromoCodes.mockResolvedValue([ACTIVE]);
    mockDeactivatePromoCode.mockResolvedValue(undefined);
    mockActivatePromoCode.mockResolvedValue(ACTIVE);
    mockUpdatePromoCode.mockResolvedValue(ACTIVE);
  });

  it('shows a loading spinner while promo codes load', () => {
    mockGetPromoCodes.mockImplementation(() => new Promise(() => undefined));
    render(<RealunitPromoPanel translate={translate} />);
    expect(screen.getByText('Promo codes')).toBeInTheDocument();
  });

  it('shows the empty promo list', async () => {
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('No promo codes yet')).toBeInTheDocument());
    expect(mockGetPromoCodes).toHaveBeenCalled();
  });

  it('starts a promo code with day-bounded ISO dates', async () => {
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: ' START2026 ' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Minimum buy (REALU)'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-12-31' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(mockCreatePromoCode).toHaveBeenCalled());
    expect(mockCreatePromoCode).toHaveBeenCalledWith({
      code: 'START2026',
      redemptionCap: 50,
      minBuyRealu: 200,
      validFrom: '2026-09-09T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.999Z',
    });
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());
  });

  it('starts a batch of promo codes with a prefix', async () => {
    const batch = [
      { ...ACTIVE, id: 11, code: 'MESSE-AAAA1111' },
      { ...ACTIVE, id: 12, code: 'MESSE-BBBB2222' },
    ];
    mockCreatePromoCodes.mockResolvedValue(batch);
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Prefix (optional)'), { target: { value: 'MESSE' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-12-31' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(mockCreatePromoCodes).toHaveBeenCalled());
    expect(mockCreatePromoCodes).toHaveBeenCalledWith({
      count: 2,
      prefix: 'MESSE',
      redemptionCap: 1,
      minBuyRealu: 200,
      validFrom: '2026-09-09T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.999Z',
    });
    expect(mockCreatePromoCode).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('MESSE-AAAA1111')).toBeInTheDocument());
  });

  it('starts a batch of promo codes without a prefix', async () => {
    const batch = [
      { ...ACTIVE, id: 21, code: 'BATCH-CCCC3333' },
      { ...ACTIVE, id: 22, code: 'BATCH-DDDD4444' },
    ];
    mockCreatePromoCodes.mockResolvedValue(batch);
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Prefix (optional)'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-12-31' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(mockCreatePromoCodes).toHaveBeenCalled());
    expect(mockCreatePromoCodes).toHaveBeenCalledWith({
      count: 2,
      prefix: undefined,
      redemptionCap: 3,
      minBuyRealu: 200,
      validFrom: '2026-09-09T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.999Z',
    });
    expect(mockCreatePromoCode).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('BATCH-CCCC3333')).toBeInTheDocument());
    expect(screen.getByText('BATCH-DDDD4444')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity')).toHaveValue(1);
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
  });

  it('keeps Start disabled when quantity is above 500', async () => {
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '501' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-09-10' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('keeps Start disabled for quantity 0, empty, or fractional', async () => {
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-09-10' } });

    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1.5' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('keeps Start disabled when quantity is 1 and Code is empty', async () => {
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-09-10' } });

    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('does not create on form submit when the form is incomplete', async () => {
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());
    fireEvent.submit(screen.getByRole('button', { name: 'Start' }).closest('form') as HTMLFormElement);
    expect(mockCreatePromoCode).not.toHaveBeenCalled();
    expect(mockCreatePromoCodes).not.toHaveBeenCalled();
  });

  it('creates on form submit when the form is complete', async () => {
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'FORM1' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-09-10' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled());
    fireEvent.submit(screen.getByRole('button', { name: 'Start' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(mockCreatePromoCode).toHaveBeenCalled());
  });

  it('keeps Start disabled until the form is complete', async () => {
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('keeps Start disabled for a fractional or zero cap and an empty minimum buy', async () => {
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-09-10' } });

    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '1.5' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Minimum buy (REALU)'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Minimum buy (REALU)'), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Minimum buy (REALU)'), { target: { value: '1.5' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('keeps Start disabled while promo codes are still loading', () => {
    mockGetPromoCodes.mockImplementation(() => new Promise(() => undefined));
    render(<RealunitPromoPanel translate={translate} />);
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-09-10' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('shows a form error when create fails', async () => {
    mockCreatePromoCode.mockRejectedValue(new Error('taken'));
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-09-10' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('taken'));
  });

  it('shows a loaded promo as already deactivated', async () => {
    mockGetPromoCodes.mockResolvedValue([{ ...ACTIVE, deactivatedAt: '2026-09-01T00:00:00.000Z' }]);
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('Deactivated')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
  });

  it('keeps Start disabled after the promo list fails to load', async () => {
    mockGetPromoCodes.mockRejectedValue(new Error('list-fail'));
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('list-fail'));

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-09-10' } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('shows a list error when promo codes fail to load', async () => {
    mockGetPromoCodes.mockRejectedValue(new Error('list-fail'));
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('list-fail'));
  });

  it('falls back to Unknown error when the promo list rejects without a message', async () => {
    mockGetPromoCodes.mockRejectedValue({ message: undefined });
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });

  it('deactivates an active promo code', async () => {
    const other = { ...ACTIVE, id: 4, code: 'KEEP2026' };
    mockGetPromoCodes.mockResolvedValue([ACTIVE, other]);
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());
    expect(screen.getByText('KEEP2026')).toBeInTheDocument();

    const startRow = screen.getByText('START2026').closest('tr') as HTMLElement;
    fireEvent.click(within(startRow).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(mockDeactivatePromoCode).toHaveBeenCalledWith(3));
    await waitFor(() => {
      const row = screen.getByText('START2026').closest('tr') as HTMLElement;
      expect(within(row).getByText('Deactivated')).toBeInTheDocument();
    });
    const keepRow = screen.getByText('KEEP2026').closest('tr') as HTMLElement;
    expect(within(keepRow).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
    expect(within(keepRow).queryByText('Deactivated')).not.toBeInTheDocument();
  });

  it('keeps Start disabled when until is before from', async () => {
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-10' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-09-09' } });

    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('falls back to Unknown error when create rejects without a message', async () => {
    mockCreatePromoCode.mockRejectedValue({ message: undefined });
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-09-10' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });

  it('shows a list error when deactivate fails', async () => {
    mockGetPromoCodes.mockResolvedValue([ACTIVE]);
    mockDeactivatePromoCode.mockRejectedValue(new Error('nope'));
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('nope'));

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-09-10' } });
    expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled();
  });

  it('falls back to Unknown error when deactivate rejects without a message', async () => {
    mockGetPromoCodes.mockResolvedValue([ACTIVE]);
    mockDeactivatePromoCode.mockRejectedValue({ message: undefined });
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });

  it('ignores a second Start click while create is in flight', async () => {
    const deferred: { resolve: (value: typeof ACTIVE) => void } = { resolve: () => undefined };
    mockCreatePromoCode.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve;
        }),
    );
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(mockGetPromoCodes).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'START2026' } });
    fireEvent.change(screen.getByLabelText('Redemption cap'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Minimum buy (REALU)'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Valid from'), { target: { value: '2026-09-09' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2026-12-31' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled());
    const startBtn = screen.getByRole('button', { name: 'Start' });
    fireEvent.click(startBtn);
    fireEvent.click(startBtn);
    expect(mockCreatePromoCode).toHaveBeenCalledTimes(1);

    deferred.resolve(ACTIVE);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());
  });

  it('allows deactivating two rows in parallel', async () => {
    const other = { ...ACTIVE, id: 4, code: 'KEEP2026' };
    mockGetPromoCodes.mockResolvedValue([ACTIVE, other]);
    const resolvers: Record<number, (value?: unknown) => void> = {};
    mockDeactivatePromoCode.mockImplementation(
      (id: number) =>
        new Promise((resolve) => {
          resolvers[id] = resolve;
        }),
    );
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());

    const startRow = screen.getByText('START2026').closest('tr') as HTMLElement;
    const keepRow = screen.getByText('KEEP2026').closest('tr') as HTMLElement;
    fireEvent.click(within(startRow).getByRole('button', { name: 'Deactivate' }));

    expect(within(startRow).getByRole('button', { name: 'Deactivate' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(keepRow).getByRole('button', { name: 'Deactivate' })).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(within(keepRow).getByRole('button', { name: 'Deactivate' }));

    expect(mockDeactivatePromoCode).toHaveBeenCalledTimes(2);
    expect(mockDeactivatePromoCode).toHaveBeenCalledWith(3);
    expect(mockDeactivatePromoCode).toHaveBeenCalledWith(4);

    resolvers[3]();
    await waitFor(() => {
      const row = screen.getByText('START2026').closest('tr') as HTMLElement;
      expect(within(row).getByText('Deactivated')).toBeInTheDocument();
    });
    const keepRowAfter = screen.getByText('KEEP2026').closest('tr') as HTMLElement;
    expect(within(keepRowAfter).getByRole('button', { name: 'Deactivate' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(keepRowAfter).queryByText('Deactivated')).not.toBeInTheDocument();
  });

  it('ignores a second Deactivate click on the same row while in flight', async () => {
    mockGetPromoCodes.mockResolvedValue([ACTIVE]);
    mockDeactivatePromoCode.mockImplementation(() => new Promise(() => undefined));
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());

    const startRow = screen.getByText('START2026').closest('tr') as HTMLElement;
    const deactivate = within(startRow).getByRole('button', { name: 'Deactivate' });
    fireEvent.click(deactivate);
    fireEvent.click(deactivate);

    expect(mockDeactivatePromoCode).toHaveBeenCalledTimes(1);
    expect(mockDeactivatePromoCode).toHaveBeenCalledWith(3);
  });

  it('lists a shareable realunit.app landing link for each promo code', async () => {
    mockGetPromoCodes.mockResolvedValue([ACTIVE]);
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());

    const startRow = screen.getByText('START2026').closest('tr') as HTMLElement;
    const link = within(startRow).getByRole('link', { name: 'https://realunit.app/promo/START2026' });
    expect(link).toHaveAttribute('href', 'https://realunit.app/promo/START2026');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('opens the QR dialog with PNG SVG and JPG downloads for that landing URL', async () => {
    mockGetPromoCodes.mockResolvedValue([ACTIVE]);
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());

    const startRow = screen.getByText('START2026').closest('tr') as HTMLElement;
    fireEvent.click(within(startRow).getByRole('button', { name: 'View QR code' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('qr-svg')).toHaveAttribute(
      'data-value',
      'https://realunit.app/promo/START2026',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download SVG' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download PNG' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download JPG' }));
    expect(mockDownloadQrSvg).toHaveBeenCalledTimes(1);
    expect(mockDownloadQrRaster).toHaveBeenCalledTimes(2);
    expect(mockDownloadQrRaster.mock.calls[0][2]).toBe('image/png');
    expect(mockDownloadQrRaster.mock.calls[1][2]).toBe('image/jpeg');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not download when the QR svg is missing', async () => {
    mockGetPromoCodes.mockResolvedValue([ACTIVE]);
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'View QR code' }));
    screen.getByTestId('promo-qr').replaceChildren();
    mockDownloadQrSvg.mockClear();
    mockDownloadQrRaster.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Download SVG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download PNG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download JPG' }));
    expect(mockDownloadQrSvg).not.toHaveBeenCalled();
    expect(mockDownloadQrRaster).not.toHaveBeenCalled();
  });

  it('closes the QR dialog on Escape', async () => {
    mockGetPromoCodes.mockResolvedValue([ACTIVE]);
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'View QR code' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the QR dialog when the backdrop is clicked', async () => {
    mockGetPromoCodes.mockResolvedValue([ACTIVE]);
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'View QR code' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('activates a deactivated promo code', async () => {
    mockGetPromoCodes.mockResolvedValue([{ ...ACTIVE, deactivatedAt: '2026-09-01T00:00:00.000Z' }]);
    mockActivatePromoCode.mockResolvedValue({ ...ACTIVE });
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('Deactivated')).toBeInTheDocument());

    const startRow = screen.getByText('START2026').closest('tr') as HTMLElement;
    expect(within(startRow).queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
    expect(within(startRow).getByRole('button', { name: 'Activate' })).toBeInTheDocument();
    fireEvent.click(within(startRow).getByRole('button', { name: 'Activate' }));

    await waitFor(() => expect(mockActivatePromoCode).toHaveBeenCalledWith(3));
    await waitFor(() => {
      const row = screen.getByText('START2026').closest('tr') as HTMLElement;
      expect(within(row).queryByText('Deactivated')).not.toBeInTheDocument();
      expect(within(row).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
    });
  });

  it('ignores a second Activate click on the same row while in flight', async () => {
    mockGetPromoCodes.mockResolvedValue([{ ...ACTIVE, deactivatedAt: '2026-09-01T00:00:00.000Z' }]);
    mockActivatePromoCode.mockImplementation(() => new Promise(() => undefined));
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());

    const startRow = screen.getByText('START2026').closest('tr') as HTMLElement;
    const activate = within(startRow).getByRole('button', { name: 'Activate' });
    fireEvent.click(activate);
    fireEvent.click(activate);

    expect(mockActivatePromoCode).toHaveBeenCalledTimes(1);
    expect(mockActivatePromoCode).toHaveBeenCalledWith(3);
  });

  it('shows an action error when activate fails and leaves the row deactivated', async () => {
    mockGetPromoCodes.mockResolvedValue([{ ...ACTIVE, deactivatedAt: '2026-09-01T00:00:00.000Z' }]);
    mockActivatePromoCode.mockRejectedValue(new Error('cannot-activate'));
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('cannot-activate'));
    const startRow = screen.getByText('START2026').closest('tr') as HTMLElement;
    expect(within(startRow).getByText('Deactivated')).toBeInTheDocument();
    expect(within(startRow).getByRole('button', { name: 'Activate' })).toBeInTheDocument();
    expect(within(startRow).queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
  });

  it('saves edits to an active promo code with day-bounded ISO dates', async () => {
    mockGetPromoCodes.mockResolvedValue([ACTIVE]);
    mockUpdatePromoCode.mockResolvedValue({ ...ACTIVE, code: 'NEW2026', redemptionCap: 80 });
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());

    const startRow = screen.getByText('START2026').closest('tr') as HTMLElement;
    fireEvent.click(within(startRow).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(startRow).getByDisplayValue('START2026'), { target: { value: 'NEW2026' } });
    fireEvent.change(within(startRow).getByDisplayValue('50'), { target: { value: '80' } });
    fireEvent.click(within(startRow).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockUpdatePromoCode).toHaveBeenCalled());
    expect(mockUpdatePromoCode).toHaveBeenCalledWith(3, {
      code: 'NEW2026',
      redemptionCap: 80,
      minBuyRealu: 200,
      validFrom: '2026-09-09T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.999Z',
    });
    await waitFor(() => expect(screen.getByText('NEW2026')).toBeInTheDocument());
  });

  it('does not update when edit is cancelled', async () => {
    mockGetPromoCodes.mockResolvedValue([ACTIVE]);
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());

    const startRow = screen.getByText('START2026').closest('tr') as HTMLElement;
    fireEvent.click(within(startRow).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(startRow).getByDisplayValue('START2026'), { target: { value: 'CHANGED' } });
    fireEvent.click(within(startRow).getByRole('button', { name: 'Cancel' }));

    expect(mockUpdatePromoCode).not.toHaveBeenCalled();
    expect(screen.getByText('START2026')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('CHANGED')).not.toBeInTheDocument();
  });

  it('keeps Save disabled when the cap is below the redemption count', async () => {
    mockGetPromoCodes.mockResolvedValue([{ ...ACTIVE, redemptionCount: 10 }]);
    render(<RealunitPromoPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('START2026')).toBeInTheDocument());

    const startRow = screen.getByText('START2026').closest('tr') as HTMLElement;
    fireEvent.click(within(startRow).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(startRow).getByDisplayValue('50'), { target: { value: '9' } });

    expect(within(startRow).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(mockUpdatePromoCode).not.toHaveBeenCalled();
  });
});
