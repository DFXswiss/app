const mockInvoiceFor = jest.fn();
const mockOpenPdf = jest.fn();
const mockNavigate = jest.fn();
let mockUser: { accountId?: number; kyc: { dataComplete: boolean } } | undefined = {
  accountId: 1,
  kyc: { dataComplete: true },
};
let mockSession: { account: number; user?: number } | undefined = { account: 1, user: 1 };

jest.mock('@dfx.swiss/react', () => ({
  useBuy: () => ({ invoiceFor: mockInvoiceFor }),
  useUserContext: () => ({ user: mockUser }),
  useApiSession: () => ({ session: mockSession }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  IconColor: { BLUE: 'blue' },
  SpinnerSize: { MD: 'md' },
  SpinnerVariant: { LIGHT_MODE: 'light' },
  StyledInfoText: ({ children }: any) => <div>{children}</div>,
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
  useNavigation: () => ({ navigate: mockNavigate }),
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

const originalCreateObjectURL = (global.URL as any).createObjectURL;

beforeEach(() => {
  jest.clearAllMocks();
  mockInvoiceFor.mockResolvedValue({ pdfData: 'JVBERi0x' });
  mockUser = { accountId: 1, kyc: { dataComplete: true } };
  mockSession = { account: 1, user: 1 };
  jest.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  jest.restoreAllMocks();
  if (originalCreateObjectURL) {
    (global.URL as any).createObjectURL = originalCreateObjectURL;
  } else {
    delete (global.URL as any).createObjectURL;
  }
});

const NO_COLLECTION_QR_HINT =
  'No QR code is available for the collection account. Please enter the IBAN and the remittance info manually.';

describe('PaymentQrCode incomplete KYC', () => {
  it('navigates to profile when KYC data is incomplete and does not request or open an invoice', async () => {
    mockUser = { kyc: { dataComplete: false } };

    render(<PaymentQrCode value="BCD\n001" txId={42} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/profile', { setRedirect: true });
    expect(mockInvoiceFor).not.toHaveBeenCalled();
    expect(mockOpenPdf).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe('PaymentQrCode missing value', () => {
  it('renders the no-QR hint, hides the GiroCode caption, and still offers the PDF Invoice button', () => {
    render(<PaymentQrCode txId={42} collectionAccount />);

    expect(screen.getByText(NO_COLLECTION_QR_HINT)).toBeVisible();
    expect(screen.queryByText('GiroCode')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF Invoice' })).toBeInTheDocument();
  });

  it('requests a collection-account invoice and opens the PDF when value is absent', async () => {
    render(<PaymentQrCode txId={42} collectionAccount />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(1);
    });
    expect(mockInvoiceFor).toHaveBeenCalledWith(42, true);

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith('about:blank');
      expect(mockOpenPdf).toHaveBeenCalledTimes(1);
    });
    expect(mockOpenPdf).toHaveBeenCalledWith('JVBERi0x', false);
  });
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

  it('closes the reserved preview when invoice generation rejects', async () => {
    const preview = { closed: false, close: jest.fn(), location: { href: '' } };
    jest.spyOn(window, 'open').mockImplementation(() => preview as unknown as Window);
    mockInvoiceFor.mockRejectedValue({ message: 'Invoice service is unavailable' });

    render(<PaymentQrCode value="<svg>QR bill</svg>" txId={42} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(preview.close).toHaveBeenCalled();
      expect(screen.getByText('Invoice service is unavailable')).toBeVisible();
    });
    expect(mockOpenPdf).not.toHaveBeenCalled();
  });
});

describe('PaymentQrCode reserved preview success', () => {
  it('assigns the PDF via the reserved window when window.open returns a live preview', async () => {
    const preview = { closed: false, close: jest.fn(), location: { href: '' } };
    jest.spyOn(window, 'open').mockImplementation(() => preview as unknown as Window);
    (global.URL as any).createObjectURL = jest.fn(() => 'blob:invoice');

    render(<PaymentQrCode value="BCD\n001" txId={42} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith('about:blank');
      expect(preview.location.href).toBe('blob:invoice');
      expect((global.URL as any).createObjectURL).toHaveBeenCalled();
    });
    expect(mockOpenPdf).not.toHaveBeenCalled();
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

describe('PaymentQrCode stale-response guard', () => {
  let resolveInvoice: (value: unknown) => void;
  let resolveInvoiceQueue: Array<(value: unknown) => void>;

  beforeEach(() => {
    resolveInvoiceQueue = [];
    mockInvoiceFor.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInvoice = resolve;
          resolveInvoiceQueue.push(resolve);
        }),
    );
  });

  it('does not open the PDF when the collection mode changes while the request is in flight', async () => {
    const { rerender } = render(<PaymentQrCode value="BCD\n001" txId={42} collectionAccount />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(1);
    });

    rerender(<PaymentQrCode value="BCD\n001" txId={42} />);

    await act(async () => {
      resolveInvoice({ pdfData: 'JVBERi0x' });
    });

    expect(mockOpenPdf).not.toHaveBeenCalled();
  });

  it('does not open the PDF when the txId changes while the request is in flight', async () => {
    const { rerender } = render(<PaymentQrCode value="BCD\n001" txId={42} collectionAccount />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(1);
    });

    rerender(<PaymentQrCode value="BCD\n001" txId={43} collectionAccount />);

    await act(async () => {
      resolveInvoice({ pdfData: 'JVBERi0x' });
    });

    expect(mockOpenPdf).not.toHaveBeenCalled();
    expect(screen.queryByText('Invoice service is unavailable')).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'PDF Invoice' });
    expect(button).toBeEnabled();
  });

  it('does not open the PDF when the session identity changes while the user data stays stale', async () => {
    const { rerender } = render(<PaymentQrCode value="BCD\n001" txId={42} collectionAccount />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(1);
    });

    // Same txId, collectionAccount, and user — only the session account changes (in-place token swap).
    // The user context can lag behind; the guard must key on the session, not user.accountId.
    mockSession = { account: 2, user: 1 };
    rerender(<PaymentQrCode value="BCD\n001" txId={42} collectionAccount />);

    await act(async () => {
      resolveInvoice({ pdfData: 'JVBERi0x' });
    });

    expect(mockOpenPdf).not.toHaveBeenCalled();
    expect(screen.queryByText('Invoice service is unavailable')).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'PDF Invoice' });
    expect(button).toBeEnabled();
  });

  it('does not show an error when the collection mode changes while a failing request is in flight', async () => {
    let rejectInvoice: (reason: unknown) => void;
    mockInvoiceFor.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectInvoice = reject;
        }),
    );

    const { rerender } = render(<PaymentQrCode value="BCD\n001" txId={42} collectionAccount />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(1);
    });

    // Mode flip bumps invoiceGeneration before the rejection lands — catch must not surface it.
    rerender(<PaymentQrCode value="BCD\n001" txId={42} />);

    await act(async () => {
      if (!rejectInvoice) throw new Error('invoice rejecter was not captured');
      rejectInvoice({ message: 'Invoice service is unavailable' });
    });

    expect(screen.queryByText('Invoice service is unavailable')).not.toBeInTheDocument();
    expect(mockOpenPdf).not.toHaveBeenCalled();
  });

  it('releases the loading state when the mode changes while the request is in flight', async () => {
    const { rerender } = render(<PaymentQrCode value="BCD\n001" txId={42} collectionAccount />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText('Loading')).toBeInTheDocument();

    rerender(<PaymentQrCode value="BCD\n001" txId={42} />);

    const button = screen.getByRole('button', { name: 'PDF Invoice' });
    expect(button).toBeEnabled();
    expect(screen.queryByText('Loading')).not.toBeInTheDocument();

    await act(async () => {
      if (!resolveInvoice) throw new Error('invoice resolver was not captured');
      resolveInvoice({ pdfData: 'JVBERi0x' });
    });

    expect(mockOpenPdf).not.toHaveBeenCalled();
  });

  it('does not open the PDF when the component unmounts while the request is in flight', async () => {
    const { unmount } = render(<PaymentQrCode value="BCD\n001" txId={42} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(1);
    });

    unmount();

    await act(async () => {
      resolveInvoice({ pdfData: 'JVBERi0x' });
    });

    expect(mockOpenPdf).not.toHaveBeenCalled();
  });

  it('opens the PDF when the request completes without a mode change', async () => {
    render(<PaymentQrCode value="BCD\n001" txId={42} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveInvoice({ pdfData: 'JVBERi0x' });
    });

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith('about:blank');
      expect(mockOpenPdf).toHaveBeenCalledTimes(1);
    });
    expect(mockOpenPdf).toHaveBeenCalledWith('JVBERi0x', false);
  });

  it('clears a shown error when the mode changes', async () => {
    let rejectInvoice: (reason: unknown) => void;
    mockInvoiceFor.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectInvoice = reject;
        }),
    );

    const { rerender } = render(<PaymentQrCode value="BCD\n001" txId={42} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      if (!rejectInvoice) throw new Error('invoice rejecter was not captured');
      rejectInvoice({ message: 'Invoice service is unavailable' });
    });

    await waitFor(() => {
      expect(screen.getByText('Invoice service is unavailable')).toBeVisible();
    });

    rerender(<PaymentQrCode value="BCD\n001" txId={42} collectionAccount />);

    expect(screen.queryByText('Invoice service is unavailable')).not.toBeInTheDocument();
  });

  it('does not open the PDF when only the session user identity changes while the user data stays stale', async () => {
    const { rerender } = render(<PaymentQrCode value="BCD\n001" txId={42} collectionAccount />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(1);
    });

    // Same txId, collectionAccount, and session account — only the session user changes
    // (in-place token swap). The user context can lag behind; the guard must key on both
    // session identity fields, not only session.account.
    mockSession = { account: 1, user: 2 };
    rerender(<PaymentQrCode value="BCD\n001" txId={42} collectionAccount />);

    await act(async () => {
      resolveInvoice({ pdfData: 'JVBERi0x' });
    });

    expect(mockOpenPdf).not.toHaveBeenCalled();
    expect(screen.queryByText('Invoice service is unavailable')).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'PDF Invoice' });
    expect(button).toBeEnabled();
  });

  it('keeps the newer request loading when a stale concurrent response resolves first', async () => {
    const { rerender } = render(<PaymentQrCode value="BCD\n001" txId={42} collectionAccount />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'PDF Invoice' }));
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(1);
    });

    // Mode flip bumps generation and resets loading without aborting request A's promise.
    rerender(<PaymentQrCode value="BCD\n001" txId={42} />);

    const buttonAfterFlip = screen.getByRole('button', { name: 'PDF Invoice' });
    expect(buttonAfterFlip).toBeEnabled();

    await act(async () => {
      await userEvent.click(buttonAfterFlip);
    });

    await waitFor(() => {
      expect(mockInvoiceFor).toHaveBeenCalledTimes(2);
    });

    const resolveA = resolveInvoiceQueue[0];
    if (!resolveA) throw new Error('invoice resolver A was not captured');

    await act(async () => {
      resolveA({ pdfData: 'JVBERi0x' });
    });

    // Request B is still in flight — a generation-unguarded finally would clear its spinner here.
    expect(mockOpenPdf).not.toHaveBeenCalled();
    expect(screen.queryByText('Invoice service is unavailable')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();

    const resolveB = resolveInvoiceQueue[1];
    if (!resolveB) throw new Error('invoice resolver B was not captured');

    await act(async () => {
      resolveB({ pdfData: 'JVBERi0x' });
    });

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith('about:blank');
      expect(mockOpenPdf).toHaveBeenCalledTimes(1);
    });
    expect(mockOpenPdf).toHaveBeenCalledWith('JVBERi0x', false);
  });
});
