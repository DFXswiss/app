jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledButtonWidth: { MIN: 'min' },
  StyledButtonSize: { SMALL: 'small', BIG: 'big' },
  StyledButtonColor: { BLUE: 'blue', RED: 'red' },
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

const mockListPrizeWalletAlerts = jest.fn();
const mockCreatePrizeWalletAlert = jest.fn();
const mockDeletePrizeWalletAlert = jest.fn();
jest.mock('src/hooks/realunit-referral.hook', () => ({
  useRealunitReferral: () => ({
    listPrizeWalletAlerts: (...args: unknown[]) => mockListPrizeWalletAlerts(...args),
    createPrizeWalletAlert: (...args: unknown[]) => mockCreatePrizeWalletAlert(...args),
    deletePrizeWalletAlert: (...args: unknown[]) => mockDeletePrizeWalletAlert(...args),
  }),
}));

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RealunitPrizeWalletAlertPanel } from 'src/components/realunit/prize-wallet-alert-panel';
import { RealUnitPrizeWalletAlertAsset } from 'src/dto/realunit-referral.dto';

const translate = (_ns: string, key: string) => key;

const ALERT = {
  id: 3,
  asset: RealUnitPrizeWalletAlertAsset.ETH,
  threshold: 0.05,
  mail: 'ops@example.com',
  created: '2026-09-10T00:00:00.000Z',
};

const NOTIFY = 'Notify on low balance';

async function openForm() {
  await waitFor(() => expect(screen.getByRole('button', { name: NOTIFY })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: NOTIFY }));
  await waitFor(() => expect(screen.getByLabelText('Asset')).toBeInTheDocument());
}

