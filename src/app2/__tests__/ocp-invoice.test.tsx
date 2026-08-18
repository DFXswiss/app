import { TextEncoder } from 'util';

(global as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;

const mockGetStickers = jest.fn();
const mockCreateInvoice = jest.fn();
const mockCopy = jest.fn();
const mockLoadRoutes = jest.fn();
const mockGo = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  usePaymentRoutes: () => ({ getPaymentStickers: mockGetStickers }),
  Blockchain: { LIGHTNING: 'Lightning', BITCOIN: 'Bitcoin' },
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiException } from '@dfx.swiss/react';
import InvoiceView from '../screens/ocp/invoice';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

function sellRoute(id: number, currency?: string) {
  return { id, currency: currency ? { name: currency } : undefined };
}

function renderInvoice(ocp: Record<string, unknown>) {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <InvoiceView ocp={ocp as never} go={mockGo} />
      </ToastProvider>
    </LanguageProvider>,
  );
}

describe('OCP invoice view', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateInvoice.mockResolvedValue({ lnurl: 'LNURL1DEMOINVOICE' });
    mockGetStickers.mockResolvedValue({ data: new Blob(['pdf']) });
    Object.assign(URL, {
      createObjectURL: jest.fn(() => 'blob:invoice'),
      revokeObjectURL: jest.fn(),
    });
  });

  it('loads routes while they are null and sends the user to add a route', () => {
    renderInvoice({ routes: null, lnSellRoutes: [], loadRoutes: mockLoadRoutes });
    expect(mockLoadRoutes).toHaveBeenCalled();
    expect(document.querySelector('.spin')).toBeTruthy();

    renderInvoice({ routes: { sell: [], buy: [], swap: [] }, lnSellRoutes: [], loadRoutes: mockLoadRoutes });
    fireEvent.click(screen.getByRole('button', { name: /add a lightning sell route/i }));
    expect(mockGo).toHaveBeenCalledWith('routes');
  });

  it('validates, generates, copies, prints and downloads', async () => {
    const ocp = {
      routes: { sell: [sellRoute(1, 'CHF')], buy: [], swap: [] },
      lnSellRoutes: [sellRoute(1, 'CHF'), sellRoute(2)],
      loadRoutes: mockLoadRoutes,
      createInvoice: mockCreateInvoice,
      copy: mockCopy,
      demo: false,
    };
    renderInvoice(ocp);

    fireEvent.click(screen.getByRole('button', { name: /generate invoice/i }));
    fireEvent.change(screen.getByLabelText('Invoice ID'), { target: { value: 'INV-1' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /generate invoice/i }));
    expect(screen.getByText(/enter a valid amount/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '12.5' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '999' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /generate invoice/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /copy lnurl/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /copy lnurl/i }));
    expect(mockCopy).toHaveBeenCalled();

    const open = jest.spyOn(window, 'open').mockReturnValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: /^print$/i }));
    expect(open).toHaveBeenCalled();

    const popup = {
      document: { write: jest.fn(), close: jest.fn() },
      focus: jest.fn(),
      print: jest.fn(),
    };
    open.mockReturnValueOnce(popup as unknown as Window);
    jest.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /^print$/i }));
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(popup.print).toHaveBeenCalled();
    popup.print.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    open.mockReturnValueOnce(popup as unknown as Window);
    fireEvent.click(screen.getByRole('button', { name: /^print$/i }));
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    jest.useRealTimers();
    open.mockRestore();

    const ctx = { fillRect: jest.fn(), drawImage: jest.fn(), fillStyle: '' };
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,xx');
    const OriginalImage = window.Image;
    Object.defineProperty(window, 'Image', {
      configurable: true,
      writable: true,
      value: class {
        onload: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /download qr/i }));
    await waitFor(() => expect(ctx.drawImage).toHaveBeenCalled());
    Object.defineProperty(window, 'Image', { configurable: true, writable: true, value: OriginalImage });

    fireEvent.click(screen.getByRole('button', { name: /sticker/i }));
    await waitFor(() => expect(mockGetStickers).toHaveBeenCalled());

    mockGetStickers.mockRejectedValueOnce(new Error('down'));
    fireEvent.click(screen.getByRole('button', { name: /sticker/i }));
    await waitFor(() => expect(mockGetStickers).toHaveBeenCalledTimes(2));
  });

  it('surfaces API and generic generate errors and a demo sticker toast', async () => {
    mockCreateInvoice.mockRejectedValueOnce(new ApiException(400, 'nope'));
    const ocp = {
      routes: { sell: [sellRoute(1, 'CHF')], buy: [], swap: [] },
      lnSellRoutes: [sellRoute(1, 'CHF')],
      loadRoutes: mockLoadRoutes,
      createInvoice: mockCreateInvoice,
      copy: mockCopy,
      demo: true,
    };
    renderInvoice(ocp);
    fireEvent.change(screen.getByLabelText('Invoice ID'), { target: { value: 'INV-2' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /generate invoice/i }));
    await waitFor(() => expect(screen.getByText(/nope/)).toBeInTheDocument());

    mockCreateInvoice.mockRejectedValueOnce(new Error('x'));
    fireEvent.click(screen.getByRole('button', { name: /generate invoice/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /generate invoice/i })).not.toBeDisabled());
    expect(mockCreateInvoice).toHaveBeenCalledTimes(2);

    mockCreateInvoice.mockResolvedValueOnce({ lnurl: 'LNURL1DEMOINVOICE' });
    fireEvent.click(screen.getByRole('button', { name: /generate invoice/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /sticker pdf/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /sticker pdf/i }));
  });

  it('focuses an empty invoice id and ignores a second generate while one is in flight', async () => {
    let resolveInvoice!: (value: { lnurl: string }) => void;
    mockCreateInvoice.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInvoice = resolve;
        }),
    );
    renderInvoice({
      routes: { sell: [sellRoute(1, 'CHF')], buy: [], swap: [] },
      lnSellRoutes: [sellRoute(1)],
      loadRoutes: mockLoadRoutes,
      createInvoice: mockCreateInvoice,
      copy: mockCopy,
      demo: false,
    });
    fireEvent.click(screen.getByRole('button', { name: /generate invoice/i }));
    expect(screen.getByLabelText('Invoice ID')).toHaveFocus();

    fireEvent.change(screen.getByLabelText('Invoice ID'), { target: { value: 'INV-3' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1' } });
    const generateBtn = screen.getByRole('button', { name: /generate invoice/i });
    // Two clicks in one act — before React can commit `generating` — must share the ref lock.
    act(() => {
      generateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      generateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mockCreateInvoice).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveInvoice({ lnurl: 'LNURL1ONCE' });
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /copy lnurl/i })).toBeInTheDocument());
  });

  it('skips a download when the canvas context is missing and prints escaped captions', async () => {
    renderInvoice({
      routes: { sell: [sellRoute(1, 'CHF')], buy: [], swap: [] },
      lnSellRoutes: [sellRoute(1, 'CHF')],
      loadRoutes: mockLoadRoutes,
      createInvoice: mockCreateInvoice,
      copy: mockCopy,
      demo: false,
    });
    fireEvent.change(screen.getByLabelText('Invoice ID'), { target: { value: 'A & B <C> "D"' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /generate invoice/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /download qr/i })).toBeInTheDocument());

    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: /download qr/i }));

    const popup = {
      document: { write: jest.fn(), close: jest.fn() },
      focus: jest.fn(),
      print: jest.fn(),
    };
    const open = jest.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    fireEvent.click(screen.getByRole('button', { name: /^print$/i }));
    expect(popup.document.write).toHaveBeenCalledWith(expect.stringContaining('&amp;'));
    expect(popup.document.write).toHaveBeenCalledWith(expect.stringContaining('&lt;'));
    expect(popup.document.write).toHaveBeenCalledWith(expect.stringContaining('&quot;'));
    open.mockRestore();
  });

  it('does nothing when the QR svg is missing', async () => {
    renderInvoice({
      routes: { sell: [sellRoute(1, 'CHF')], buy: [], swap: [] },
      lnSellRoutes: [sellRoute(1, 'CHF')],
      loadRoutes: mockLoadRoutes,
      createInvoice: mockCreateInvoice,
      copy: mockCopy,
      demo: false,
    });
    fireEvent.change(screen.getByLabelText('Invoice ID'), { target: { value: 'INV-4' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /generate invoice/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /download qr/i })).toBeInTheDocument());
    const query = jest.spyOn(Element.prototype, 'querySelector').mockReturnValue(null);
    fireEvent.click(screen.getByRole('button', { name: /download qr/i }));
    fireEvent.click(screen.getByRole('button', { name: /^print$/i }));
    query.mockRestore();
  });

  it('revokes the sticker blob URL after download', async () => {
    renderInvoice({
      routes: { sell: [sellRoute(1, 'CHF')], buy: [], swap: [] },
      lnSellRoutes: [sellRoute(1, 'CHF')],
      loadRoutes: mockLoadRoutes,
      createInvoice: mockCreateInvoice,
      copy: mockCopy,
      demo: false,
    });
    fireEvent.change(screen.getByLabelText('Invoice ID'), { target: { value: 'INV-5' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /generate invoice/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /sticker/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /sticker/i }));
    await waitFor(() => expect(mockGetStickers).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600));
    });
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
