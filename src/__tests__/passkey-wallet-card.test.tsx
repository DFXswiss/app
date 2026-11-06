import type { Fiat } from '@dfx.swiss/react';
import { fireEvent, render, screen } from '@testing-library/react';
import PasskeyWalletCard from '../components/home/wallet/passkey-wallet-card';

const mockChangeCurrency = jest.fn();
let mockCurrency: { name: string } | undefined;
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, text: string) => text,
    currency: mockCurrency,
    changeCurrency: mockChangeCurrency,
    locale: 'en-US',
  }),
}));

it('renders balance, currency controls and wallet toggles from app settings', () => {
  const onExpandedChange = jest.fn();
  const onSettings = jest.fn();
  const currencies = [{ name: 'CHF' }, { name: 'EUR' }] as Fiat[];
  mockCurrency = { name: 'CHF' };
  const props = { currencies, expanded: false, onExpandedChange, onSettings };
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
  expect(mockChangeCurrency).toHaveBeenCalledWith(currencies[1]);
  mockCurrency = { name: 'EUR' };
  view.rerender(<PasskeyWalletCard {...props} expanded balance={{ chf: 1234.5, eur: 99.25 }} />);
  expect(screen.getByText('99')).toBeInTheDocument();
  expect(screen.getByText('.25')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'EUR' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Hide wallet' }));
  expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  mockChangeCurrency.mockClear();
  view.rerender(<PasskeyWalletCard {...props} currencies={undefined} />);
  fireEvent.click(screen.getByRole('button', { name: 'CHF' }));
  expect(mockChangeCurrency).not.toHaveBeenCalled();
});
