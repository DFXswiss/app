// DFX App 2.0 — client-side IBAN validation for the sell payout-account form.
//
// Ported verbatim from the static app's `ibanCheck`/`ibanErr` (public/app2/index.html):
// ISO 13616 mod-97 checksum + a per-country length table. This is a client-side sanity
// check only — the API is still the source of truth (it can reject an IBAN this passes,
// e.g. an unsupported country or currency mismatch).

import type { TranslationKey } from '../../i18n';

const IBAN_LEN: Record<string, number> = {
  CH: 21,
  LI: 21,
  DE: 22,
  AT: 20,
  FR: 27,
  IT: 27,
  ES: 24,
  NL: 18,
  BE: 16,
  LU: 20,
  GB: 22,
};

export type IbanCheckResult = { ok: true; cc: string } | { ok: false; reason: 'length' | 'checksum'; cc?: string };

export function ibanCheck(raw: string): IbanCheckResult {
  const s = (raw || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}[0-9A-Z]+$/.test(s) || s.length < 15 || s.length > 34) return { ok: false, reason: 'length' };
  const cc = s.slice(0, 2);
  const want = IBAN_LEN[cc];
  if (want && s.length !== want) return { ok: false, reason: 'length', cc };
  // move the first 4 chars to the end, letters → numbers (A=10 .. Z=35), then mod-97 in 7-digit chunks
  const rearranged = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (let i = 0; i < rearranged.length; i += 7) {
    rem = parseInt(`${rem}${rearranged.slice(i, i + 7)}`, 10) % 97;
  }
  return rem === 1 ? { ok: true, cc } : { ok: false, reason: 'checksum', cc };
}

export function ibanErrorMessage(
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
  result: Extract<IbanCheckResult, { ok: false }>,
): string {
  if (result.reason === 'checksum') return t('ibanChecksum');
  if (result.cc) return t('ibanLenCC', { c: result.cc });
  return t('ibanLength');
}
