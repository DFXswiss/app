import fs from 'fs';
import path from 'path';

// public/_headers is read by the hosting edge, not by the app, so nothing else in the suite looks
// at it. These cases pin the security headers its `/*` rule adds to every statically served
// response (Function responses do not get them, see the comment in that file), and pin just as much
// what it must NOT send: the app is embedded by third-party sites (README.md, Iframe integration)
// and loads scripts, frames and connections from many origins, so a framing restriction or a
// fetch directive in the policy would break those integrations without any test noticing.

type HeaderRules = Map<string, Map<string, string>>;

// Cloudflare Pages format: an unindented line opens a URL pattern, indented `Name: value` lines
// below it belong to that pattern, `#` starts a comment.
function parseHeaders(source: string): HeaderRules {
  const rules: HeaderRules = new Map();
  let current: Map<string, string> | undefined;

  for (const line of source.split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    if (!/^\s/.test(line)) {
      current = new Map();
      rules.set(line.trim(), current);
      continue;
    }

    const separator = line.indexOf(':');
    if (!current || separator < 0) throw new Error(`Unexpected line in public/_headers: ${line}`);
    current.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }

  return rules;
}

function directives(policy: string): Map<string, string> {
  return new Map(
    policy
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name.toLowerCase(), values.join(' ')];
      }),
  );
}

const rules = parseHeaders(fs.readFileSync(path.join(__dirname, '../../public/_headers'), 'utf8'));
const all = rules.get('/*') ?? new Map<string, string>();

describe('public/_headers security headers', () => {
  it('applies them to every path', () => {
    expect(rules.has('/*')).toBe(true);
  });

  it('enforces HTTPS for a year, limited to the sending host', () => {
    expect(all.get('strict-transport-security')).toBe('max-age=31536000');
  });

  it('sends a content security policy that hardens without restricting what the app loads', () => {
    const policy = directives(all.get('content-security-policy') ?? '');

    expect([...policy.keys()].sort()).toEqual(['base-uri', 'object-src', 'upgrade-insecure-requests']);
    expect(policy.get('base-uri')).toBe("'self'");
    // blob: is kept for the PDF previews rendered in an <embed> of a blob: URL.
    expect(policy.get('object-src')).toBe("'self' blob:");
    expect(policy.get('upgrade-insecure-requests')).toBe('');
  });

  it('switches off unused device and tracking features and leaves the used ones alone', () => {
    const features = new Map(
      (all.get('permissions-policy') ?? '')
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)
        .map((f) => f.split('=') as [string, string]),
    );

    expect([...features.keys()].sort()).toEqual(['bluetooth', 'browsing-topics', 'display-capture', 'midi', 'serial']);
    expect([...features.values()].every((allowlist) => allowlist === '()')).toBe(true);

    // KYC identification, hardware wallets, copy buttons and the KYC frame depend on these.
    for (const used of ['camera', 'microphone', 'hid', 'usb', 'clipboard-write', 'fullscreen']) {
      expect(features.has(used)).toBe(false);
    }
  });

  it('keeps the app embeddable on third-party sites', () => {
    for (const headers of rules.values()) {
      expect(headers.has('x-frame-options')).toBe(false);
      expect(directives(headers.get('content-security-policy') ?? '').has('frame-ancestors')).toBe(false);
    }
  });

  it('sets each security header in one rule only, so the edge never joins two values', () => {
    for (const name of ['strict-transport-security', 'content-security-policy', 'permissions-policy']) {
      expect([...rules.values()].filter((headers) => headers.has(name))).toHaveLength(1);
    }
  });
});
