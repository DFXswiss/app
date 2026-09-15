// Unit tests for the "transfer to KYC file" action on a support attachment: visibility rules (route,
// role, attachment, already transferred, file type), the title/preview form, the submit paths and
// the in-flight guards.

const mockTransfer = jest.fn();
const mockAuth = { role: 'Compliance' as string | undefined };
const mockParams = { id: 'I123' as string | undefined };

jest.mock('@dfx.swiss/react', () => ({
  UserRole: { ADMIN: 'Admin', COMPLIANCE: 'Compliance', SUPPORT: 'Support' },
  useAuthContext: () => ({ session: mockAuth.role ? { role: mockAuth.role } : undefined }),
}));

jest.mock('react-router-dom', () => ({
  useParams: () => mockParams,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/support-dashboard.hook', () => ({
  useSupportDashboard: () => ({ transferMessageFileToKycFile: mockTransfer }),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KycFileTransfer, toKycFileSlug } from 'src/components/support/kyc-file-transfer';

const attachment = { id: 7, fileName: 'Gesellschafterliste.pdf' };

function openForm(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Transfer to KYC file' }));
}

function typeTitle(value: string): void {
  fireEvent.change(screen.getByPlaceholderText('Document title'), { target: { value } });
}

function save(): HTMLElement {
  return screen.getByRole('button', { name: 'Save' });
}

describe('toKycFileSlug', () => {
  it.each([
    ['Gesellschafterliste', 'gesellschafterliste'],
    ['Mietvertrag Zürich 2026', 'mietvertrag-zuerich-2026'],
    ['Straßenname & Öl', 'strassenname-oel'],
    ['Résumé café', 'resume-cafe'],
    ['  --Trim me--  ', 'trim-me'],
    ['!!!', ''],
  ])('turns %p into %p', (title, slug) => {
    expect(toKycFileSlug(title)).toBe(slug);
  });
});

describe('KycFileTransfer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.role = 'Compliance';
    mockParams.id = 'I123';
  });

  describe('visibility', () => {
    it.each([
      ['outside a ticket route', () => (mockParams.id = undefined), attachment],
      ['without a session', () => (mockAuth.role = undefined), attachment],
      ['for a role the API refuses', () => (mockAuth.role = 'Support'), attachment],
      ['for a message without id', () => undefined, { fileName: 'x.pdf' }],
      ['for a message without attachment', () => undefined, { id: 7 }],
    ])('renders nothing %s', (_label, arrange, message) => {
      arrange();
      const { container } = render(<KycFileTransfer message={message} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders for admins too', () => {
      mockAuth.role = 'Admin';
      render(<KycFileTransfer message={attachment} />);
      expect(screen.getByRole('button', { name: 'Transfer to KYC file' })).toBeInTheDocument();
    });

    it('shows the KYC file name of an already transferred attachment, falling back to the id', () => {
      const { rerender } = render(
        <KycFileTransfer message={{ ...attachment, kycFileId: 5, kycFileName: '20260915_1-liste-1.pdf' }} />,
      );
      expect(screen.getByText('In KYC file: 20260915_1-liste-1.pdf')).toBeInTheDocument();

      rerender(<KycFileTransfer message={{ ...attachment, kycFileId: 5 }} />);
      expect(screen.getByText('In KYC file: 5')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it.each(['vertrag.docx', 'scan', 'foto.HEIC'])('explains why %s cannot be transferred', (fileName) => {
      render(<KycFileTransfer message={{ id: 7, fileName }} />);
      expect(screen.getByText('Only PDF, JPG or PNG files can be transferred to the KYC file')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it.each(['a.pdf', 'b.JPG', 'c.jpeg', 'd.png'])('offers the transfer for %s', (fileName) => {
      render(<KycFileTransfer message={{ id: 7, fileName }} />);
      expect(screen.getByRole('button', { name: 'Transfer to KYC file' })).toBeInTheDocument();
    });
  });

  describe('form', () => {
    it('opens on click without bubbling to the row, previews the stored name and enables Save with a usable title', () => {
      const onRowClick = jest.fn();
      render(
        <div onClick={onRowClick}>
          <KycFileTransfer message={attachment} />
        </div>,
      );

      openForm();
      expect(onRowClick).not.toHaveBeenCalled();
      expect(save()).toBeDisabled();
      expect(screen.getByText(/^Stored as: -/)).toBeInTheDocument();

      typeTitle('Gesellschafterliste 2026');
      expect(screen.getByText(/^Stored as: gesellschafterliste-2026\.pdf/)).toBeInTheDocument();
      expect(save()).toBeEnabled();

      fireEvent.click(screen.getByPlaceholderText('Document title'));
      expect(onRowClick).not.toHaveBeenCalled();
    });

    it('cancel closes the form and drops a previous error', async () => {
      mockTransfer.mockRejectedValue(new Error('Message file is already in the KYC file'));
      render(<KycFileTransfer message={attachment} />);
      openForm();
      typeTitle('Liste');
      fireEvent.click(save());
      expect(await screen.findByText('Message file is already in the KYC file')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('button', { name: 'Transfer to KYC file' })).toBeInTheDocument();

      openForm();
      expect(screen.queryByText('Message file is already in the KYC file')).not.toBeInTheDocument();
    });
  });

  describe('submit', () => {
    it('transfers with the trimmed title and then shows the name the file got', async () => {
      mockTransfer.mockResolvedValue({ id: 7, kycFileId: 371611, kycFileName: '20260915_112046-liste-304535.pdf' });
      render(<KycFileTransfer message={attachment} />);
      openForm();
      typeTitle('  Liste  ');
      fireEvent.click(save());

      expect(await screen.findByText('In KYC file: 20260915_112046-liste-304535.pdf')).toBeInTheDocument();
      expect(mockTransfer).toHaveBeenCalledWith('I123', 7, 'Liste');
    });

    it('submits on Enter and falls back to the id when the API returns no name', async () => {
      mockTransfer.mockResolvedValue({ id: 7, kycFileId: 9 });
      render(<KycFileTransfer message={attachment} />);
      openForm();
      typeTitle('Liste');
      fireEvent.keyDown(screen.getByPlaceholderText('Document title'), { key: 'Enter' });

      expect(await screen.findByText('In KYC file: 9')).toBeInTheDocument();
    });

    it('ignores Enter and other keys while the title is unusable', () => {
      render(<KycFileTransfer message={attachment} />);
      openForm();
      typeTitle('!!!');
      fireEvent.keyDown(screen.getByPlaceholderText('Document title'), { key: 'Enter' });
      fireEvent.keyDown(screen.getByPlaceholderText('Document title'), { key: 'a' });
      expect(mockTransfer).not.toHaveBeenCalled();
    });

    it('shows the API error and lets the clerk retry', async () => {
      mockTransfer.mockRejectedValueOnce(new Error('Staff identification requires a verified name on this account.'));
      mockTransfer.mockResolvedValueOnce({ id: 7, kycFileId: 1, kycFileName: 'x.pdf' });
      render(<KycFileTransfer message={attachment} />);
      openForm();
      typeTitle('Liste');
      fireEvent.click(save());

      expect(
        await screen.findByText('Staff identification requires a verified name on this account.'),
      ).toBeInTheDocument();
      expect(save()).toBeEnabled();

      fireEvent.click(save());
      expect(await screen.findByText('In KYC file: x.pdf')).toBeInTheDocument();
    });

    it('shows a generic message for a non-Error rejection', async () => {
      mockTransfer.mockRejectedValue('boom');
      render(<KycFileTransfer message={attachment} />);
      openForm();
      typeTitle('Liste');
      fireEvent.click(save());

      expect(await screen.findByText('Failed to transfer file')).toBeInTheDocument();
    });

    it('starts one transfer per click burst and locks Cancel and the input while in flight', async () => {
      let resolve: (value: unknown) => void = () => undefined;
      mockTransfer.mockImplementation(() => new Promise((r) => (resolve = r)));
      render(<KycFileTransfer message={attachment} />);
      openForm();
      typeTitle('Liste');

      const submit = save();
      fireEvent.click(submit);
      fireEvent.click(submit);
      fireEvent.keyDown(screen.getByPlaceholderText('Document title'), { key: 'Enter' });

      expect(mockTransfer).toHaveBeenCalledTimes(1);
      expect(submit).toHaveTextContent('Loading…');
      expect(submit).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByPlaceholderText('Document title')).toBeDisabled();

      await act(async () => {
        resolve({ id: 7, kycFileId: 2, kycFileName: 'y.pdf' });
      });
      expect(screen.getByText('In KYC file: y.pdf')).toBeInTheDocument();
    });

    it.each([
      ['resolves', (r: (v: unknown) => void) => r({ id: 7, kycFileId: 2 })],
      ['rejects', (_r: (v: unknown) => void, j: (e: unknown) => void) => j(new Error('late'))],
    ])('does not touch state when the request %s after unmount', async (_label, settle) => {
      let resolve: (value: unknown) => void = () => undefined;
      let reject: (error: unknown) => void = () => undefined;
      mockTransfer.mockImplementation(
        () =>
          new Promise((res, rej) => {
            resolve = res;
            reject = rej;
          }),
      );
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { unmount } = render(<KycFileTransfer message={attachment} />);
      openForm();
      typeTitle('Liste');
      fireEvent.click(save());
      unmount();

      await act(async () => {
        settle(resolve, reject);
      });
      await waitFor(() => expect(errorSpy).not.toHaveBeenCalled());
      errorSpy.mockRestore();
    });
  });
});
