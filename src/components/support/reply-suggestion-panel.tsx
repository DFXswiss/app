import { SupportReplySuggestion } from 'src/hooks/support-dashboard.hook';
import { formatDateTime } from 'src/util/compliance-helpers';
import { LinkedText } from './info-panel';

/**
 * The proposed answer offered to the clerk above the composer.
 *
 * Only ever the newest suggestion awaiting a decision — earlier ones stay in the database but are
 * not shown. Accepting hands the text to the composer, where the clerk edits it and sends it as
 * their own message; discarding records the decision and leaves the composer untouched. There is
 * no control for writing a suggestion: they enter the system through the API alone.
 */
export function ReplySuggestionPanel({
  suggestion,
  isBusy,
  onAccept,
  onDiscard,
}: {
  suggestion: SupportReplySuggestion;
  isBusy: boolean;
  onAccept: () => void;
  onDiscard: () => void;
}): JSX.Element {
  return (
    <div className="mb-3 p-3 rounded-lg border border-dfxBlue-400/40 bg-dfxBlue-400/5">
      <div className="flex justify-between items-center gap-4 mb-2">
        <span className="text-xs font-medium text-dfxGray-700">Suggested reply</span>
        <span className="text-xs text-dfxGray-700">{formatDateTime(suggestion.created)}</span>
      </div>

      {suggestion.isStale && (
        <div className="text-xs text-dfxRed-150 mb-2">
          Written before the newest message of this conversation — check it against what the customer wrote last.
        </div>
      )}

      <div className="text-sm text-dfxBlue-800 whitespace-pre-wrap break-words">
        <LinkedText text={suggestion.text} />
      </div>

      <div className="flex gap-2 mt-3">
        <button
          className="px-3 py-1.5 bg-dfxBlue-400 text-white rounded text-xs hover:bg-dfxBlue-800 transition-colors disabled:opacity-50"
          onClick={onAccept}
          disabled={isBusy}
          title="Copy the suggestion into the message box, where you can edit it before sending"
        >
          Accept
        </button>
        <button
          className="px-3 py-1.5 border border-dfxGray-400 text-dfxBlue-800 rounded text-xs hover:bg-dfxGray-300 transition-colors disabled:opacity-50"
          onClick={onDiscard}
          disabled={isBusy}
          title="Discard the suggestion — it stays on record, but is no longer offered"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
