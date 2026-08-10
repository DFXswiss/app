// Focused unit test for the Bank Frick collection-IBAN toggle in PaymentInformationContent.
// Mounts the REAL component (not mocked) so the toggle button and the displayed/copied IBAN
// value are exercised. The toggle must only appear for a verified Bank Frick personal IBAN,
// a currency with a configured collection account (EUR or CHF), and a present remittanceInfo,
// and never for customers already shown the collection account (isPersonalIban false) or whose
// displayed IBAN already is that account.

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
  DfxIcon: () => null,
  IconColor: { BLUE: 'blue', RED: 'red' },
  IconVariant: { SEPA_INSTANT: 'sepa' },
  StyledDataTable: ({ children, label }: any) => (
    <div data-testid={label ? `table-${label}` : 'table'}>{children}</div>
  ),
  StyledDataTableRow: ({ label, children }: any) => (
    <div data-testid={`row-${label}`}>
      <span data-testid={`row-label-${label}`}>{label}</span>
      <span data-testid={`row-value-${label}`}>{children}</span>
    </div>
  ),
  StyledInfoText: ({ children }: any) => <div>{children}</div>,
  StyledTabContainer: ({ tabs }: any) => <div>{tabs?.[0]?.content}</div>,
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
  PaymentQrCode: () => null,
}));

import { fireEvent, render, screen, within } from '@testing-library/react';
import { PaymentInformationContent } from '../components/payment/payment-info-buy';
import { getOfferableCollectionIban } from '../util/personal-iban';

function baseInfo(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    amount: 100,
    currency: { name: 'EUR' },
    iban: 'LI21088110102979K002E',
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
    expect(ibanRow).toHaveTextContent('LI21088110102979K002E');

    const showCollectionButton = within(ibanRow).getByRole('button', { name: 'Show collection IBAN' });
    fireEvent.click(showCollectionButton);

    expect(ibanRow).toHaveTextContent('LI75088110105923K000E');
    const showPersonalButton = within(ibanRow).getByRole('button', { name: 'Show personal IBAN' });
    expect(showPersonalButton).toBeInTheDocument();

    fireEvent.click(within(ibanRow).getByTestId('copy'));
    expect(mockCopy).toHaveBeenLastCalledWith('LI75088110105923K000E');

    fireEvent.click(showPersonalButton);

    expect(ibanRow).toHaveTextContent('LI21088110102979K002E');
    expect(within(ibanRow).getByRole('button', { name: 'Show collection IBAN' })).toBeInTheDocument();

    fireEvent.click(within(ibanRow).getByTestId('copy'));
    expect(mockCopy).toHaveBeenLastCalledWith('LI21088110102979K002E');
  });

  it('does not show the toggle when the customer already sees the collection account (isPersonalIban false)', () => {
    render(<PaymentInformationContent info={baseInfo({ isPersonalIban: false })} />);

    expect(screen.queryByRole('button', { name: 'Show collection IBAN' })).not.toBeInTheDocument();
  });

  it('does not show the toggle for a currency without a configured Bank Frick collection account', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({
          isPersonalIban: true,
          bank: 'Bank Frick',
          name: 'DFX AG',
          currency: { name: 'USD' },
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Show collection IBAN' })).not.toBeInTheDocument();
  });

  it('toggles the displayed and copied IBAN between the personal and CHF collection account', () => {
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

    const ibanRow = screen.getByTestId('row-value-IBAN');
    expect(ibanRow).toHaveTextContent('LI21088110102979K002E');

    const showCollectionButton = within(ibanRow).getByRole('button', { name: 'Show collection IBAN' });
    fireEvent.click(showCollectionButton);

    expect(ibanRow).toHaveTextContent('LI32088110105923K000C');
    expect(ibanRow).not.toHaveTextContent('LI75088110105923K000E');
    const showPersonalButton = within(ibanRow).getByRole('button', { name: 'Show personal IBAN' });
    expect(showPersonalButton).toBeInTheDocument();

    fireEvent.click(within(ibanRow).getByTestId('copy'));
    expect(mockCopy).toHaveBeenLastCalledWith('LI32088110105923K000C');

    fireEvent.click(showPersonalButton);

    expect(ibanRow).toHaveTextContent('LI21088110102979K002E');
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
          iban: 'LI75088110105923K000E',
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Show collection IBAN' })).not.toBeInTheDocument();
  });
});

describe('getOfferableCollectionIban', () => {
  it('returns the EUR collection IBAN for a verified Bank Frick personal IBAN with EUR currency and remittanceInfo', () => {
    expect(
      getOfferableCollectionIban(baseInfo({ isPersonalIban: true, bank: 'Bank Frick', name: 'DFX AG' })),
    ).toBe('LI75088110105923K000E');
  });

  it('returns the CHF collection IBAN for a verified Bank Frick personal IBAN with CHF currency and remittanceInfo', () => {
    expect(
      getOfferableCollectionIban(
        baseInfo({ isPersonalIban: true, bank: 'Bank Frick', name: 'DFX AG', currency: { name: 'CHF' } }),
      ),
    ).toBe('LI32088110105923K000C');
  });

  it('returns undefined when the given IBAN is the collection account, ignoring whitespace and case', () => {
    expect(
      getOfferableCollectionIban(
        baseInfo({
          isPersonalIban: true,
          bank: 'Bank Frick',
          name: 'DFX AG',
          iban: 'li75 0881 1010 5923 k000 e',
        }),
      ),
    ).toBeUndefined();
  });

  it('returns undefined for a currency without a configured collection IBAN (USD)', () => {
    expect(
      getOfferableCollectionIban(
        baseInfo({ isPersonalIban: true, bank: 'Bank Frick', name: 'DFX AG', currency: { name: 'USD' } }),
      ),
    ).toBeUndefined();
  });
});
