// Component tests for the RealUnit compliance customer dossier Addresses CollectionTable.
// Heavy transitive deps are mocked so the screen can render under @testing-library/react without the full app shell.

jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: () => null,
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div>{message}</div>,
}));
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
  InfoRow: ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <span>{label}</span>
      <div>{value}</div>
    </div>
  ),
  SupportMessageList: ({ messages }: { messages: { author: string; message?: string }[] }) => (
    <div>
      {messages.map((m, i) => (
        <p key={i}>
          {m.author}: {m.message}
        </p>
      ))}
    </div>
  ),
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
const mockDownloadFile = jest.fn();
const mockDownloadDossier = jest.fn();
jest.mock('src/hooks/realunit-compliance.hook', () => ({
  useRealunitCompliance: () => ({
    getCustomer: mockGetCustomer,
    downloadFile: mockDownloadFile,
    downloadDossier: mockDownloadDossier,
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

  it('shows the Error message when setInsider rejects', async () => {
    mockGetCustomer.mockResolvedValue(minimalCustomer({ realUnitInsider: false }));
    mockSetInsider.mockRejectedValue(new Error('insider down'));
    render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark as insider' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as insider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(screen.getByText('insider down')).toBeInTheDocument();
    });
  });

  it('shows a fallback when setInsider rejects without a message', async () => {
    mockGetCustomer.mockResolvedValue(minimalCustomer({ realUnitInsider: false }));
    mockSetInsider.mockRejectedValue({});
    render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark as insider' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as insider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(screen.getByText('Error updating insider')).toBeInTheDocument();
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

  it('ignores a stale setInsider result after the id changes', async () => {
    let resolveSet: (value: RealUnitCustomerDetailDto) => void = () => undefined;
    mockGetCustomer
      .mockResolvedValueOnce(minimalCustomer({ realUnitInsider: false }))
      .mockResolvedValueOnce(
        minimalCustomer({
          id: 8,
          realUnitInsider: false,
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
    mockSetInsider.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSet = resolve;
        }),
    );

    const { rerender } = render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark as insider' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as insider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(mockSetInsider).toHaveBeenCalledWith(7, true);
    });

    (useParams as jest.Mock).mockReturnValue({ id: '8' });
    rerender(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByText('0xcurrent')).toBeInTheDocument();
    });

    resolveSet(minimalCustomer({ id: 7, realUnitInsider: true, addresses: [] }));
    await waitFor(() => {
      expect(screen.queryByText('0xstale')).not.toBeInTheDocument();
    });
    expect(screen.getByText('0xcurrent')).toBeInTheDocument();
  });

  it('closes the insider dialog on cancel without calling setInsider', async () => {
    mockGetCustomer.mockResolvedValue(minimalCustomer({ realUnitInsider: false }));
    render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark as insider' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as insider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Mark this shareholder as an insider? The 20 REALU referral prize will be withheld.')).not.toBeInTheDocument();
    expect(mockSetInsider).not.toHaveBeenCalled();
  });
});

