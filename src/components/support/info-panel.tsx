import { CustomerAuthor } from 'src/hooks/support-dashboard.hook';
import { formatDateTime } from 'src/util/compliance-helpers';

// Presentational info/chat building blocks, extracted verbatim from support-dashboard-issue.screen.tsx so both the
// DFX support-issue screen and the read-only RealUnit compliance/support screens can share them. InfoPanel/InfoRow/
// LinkedText are pure. SupportMessageList is the read-only message thread (no composer), split out so the read-only
// compliance dossier can render a chat WITHOUT the staff reply controls.

export function InfoPanel({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 flex-1 min-w-[250px]">
      <h2 className="text-dfxGray-700 mb-3">{title}</h2>
      <table className="text-sm text-dfxBlue-800 text-left">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | JSX.Element;
  mono?: boolean;
}): JSX.Element {
  return (
    <tr>
      <td className="pr-4 py-1 font-medium whitespace-nowrap text-sm">{label}:</td>
      <td className={`py-1 text-sm break-all ${mono ? 'font-mono' : ''}`}>{value}</td>
    </tr>
  );
}

export const URL_PATTERN = /https?:\/\/[^\s]+/;

export function LinkedText({ text }: { text: string }): JSX.Element {
  const parts = text.split(new RegExp(`(${URL_PATTERN.source})`, 'g'));
  return (
    <>
      {parts.map((part, i) =>
        URL_PATTERN.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dfxBlue-400 underline hover:text-dfxBlue-800 break-all"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// A single support message. `id`/`fileName` are optional so the reduced RealUnit compliance dossier (whose message
// slices carry only author/message/created) can render the same thread without file attachments.
export interface SupportMessageListItem {
  id?: number;
  author: string;
  message?: string;
  fileName?: string;
  created: string;
}

// Read-only message thread (bubbles), no composer. `onOpenFile` is optional: when omitted, file links are not
// rendered (read-only dossier). Ordering mirrors the DFX support-issue screen (by message id) and falls back to the
// created timestamp when ids are absent, so a DFX thread renders byte-for-byte identically to before extraction.
//
// The callback receives the message with its `fileName` narrowed to a string: the link exists only for a message
// that carries a file, so the caller must not have to re-check what this component already decided.
export function SupportMessageList<T extends SupportMessageListItem>({
  messages,
  onOpenFile,
}: {
  messages: T[];
  onOpenFile?: (msg: T & { fileName: string }) => void;
}): JSX.Element {
  const sorted = [...messages].sort(
    (a, b) => (a.id ?? 0) - (b.id ?? 0) || new Date(a.created).getTime() - new Date(b.created).getTime(),
  );

  return (
    <>
      {sorted.map((msg, index) => {
        const isCustomer = msg.author === CustomerAuthor;
        const fileName = msg.fileName;
        return (
          <div key={msg.id ?? index} className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                isCustomer
                  ? 'bg-dfxGray-300 text-dfxBlue-800'
                  : 'bg-dfxBlue-800/10 text-dfxBlue-800 border border-dfxBlue-800/20'
              }`}
            >
              <div className="flex justify-between items-center gap-4 mb-1">
                <span className="text-xs font-medium">{msg.author}</span>
                <span className="text-xs opacity-70">{formatDateTime(msg.created)}</span>
              </div>
              <div className="text-sm whitespace-pre-wrap break-words">
                {msg.message ? <LinkedText text={msg.message} /> : '-'}
              </div>
              {fileName && onOpenFile && (
                <button
                  className="text-xs mt-1 text-dfxBlue-400 underline hover:text-dfxBlue-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenFile({ ...msg, fileName });
                  }}
                >
                  {fileName}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
