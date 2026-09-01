// Component tests for the RealUnit compliance customer dossier Addresses CollectionTable.
// Heavy transitive deps are mocked so the screen can render under @testing-library/react without the full app shell.

jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: () => null,
}));
jest.mock('src/components/error-hint', () => ({ ErrorHint: () => null }));
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
  useParams: () => ({ id: '7' }),
}));

const mockGetCustomer = jest.fn();
jest.mock('src/hooks/realunit-compliance.hook', () => ({
  useRealunitCompliance: () => ({
    getCustomer: mockGetCustomer,
    downloadFile: jest.fn(),
    downloadDossier: jest.fn(),
  }),
}));

import { render, screen, waitFor } from '@testing-library/react';
import { RealUnitCustomerDetailDto } from 'src/dto/realunit-compliance.dto';
import RealunitComplianceUserScreen from 'src/screens/realunit-compliance-user.screen';

function minimalCustomer(overrides: Partial<RealUnitCustomerDetailDto> = {}): RealUnitCustomerDetailDto {
  return {
    id: 7,
    created: '2024-01-01T00:00:00.000Z',
    kycStatus: 'Completed',
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