describe('RealunitComplianceUserScreen load, downloads, checks, and collections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useParams as jest.Mock).mockReturnValue({ id: '7' });
    mockDownloadFile.mockReset();
    mockDownloadDossier.mockReset();
  });

  it('stays on the spinner when the route has no id', () => {
    (useParams as jest.Mock).mockReturnValue({});
    render(<RealunitComplianceUserScreen />);
    expect(mockGetCustomer).not.toHaveBeenCalled();
  });

  it('ignores a stale getCustomer rejection after the id changes', async () => {
    let rejectFirst: (reason: Error) => void = () => undefined;
    mockGetCustomer
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce(minimalCustomer({ id: 8, addresses: [{ id: 22, address: '0xcurrent', status: 'Active', created: '2024-01-02T00:00:00.000Z' }] }));

    const { rerender } = render(<RealunitComplianceUserScreen />);
    (useParams as jest.Mock).mockReturnValue({ id: '8' });
    rerender(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByText('0xcurrent')).toBeInTheDocument();
    });
    rejectFirst(new Error('stale fail'));
    await waitFor(() => {
      expect(screen.queryByText('stale fail')).not.toBeInTheDocument();
    });
  });

  it('does not download after the route id is cleared', async () => {
    mockGetCustomer.mockResolvedValue(
      minimalCustomer({
        kycFiles: [{ uid: 'file-1', type: 'Identification', name: 'passport.pdf' }],
      }),
    );
    const { rerender } = render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    });
    (useParams as jest.Mock).mockReturnValue({});
    rerender(<RealunitComplianceUserScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download dossier (ZIP)' }));
    expect(mockDownloadFile).not.toHaveBeenCalled();
    expect(mockDownloadDossier).not.toHaveBeenCalled();
  });

  it('falls back to the file name when the download payload has no name', async () => {
    const createObjectURL = jest.fn(() => 'blob:file');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    mockGetCustomer.mockResolvedValue(
      minimalCustomer({
        kycFiles: [{ uid: 'file-1', type: 'Identification', name: 'fallback.pdf' }],
      }),
    );
    mockDownloadFile.mockResolvedValue({
      content: { type: 'Buffer', data: [1] },
      contentType: 'application/pdf',
      name: '',
    });
    render(<RealunitComplianceUserScreen />);
    fireEvent.click(await waitFor(() => screen.getByRole('button', { name: 'Download' })));
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
    });
  });

  it('does not start a second insider save while one is in flight', async () => {
    mockGetCustomer.mockResolvedValue(minimalCustomer({ realUnitInsider: false }));
    let resolveSet: (value: RealUnitCustomerDetailDto) => void = () => undefined;
    mockSetInsider.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSet = resolve;
        }),
    );
    render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark as insider' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as insider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockSetInsider).toHaveBeenCalledTimes(1);
    resolveSet(minimalCustomer({ realUnitInsider: true }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove insider mark' })).toBeInTheDocument();
    });
  });

  it('ignores a stale setInsider rejection after the id changes', async () => {
    let rejectSet: (reason: Error) => void = () => undefined;
    mockGetCustomer
      .mockResolvedValueOnce(minimalCustomer({ realUnitInsider: false }))
      .mockResolvedValueOnce(
        minimalCustomer({
          id: 8,
          addresses: [{ id: 22, address: '0xcurrent', status: 'Active', created: '2024-01-02T00:00:00.000Z' }],
        }),
      );
    mockSetInsider.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSet = reject;
        }),
    );
    const { rerender } = render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark as insider' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as insider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    (useParams as jest.Mock).mockReturnValue({ id: '8' });
    rerender(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByText('0xcurrent')).toBeInTheDocument();
    });
    rejectSet(new Error('stale insider'));
    await waitFor(() => {
      expect(screen.queryByText('stale insider')).not.toBeInTheDocument();
    });
  });

  it('shows the load error when getCustomer rejects', async () => {
    mockGetCustomer.mockRejectedValue(new Error('dossier down'));
    render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByText('dossier down')).toBeInTheDocument();
    });
  });

  it('shows a fallback when getCustomer rejects without a message', async () => {
    mockGetCustomer.mockRejectedValue({});
    render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByText('Unknown error')).toBeInTheDocument();
    });
  });

  it('downloads a KYC file and reports invalid payloads', async () => {
    const createObjectURL = jest.fn(() => 'blob:file');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    mockGetCustomer.mockResolvedValue(
      minimalCustomer({
        kycFiles: [{ uid: 'file-1', type: 'Identification', name: 'passport.pdf', created: '2024-01-02T00:00:00.000Z' }],
      }),
    );
    mockDownloadFile
      .mockResolvedValueOnce({ content: { type: 'text' }, contentType: 'text/plain', name: 'bad.txt' })
      .mockResolvedValueOnce({
        content: { type: 'Buffer', data: [1, 2] },
        contentType: 'application/pdf',
        name: 'passport.pdf',
      });

    render(<RealunitComplianceUserScreen />);
    const download = await waitFor(() => screen.getByRole('button', { name: 'Download' }));
    fireEvent.click(download);
    await waitFor(() => {
      expect(screen.getByText('Invalid file type')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
    });
  });

  it('shows the download error when downloadFile rejects', async () => {
    mockGetCustomer.mockResolvedValue(
      minimalCustomer({
        kycFiles: [{ uid: 'file-1', type: 'Identification', name: 'passport.pdf' }],
      }),
    );
    mockDownloadFile.mockRejectedValue(new Error('file down'));
    render(<RealunitComplianceUserScreen />);
    fireEvent.click(await waitFor(() => screen.getByRole('button', { name: 'Download' })));
    await waitFor(() => {
      expect(screen.getByText('file down')).toBeInTheDocument();
    });
  });

  it('shows a fallback when downloadFile rejects without a message', async () => {
    mockGetCustomer.mockResolvedValue(
      minimalCustomer({
        kycFiles: [{ uid: 'file-1', type: 'Identification', name: 'passport.pdf' }],
      }),
    );
    mockDownloadFile.mockRejectedValue({});
    render(<RealunitComplianceUserScreen />);
    fireEvent.click(await waitFor(() => screen.getByRole('button', { name: 'Download' })));
    await waitFor(() => {
      expect(screen.getByText('Error downloading file')).toBeInTheDocument();
    });
  });

  it('downloads the dossier ZIP and reports failures', async () => {
    mockGetCustomer.mockResolvedValue(minimalCustomer());
    mockDownloadDossier.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('zip down'));
    render(<RealunitComplianceUserScreen />);
    const zip = await waitFor(() => screen.getByRole('button', { name: 'Download dossier (ZIP)' }));
    fireEvent.click(zip);
    await waitFor(() => {
      expect(mockDownloadDossier).toHaveBeenCalledWith(7);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Download dossier (ZIP)' })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download dossier (ZIP)' }));
    await waitFor(() => {
      expect(screen.getByText('zip down')).toBeInTheDocument();
    });
  });

  it('shows a fallback when downloadDossier rejects without a message', async () => {
    mockGetCustomer.mockResolvedValue(minimalCustomer());
    mockDownloadDossier.mockRejectedValue({});
    render(<RealunitComplianceUserScreen />);
    fireEvent.click(await waitFor(() => screen.getByRole('button', { name: 'Download dossier (ZIP)' })));
    await waitFor(() => {
      expect(screen.getByText('Error downloading dossier')).toBeInTheDocument();
    });
  });

  it('renders missing and present check evidence including a download', async () => {
    mockGetCustomer.mockResolvedValue(
      minimalCustomer({
        checks: {
          nameCheck: {
            status: 'Completed',
            type: 'Dilisense',
            date: '2024-06-15T12:00:00.000Z',
            fileUid: 'nc-1',
            fileName: 'dilisense.pdf',
          },
        },
      }),
    );
    mockDownloadFile.mockResolvedValue({ content: { type: 'text' } });
    render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByText('Missing')).toBeInTheDocument();
      expect(screen.getByText('Dilisense')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => {
      expect(mockDownloadFile).toHaveBeenCalledWith(7, 'nc-1');
    });
  });

  it('renders organization, bool flags, collections, and support issues', async () => {
    mockGetCustomer.mockResolvedValue(
      minimalCustomer({
        accountType: 'Organization',
        mail: 'ops@example.com',
        firstname: 'Petra',
        surname: 'Prokura',
        verifiedName: 'Petra Prokura',
        street: 'Musterstrasse',
        houseNumber: '12',
        zip: '8000',
        location: 'Zürich',
        country: { name: 'Switzerland' },
        nationality: { name: 'Switzerland' },
        language: { name: 'German' },
        birthday: '1985-06-15T00:00:00.000Z',
        phone: '+41000',
        highRisk: true,
        pep: false,
        balance: 1250,
        organization: {
          id: 9,
          name: 'ACME Example AG',
          street: 'Orgstrasse',
          houseNumber: '1',
          zip: '8001',
          location: 'Zürich',
          country: { name: 'Switzerland' },
          legalEntity: 'AG',
          signatoryPower: 'Joint',
          complexOrgStructure: true,
          allBeneficialOwnersName: 'Owner',
          allBeneficialOwnersDomicile: 'CH',
          accountOpenerAuthorization: 'Yes',
        },
        kycFiles: [{ uid: 'f1', type: 'Ident', name: 'id.pdf', created: '2024-01-02T00:00:00.000Z' }],
        kycSteps: [
          { id: 1, name: 'Ident', type: 'SumsubAuto', status: 'Completed', sequenceNumber: 1, created: '2024-01-02T00:00:00.000Z' },
        ],
        transactions: [
          {
            id: 33,
            uid: 'tx-1',
            type: 'Buy',
            sourceType: 'Bank',
            inputAmount: 10,
            inputAsset: 'CHF',
            outputAmount: 8,
            outputAsset: 'REALU',
            amountInChf: 10,
            isCompleted: true,
            chargebackDate: '2024-02-01T00:00:00.000Z',
            created: '2024-01-03T00:00:00.000Z',
          },
        ],
        bankDatas: [
          {
            id: 4,
            iban: 'CH9300762011623852957',
            name: 'Bank',
            type: 'Personal',
            status: 'Active',
            approved: true,
            active: true,
            created: '2024-01-04T00:00:00.000Z',
          },
        ],
        buyRoutes: [
          {
            id: 5,
            iban: 'CH00',
            bankUsage: 'buy',
            assetName: 'REALU',
            blockchain: 'Ethereum',
            volume: 1,
            active: true,
            created: '2024-01-05T00:00:00.000Z',
          },
        ],
        sellRoutes: [
          {
            id: 6,
            iban: 'CH01',
            fiatName: 'CHF',
            depositAddress: '0xsell',
            volume: 2,
            active: false,
            created: '2024-01-06T00:00:00.000Z',
          },
        ],
        swapRoutes: [
          {
            id: 7,
            assetName: 'REALU',
            blockchain: 'Ethereum',
            depositAddress: '0xswap',
            volume: 3,
            annualVolume: 3,
            active: true,
            created: '2024-01-07T00:00:00.000Z',
          },
        ],
        virtualIbans: [
          {
            id: 8,
            iban: 'CH02',
            currency: 'CHF',
            bank: 'Bank',
            status: 'Active',
            active: true,
            label: 'Main',
            created: '2024-01-08T00:00:00.000Z',
          },
        ],
        supportIssues: [
          {
            id: 8,
            uid: 'iss-1',
            type: 'GenericIssue',
            state: 'Pending',
            reason: 'Missing incoming transfer',
            name: 'ACME',
            clerk: 'Ada',
            department: 'Compliance',
            information: 'Need proof',
            messages: [{ author: 'Customer', message: 'Hello', created: '2024-01-09T00:00:00.000Z' }],
            created: '2024-01-09T00:00:00.000Z',
          },
        ],
      }),
    );

    render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByText('ACME Example AG')).toBeInTheDocument();
      expect(screen.getAllByText('Yes').length).toBeGreaterThan(0);
      expect(screen.getAllByText('No').length).toBeGreaterThan(0);
      expect(screen.getByText('id.pdf')).toBeInTheDocument();
      expect(screen.getByText('CH9300762011623852957')).toBeInTheDocument();
      expect(screen.getByText('0xsell')).toBeInTheDocument();
      expect(screen.getByText('0xswap')).toBeInTheDocument();
      expect(screen.getByText('CH02')).toBeInTheDocument();
      expect(screen.getByText('Missing incoming transfer')).toBeInTheDocument();
      expect(screen.getByText('Customer: Hello')).toBeInTheDocument();
      expect(screen.getByText('Need proof')).toBeInTheDocument();
    });
  });

  it('renders empty support issues and omitted optional collection fields', async () => {
    mockGetCustomer.mockResolvedValue(
      minimalCustomer({
        pep: undefined,
        highRisk: undefined,
        organization: { id: 1 },
        transactions: [
          {
            id: 33,
            uid: 'tx-2',
            sourceType: 'Bank',
            isCompleted: false,
            created: '2024-01-03T00:00:00.000Z',
          },
        ],
        bankDatas: [
          {
            id: 4,
            iban: 'CH99',
            name: 'Bank',
            approved: false,
            active: false,
            created: '2024-01-04T00:00:00.000Z',
          },
        ],
        kycSteps: [{ id: 1, name: 'Ident', status: 'InProgress', sequenceNumber: 1, created: '2024-01-02T00:00:00.000Z' }],
        buyRoutes: [
          {
            id: 5,
            bankUsage: 'buy',
            assetName: 'REALU',
            blockchain: 'Ethereum',
            volume: 0,
            active: false,
            created: '2024-01-05T00:00:00.000Z',
          },
        ],
        sellRoutes: [{ id: 6, iban: 'CH01', volume: 0, active: false, created: '2024-01-06T00:00:00.000Z' }],
        swapRoutes: [{ id: 7, volume: 0, annualVolume: 0, active: false, created: '2024-01-07T00:00:00.000Z' }],
        virtualIbans: [{ id: 8, iban: 'CH08', active: false, created: '2024-01-08T00:00:00.000Z' }],
        supportIssues: [
          {
            id: 9,
            uid: 'iss-2',
            type: 'GenericIssue',
            state: 'Pending',
            reason: 'Other',
            name: 'ACME',
            messages: [],
            created: '2024-01-09T00:00:00.000Z',
          },
        ],
        checks: { identCheck: { date: '2024-01-01T00:00:00.000Z' } },
      }),
    );
    render(<RealunitComplianceUserScreen />);
    await waitFor(() => {
      expect(screen.getByText('Other')).toBeInTheDocument();
      expect(screen.getByText('CH99')).toBeInTheDocument();
      expect(screen.getAllByText('-').length).toBeGreaterThan(0);
    });
  });
});
