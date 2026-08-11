// Focused unit test for the personal-IBAN provider toggle in PaymentInformationContent.
// Mounts the real component so each switch direction, its accessible label, and the callback
// payload are pinned independently from the Buy screens that decide whether a switch is valid.

const mockCopy = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  PersonalIbanProvider: { FRICK: 'Frick', YAPEAL: 'Yapeal' },
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
  IconVariant: { BANK: 'bank', SEPA_INSTANT: 'sepa' },
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
    translate: (_ns: string, key: string) => key,
  }),
}));

jest.mock('../hooks/clipboard.hook', () => ({
  useClipboard: () => ({ copy: mockCopy }),
}));

jest.mock('../components/payment/payment-qr-code', () => ({
  PaymentQrCode: () => null,
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { PersonalIbanProvider } from '@dfx.swiss/react';
import { PaymentInformationContent } from '../components/payment/payment-info-buy';

function baseInfo() {
  return {
    id: 1,
    amount: 100,
    currency: { name: 'CHF' },
    iban: 'CH9300762011623852957',
    bic: 'YAPECHZ2',
    name: 'Test User',
    street: 'Main',
    number: '1',
    zip: '8000',
    city: 'Zurich',
    country: 'CH',
    sepaInstant: false,
    remittanceInfo: 'DFX-BUY-1',
  } as any;
}

describe('PaymentInformationContent personal-IBAN provider toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('offers the legacy Yapeal direction and forwards the Yapeal provider', () => {
    const onSwitchPersonalIbanProvider = jest.fn();
    render(
      <PaymentInformationContent
        info={baseInfo()}
        switchablePersonalIbanProvider={PersonalIbanProvider.YAPEAL}
        onSwitchPersonalIbanProvider={onSwitchPersonalIbanProvider}
      />,
    );

    const button = screen.getByRole('button', { name: 'Show legacy Yapeal IBAN' });
    expect(screen.queryByRole('button', { name: 'Show Bank Frick IBAN' })).not.toBeInTheDocument();

    fireEvent.click(button);

    expect(onSwitchPersonalIbanProvider).toHaveBeenCalledWith(PersonalIbanProvider.YAPEAL);
  });

  it('offers the Bank Frick direction and forwards the Frick provider', () => {
    const onSwitchPersonalIbanProvider = jest.fn();
    render(
      <PaymentInformationContent
        info={baseInfo()}
        switchablePersonalIbanProvider={PersonalIbanProvider.FRICK}
        onSwitchPersonalIbanProvider={onSwitchPersonalIbanProvider}
      />,
    );

    const button = screen.getByRole('button', { name: 'Show Bank Frick IBAN' });
    expect(screen.queryByRole('button', { name: 'Show legacy Yapeal IBAN' })).not.toBeInTheDocument();

    fireEvent.click(button);

    expect(onSwitchPersonalIbanProvider).toHaveBeenCalledWith(PersonalIbanProvider.FRICK);
  });

  it.each([
    ['both props are absent', {}],
    [
      'the callback is absent',
      { switchablePersonalIbanProvider: PersonalIbanProvider.YAPEAL },
    ],
    [
      'the target provider is absent',
      { onSwitchPersonalIbanProvider: jest.fn() },
    ],
  ])('does not show a provider toggle when %s', (_case, props) => {
    render(<PaymentInformationContent info={baseInfo()} {...props} />);

    expect(screen.queryByRole('button', { name: 'Show legacy Yapeal IBAN' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show Bank Frick IBAN' })).not.toBeInTheDocument();
  });
});
