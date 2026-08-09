// Focused unit test for PaymentInformationContent Bank-row gating and copy callbacks.
// Mounts the REAL component (not mocked) so the explicit showBank prop is exercised.
// Must NOT gate on generic isPersonalIban — legacy Yapeal personal IBANs also set that flag.

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

function baseInfo(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    amount: 100,
    currency: { name: 'EUR' },
    iban: 'LI35088110102979K002E',
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

function clickCopyInRow(label: string) {
  fireEvent.click(within(screen.getByTestId(`row-value-${label}`)).getByTestId('copy'));
}

describe('PaymentInformationContent Bank row', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the Bank row when showBank is true and bank is set', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({ isPersonalIban: true, bank: 'Bank Frick', name: 'DFX AG' })}
        showBank
      />,
    );

    expect(screen.getByTestId('row-Bank')).toBeInTheDocument();
    expect(screen.getByTestId('row-value-Bank')).toHaveTextContent('Bank Frick');
  });

  it('does not show the Bank row for a normal buy even when isPersonalIban is true (B5)', () => {
    // Legacy Yapeal virtual-IBAN path returns isPersonalIban: true + bank without a Frick selector.
    render(
      <PaymentInformationContent
        info={baseInfo({ isPersonalIban: true, bank: 'Yapeal', name: 'Alice Example' })}
      />,
    );

    expect(screen.queryByTestId('row-Bank')).not.toBeInTheDocument();
  });

  it('does not show the Bank row when showBank is false despite bank present', () => {
    render(
      <PaymentInformationContent
        info={baseInfo({ isPersonalIban: true, bank: 'Bank Frick' })}
        showBank={false}
      />,
    );

    expect(screen.queryByTestId('row-Bank')).not.toBeInTheDocument();
  });

  it('does not show the Bank row when bank is absent even if showBank is true', () => {
    render(
      <PaymentInformationContent info={baseInfo({ isPersonalIban: true, bank: undefined })} showBank />,
    );

    expect(screen.queryByTestId('row-Bank')).not.toBeInTheDocument();
  });
});

describe('PaymentInformationContent copy callbacks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('copies the displayed amount, BIC, bank, remittance and recipient fields', () => {
    const info = baseInfo({
      amount: 250.5,
      bic: 'BFRILI22',
      bank: 'Bank Frick',
      name: 'DFX AG',
      street: 'Bahnhofstrasse',
      number: '7',
      zip: '6300',
      city: 'Zug',
      country: 'CH',
      remittanceInfo: 'DFX-BUY-99',
    });

    render(<PaymentInformationContent info={info} showBank />);

    expect(screen.getByTestId('row-value-BIC')).toHaveTextContent('BFRILI22');
    expect(screen.getByTestId('row-value-Bank')).toHaveTextContent('Bank Frick');
    expect(screen.getByTestId('row-value-Remittance info')).toHaveTextContent('DFX-BUY-99');

    clickCopyInRow('Amount in EUR');
    expect(mockCopy).toHaveBeenLastCalledWith('250.5');

    clickCopyInRow('BIC');
    expect(mockCopy).toHaveBeenLastCalledWith('BFRILI22');

    clickCopyInRow('Bank');
    expect(mockCopy).toHaveBeenLastCalledWith('Bank Frick');

    clickCopyInRow('Remittance info');
    expect(mockCopy).toHaveBeenLastCalledWith('DFX-BUY-99');

    clickCopyInRow('Name');
    expect(mockCopy).toHaveBeenLastCalledWith('DFX AG');

    clickCopyInRow('Address');
    expect(mockCopy).toHaveBeenLastCalledWith('Bahnhofstrasse 7');

    clickCopyInRow('ZIP code');
    expect(mockCopy).toHaveBeenLastCalledWith('6300');

    clickCopyInRow('City');
    expect(mockCopy).toHaveBeenLastCalledWith('Zug');

    clickCopyInRow('Country');
    expect(mockCopy).toHaveBeenLastCalledWith('CH');

    expect(mockCopy).toHaveBeenCalledTimes(9);
  });
});
