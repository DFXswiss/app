import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';

export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps): JSX.Element {
  const { translate } = usePartnerTranslation();

  return (
    <div
      className="partner-card p-8 text-center space-y-4"
      role="alert"
      data-testid="dashboard-error"
    >
      <p className="partner-text-secondary text-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 text-sm font-medium partner-btn-primary transition-colors"
      >
        {translate('Retry')}
      </button>
    </div>
  );
}
