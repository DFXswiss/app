export function EmptyState({ message }: { message: string }): JSX.Element {
  return (
    <div
      className="flex items-center justify-center h-48 text-sm partner-text-tertiary"
      data-testid="dashboard-empty"
    >
      {message}
    </div>
  );
}
