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
  const props = { currency: 'CHF' as const, onCurrencyChange, expanded: false, onExpandedChange, onSettings };
  const view = render(<PasskeyWalletCard {...props} />);
  expect(screen.getByLabelText('Loading balance')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'CHF' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Total balance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
  fireEvent.click(screen.getByRole('button', { name: 'EUR' }));
  expect(onSettings).toHaveBeenCalledTimes(1);
  expect(onExpandedChange).toHaveBeenCalledTimes(2);
  expect(onExpandedChange).toHaveBeenCalledWith(true);
  expect(onCurrencyChange).toHaveBeenCalledWith('EUR');
  view.rerender(<PasskeyWalletCard {...props} currency="EUR" expanded balance={{ chf: 1234.5, eur: 99.25 }} />);
  expect(screen.getByText('99')).toBeInTheDocument();
  expect(screen.getByText('.25')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'EUR' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Hide wallet' }));
  expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole('button', { name: 'CHF' }));
  expect(onCurrencyChange).toHaveBeenLastCalledWith('CHF');
});

it('enables key actions only when unlocked or unlockable and disables every action while busy', () => {
  const onAction = jest.fn();
  const view = render(<PasskeyWalletActions unlocked={false} canUnlock={false} onAction={onAction} />);
  for (const name of ['Buy', 'Sell', 'Swap', 'Send', 'Receive', 'Pay']) {
    const action = screen.getByRole('button', { name });
    expect(action).toBeDisabled();
    expect(action.querySelector('svg rect')).toBeInTheDocument();
    fireEvent.click(action);
    expect(onAction).not.toHaveBeenCalledWith(name);
  }
  view.rerender(<PasskeyWalletActions unlocked={false} canUnlock onAction={onAction} />);
  for (const name of ['Buy', 'Sell', 'Swap', 'Send', 'Receive', 'Pay']) {
    expect(screen.getByRole('button', { name })).toBeEnabled();
    expect(screen.getByRole('button', { name }).querySelector('svg rect')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name }));
    expect(onAction).toHaveBeenCalledWith(name);
  }
  view.rerender(<PasskeyWalletActions unlocked canUnlock={false} onAction={onAction} />);
  for (const name of ['Buy', 'Sell', 'Swap', 'Send', 'Receive', 'Pay']) {
    expect(screen.getByRole('button', { name })).toBeEnabled();
    expect(screen.getByRole('button', { name }).querySelector('svg rect')).not.toBeInTheDocument();
  }
  view.rerender(<PasskeyWalletActions unlocked canUnlock={false} busy onAction={onAction} />);
  for (const name of ['Buy', 'Sell', 'Swap', 'Send', 'Receive', 'Pay']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
});