async function fillValidEthForm() {
  fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '0.05' } });
  fireEvent.change(screen.getByLabelText('Mail'), { target: { value: 'ops@example.com' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled());
}

describe('RealunitPrizeWalletAlertPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListPrizeWalletAlerts.mockResolvedValue([]);
    mockCreatePrizeWalletAlert.mockResolvedValue(ALERT);
    mockDeletePrizeWalletAlert.mockResolvedValue(undefined);
  });

  it('shows the notify button and a loading spinner while alerts load', () => {
    mockListPrizeWalletAlerts.mockImplementation(() => new Promise(() => undefined));
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    expect(screen.getByRole('button', { name: NOTIFY })).toBeInTheDocument();
    expect(screen.getByTestId('prize-wallet-alert-loading')).toHaveTextContent('Loading');
    expect(screen.queryByLabelText('Asset')).not.toBeInTheDocument();
  });

  it('keeps Notify disabled while alerts are still loading', () => {
    mockListPrizeWalletAlerts.mockImplementation(() => new Promise(() => undefined));
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    expect(screen.getByRole('button', { name: NOTIFY })).toBeDisabled();
  });

  it('toggles the form open and closed', async () => {
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(mockListPrizeWalletAlerts).toHaveBeenCalled());
    expect(screen.queryByLabelText('Asset')).not.toBeInTheDocument();

    await openForm();
    expect(screen.getByLabelText('Threshold')).toHaveAttribute('step', 'any');
    expect(screen.getByLabelText('Threshold')).not.toHaveAttribute('min');

    fireEvent.click(screen.getByRole('button', { name: NOTIFY }));
    expect(screen.queryByLabelText('Asset')).not.toBeInTheDocument();
  });

  it('switches threshold constraints when REALU is selected', async () => {
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(mockListPrizeWalletAlerts).toHaveBeenCalled());
    await openForm();

    fireEvent.change(screen.getByLabelText('Asset'), { target: { value: RealUnitPrizeWalletAlertAsset.REALU } });
    expect(screen.getByLabelText('Threshold')).toHaveAttribute('step', '1');
    expect(screen.getByLabelText('Threshold')).toHaveAttribute('min', '1');
  });

  it('keeps Submit disabled for invalid ETH, REALU, and mail values', async () => {
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(mockListPrizeWalletAlerts).toHaveBeenCalled());
    await openForm();

    fireEvent.change(screen.getByLabelText('Mail'), { target: { value: 'ops@example.com' } });
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '-1' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: 'Infinity' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '0.05' } });
    fireEvent.change(screen.getByLabelText('Mail'), { target: { value: 'not-an-email' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Mail'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Asset'), { target: { value: RealUnitPrizeWalletAlertAsset.REALU } });
    fireEvent.change(screen.getByLabelText('Mail'), { target: { value: 'ops@example.com' } });
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '1.5' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('rejects comma-separated, semicolon-separated, and whitespace-separated mail', async () => {
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(mockListPrizeWalletAlerts).toHaveBeenCalled());
    await openForm();

    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '0.05' } });
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form') as HTMLFormElement;

    fireEvent.change(screen.getByLabelText('Mail'), { target: { value: 'a@b,c@d' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    fireEvent.submit(form);
    expect(mockCreatePrizeWalletAlert).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Mail'), { target: { value: 'a@b;c@d' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    fireEvent.submit(form);
    expect(mockCreatePrizeWalletAlert).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Mail'), { target: { value: 'a@b c@d' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    fireEvent.submit(form);
    expect(mockCreatePrizeWalletAlert).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Mail'), { target: { value: 'a@@b' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Mail'), { target: { value: '@b' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Mail'), { target: { value: 'a@' } });
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Mail'), { target: { value: 'a@b' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled());
  });

  it('does not create on form submit when the form is incomplete', async () => {
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(mockListPrizeWalletAlerts).toHaveBeenCalled());
    await openForm();
    fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form') as HTMLFormElement);
    expect(mockCreatePrizeWalletAlert).not.toHaveBeenCalled();
  });

  it('creates an ETH alert, prepends it, resets and closes the form', async () => {
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(mockListPrizeWalletAlerts).toHaveBeenCalled());
    await openForm();
    await fillValidEthForm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(mockCreatePrizeWalletAlert).toHaveBeenCalledWith({
        asset: RealUnitPrizeWalletAlertAsset.ETH,
        threshold: 0.05,
        mail: 'ops@example.com',
      }),
    );
    await waitFor(() => expect(screen.getByText('ops@example.com')).toBeInTheDocument());
    expect(screen.queryByLabelText('Asset')).not.toBeInTheDocument();
  });

  it('creates a REALU alert via form submit', async () => {
    const created = {
      ...ALERT,
      id: 9,
      asset: RealUnitPrizeWalletAlertAsset.REALU,
      threshold: 10,
      mail: 'realu@example.com',
    };
    mockCreatePrizeWalletAlert.mockResolvedValue(created);
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(mockListPrizeWalletAlerts).toHaveBeenCalled());
    await openForm();

    fireEvent.change(screen.getByLabelText('Asset'), { target: { value: RealUnitPrizeWalletAlertAsset.REALU } });
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Mail'), { target: { value: ' realu@example.com ' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled());
    fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form') as HTMLFormElement);

    await waitFor(() =>
      expect(mockCreatePrizeWalletAlert).toHaveBeenCalledWith({
        asset: RealUnitPrizeWalletAlertAsset.REALU,
        threshold: 10,
        mail: 'realu@example.com',
      }),
    );
    await waitFor(() => expect(screen.getByText('realu@example.com')).toBeInTheDocument());
  });

  it('shows a form error when create fails', async () => {
    mockCreatePrizeWalletAlert.mockRejectedValue(new Error('taken'));
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(mockListPrizeWalletAlerts).toHaveBeenCalled());
    await openForm();
    await fillValidEthForm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('taken'));
    expect(screen.getByLabelText('Asset')).toBeInTheDocument();
  });

  it('falls back to Unknown error when create rejects without a message', async () => {
    mockCreatePrizeWalletAlert.mockRejectedValue({ message: undefined });
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(mockListPrizeWalletAlerts).toHaveBeenCalled());
    await openForm();
    await fillValidEthForm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });

  it('shows loaded alerts in the list', async () => {
    mockListPrizeWalletAlerts.mockResolvedValue([ALERT]);
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('ops@example.com')).toBeInTheDocument());
    expect(screen.getByText('ETH')).toBeInTheDocument();
    expect(screen.getByText('0.05')).toBeInTheDocument();
  });

  it('shows a list error when alerts fail to load', async () => {
    mockListPrizeWalletAlerts.mockRejectedValue(new Error('list-fail'));
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('list-fail'));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('keeps Submit enabled after the alert list fails and clears listError on successful create', async () => {
    mockListPrizeWalletAlerts.mockRejectedValue(new Error('list-fail'));
    mockCreatePrizeWalletAlert.mockResolvedValue(ALERT);
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('list-fail'));
    await openForm();
    await fillValidEthForm();
    expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(mockCreatePrizeWalletAlert).toHaveBeenCalledWith({
        asset: RealUnitPrizeWalletAlertAsset.ETH,
        threshold: 0.05,
        mail: 'ops@example.com',
      }),
    );
    await waitFor(() => expect(screen.queryByText('list-fail')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('ops@example.com')).toBeInTheDocument());
  });

  it('retries the alert list after a load failure', async () => {
    mockListPrizeWalletAlerts.mockRejectedValueOnce(new Error('list-fail')).mockResolvedValueOnce([ALERT]);
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('list-fail'));
    expect(mockListPrizeWalletAlerts).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(mockListPrizeWalletAlerts).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('list-fail')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('ops@example.com')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('falls back to Unknown error when the alert list rejects without a message', async () => {
    mockListPrizeWalletAlerts.mockRejectedValue({ message: undefined });
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });

  it('deletes an alert and removes the row', async () => {
    const other = { ...ALERT, id: 4, mail: 'keep@example.com' };
    mockListPrizeWalletAlerts.mockResolvedValue([ALERT, other]);
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('ops@example.com')).toBeInTheDocument());

    const row = screen.getByText('ops@example.com').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockDeletePrizeWalletAlert).toHaveBeenCalledWith(3));
    await waitFor(() => expect(screen.queryByText('ops@example.com')).not.toBeInTheDocument());
    expect(screen.getByText('keep@example.com')).toBeInTheDocument();
  });

  it('shows a list error when delete fails', async () => {
    mockListPrizeWalletAlerts.mockResolvedValue([ALERT]);
    mockDeletePrizeWalletAlert.mockRejectedValue(new Error('nope'));
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('ops@example.com')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('nope'));
    expect(screen.getByText('ops@example.com')).toBeInTheDocument();
  });

  it('clears a leftover delete error after a successful create', async () => {
    const created = { ...ALERT, id: 11, mail: 'new@example.com' };
    mockListPrizeWalletAlerts.mockResolvedValue([ALERT]);
    mockDeletePrizeWalletAlert.mockRejectedValue(new Error('nope'));
    mockCreatePrizeWalletAlert.mockResolvedValue(created);
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('ops@example.com')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('nope'));

    await openForm();
    await fillValidEthForm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(mockCreatePrizeWalletAlert).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('nope')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('new@example.com')).toBeInTheDocument());
  });

  it('falls back to Unknown error when delete rejects without a message', async () => {
    mockListPrizeWalletAlerts.mockResolvedValue([ALERT]);
    mockDeletePrizeWalletAlert.mockRejectedValue({ message: undefined });
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('ops@example.com')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });

  it('exposes Notify on low balance as the notify button accessible name', async () => {
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(mockListPrizeWalletAlerts).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Notify on low balance' })).toBeInTheDocument();
  });

  it('ignores a second Submit click while create is in flight', async () => {
    const deferred: { resolve: (value: typeof ALERT) => void } = { resolve: () => undefined };
    mockCreatePrizeWalletAlert.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve;
        }),
    );
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(mockListPrizeWalletAlerts).toHaveBeenCalled());
    await openForm();
    await fillValidEthForm();

    const submit = screen.getByRole('button', { name: 'Submit' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mockCreatePrizeWalletAlert).toHaveBeenCalledTimes(1);

    deferred.resolve(ALERT);
    await waitFor(() => expect(screen.getByText('ops@example.com')).toBeInTheDocument());
  });

  it('disables Retry while create is in flight', async () => {
    mockListPrizeWalletAlerts.mockRejectedValueOnce(new Error('list-fail'));
    const deferred: { resolve: (value: typeof ALERT) => void } = { resolve: () => undefined };
    mockCreatePrizeWalletAlert.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve;
        }),
    );
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('list-fail'));
    await openForm();
    await fillValidEthForm();

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(mockCreatePrizeWalletAlert).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();

    deferred.resolve(ALERT);
    await waitFor(() => expect(screen.getByText('ops@example.com')).toBeInTheDocument());
  });

  it('allows deleting two rows in parallel', async () => {
    const other = { ...ALERT, id: 4, mail: 'keep@example.com' };
    mockListPrizeWalletAlerts.mockResolvedValue([ALERT, other]);
    const resolvers: Record<number, (value?: unknown) => void> = {};
    mockDeletePrizeWalletAlert.mockImplementation(
      (id: number) =>
        new Promise((resolve) => {
          resolvers[id] = resolve;
        }),
    );
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('ops@example.com')).toBeInTheDocument());

    const firstRow = screen.getByText('ops@example.com').closest('tr') as HTMLElement;
    const secondRow = screen.getByText('keep@example.com').closest('tr') as HTMLElement;
    fireEvent.click(within(firstRow).getByRole('button', { name: 'Delete' }));

    expect(within(firstRow).getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(secondRow).getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(within(secondRow).getByRole('button', { name: 'Delete' }));
    expect(mockDeletePrizeWalletAlert).toHaveBeenCalledTimes(2);

    resolvers[3]();
    await waitFor(() => expect(screen.queryByText('ops@example.com')).not.toBeInTheDocument());
    resolvers[4]();
    await waitFor(() => expect(screen.queryByText('keep@example.com')).not.toBeInTheDocument());
  });

  it('ignores a second Delete click on the same row while in flight', async () => {
    mockListPrizeWalletAlerts.mockResolvedValue([ALERT]);
    mockDeletePrizeWalletAlert.mockImplementation(() => new Promise(() => undefined));
    render(<RealunitPrizeWalletAlertPanel translate={translate} />);
    await waitFor(() => expect(screen.getByText('ops@example.com')).toBeInTheDocument());

    const row = screen.getByText('ops@example.com').closest('tr') as HTMLElement;
    const del = within(row).getByRole('button', { name: 'Delete' });
    fireEvent.click(del);
    fireEvent.click(del);

    expect(mockDeletePrizeWalletAlert).toHaveBeenCalledTimes(1);
    expect(mockDeletePrizeWalletAlert).toHaveBeenCalledWith(3);
  });
});
