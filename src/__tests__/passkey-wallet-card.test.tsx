import { fireEvent, render, screen } from '@testing-library/react';
import PasskeyWalletCard from '../components/home/wallet/passkey-wallet-card';
import PasskeyWalletActions from '../components/home/wallet/passkey-wallet-actions';

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, text: string) => text,
    locale: 'en-US',
  }),
}));

it('renders balance, currency controls and wallet toggles', () => {
  const onExpandedChange = jest.fn();
  const onSettings = jest.fn();
  const onCurrencyChange = jest.fn();
  const onHome = jest.fn();
  const props = { currency: 'CHF' as const, onCurrencyChange, expanded: false, onExpandedChange, onSettings, onHome };
  const view = render(<PasskeyWalletCard {...props} />);
  expect(screen.getByText('Not available yet')).toBeVisible();
  expect(view.container.querySelector('.animate-pulse')).toBeNull();
  expect(screen.getByRole('group', { name: 'Currency' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'CHF' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Total balance Not available yet' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
  fireEvent.click(screen.getByRole('button', { name: 'EUR' }));
  expect(onSettings).toHaveBeenCalledTimes(1);
  expect(onExpandedChange).toHaveBeenCalledTimes(2);
  expect(onExpandedChange).toHaveBeenCalledWith(true);
  expect(onCurrencyChange).toHaveBeenCalledWith('EUR');
  view.rerender(<PasskeyWalletCard {...props} currency="EUR" expanded balance={{ chf: 1234.5, eur: 99.25 }} />);
  expect(screen.getByText('99')).toBeInTheDocument();
  expect(screen.getByText('.25')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Total balance.*99.*\.25/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'EUR' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Hide wallet' }));
  expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole('button', { name: 'CHF' }));
  expect(onCurrencyChange).toHaveBeenLastCalledWith('CHF');
});

it('navigates home only on an unmodified left click', () => {
  const onHome = jest.fn();
  render(
    <PasskeyWalletCard
      currency="CHF"
      onCurrencyChange={jest.fn()}
      expanded={false}
      onExpandedChange={jest.fn()}
      onSettings={jest.fn()}
      onHome={onHome}
    />,
  );
  const link = screen.getByRole('link', { name: 'DFX home' });
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  fireEvent(link, click);
  expect(click.defaultPrevented).toBe(true);
  expect(onHome).toHaveBeenCalledTimes(1);
  for (const options of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const modified = new MouseEvent('click', { bubbles: true, cancelable: true, ...options });
    fireEvent(link, modified);
    expect(modified.defaultPrevented).toBe(false);
  }
  expect(onHome).toHaveBeenCalledTimes(1);
});

it('blocks an unmodified home click while busy but preserves modified clicks', () => {
  const onHome = jest.fn();
  render(
    <PasskeyWalletCard
      currency="CHF"
      onCurrencyChange={jest.fn()}
      expanded={false}
      onExpandedChange={jest.fn()}
      onSettings={jest.fn()}
      onHome={onHome}
      busy
    />,
  );
  const link = screen.getByRole('link', { name: 'DFX home' });
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  fireEvent(link, click);
  expect(click.defaultPrevented).toBe(true);
  expect(onHome).not.toHaveBeenCalled();
  for (const options of [{ metaKey: true }, { ctrlKey: true }, { button: 1 }]) {
    const modified = new MouseEvent('click', { bubbles: true, cancelable: true, ...options });
    fireEvent(link, modified);
    expect(modified.defaultPrevented).toBe(false);
  }
  expect(onHome).not.toHaveBeenCalled();
});

it('enables key actions and disables every action while busy', () => {
  const onAction = jest.fn();
  const view = render(<PasskeyWalletActions onAction={onAction} />);
  for (const name of ['Buy', 'Sell', 'Swap', 'Send', 'Receive', 'Pay']) {
    const action = screen.getByRole('button', { name });
    expect(action).toBeEnabled();
    expect(action.querySelector('svg rect')).not.toBeInTheDocument();
    fireEvent.click(action);
    expect(onAction).toHaveBeenCalledWith(name);
  }
  view.rerender(<PasskeyWalletActions busy onAction={onAction} />);
  for (const name of ['Buy', 'Sell', 'Swap', 'Send', 'Receive', 'Pay']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
});
