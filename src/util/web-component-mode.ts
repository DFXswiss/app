let webComponent = false;

// Only the Web Component entry calls this. The React package renders the same app inside the
// integrator's own React tree.
export function markWebComponent(): void {
  webComponent = true;
}

export function isWebComponent(): boolean {
  return webComponent;
}
