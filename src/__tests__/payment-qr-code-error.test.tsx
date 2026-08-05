const mockCall = jest.fn();
const mockOpenPdf = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
  useUserContext: () => ({ user: { kyc: { dataComplete: true } } }),
  BuyUrl: { invoice: (txId: number) => `buy/paymentInfos/${txId}/invoice` },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { MD: 'md' },
  SpinnerVariant: { LIGHT_MODE: 'light' },
  StyledLoadingSpinner: () => <span>Loading</span>,
  StyledButton: () => null,
  StyledButtonColor: { GRAY_OUTLINE: 'gray-outline' },
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, text: string) => text,
  }),
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../util/utils', () => ({
  openPdfFromString: (...args: unknown[]) => mockOpenPdf(...args),
}));

jest.mock('../components/payment/qr-code', () => ({
  QrBasic: () => <div>QR code</div>,
}));

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentQrCode } from '../components/payment/payment-qr-code';

beforeEach(() => {
  jest.clearAllMocks();
  mockCall.mockResolvedValue({ pdfData: 'JVBERi0x' });
});

describe('PaymentQrCode invoice errors', () => {
  it('shows the stored-payment-detail message when invoice generation rejects with a known token', async () => {
    mockCall.mockRejectedValue({ message: 'StoredPersonalIbanIsNoLongerActive' });

    render(<PaymentQrCode value="<svg>QR bill</svg>" txId={42} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(screen.getByText('This personal IBAN is no longer active. Please start a new purchase.')).toBeVisible();
    });
    expect(screen.queryByText('StoredPersonalIbanIsNoLongerActive')).not.toBeInTheDocument();
  });

  it('shows the API message unchanged when the token is not mapped', async () => {
    mockCall.mockRejectedValue({ message: 'Invoice service is unavailable' });

    render(<PaymentQrCode value="<svg>QR bill</svg>" txId={42} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Invoice service is unavailable')).toBeVisible();
    });
    expect(screen.queryByText('Unknown error')).not.toBeInTheDocument();
  });
});

describe('PaymentQrCode collection-account invoice URL', () => {
  it('appends collectionAccount=true when the collection account is active', async () => {
    render(<PaymentQrCode value="BCD\n001" txId={42} collectionAccount />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockCall).toHaveBeenCalled();
    });
    const config = mockCall.mock.calls[0][0];
    expect(config.method).toBe('PUT');
    expect(config.url).toBe('buy/paymentInfos/42/invoice?collectionAccount=true');
    expect(config.url).toContain('collectionAccount=true');
  });

  it('does not send collectionAccount when the collection account is not active', async () => {
    render(<PaymentQrCode value="BCD\n001" txId={42} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockCall).toHaveBeenCalled();
    });
    const config = mockCall.mock.calls[0][0];
    expect(config.method).toBe('PUT');
    expect(config.url).toBe('buy/paymentInfos/42/invoice');
    expect(config.url).not.toContain('collectionAccount');
  });
});
