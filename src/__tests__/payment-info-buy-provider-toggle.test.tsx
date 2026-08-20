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
  IconVariant: { BANK: 'bank', SEPA_INSTANT: 'sepa', SWAP: 'SWAP' },
  StyledDataTable: ({ children, label }: any) => <div data-testid={label ? `table-${label}` : 'table'}>{children}</div>,
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
import { FRICK_COLLECTION_IBANS } from '../util/personal-iban';

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

/** Verified Bank Frick personal IBAN so the collection account is also offered. */
function frickPersonalInfo() {
  return {
    id: 1,
    amount: 100,
    currency: { name: 'EUR' },
    iban: 'LI21088110102979K002E',
    bic: 'BFRILI22',
    name: 'DFX AG',
    bank: 'Bank Frick',
    street: 'Main',
    number: '1',
    zip: '9490',
    city: 'Vaduz',
    country: 'LI',
    sepaInstant: false,
    remittanceInfo: 'DFX-BUY-1',
    isPersonalIban: true,
  } as any;
}

const SWITCH_BUTTON_NAME = /Show (collection|personal|legacy Yapeal|Bank Frick) IBAN/;

describe('PaymentInformationContent personal-IBAN provider toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('offers the legacy Yapeal direction and forwards the Yapeal provider', () => {
    const onSwitchPersonalIbanProvider = jest.fn();
    render(
      <PaymentInformationContent
        info={baseInfo()}
        personalIbanProviderSwitch={{
          target: PersonalIbanProvider.YAPEAL,
          onSwitch: onSwitchPersonalIbanProvider,
        }}
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
        personalIbanProviderSwitch={{
          target: PersonalIbanProvider.FRICK,
          onSwitch: onSwitchPersonalIbanProvider,
        }}
      />,
    );

    const button = screen.getByRole('button', { name: 'Show Bank Frick IBAN' });
    expect(screen.queryByRole('button', { name: 'Show legacy Yapeal IBAN' })).not.toBeInTheDocument();

    fireEvent.click(button);

    expect(onSwitchPersonalIbanProvider).toHaveBeenCalledWith(PersonalIbanProvider.FRICK);
  });

  it('does not show a provider toggle when the bundled switch prop is absent', () => {
    render(<PaymentInformationContent info={baseInfo()} />);

    expect(screen.queryByRole('button', { name: 'Show legacy Yapeal IBAN' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show Bank Frick IBAN' })).not.toBeInTheDocument();
  });

  it('cycles personal → collection → provider when both alternatives are offered', () => {
    const onSwitch = jest.fn();
    render(
      <PaymentInformationContent
        info={frickPersonalInfo()}
        personalIbanProviderSwitch={{
          target: PersonalIbanProvider.YAPEAL,
          onSwitch,
        }}
      />,
    );

    expect(screen.getAllByRole('button', { name: SWITCH_BUTTON_NAME })).toHaveLength(1);
    const showCollection = screen.getByRole('button', { name: 'Show collection IBAN' });

    fireEvent.click(showCollection);

    expect(screen.getByTestId('row-value-IBAN')).toHaveTextContent(FRICK_COLLECTION_IBANS.EUR);
    expect(onSwitch).not.toHaveBeenCalled();

    expect(screen.getAllByRole('button', { name: SWITCH_BUTTON_NAME })).toHaveLength(1);
    const showYapeal = screen.getByRole('button', { name: 'Show legacy Yapeal IBAN' });

    fireEvent.click(showYapeal);

    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(onSwitch).toHaveBeenCalledWith(PersonalIbanProvider.YAPEAL);
  });
});
