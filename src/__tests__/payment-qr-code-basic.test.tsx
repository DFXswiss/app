const mockCopy = jest.fn();

jest.mock('copy-to-clipboard', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockCopy(...args),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  CopyButton: ({ onCopy }: { onCopy: () => void }) => (
    <button type="button" onClick={onCopy}>
      Copy
    </button>
  ),
}));

jest.mock('react-qr-code', () => ({
  __esModule: true,
  default: ({ value, fgColor }: { value: string; fgColor: string }) => (
    <div data-testid="qr-code" data-value={value} data-fg={fgColor} />
  ),
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { QrBasic, QrCopy } from '../components/payment/qr-code';

beforeEach(() => {
  mockCopy.mockClear();
});

describe('QrBasic', () => {
  it('renders a non-scannable skeleton while loading', () => {
    const { container } = render(<QrBasic data="https://pay.example/invoice" isLoading />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
    // Must not encode the real URL into any scannable surface while loading.
    expect(container.innerHTML).not.toContain('https://pay.example/invoice');
  });

  it('renders a non-scannable skeleton while loading even when data is SVG markup', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
    const { container } = render(<QrBasic data={svg} isLoading />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Swiss QR Bill')).not.toBeInTheDocument();
  });

  it('renders a Swiss QR Bill image when data is SVG markup', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
    render(<QrBasic data={svg} />);

    const img = screen.getByAltText('Swiss QR Bill');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
  });

  it('renders a QR code with the dark foreground when data is not SVG', () => {
    render(<QrBasic data="lnurl1payrequest" />);

    const qr = screen.getByTestId('qr-code');
    expect(qr).toHaveAttribute('data-value', 'lnurl1payrequest');
    expect(qr).toHaveAttribute('data-fg', '#072440');
    expect(screen.queryByAltText('Swiss QR Bill')).not.toBeInTheDocument();
  });

  it('treats non-SVG XML as plain QR payload rather than an image', () => {
    render(<QrBasic data="<not-svg>payload</not-svg>" />);

    expect(screen.getByTestId('qr-code')).toHaveAttribute('data-value', '<not-svg>payload</not-svg>');
    expect(screen.queryByAltText('Swiss QR Bill')).not.toBeInTheDocument();
  });
});

describe('QrCopy', () => {
  it('renders the QR and copies the data when Copy is clicked', () => {
    render(<QrCopy data="https://app.dfx.swiss/invoice?pay=1" />);

    expect(screen.getByTestId('qr-code')).toHaveAttribute(
      'data-value',
      'https://app.dfx.swiss/invoice?pay=1',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(mockCopy).toHaveBeenCalledWith('https://app.dfx.swiss/invoice?pay=1');
  });
});
