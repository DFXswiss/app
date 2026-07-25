import {
  findUnexpectedRootEntries,
  hasAbsoluteAppleTouchIcon,
  hasGoogleFontsLink,
  hasManifestJsonLink,
  hasMainAppIdentity,
  removeSharedIdentityLinks,
  removeSharedIdentityMeta,
  replaceDescriptionMeta,
  replaceTitle,
  MAIN_APP_ALBY_NAME,
  MAIN_APP_DESCRIPTION,
  MAIN_APP_TITLE,
  MAIN_APP_TWITTER_IMAGE,
  MAIN_APP_TWITTER_TITLE,
} from '../build/html-links';

describe('App2 postprocess link handling', () => {
  it('removes shared identity and Google Fonts links regardless of attribute order or quoting', () => {
    const html = [
      '<link href="/manifest.json" crossorigin rel="manifest">',
      "<link sizes='180x180' href='https://app.dfx.swiss/apple-touch-icon.png' rel='apple-touch-icon'>",
      '<link href=/favicon.ico rel="shortcut icon">',
      '<link crossorigin href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">',
      '<link href="/keep.css" rel="stylesheet">',
    ].join('');

    const result = removeSharedIdentityLinks(html);

    expect(result).toBe('<link href="/keep.css" rel="stylesheet">');
  });

  it('matches the normalized Google Fonts hostname instead of arbitrary URL substrings', () => {
    expect(hasGoogleFontsLink('<link href="https://FONTS.GOOGLEAPIS.COM:443/css2" rel="stylesheet">')).toBe(true);
    expect(
      hasGoogleFontsLink(
        '<link data-href="https://fonts.googleapis.com/css2" href="/local.css" data-rel="stylesheet">',
      ),
    ).toBe(false);

    const adversarialUrls = [
      'https://evil.example/fonts.googleapis.com/css2',
      'https://evil.example/?next=fonts.googleapis.com',
      'https://fonts.googleapis.com@evil.example/css2',
      'https://evilfonts.googleapis.com/css2',
      'https://fonts.googleapis.com.evil.example/css2',
      '/fonts.googleapis.com/css2',
      'not a URL: fonts.googleapis.com',
    ];
    adversarialUrls.forEach((href) => {
      expect(hasGoogleFontsLink(`<link rel="stylesheet" href="${href}">`)).toBe(false);
    });
  });

  it('detects only the stale manifest and absolute apple-touch identity links', () => {
    expect(hasManifestJsonLink('<link href="/manifest.json?rev=1" rel="manifest">')).toBe(true);
    expect(hasManifestJsonLink('<link rel="manifest" href="./manifest.webmanifest">')).toBe(false);
    expect(hasAbsoluteAppleTouchIcon('<link href="https://app.dfx.swiss/apple.png" rel="apple-touch-icon">')).toBe(
      true,
    );
    expect(hasAbsoluteAppleTouchIcon('<link rel="apple-touch-icon" href="./apple.png">')).toBe(false);
  });
});

