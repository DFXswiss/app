export function DashboardSkeleton(): JSX.Element {
  return (
    <div className="space-y-4 animate-pulse" data-testid="dashboard-skeleton" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-dfxBlue-700 rounded-lg h-20" />
        ))}
      </div>
      <div className="bg-dfxBlue-700 rounded-lg h-72" />
      <div className="bg-dfxBlue-700 rounded-lg h-72" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-dfxBlue-700 rounded-lg h-64" />
        <div className="bg-dfxBlue-700 rounded-lg h-64" />
      </div>
    </div>
  );
}
