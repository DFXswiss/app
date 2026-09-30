const mockCall = jest.fn();
const mockReset = jest.fn();
const mockBuildCamt053Xml = jest.fn();
let mockIsValid = true;
const mockFormData = {
  bookingDate: '2026-03-10',
  valueDate: '2026-03-11',
  amount: '42.50',
  currency: 'CHF',
  direction: 'CRDT',
  accountIban: 'CH9300762011623852957',
  accountOwner: 'Account Owner',
  accountBank: 'Example Bank',
  name: 'Counterparty',
  street: '',
  houseNumber: '',
  zip: '',
  city: '',
  country: { symbol: 'CH', name: 'Switzerland' },
  iban: 'CH3908704016075473007',
  remittanceInfo: 'Manual upload test',
};

jest.mock('@dfx.swiss/react', () => ({
  Utils: { createRules: (rules: Record<string, unknown>) => rules },
  Validations: { Required: 'required', Iban: () => 'iban' },
}));

jest.mock('@dfx.swiss/react-components', () => {
  return {
    DfxIcon: () => <span />,
    Form: ({ children, onSubmit }: any) => <form onSubmit={onSubmit}>{children}</form>,
    IconSize: { SM: 'sm' },
    IconVariant: { CHECK: 'check' },
    StyledButton: ({ label, onClick, disabled, isLoading }: any) => (
      <button type="button" onClick={onClick} disabled={disabled || isLoading}>
        {label}
      </button>
    ),
    StyledButtonWidth: { FULL: 'full' },
    StyledDropdown: ({ label, items, labelFunc }: any) => {
      const options = items.map((item: string) => labelFunc(item));
      return (
        <div>
          <div>{label}</div>
          <div data-testid={`dropdown-${label.toLowerCase()}`}>{options.join('|')}</div>
        </div>
      );
    },
    StyledHorizontalStack: ({ children }: any) => <div>{children}</div>,
    StyledInput: ({ label, placeholder }: any) => (
      <label>
        {label}
        <input placeholder={placeholder} />
      </label>
    ),
    StyledSearchDropdown: ({ label, items, labelFunc, filterFunc, matchFunc }: any) => {
      const emptySearchResults = items.filter((item: any) => filterFunc(item, '')).map(labelFunc);
      const countrySearchResults = items.filter((item: any) => filterFunc(item, 'CH')).map(labelFunc);
      const matchedCountry = items.find((item: any) => matchFunc(item, 'Switzerland'));
      const missingCountry = items.find((item: any) => matchFunc(item, undefined));
      return (
        <div>
          <div>{label}</div>
          <div data-testid="country-empty-search-results">{emptySearchResults.join('|')}</div>
          <div data-testid="country-ch-search-results">{countrySearchResults.join('|')}</div>
          <div data-testid="country-exact-match">{matchedCountry?.symbol ?? 'none'}</div>
          <div data-testid="country-missing-match">{missingCountry?.symbol ?? 'none'}</div>
        </div>
      );
    },
    StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
  };
});

jest.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    handleSubmit: (handler: (data: typeof mockFormData) => void) => () => handler(mockFormData),
    reset: mockReset,
    formState: { isValid: mockIsValid, errors: {} },
  }),
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div>{message}</div>,
}));

jest.mock('src/contexts/layout.context', () => ({ useLayoutContext: () => ({ rootRef: null }) }));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, key: string) => key,
    translateError: (key: string) => key,
    allowedCountries: [{ symbol: 'CH', name: 'Switzerland' }],
  }),
}));
jest.mock('src/hooks/guard.hook', () => ({ useAdminGuard: jest.fn() }));
jest.mock('src/hooks/guarded-api.hook', () => ({ useGuardedApi: () => ({ call: mockCall }) }));
jest.mock('src/hooks/layout-config.hook', () => ({ useLayoutOptions: jest.fn() }));
jest.mock('src/util/camt053-builder', () => ({
  buildCamt053Xml: (...args: unknown[]) => mockBuildCamt053Xml(...args),
}));
jest.mock('src/util/compliance-helpers', () => ({ todayAsString: () => '2026-03-10' }));

import { act, fireEvent, render, screen } from '@testing-library/react';
import SepaManualScreen from 'src/screens/sepa-manual.screen';

