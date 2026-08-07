// Focused unit test for the EUR collection-IBAN toggle in PaymentInformationContent.
// Mounts the REAL component (not mocked) so the toggle button and the displayed/copied IBAN
// value are exercised. The toggle must only appear for a verified Bank Frick personal IBAN,
// EUR currency, and a present remittanceInfo, and never for customers already shown the
// collection account (isPersonalIban false) or whose displayed IBAN already is that account.

const mockCopy = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  Utils: {
    formatIban: (iban: string) => iban,
  },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  AlignContent: { RIGHT: 'right' },
  CopyButton: ({ onCopy }: any) => (
    <button data-testid="copy" onClick={onCopy}>
      copy
    </button>
  ),
  DfxIcon: ({ icon }: any) => <span data-testid={'icon-' + icon} />,
  IconColor: { BLUE: 'blue', RED: 'red' },
  IconVariant: { SEPA_INSTANT: 'sepa', SWAP: 'SWAP' },
  StyledDataTable: ({ children, label }: any) => (
    <div data-testid={label ? `table-${label}` : 'table'}>{children}</div>
  ),
  StyledDataTableRow: ({ label, children, infoText }: any) => (
    <div data-testid={`row-${label}`}>
      <span data-testid={`row-label-${label}`}>{label}</span>
      <span data-testid={`row-value-${label}`}>{children}</span>
      {infoText != null && infoText !== '' && (
        <span data-testid={`row-info-${label}`}>{infoText}</span>
      )}
    </div>
  ),
  StyledInfoText: ({ children }: any) => <div>{children}</div>,
  StyledTabContainer: ({ tabs }: any) => (
    <div>
      {tabs?.map((tab: any, index: number) => (
        <div key={index}>{tab.content}</div>
      ))}
    </div>
  ),
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string, params?: Record<string, string>) => {
      if (params) {
        let result = key;
        for (const [k, v] of Object.entries(params)) {
          result = result.replace(`{{${k}}}`, v);
        }
        return result;
      }
      return key;
    },
  }),
}));

jest.mock('../hooks/clipboard.hook', () => ({
  useClipboard: () => ({ copy: mockCopy }),
}));

jest.mock('../components/payment/payment-qr-code', () => ({
  PaymentQrCode: ({ value, collectionAccount }: any) => (
    <div data-testid="qr-value" data-collection={collectionAccount ? 'true' : 'false'}>
      {value}
    </div>
  ),
}));

import { fireEvent, render, screen, within } from '@testing-library/react';
import { PaymentInformationContent } from '../components/payment/payment-info-buy';
import { canOfferCollectionIban, FRICK_EUR_COLLECTION_IBAN } from '../util/personal-iban';

const PERSONAL_IBAN = 'LI21088110102979K002E';

function sampleGiroCode(iban = PERSONAL_IBAN): string {
  return [
    'BCD',
    '001',
    '2',
    'SCT',
    'BFRILI22',
    'DFX AG, Bahnhofstrasse 7, 6300 Zug, Schweiz',
    iban,
    'EUR100',
    '',
    '',
    'DFX-BUY-1',
  ].join('\n');
}

function baseInfo(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    amount: 100,
    currency: { name: 'EUR' },
    iban: PERSONAL_IBAN,
    bic: 'BFRILI22',
    name: 'Test User',
    street: 'Main',
    number: '1',
    zip: '9490',
    city: 'Vaduz',
    country: 'LI',
    sepaInstant: false,
    remittanceInfo: 'DFX-BUY-1',
    ...overrides,
  } as any;
}

const DISCOVERABILITY_HINT =
  'Your bank does not accept this IBAN? Use the swap symbol to switch to our collection account.';
const COLLECTION_HINT =
  'This is the collection account of DFX AG. Please be sure to enter the remittance info below, otherwise we cannot assign your payment.';

