/** Accepts only absolute HTTPS URLs for every API-derived external navigation sink. */
export function isSafeHttpsUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