describe('SepaManualScreen upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildCamt053Xml.mockReturnValue('<Document />');
    mockCall.mockResolvedValue(undefined);
    mockIsValid = true;
    mockFormData.country = { symbol: 'CH', name: 'Switzerland' };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows UUID generation errors and does not send or claim an upload', () => {
    mockBuildCamt053Xml.mockImplementation(() => {
      throw new Error('Secure random UUID generation is unavailable.');
    });

    render(<SepaManualScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(screen.getByText('Secure random UUID generation is unavailable.')).toBeInTheDocument();
    expect(mockCall).not.toHaveBeenCalled();
    expect(screen.getByText('Uploaded')).toHaveClass('opacity-0');
  });

  it('renders the configured direction and country search, filter, and match results', () => {
    render(<SepaManualScreen />);

    expect(screen.getByTestId('dropdown-direction')).toHaveTextContent('Credit (incoming)|Debit (outgoing)');
    expect(screen.getByTestId('country-empty-search-results')).toHaveTextContent('Switzerland');
    expect(screen.getByTestId('country-ch-search-results')).toHaveTextContent('Switzerland');
    expect(screen.getByTestId('country-exact-match')).toHaveTextContent('CH');
    expect(screen.getByTestId('country-missing-match')).toHaveTextContent('none');
  });

  it('keeps Upload disabled for invalid form data and enables it when the form becomes valid', () => {
    mockIsValid = false;
    const { rerender } = render(<SepaManualScreen />);

    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(mockCall).not.toHaveBeenCalled();

    mockIsValid = true;
    rerender(<SepaManualScreen />);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
  });

  it('submits generated XML, shows success, and clears the notification after its timer', async () => {
    jest.useFakeTimers();
    render(<SepaManualScreen />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
      await Promise.resolve();
    });

    expect(mockBuildCamt053Xml).toHaveBeenCalledWith({ ...mockFormData, country: 'CH' });
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'bankTx', method: 'POST', noJson: true, data: expect.any(FormData) }),
    );
    expect(screen.getByText('Uploaded')).toHaveClass('opacity-100');
    expect(mockReset).toHaveBeenCalledTimes(1);

    act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByText('Uploaded')).toHaveClass('opacity-0');
  });

  it('displays a non-Error generation failure without calling the API', () => {
    mockFormData.country = undefined as unknown as typeof mockFormData.country;
    mockBuildCamt053Xml.mockImplementation(() => {
      throw 'entropy unavailable';
    });

    render(<SepaManualScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(mockBuildCamt053Xml).toHaveBeenCalledWith({ ...mockFormData, country: undefined });
    expect(screen.getByText('Secure random UUID generation is unavailable.')).toBeInTheDocument();
    expect(mockCall).not.toHaveBeenCalled();
    expect(screen.getByText('Uploaded')).toHaveClass('opacity-0');
  });

  it('retries after an API error, clears the error, and uploads generated XML without country', async () => {
    jest.useFakeTimers();
    mockFormData.country = undefined as unknown as typeof mockFormData.country;
    mockBuildCamt053Xml
      .mockReturnValueOnce('<Document attempt="1" />')
      .mockReturnValueOnce('<Document attempt="2" />');
    mockCall.mockRejectedValueOnce({ message: 'bank upload failed' }).mockResolvedValueOnce(undefined);
    render(<SepaManualScreen />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
      await Promise.resolve();
    });

    expect(screen.getByText('bank upload failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
    expect(screen.getByText('Uploaded')).toHaveClass('opacity-0');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
      await Promise.resolve();
    });

    expect(mockBuildCamt053Xml).toHaveBeenNthCalledWith(1, { ...mockFormData, country: undefined });
    expect(mockBuildCamt053Xml).toHaveBeenNthCalledWith(2, { ...mockFormData, country: undefined });
    expect(mockCall).toHaveBeenCalledTimes(2);
    expect(mockCall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ url: 'bankTx', method: 'POST', noJson: true, data: expect.any(FormData) }),
    );
    const secondRequest = mockCall.mock.calls[1][0];
    const uploadedFile = (secondRequest.data as FormData).get('files') as File;
    expect(uploadedFile).toEqual(expect.objectContaining({ name: 'manual-bank-tx.xml', type: 'text/xml' }));
    expect(uploadedFile.size).toBe('<Document attempt="2" />'.length);
    const uploadedXml = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(uploadedFile);
    });
    expect(uploadedXml).toBe('<Document attempt="2" />');
    expect(screen.queryByText('bank upload failed')).not.toBeInTheDocument();
    expect(screen.getByText('Uploaded')).toHaveClass('opacity-100');

    act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByText('Uploaded')).toHaveClass('opacity-0');
  });

  it('hides a prior Uploaded notification when a later XML generation fails', async () => {
    jest.useFakeTimers();
    mockBuildCamt053Xml
      .mockReturnValueOnce('<Document />')
      .mockImplementationOnce(() => {
        throw new Error('Secure random UUID generation is unavailable.');
      });
    render(<SepaManualScreen />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
      await Promise.resolve();
    });
    expect(screen.getByText('Uploaded')).toHaveClass('opacity-100');

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(screen.getByText('Secure random UUID generation is unavailable.')).toBeInTheDocument();
    expect(screen.getByText('Uploaded')).toHaveClass('opacity-0');
    expect(mockCall).toHaveBeenCalledTimes(1);
  });
});
