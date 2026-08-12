// Unit tests for ComplianceBankTxReturnScreen: error mapping and pending-approval banner.

const mockGetTransactionRefundData = jest.fn();
const mockChargebackTransaction = jest.fn();
const mockGoBack = jest.fn();
const mockUseComplianceGuard = jest.fn();
const mockTranslate = jest.fn((ns: string, key: string) => key);

let mockLocationState: unknown = undefined;

jest.mock('@dfx.swiss/react', () => ({
  Country: {},
  Utils: { createRules: (r: unknown) => r },
  Validations: { Required: { required: true } },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  Form: ({ children }: { children: React.ReactNode }) => <form>{children}</form>,
  SpinnerSize: { LG: 'lg' },
  StyledButton: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonColor: { WHITE: 'white' },
  StyledButtonWidth: { FULL: 'full', MD: 'md' },
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
  StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    handleSubmit: (fn: (data: unknown) => void) => () =>
      fn({
        iban: 'DE89370400440532013000',
        creditorName: 'Erika Muster',
        creditorStreet: 'Main',
        creditorHouseNumber: '1',
        creditorZip: '10115',
        creditorCity: 'Berlin',
        creditorCountry: { symbol: 'DE' },
      }),
    formState: { isValid: true, errors: {} },
    setValue: jest.fn(),
  }),
}));

jest.mock('react-router-dom', () => ({
  useParams: () => ({ id: '9002' }),
  useLocation: () => ({ state: mockLocationState }),
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/components/refund/refund-creditor-fields', () => ({
  RefundCreditorFields: () => <div data-testid="creditor-fields" />,
}));

jest.mock('src/components/refund/refund-data-table', () => ({
  RefundDataTable: () => <div data-testid="refund-data-table" />,
}));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: mockTranslate,
    translateError: (k: string) => k,
    allowedCountries: [{ symbol: 'DE', name: 'Germany' }],
  }),
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({
    getTransactionRefundData: mockGetTransactionRefundData,
    chargebackTransaction: mockChargebackTransaction,
  }),
}));

jest.mock('src/hooks/guard.hook', () => ({
  useComplianceGuard: (...args: unknown[]) => mockUseComplianceGuard(...args),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('src/util/validation-rules', () => ({
  ZipValidation: { required: true },
}));

import { render, screen, waitFor } from '@testing-library/react';
import { ChargebackBlockReason } from 'src/dto/chargeback.dto';
import ComplianceBankTxReturnScreen from 'src/screens/compliance-bank-tx-return.screen';

const refundPayload = {
  expiryDate: '2020-01-02T01:00:00.000Z',
  fee: { dfx: 3, network: 0, bank: 2 },
  refundAmount: 95,
  refundAsset: { id: 1, name: 'EUR' },
  inputAmount: 100,
  inputAsset: { id: 1, name: 'EUR' },
  refundTarget: 'DE89370400440532013000',
  bankDetails: {
    name: 'Erika Muster',
    address: 'Main',
    zip: '10115',
    city: 'Berlin',
    country: 'DE',
    iban: 'DE89370400440532013000',
  },
};

describe('ComplianceBankTxReturnScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocationState = undefined;
    mockTranslate.mockImplementation((_ns: string, key: string) => key);
    mockGetTransactionRefundData.mockResolvedValue(refundPayload);
    mockChargebackTransaction.mockResolvedValue(undefined);
  });

  it('shows the pending-approval banner when bank details are prefilled from a user request', async () => {
    render(<ComplianceBankTxReturnScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('pending-refund-banner')).toBeInTheDocument();
    });
    expect(screen.getByText('Waiting for manual approval')).toBeInTheDocument();
    expect(screen.getByTestId('refund-data-table')).toBeInTheDocument();
  });

  it('highlights name mismatch when opened from the pending list with that block reason', async () => {
    mockLocationState = {
      pendingChargeback: {
        blockReasons: [ChargebackBlockReason.NAME_MISMATCH],
        verifiedName: 'Justus Fixture',
        completeName: 'Justus Fixture',
        creditorName: 'Erika Muster',
        chargebackAmount: 95,
        chargebackAsset: 'EUR',
      },
    };

    render(<ComplianceBankTxReturnScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('pending-refund-banner')).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        'Name mismatch: the creditor name differs from the KYC name. Confirm the recipient before approving.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Justus Fixture').length).toBeGreaterThanOrEqual(1);
  });

  it('maps already-charged-back API errors to plain language', async () => {
    mockGetTransactionRefundData.mockRejectedValue(new Error('Transaction already charged back'));

    render(<ComplianceBankTxReturnScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toBeInTheDocument();
    });
    expect(mockTranslate).toHaveBeenCalledWith(
      'screens/compliance',
      'This refund has already been approved or paid out and cannot be submitted again.',
    );
  });
});
