import { Component, ErrorInfo, ReactNode } from 'react';
import { partnerTranslate } from 'src/partner-dashboard/util/i18n';

interface PartnerErrorBoundaryProps {
  children: ReactNode;
}

interface PartnerErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps the partner shell usable when a child throws (e.g. context bootstrap failure).
 * Does not rethrow — shows an embedded message instead of the full-page React overlay path.
 */
export class PartnerErrorBoundary extends Component<PartnerErrorBoundaryProps, PartnerErrorBoundaryState> {
  state: PartnerErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PartnerErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep a breadcrumb for debugging; never rethrow.
    // eslint-disable-next-line no-console
    console.error('Partner dashboard error boundary:', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <div
          className="partner-dashboard theme-dark min-h-screen w-full flex items-center justify-center p-4"
          data-testid="partner-error-boundary"
          role="alert"
        >
          <div className="partner-card max-w-md w-full space-y-3 text-center">
            <p className="text-sm partner-text-secondary">
              {partnerTranslate(
                'An error occurred while loading the dashboard. The page remains usable.',
              )}
            </p>
            <p className="text-2xs partner-text-tertiary break-words" data-testid="partner-error-message">
              {error.message || partnerTranslate('Unknown error')}
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="px-4 py-2 text-sm font-medium partner-btn-primary"
            >
              {partnerTranslate('Try again')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
