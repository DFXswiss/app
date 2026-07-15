// Pure helpers shared by the App2 build postprocessor and its regression tests.
// The CRA template is controlled input, but link attributes may be reordered or use different
// quote styles. Parse each complete link tag before making decisions about rel or URL values.

const LINK_TAG_PATTERN = /<link\b[^>]*>/gi;
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

module.exports = {
  hasAbsoluteAppleTouchIcon,
  hasGoogleFontsLink,
  hasManifestJsonLink,
  removeSharedIdentityLinks,
};
