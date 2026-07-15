import {
  hasAbsoluteAppleTouchIcon,
  hasGoogleFontsLink,
  hasManifestJsonLink,
  removeSharedIdentityLinks,
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
