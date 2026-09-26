// Component tests for the RealUnit compliance customer dossier Addresses CollectionTable.
// Heavy transitive deps are mocked so the screen can render under @testing-library/react without the full app shell.

jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: () => null,
}));
jest.mock('src/components/error-hint', () => ({ ErrorHint: () => null }));
jest.mock('src/components/confirm-dialog', () => ({
  ConfirmDialog: ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    title?: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    isOpen ? (
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        <button type="button" onClick={onConfirm}>
          Confirm
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));
jest.mock('src/components/support/info-panel', () => ({
  InfoPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  InfoRow: () => null,
  SupportMessageList: () => null,
}));
jest.mock('src/hooks/guard.hook', () => ({
  useRealunitGuard: () => undefined,
}));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));
jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));
jest.mock('react-router-dom', () => ({
  useParams: jest.fn(() => ({ id: '7' })),
}));

const mockGetCustomer = jest.fn();
const mockSetInsider = jest.fn();
jest.mock('src/hooks/realunit-compliance.hook', () => ({
  useRealunitCompliance: () => ({
    getCustomer: mockGetCustomer,
    downloadFile: jest.fn(),
    downloadDossier: jest.fn(),
    setInsider: mockSetInsider,
  }),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useParams } from 'react-router-dom';
import { RealUnitCustomerDetailDto } from 'src/dto/realunit-compliance.dto';
import RealunitComplianceUserScreen from 'src/screens/realunit-compliance-user.screen';

function minimalCustomer(overrides: Partial<RealUnitCustomerDetailDto> = {}): RealUnitCustomerDetailDto {
  return {
    id: 7,
    created: '2024-01-01T00:00:00.000Z',
    kycStatus: 'Completed',
    realUnitInsider: false,
    checks: {},
    kycFiles: [],
    kycSteps: [],
    transactions: [],
    bankDatas: [],
    addresses: [],
    buyRoutes: [],
    sellRoutes: [],
    swapRoutes: [],
    virtualIbans: [],
    supportIssues: [],
    ...overrides,
  };
}

describe('RealunitComplianceUserScreen Addresses table', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useParams as jest.Mock).mockReturnValue({ id: '7' });
  });

  it('renders the Addresses heading and wallet address', async () => {
    mockGetCustomer.mockResolvedValue(
      minimalCustomer({
        addresses: [
          {
            id: 11,
            address: '0xrealunitonly',
            status: 'Active',
            created: '2024-01-02T00:00:00.000Z',
          },
        ],
      }),
    );

    render(<RealunitComplianceUserScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Addresses/)).toBeInTheDocument();
      expect(screen.getByText('0xrealunitonly')).toBeInTheDocument();
      expect(screen.getByText('11')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  it('shows No addresses when the list is empty', async () => {
    mockGetCustomer.mockResolvedValue(minimalCustomer({ addresses: [] }));

    render(<RealunitComplianceUserScreen />);

    await waitFor(() => {
      expect(screen.getByText('No addresses')).toBeInTheDocument();
    });
  });
});

describe('RealunitComplianceUserScreen insider mark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useParams as jest.Mock).mockReturnValue({ id: '7' });
  });

  it('marks a shareholder as insider after confirm', async () => {
    mockGetCustomer.mockResolvedValue(minimalCustomer({ realUnitInsider: false }));
    mockSetInsider.mockResolvedValue(minimalCustomer({ realUnitInsider: true }));

    render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark as insider' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mark as insider' }));
    expect(
      screen.getByText('Mark this shareholder as an insider? The 20 REALU referral prize will be withheld.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(mockSetInsider).toHaveBeenCalledWith(7, true);
    });
  });

  it('removes the insider mark after confirm', async () => {
    mockGetCustomer.mockResolvedValue(minimalCustomer({ realUnitInsider: true }));
    mockSetInsider.mockResolvedValue(minimalCustomer({ realUnitInsider: false }));

    render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove insider mark' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove insider mark' }));
    expect(
      screen.getByText('Remove the insider mark? The shareholder can receive the referral prize again.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(mockSetInsider).toHaveBeenCalledWith(7, false);
    });
  });

  it('ignores a stale getCustomer result after the id changes', async () => {
    let resolveFirst: (value: RealUnitCustomerDetailDto) => void = () => undefined;
    mockGetCustomer
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(
        minimalCustomer({
          id: 8,
          addresses: [
            {
              id: 22,
              address: '0xcurrent',
              status: 'Active',
              created: '2024-01-02T00:00:00.000Z',
            },
          ],
        }),
      );

    const { rerender } = render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(mockGetCustomer).toHaveBeenCalledWith(7);
    });

    (useParams as jest.Mock).mockReturnValue({ id: '8' });
    rerender(<RealunitComplianceUserScreen />);

    await waitFor(() => {
      expect(mockGetCustomer).toHaveBeenCalledWith(8);
    });
    await waitFor(() => {
      expect(screen.getByText('0xcurrent')).toBeInTheDocument();
    });

    resolveFirst(
      minimalCustomer({
        id: 7,
        addresses: [
          {
            id: 11,
            address: '0xstale',
            status: 'Active',
            created: '2024-01-02T00:00:00.000Z',
          },
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText('0xstale')).not.toBeInTheDocument();
    });
    expect(screen.getByText('0xcurrent')).toBeInTheDocument();
  });
});
