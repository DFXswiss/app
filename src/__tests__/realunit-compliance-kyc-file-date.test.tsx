// Component test for the KYC file list of the RealUnit compliance dossier: a file whose document date the api
// could not establish (`created` omitted) must render as a gap, not as a formatted non-date. Heavy transitive deps
// are mocked, but the date formatter is the real one — a stub would hide exactly the defect under test.

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
jest.mock('src/hooks/guard.hook', () => ({ useRealunitGuard: () => undefined }));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));
jest.mock('src/hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));
jest.mock('react-router-dom', () => ({ useParams: () => ({ id: '7101' }) }));
jest.mock('src/util/compliance-helpers', () => ({
  statusBadge: (status: string) => status,
  // real Swiss formatter: with a missing date it yields 'Invalid Date', which is what the screen must not reach
  formatDate: (value: string) => jest.requireActual('src/util/utils').formatSwissDate(value),
}));

const mockGetCustomer = jest.fn();
jest.mock('src/hooks/realunit-compliance.hook', () => ({
  useRealunitCompliance: () => ({
    getCustomer: mockGetCustomer,
    downloadFile: jest.fn(),
    downloadDossier: jest.fn(),
  }),
}));

import { render, screen, waitFor, within } from '@testing-library/react';
import { RealUnitCustomerDetailDto } from 'src/dto/realunit-compliance.dto';
import RealunitComplianceUserScreen from 'src/screens/realunit-compliance-user.screen';

// Built from local components so the expectations hold in any timezone the suite runs in: the formatter renders in
// local time, so a UTC literal would fall back to the previous day on negative offsets.
const FILE_DATE = new Date(2024, 0, 2);

const DOSSIER: RealUnitCustomerDetailDto = {
  id: 7101,
  created: new Date(2024, 0, 1).toISOString(),
  kycStatus: 'Completed',
  checks: {},
  kycFiles: [
    { uid: 'file-1', type: 'Identification', name: 'passport.pdf', created: FILE_DATE.toISOString() },
    // catalogued legacy document — the api could not establish its date and therefore omits the field
    { uid: 'file-2', type: 'NameCheck', name: 'legacy-name-check.pdf' },
  ],
  kycSteps: [],
  transactions: [],
  bankDatas: [],
  addresses: [],
  buyRoutes: [],
  sellRoutes: [],
  swapRoutes: [],
  virtualIbans: [],
  supportIssues: [],
};

describe('RealUnit compliance dossier KYC file date', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCustomer.mockResolvedValue(DOSSIER);
  });

  it('renders the date of a file that has one', async () => {
    render(<RealunitComplianceUserScreen />);

    const row = await waitFor(() => screen.getByText('passport.pdf').closest('tr') as HTMLElement);
    expect(within(row).getByText('02.01.2024')).toBeInTheDocument();
  });

  it('renders a placeholder instead of an invalid date when the file has no date', async () => {
    render(<RealunitComplianceUserScreen />);

    const row = await waitFor(() => screen.getByText('legacy-name-check.pdf').closest('tr') as HTMLElement);
    expect(within(row).getByText('-')).toBeInTheDocument();
    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
  });
});
