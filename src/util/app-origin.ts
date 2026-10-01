// Origin the app itself is served from. Embedded as a Web Component, `window.location` belongs to the
// embedding page, so URLs that must lead back into the app are built from this instead.
export function appOrigin(): string {
  const origin = process.env.REACT_APP_PUBLIC_URL || window.location.origin;
  return origin.replace(/\/+$/, '');
}
