const SCOR_BODY = /^[A-Z0-9]{1,21}$/;

/**
 * ISO 11649 creditor reference for a free-text payment usage.
 *
 * Spaces and dashes are removed first. Returns undefined when the remaining
 * body is empty, longer than 21 characters, or not alphanumeric.
 */
export function toScorReference(usage: string | undefined): string | undefined {
  if (!usage) return undefined;

  const body = usage.replace(/[\s-]/g, '').toUpperCase();
  if (!SCOR_BODY.test(body)) return undefined;

  const checksum = String(98 - mod97(`${body}RF00`)).padStart(2, '0');
  return `RF${checksum}${body}`;
}

function mod97(input: string): number {
  const charCodeOfLetterA = 'A'.charCodeAt(0);
  let expanded = '';
  for (let i = 0; i < input.length; i++) {
    const charCode = input.charCodeAt(i);
    expanded += charCode >= charCodeOfLetterA ? String(charCode - charCodeOfLetterA + 10) : input[i];
  }

  let remainder = 0;
  for (let i = 0; i < expanded.length; i++) {
    remainder = (10 * remainder + Number(expanded[i])) % 97;
  }
  return remainder;
}
