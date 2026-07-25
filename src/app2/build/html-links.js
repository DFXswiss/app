// Pure helpers shared by the App2 build postprocessor and its regression tests.
// The CRA template is controlled input, but link/meta attributes may be reordered or use
// different quote styles. Parse each complete tag before making decisions about its name or
// value — never a naive string/regex replace keyed on one particular attribute order.

const LINK_TAG_PATTERN = /<link\b[^>]*>/gi;
const META_TAG_PATTERN = /<meta\b[^>]*>/gi;
const GOOGLE_FONTS_HOSTNAME = 'fonts.googleapis.com';

function attributeValue(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(
    new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i'),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function parseLinkTag(tag) {
  const rel = new Set(
    (attributeValue(tag, 'rel') ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  );
  return { href: attributeValue(tag, 'href'), rel };
}

function absoluteHttpUrl(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function isGoogleFontsLink(tag) {
  const url = absoluteHttpUrl(parseLinkTag(tag).href);
  return url?.hostname === GOOGLE_FONTS_HOSTNAME;
}

function removeSharedIdentityLinks(html) {
  return html.replace(LINK_TAG_PATTERN, (tag) => {
    const { rel } = parseLinkTag(tag);
    const isSharedIdentity = rel.has('icon') || rel.has('apple-touch-icon') || rel.has('manifest');
    return isSharedIdentity || isGoogleFontsLink(tag) ? '' : tag;
  });
}

function linkTags(html) {
  return html.match(LINK_TAG_PATTERN) ?? [];
}

function hasGoogleFontsLink(html) {
  return linkTags(html).some(isGoogleFontsLink);
}

function hasManifestJsonLink(html) {
  return linkTags(html).some((tag) => {
    const { href, rel } = parseLinkTag(tag);
    if (!rel.has('manifest') || !href) return false;
    try {
      return new URL(href, 'https://app.invalid/').pathname.endsWith('/manifest.json');
    } catch {
      return false;
    }
  });
}

function hasAbsoluteAppleTouchIcon(html) {
  return linkTags(html).some((tag) => {
    const { href, rel } = parseLinkTag(tag);
    return rel.has('apple-touch-icon') && absoluteHttpUrl(href) !== undefined;
  });
}

// ---------------------------------------------------------------------------
// <meta> identity — the shared public/index.html carries the main app's social-preview identity
// (twitter:*/alby:*; there is no og:* today, but it's covered too against a future addition)
// alongside the plain <meta name="description">. A link-preview unfurl (Slack/X/Telegram/Signal)
// reads the twitter:*/og:* tags, not the visible <title>, so replacing only <title> leaves every
// shared /app2 link unfurling as the *old* app.
// ---------------------------------------------------------------------------

const SHARED_IDENTITY_META_PREFIXES = ['twitter:', 'og:', 'alby:'];

function metaTags(html) {
  return html.match(META_TAG_PATTERN) ?? [];
}

function parseMetaTag(tag) {
  const name = (attributeValue(tag, 'name') ?? attributeValue(tag, 'property') ?? '').toLowerCase();
  return { name, content: attributeValue(tag, 'content') };
}

function isSharedIdentityMeta(tag) {
  const { name } = parseMetaTag(tag);
  return SHARED_IDENTITY_META_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Strips every inherited twitter:*, og:*, alby:* meta tag so the App2 postprocessor can inject
 * its own set from a clean slate, rather than editing the main app's tags in place. */
function removeSharedIdentityMeta(html) {
  return html.replace(META_TAG_PATTERN, (tag) => (isSharedIdentityMeta(tag) ? '' : tag));
}

function hasSharedIdentityMeta(html) {
  return metaTags(html).some(isSharedIdentityMeta);
}

/** Replaces the (first) `<title>` verbatim, throwing instead of silently no-op'ing if the CRA
 * template no longer has one in the shape this expects — a template change must fail the build,
 * not ship the old app's title. */
function replaceTitle(html, newTitle) {
  let matched = false;
  const result = html.replace(/<title>[\s\S]*?<\/title>/, () => {
    matched = true;
    return `<title>${newTitle}</title>`;
  });
  if (!matched) throw new Error('Failed to find the shared <title> tag to replace');
  return result;
}

/** Replaces the `<meta name="description">` tag's content, regardless of attribute order/quote
 * style, throwing if no such tag exists to replace. */
function replaceDescriptionMeta(html, newContent) {
  let matched = false;
  const result = html.replace(META_TAG_PATTERN, (tag) => {
    if (parseMetaTag(tag).name !== 'description') return tag;
    matched = true;
    return `<meta name="description" content="${newContent}"/>`;
  });
  if (!matched) throw new Error('Failed to find the shared <meta name="description"> tag to replace');
  return result;
}

// The main app's exact current values (public/index.html) — used only to fail the build closed
// if any of them are still present after the App2 postprocessor has run. Note the two copies of
// the "Buy & Sell" string in the real template differ by one space ("| Buy" vs "|Buy") — matched
// verbatim, not normalized, so a check here can't silently miss the actual bytes on disk.
const MAIN_APP_TITLE = 'DFX.swiss | Buy & Sell directly into your wallet';
const MAIN_APP_TWITTER_TITLE = 'DFX.swiss |Buy & Sell directly into your wallet';
const MAIN_APP_DESCRIPTION = 'Buy coins and tokens on a blockchain simply by using DFX services. Your keys, your coins.';
const MAIN_APP_TWITTER_IMAGE = 'https://dfx.swiss/images/app/dfx_services_twt-og-2.png';
const MAIN_APP_ALBY_NAME = 'DFX.swiss';

/** Fail-closed check: true if the main app's own title, description, or any twitter:* or alby:*
 * value is still present anywhere in the artifact's `<head>`. Checked by exact tag and value, not a
 * blanket "no twitter: tags at all" rule, because App2 is expected to ship its own twitter:* meta
 * tags (see postprocess-app2.js) — only the main app's specific values are ever wrong here. */
function hasMainAppIdentity(html) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);
  if (titleMatch?.[1] === MAIN_APP_TITLE) return true;

  return metaTags(html).some((tag) => {
    const { name, content } = parseMetaTag(tag);
    if (name === 'description' && content === MAIN_APP_DESCRIPTION) return true;
    if (name === 'twitter:title' && content === MAIN_APP_TWITTER_TITLE) return true;
    if (name === 'twitter:description' && content === MAIN_APP_DESCRIPTION) return true;
    if (name === 'twitter:image' && content === MAIN_APP_TWITTER_IMAGE) return true;
    if (name === 'alby:name' && content === MAIN_APP_ALBY_NAME) return true;
    return false;
  });
}

// ---------------------------------------------------------------------------
// Artifact root allow-list (R10) — the shared public/ payload is stripped by a hardcoded
// deny-list in postprocess-app2.js; this is the fail-closed counterpart: after every known build
// step has run, anything at the artifact root that isn't explicitly expected is treated as a
// silent leak (e.g. a file added to public/ later that the deny-list was never updated for) and
// fails the build instead of shipping.
// ---------------------------------------------------------------------------

/** Entries in `entries` that are neither in `knownEntries` nor match `isKnownPattern` (if given)
 * — e.g. CRA's content-hashed `*.wasm` module, whose exact filename varies by build. */
function findUnexpectedRootEntries(entries, knownEntries, isKnownPattern) {
  return entries.filter((entry) => !knownEntries.has(entry) && !(isKnownPattern && isKnownPattern(entry)));
}

module.exports = {
  findUnexpectedRootEntries,
  hasAbsoluteAppleTouchIcon,
  hasGoogleFontsLink,
  hasManifestJsonLink,
  hasMainAppIdentity,
  hasSharedIdentityMeta,
  removeSharedIdentityLinks,
  removeSharedIdentityMeta,
  replaceDescriptionMeta,
  replaceTitle,
  MAIN_APP_ALBY_NAME,
  MAIN_APP_DESCRIPTION,
  MAIN_APP_TITLE,
  MAIN_APP_TWITTER_IMAGE,
  MAIN_APP_TWITTER_TITLE,
};