describe('PaymentInformationContent collection-IBAN toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('toggles the displayed and copied IBAN between the personal and collection account', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({ isPersonalIban: true, bank: 'Bank Frick', name: 'DFX AG' })}
      />,
    );

    const ibanRow = screen.getByTestId('row-value-IBAN');
    expect(ibanRow).toHaveTextContent(PERSONAL_IBAN);

    const showCollectionButton = within(ibanRow).getByRole('button', { name: 'Show collection IBAN' });
    fireEvent.click(showCollectionButton);

    expect(ibanRow).toHaveTextContent(FRICK_EUR_COLLECTION_IBAN);
    const showPersonalButton = within(ibanRow).getByRole('button', { name: 'Show personal IBAN' });
    expect(showPersonalButton).toBeInTheDocument();

    fireEvent.click(within(ibanRow).getByTestId('copy'));
    expect(mockCopy).toHaveBeenLastCalledWith(FRICK_EUR_COLLECTION_IBAN);

    fireEvent.click(showPersonalButton);

    expect(ibanRow).toHaveTextContent(PERSONAL_IBAN);
    expect(within(ibanRow).getByRole('button', { name: 'Show collection IBAN' })).toBeInTheDocument();

    fireEvent.click(within(ibanRow).getByTestId('copy'));
    expect(mockCopy).toHaveBeenLastCalledWith(PERSONAL_IBAN);
  });

  it('does not show the toggle when the customer already sees the collection account (isPersonalIban false)', () => {
    render(<PaymentInformationContent info={baseInfo({ isPersonalIban: false })} />);

    expect(screen.queryByRole('button', { name: 'Show collection IBAN' })).not.toBeInTheDocument();
  });

  it('does not show the toggle for a non-EUR currency', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({
          isPersonalIban: true,
          bank: 'Bank Frick',
          name: 'DFX AG',
          currency: { name: 'CHF' },
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Show collection IBAN' })).not.toBeInTheDocument();
  });

  it('does not show the toggle when remittanceInfo is absent', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({
          isPersonalIban: true,
          bank: 'Bank Frick',
          name: 'DFX AG',
          remittanceInfo: undefined,
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Show collection IBAN' })).not.toBeInTheDocument();
  });

  it('does not show the toggle for a legacy Yapeal virtual IBAN', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({ isPersonalIban: true, bank: 'Yapeal', name: 'Alice Example' })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Show collection IBAN' })).not.toBeInTheDocument();
  });

  it('does not show the toggle when the displayed IBAN already is the collection account', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({
          isPersonalIban: true,
          bank: 'Bank Frick',
          name: 'DFX AG',
          iban: FRICK_EUR_COLLECTION_IBAN,
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Show collection IBAN' })).not.toBeInTheDocument();
  });

  it('shows the discoverability hint in the initial state when the toggle is offered', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({ isPersonalIban: true, bank: 'Bank Frick', name: 'DFX AG' })}
      />,
    );

    const infoEl = screen.getByTestId('row-info-IBAN');
    expect(infoEl).toHaveTextContent(DISCOVERABILITY_HINT);
    expect(infoEl).not.toHaveTextContent(COLLECTION_HINT);
  });

  it('shows the collection remittance hint after switching to the collection account', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({ isPersonalIban: true, bank: 'Bank Frick', name: 'DFX AG' })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show collection IBAN' }));

    const infoEl = screen.getByTestId('row-info-IBAN');
    expect(infoEl).toHaveTextContent(COLLECTION_HINT);
    expect(infoEl).not.toHaveTextContent(DISCOVERABILITY_HINT);
  });

  it('does not show an IBAN info hint when the toggle is not offered', () => {
    render(<PaymentInformationContent info={baseInfo({ isPersonalIban: false })} />);

    expect(screen.queryByTestId('row-info-IBAN')).not.toBeInTheDocument();
  });

  it('mirrors the toggle state in aria-pressed', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({ isPersonalIban: true, bank: 'Bank Frick', name: 'DFX AG' })}
      />,
    );

    const button = screen.getByRole('button', { name: 'Show collection IBAN' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(button);

    expect(screen.getByRole('button', { name: 'Show personal IBAN' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('renders a SWAP icon instead of the refresh emoji', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({ isPersonalIban: true, bank: 'Bank Frick', name: 'DFX AG' })}
      />,
    );

    const button = screen.getByRole('button', { name: 'Show collection IBAN' });
    expect(within(button).getByTestId('icon-SWAP')).toBeInTheDocument();
    expect(screen.getByTestId('row-value-IBAN')).not.toHaveTextContent('🔄');
  });

  it('keeps the personal IBAN in the QR value in the initial state', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({
          isPersonalIban: true,
          bank: 'Bank Frick',
          name: 'DFX AG',
          paymentRequest: sampleGiroCode(),
        })}
      />,
    );

    const qrValue = screen.getByTestId('qr-value');
    expect(qrValue).toHaveTextContent(PERSONAL_IBAN);
    expect(qrValue).not.toHaveTextContent(FRICK_EUR_COLLECTION_IBAN);
    expect(screen.getByTestId('qr-value')).toHaveAttribute('data-collection', 'false');
  });

  it('switches the QR value to the collection IBAN after the toggle', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({
          isPersonalIban: true,
          bank: 'Bank Frick',
          name: 'DFX AG',
          paymentRequest: sampleGiroCode(),
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show collection IBAN' }));

    const qrValue = screen.getByTestId('qr-value');
    expect(qrValue).toHaveTextContent(FRICK_EUR_COLLECTION_IBAN);
    expect(qrValue).not.toHaveTextContent(PERSONAL_IBAN);
    expect(screen.getByTestId('qr-value')).toHaveAttribute('data-collection', 'true');
  });

  const NO_COLLECTION_QR_HINT =
    'No QR code is available for the collection account. Please enter the IBAN and the remittance info manually.';

  it.each([
    {
      name: 'Swiss QR-Bill SVG',
      paymentRequest: '<svg xmlns="http://www.w3.org/2000/svg" data-unique="swiss-qr-bill"></svg>',
    },
    {
      name: 'GiroCode with a foreign IBAN on line 6',
      paymentRequest: sampleGiroCode('LI99088110100000K999E'),
    },
  ])(
    'shows the no-QR hint and hides the QR when collection is selected and the payload is rejected ($name)',
    ({ paymentRequest }) => {
      const { container } = render(
        <PaymentInformationContent
          info={baseInfo({
            isPersonalIban: true,
            bank: 'Bank Frick',
            name: 'DFX AG',
            paymentRequest,
          })}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Show collection IBAN' }));

      expect(screen.queryByTestId('qr-value')).not.toBeInTheDocument();
      expect(screen.getByText(NO_COLLECTION_QR_HINT)).toBeInTheDocument();
      expect(container.textContent).not.toContain(paymentRequest);
    },
  );

  it('does not show the no-QR hint when the collection GiroCode rewrite succeeds', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({
          isPersonalIban: true,
          bank: 'Bank Frick',
          name: 'DFX AG',
          paymentRequest: sampleGiroCode(),
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show collection IBAN' }));

    expect(screen.getByTestId('qr-value')).toBeInTheDocument();
    expect(screen.queryByText(NO_COLLECTION_QR_HINT)).not.toBeInTheDocument();
  });

  it('keeps the original QR value when offerCollectionIban becomes false while still toggled', () => {
    const paymentRequest = sampleGiroCode();
    const offeredInfo = baseInfo({
      isPersonalIban: true,
      bank: 'Bank Frick',
      name: 'DFX AG',
      paymentRequest,
    });
    const { rerender } = render(<PaymentInformationContent info={offeredInfo} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show collection IBAN' }));
    expect(screen.getByTestId('qr-value')).toHaveTextContent(FRICK_EUR_COLLECTION_IBAN);

    // State stays toggled; props no longer pass canOfferCollectionIban → QR must not stay rewritten.
    rerender(
      <PaymentInformationContent
        info={baseInfo({
          isPersonalIban: false,
          bank: 'Bank Frick',
          name: 'DFX AG',
          paymentRequest,
        })}
      />,
    );

    const qrValue = screen.getByTestId('qr-value');
    expect(qrValue).toHaveTextContent(PERSONAL_IBAN);
    expect(qrValue).not.toHaveTextContent(FRICK_EUR_COLLECTION_IBAN);
    expect(qrValue.textContent).toBe(paymentRequest);
  });
});

describe('canOfferCollectionIban', () => {
  it('is true for a verified Bank Frick personal IBAN with EUR currency and remittanceInfo', () => {
    expect(
      canOfferCollectionIban(baseInfo({ isPersonalIban: true, bank: 'Bank Frick', name: 'DFX AG' })),
    ).toBe(true);
  });

  it('is false when the given IBAN is the collection account, ignoring whitespace and case', () => {
    expect(
      canOfferCollectionIban(
        baseInfo({
          isPersonalIban: true,
          bank: 'Bank Frick',
          name: 'DFX AG',
          iban: 'li75 0881 1010 5923 k000 e',
        }),
      ),
    ).toBe(false);
  });
});
