const mockInvoiceFor = jest.fn();
const mockOpenPdf = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useBuy: () => ({ invoiceFor: mockInvoiceFor }),
  useUserContext: () => ({ user: { kyc: { dataComplete: true } } }),
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
  mockInvoiceFor.mockResolvedValue({ pdfData: 'JVBERi0x' });
});

describe('PaymentQrCode invoice errors', () => {
  it('shows the stored-payment-detail message when invoice generation rejects with a known token', async () => {
    mockInvoiceFor.mockRejectedValue({ message: 'StoredPersonalIbanIsNoLongerActive' });

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
    mockInvoiceFor.mockRejectedValue({ message: 'Invoice service is unavailable' });

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

describe('PaymentQrCode collection-account forwarding', () => {
  it('forwards collectionAccount=true to the SDK when the collection account is active', async () => {
    render(<PaymentQrCode value="BCD\n001" txId={42} collectionAccount />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(1);
    });
    expect(mockInvoiceFor).toHaveBeenCalledWith(42, true);
  });

  it('forwards collectionAccount=false to the SDK when the collection account is not active', async () => {
    render(<PaymentQrCode value="BCD\n001" txId={42} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(1);
    });
    expect(mockInvoiceFor).toHaveBeenCalledWith(42, false);
  });
});
