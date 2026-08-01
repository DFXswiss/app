export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps): JSX.Element {
  return (
    <div
      className="bg-dfxBlue-700 rounded-lg p-8 text-center space-y-4"
      role="alert"
      data-testid="dashboard-error"
    >
      <p className="text-dfxGray-600 text-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded text-sm font-medium bg-dfxBlue-400 text-white hover:bg-dfxBlue-300 transition-colors"
      >
        Wiederholen
      </button>
    </div>
  );
}
