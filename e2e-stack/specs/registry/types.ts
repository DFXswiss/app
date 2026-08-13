export interface RouteClaim {
  path: string;
  spec: string;
  note?: string;
  /** Hosted artifact that is not declared in `src/App.tsx` (e.g. `/app2/`). */
  hosted?: boolean;
}