// R9: a link-preview unfurl (Slack/X/Telegram/Signal) reads twitter:*/og:* meta tags, not the
// visible <title> — the main app's inherited social-preview identity in the shared
// public/index.html was never stripped, so every shared /app2 link unfurled as the *old* app.
describe('App2 postprocess social-identity handling', () => {
  it('strips every twitter:*/og:*/alby:* meta tag regardless of attribute order or quoting, leaving unrelated meta tags untouched', () => {
    const html = [
      '<meta name="twitter:card" content="summary_large_image">',
      "<meta content='@dfx_swiss' name='twitter:site'>", // reversed attribute order
      '<meta name=twitter:title content=unquoted>', // unquoted attribute value
      '<meta property="og:title" content="Should also be stripped">', // og:* via `property`, not `name`
      '<meta name="alby:name" content="DFX.swiss">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">', // must survive
      '<meta name="description" content="keep me — handled by replaceDescriptionMeta, not this">',
    ].join('');

    const result = removeSharedIdentityMeta(html);

    expect(result).toContain('name="viewport"');
    expect(result).toContain('name="description"');
    expect(result).not.toMatch(/twitter:|og:title|alby:name/);
  });

  it('replaces the description meta tag regardless of attribute order/quoting, and throws if none is found', () => {
    const reordered = '<meta content="old copy" name="description">';
    expect(replaceDescriptionMeta(reordered, 'new copy')).toBe('<meta name="description" content="new copy"/>');

    const singleQuoted = "<meta name='description' content='old copy'>";
    expect(replaceDescriptionMeta(singleQuoted, 'new copy')).toBe('<meta name="description" content="new copy"/>');

    // No description tag at all — a template change must fail the build loudly, not ship stale
    // (or blank) copy silently.
    expect(() => replaceDescriptionMeta('<meta name="viewport" content="width=device-width">', 'new copy')).toThrow();
  });

  it('replaces <title> and throws if the template has none to replace', () => {
    expect(replaceTitle('<title>Old Title</title>', 'New Title')).toBe('<title>New Title</title>');
    expect(() => replaceTitle('<meta name="viewport" content="width=device-width">', 'New Title')).toThrow();
  });

  it('flags the main app\'s exact title/description/twitter/alby values individually, not a blanket "any twitter tag" rule', () => {
    // Each main-app marker on its own must be caught...
    expect(hasMainAppIdentity(`<title>${MAIN_APP_TITLE}</title>`)).toBe(true);
    expect(hasMainAppIdentity(`<meta name="description" content="${MAIN_APP_DESCRIPTION}">`)).toBe(true);
    expect(hasMainAppIdentity(`<meta name="twitter:title" content="${MAIN_APP_TWITTER_TITLE}">`)).toBe(true);
    expect(hasMainAppIdentity(`<meta name="twitter:description" content="${MAIN_APP_DESCRIPTION}">`)).toBe(true);
    expect(hasMainAppIdentity(`<meta name="twitter:image" content="${MAIN_APP_TWITTER_IMAGE}">`)).toBe(true);
    expect(hasMainAppIdentity(`<meta name="alby:name" content="${MAIN_APP_ALBY_NAME}">`)).toBe(true);

    // ...but App2's own twitter:* tags (a different value under the same tag name) must not
    // trip the check — App2 is expected to ship its own twitter:* meta tags.
    expect(
      hasMainAppIdentity(
        [
          '<title>DFX — Buy crypto directly into your wallet</title>',
          '<meta name="description" content="Buy, sell and swap crypto directly with your own wallet.">',
          '<meta name="twitter:title" content="DFX — Buy crypto directly into your wallet">',
          '<meta name="twitter:description" content="Buy, sell and swap crypto directly with your own wallet.">',
          '<meta name="alby:name" content="DFX">',
        ].join(''),
      ),
    ).toBe(false);
  });

  it("is red against the pre-fix pipeline: only replacing <title> leaves the main app's social-preview identity behind", () => {
    // Reproduces exactly what the pre-fix postprocessor did: replace <title> only, never touch
    // twitter:*/alby:*. hasMainAppIdentity must still catch the leftover identity.
    const html = [
      `<title>${MAIN_APP_TITLE}</title>`,
      `<meta name="description" content="${MAIN_APP_DESCRIPTION}">`,
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:title" content="${MAIN_APP_TWITTER_TITLE}">`,
      `<meta name="twitter:description" content="${MAIN_APP_DESCRIPTION}">`,
      `<meta name="twitter:image" content="${MAIN_APP_TWITTER_IMAGE}">`,
      `<meta name="alby:name" content="${MAIN_APP_ALBY_NAME}">`,
    ].join('');
    const titleOnlyReplaced = replaceTitle(html, 'DFX — Buy crypto directly into your wallet');

    expect(hasMainAppIdentity(titleOnlyReplaced)).toBe(true);
  });
});

// R10: the shared public/ strip in postprocess-app2.js is a hardcoded deny-list — a file added
// to public/ later would ride along into the App2 artifact unnoticed. findUnexpectedRootEntries
// is the fail-closed counterpart: an allow-list that must be updated deliberately.
describe('App2 postprocess artifact-root allow-list', () => {
  it('flags anything at the artifact root that is not explicitly known or a content-hashed wasm module', () => {
    const known = new Set(['index.html', 'static', 'favicon.svg']);
    const isWasm = (entry: string) => /\.wasm$/i.test(entry);

    expect(findUnexpectedRootEntries(['index.html', 'static', 'favicon.svg'], known, isWasm)).toEqual([]);
    expect(findUnexpectedRootEntries(['index.html', 'abc123.module.wasm'], known, isWasm)).toEqual([]);

    // A file silently added to the shared public/ later (e.g. the main app's logo.png) must be
    // caught, not ride along with a green build.
    expect(findUnexpectedRootEntries(['index.html', 'logo.png'], known, isWasm)).toEqual(['logo.png']);
  });

  it('works without a pattern predicate too (every entry must be explicitly known)', () => {
    const known = new Set(['index.html']);
    expect(findUnexpectedRootEntries(['index.html', 'stray.txt'], known)).toEqual(['stray.txt']);
  });
});
