import { useAuthContext, UserRole } from '@dfx.swiss/react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useSupportDashboard } from 'src/hooks/support-dashboard.hook';

// What the KYC file accepts (DFXswiss/backend KycDocumentService.isPermittedFileType). Anything else
// stays in the ticket; the customer has to resend it as PDF.
export const TRANSFERABLE_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];

// Mirrors the API guard on PUT support/issue/:id/message/:messageId/kycFile (Compliance and above).
const TRANSFER_ROLES: string[] = [UserRole.ADMIN, UserRole.COMPLIANCE];

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

// Mirrors SupportKycFileService.toKycFileName in DFXswiss/backend: the descriptive part of the stored
// file name is the title, made file-safe. Shown as a preview so the clerk sees what the file will be
// called before the (write-once) transfer.
export function toKycFileSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface KycFileTransferMessage {
  id?: number;
  fileName?: string;
  kycFileId?: number;
  kycFileName?: string;
}

// "Transfer to KYC file" for one support attachment: a title, a preview of the resulting name, one
// click. Renders nothing for messages without an attachment, outside a ticket route, or for roles the
// API would refuse anyway; a transferred attachment shows the name it got in the KYC file instead.
export function KycFileTransfer({ message }: { message: KycFileTransferMessage }): JSX.Element | null {
  const { session } = useAuthContext();
  const { id: issueId } = useParams();
  const { translate } = useSettingsContext();
  const { transferMessageFileToKycFile } = useSupportDashboard();

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [kycFile, setKycFile] = useState<{ id?: number; name?: string }>();

  const mountedRef = useRef(true);
  // Sync guard: isSubmitting only disables the button after re-render; a second click in the same
  // tick must not start another transfer (the API would answer 409, but the file would be uploaded twice).
  const submittingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { id: messageId, fileName } = message;
  if (!issueId || messageId == null || !fileName || !session?.role || !TRANSFER_ROLES.includes(session.role))
    return null;
  // Narrowed copies for the submit closure (control-flow narrowing does not reach into it).
  const transferIssueId: string = issueId;
  const transferMessageId: number = messageId;

  const transferred =
    kycFile ?? (message.kycFileId != null ? { id: message.kycFileId, name: message.kycFileName } : undefined);
  if (transferred)
    return (
      <div className="text-xs mt-1 text-dfxGray-700">
        {translate('screens/support', 'In KYC file')}: {transferred.name ?? transferred.id}
      </div>
    );

  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() : '';
  if (!TRANSFERABLE_EXTENSIONS.includes(extension))
    return (
      <div className="text-xs mt-1 text-dfxGray-700">
        {translate('screens/support', 'Only PDF, JPG or PNG files can be transferred to the KYC file')}
      </div>
    );

  if (!isEditing)
    return (
      <button
        className="text-xs mt-1 ml-3 text-dfxBlue-400 underline hover:text-dfxBlue-800"
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
      >
        {translate('screens/support', 'Transfer to KYC file')}
      </button>
    );

  const slug = toKycFileSlug(title);

  async function handleSubmit(): Promise<void> {
    if (submittingRef.current || !slug) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setError(undefined);
    try {
      const result = await transferMessageFileToKycFile(transferIssueId, transferMessageId, title.trim());
      if (!mountedRef.current) return;
      setKycFile({ id: result.kycFileId, name: result.kycFileName });
      setIsEditing(false);
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : translate('screens/support', 'Failed to transfer file'));
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        className="px-2 py-1 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
        placeholder={translate('screens/support', 'Document title')}
        value={title}
        maxLength={80}
        disabled={isSubmitting}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSubmit();
        }}
      />
      <div className="text-xs text-dfxGray-700">
        {translate('screens/support', 'Stored as')}: {slug ? `${slug}.${extension}` : '-'} (
        {translate('screens/support', 'Date and customer number are added automatically')})
      </div>
      {error && <div className="text-xs text-dfxRed-100">{error}</div>}
      <div className="flex gap-2">
        <button
          className="px-2 py-1 text-xs text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded disabled:opacity-50"
          disabled={isSubmitting || !slug}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? `${translate('general/actions', 'Loading')}…` : translate('general/actions', 'Save')}
        </button>
        <button
          className="px-2 py-1 text-xs text-dfxBlue-800 border border-dfxGray-400 rounded disabled:opacity-50"
          disabled={isSubmitting}
          onClick={() => {
            setIsEditing(false);
            setError(undefined);
          }}
        >
          {translate('general/actions', 'Cancel')}
        </button>
      </div>
    </div>
  );
}
