import { render, screen } from '@testing-library/react';
import PasskeyReceive from '../components/home/wallet/passkey-receive';

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_namespace: string, text: string) => text }),
}));

jest.mock('../components/payment/qr-code', () => ({
  QrCopy: ({ data }: { data: string }) => <div data-testid="qr">{data}</div>,
}));

it('renders the supplied address, QR, heading and notice', () => {
  const address = '0x1234567890123456789012345678901234567890';
  render(<PasskeyReceive address={address} />);

  expect(screen.getByText('Receive on EVM')).toBeInTheDocument();
  expect(screen.getByTestId('passkey-receive-address').textContent).toBe(address);
  expect(screen.getByTestId('qr')).toHaveTextContent(address);
  expect(
    screen.getByText(
      'This address is the same on every EVM network, for example Ethereum, Arbitrum or Base. Only send coins from EVM networks to it.',
    ),
  ).toBeInTheDocument();
});
