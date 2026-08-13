#!/usr/bin/env node
/**
 * Handbook coverage: every screenshot spec under e2e/*.spec.ts must have a
 * metadata.json key equal to its file name without .spec.ts, and every
 * spec-metadata key must name an existing spec file.
 *
 * Screenshot spec = top-level e2e/*.spec.ts whose contents call
 * toHaveScreenshot(. Nested trees (helpers/, synpress/, wallet-setup/)
 * and non-.spec.ts files are ignored, except the one confirmed extra
 * path in EXTRA_SPEC_REL_PATHS.
 *
 * metadata.json has two kinds of top-level keys (same split as build.js):
 *   - spec/screenshot-group metadata (title + description)
 *   - "docs": markdown title overrides, not a spec name
 *
 * Usage:
 *   node scripts/handbook/check-parity.js
 *   node scripts/handbook/check-parity.js --e2e-dir <dir> --metadata <file>
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCREENSHOT_CALL = 'toHaveScreenshot(';
const SPEC_SUFFIX = '.spec.ts';

// Same reserved key as scripts/handbook/build.js (orphan loop ~667):
//   if (key === 'docs') continue;
// build.js reads metadata.docs as path → { title } overrides for markdown
// ("Optional title overrides via metadata.json → docs[relSrc].title").
// That is documentation metadata, not a screenshot-group / spec-metadata
// entry, so it must not be required to name an e2e/*.spec.ts file.
const DOCS_METADATA_KEY = 'docs';

// Historical screenshot-group keys whose names are not the spec file.
// Each mapping was confirmed against spec contents and the metadata
// description — not inferred from the key string alone.
const ALIAS_MAP = {
  // debug-session-switch.spec.ts writes
  // e2e/screenshots/bug-session-1-account1.png and
  // bug-session-2-account2.png; metadata describes the session/account
  // switch. Key is the screenshot prefix, not the spec file name.
  'bug-session': 'debug-session-switch',
  // subpages-test.spec.ts writes e2e/screenshots/subpage-{name}.png for
  // Buy/Sell/Swap/Transactions (and Account/Settings); metadata describes
  // those subpages. Key is the screenshot prefix.
  'subpage': 'subpages-test',
  // swap-bitcoin-to-lightning.spec.ts writes
  // baseline/swap-btc-to-ln-01-loaded.png and -02-complete.png;
  // metadata: "Swap von Bitcoin zu Lightning (geladen und abgeschlossen)."
  'swap-btc-to-ln': 'swap-bitcoin-to-lightning',
  // swap-lightning-to-bitcoin.spec.ts writes
  // baseline/swap-ln-to-btc-01-loaded.png and -02-complete.png;
  // metadata: "Swap von Lightning zu Bitcoin."
  'swap-ln-to-btc': 'swap-lightning-to-bitcoin',
};

// Confirmed non-top-level screenshot spec. metadata "sell-complete"
// describes the MetaMask end-to-end sell in this file (toHaveScreenshot of
// sell page, amount, tx, etherscan for two wallets). Only this file — not
// a recursive scan of e2e/synpress/.
const EXTRA_SPEC_REL_PATHS = ['synpress/sell-complete.spec.ts'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--e2e-dir' || arg === '--metadata') {
      const value = argv[i + 1];
      if (value === undefined) {
        fail(arg + ' requires a path argument');
      }
      if (arg === '--e2e-dir') {
        out.e2eDir = value;
      } else {
        out.metadataPath = value;
      }
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else {
      fail('Unknown argument: ' + arg);
    }
  }
  return out;
}

function specKey(fileName) {
  return path.basename(fileName).slice(0, -SPEC_SUFFIX.length);
}

function listTopLevelSpecs(e2eDir) {
  if (!fs.existsSync(e2eDir) || !fs.statSync(e2eDir).isDirectory()) {
    return [];
  }
  return fs
    .readdirSync(e2eDir)
    .filter((name) => name.endsWith(SPEC_SUFFIX))
    .filter((name) => fs.statSync(path.join(e2eDir, name)).isFile())
    .sort();
}

function listKnownExtraSpecs(e2eDir) {
  return EXTRA_SPEC_REL_PATHS.filter((rel) => {
    const full = path.join(e2eDir, rel);
    return fs.existsSync(full) && fs.statSync(full).isFile();
  });
}

function loadMetadata(metadataPath) {
  if (!fs.existsSync(metadataPath)) {
    throw new Error('metadata.json not found: ' + metadataPath);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (err) {
    throw new Error(
      'metadata.json is not valid JSON (' +
        metadataPath +
        '): ' +
        (err && err.message ? err.message : String(err)),
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('metadata.json must be a JSON object: ' + metadataPath);
  }
  return parsed;
}

function keysMatch(specName, metadataKey) {
  if (specName === metadataKey) {
    return true;
  }
  return ALIAS_MAP[metadataKey] === specName;
}

function formatReport(result) {
  const lines = [
    'Handbook spec ↔ metadata parity',
    '',
    'Top-level specs: ' + result.topLevelSpecs.length,
    'Extra specs: ' + result.extraSpecs.length,
    'Screenshot specs that call toHaveScreenshot(: ' + result.screenshotSpecs.length,
    'Metadata keys: ' + result.metadataKeys.length,
  ];

  if (result.vacuous) {
    lines.push('', result.message);
    return lines.join('\n');
  }

  if (result.missing.length) {
    lines.push('', 'Screenshot specs missing a metadata key:');
    for (const fileName of result.missing) {
      lines.push('  - e2e/' + fileName + '  (expected key "' + specKey(fileName) + '")');
    }
  }

  if (result.orphans.length) {
    lines.push('', 'Metadata keys without a matching e2e/<key>.spec.ts:');
    for (const key of result.orphans) {
      lines.push('  - "' + key + '"');
    }
  }

  if (result.ok) {
    lines.push('', 'PASS');
  } else {
    lines.push('', 'FAIL');
  }
  return lines.join('\n');
}

function checkParity({ e2eDir, metadataPath }) {
  if (!e2eDir) {
    throw new Error('e2eDir is required');
  }
  if (!metadataPath) {
    throw new Error('metadataPath is required');
  }

  const topLevelSpecs = listTopLevelSpecs(e2eDir);
  if (topLevelSpecs.length === 0) {
    const result = {
      ok: false,
      vacuous: true,
      topLevelSpecs,
      extraSpecs: [],
      specFiles: [],
      screenshotSpecs: [],
      metadataKeys: [],
      missing: [],
      orphans: [],
      message:
        'No e2e/*.spec.ts files found — refusing to pass on an empty input set.',
    };
    result.report = formatReport(result);
    return result;
  }

  const extraSpecs = listKnownExtraSpecs(e2eDir);
  const specFiles = topLevelSpecs.concat(extraSpecs);
  const metadata = loadMetadata(metadataPath);
  const metadataKeys = Object.keys(metadata).sort();
  const specNameByFile = new Map(specFiles.map((fileName) => [fileName, specKey(fileName)]));
  const specNames = new Set(specNameByFile.values());

  const screenshotSpecs = specFiles.filter((fileName) => {
    const contents = fs.readFileSync(path.join(e2eDir, fileName), 'utf8');
    return contents.includes(SCREENSHOT_CALL);
  });

  const missing = screenshotSpecs.filter((fileName) => {
    const name = specNameByFile.get(fileName);
    return !metadataKeys.some((key) => keysMatch(name, key));
  });

  const orphans = metadataKeys.filter((key) => {
    if (key === DOCS_METADATA_KEY) {
      return false;
    }
    return !Array.from(specNames).some((name) => keysMatch(name, key));
  });

  const result = {
    ok: missing.length === 0 && orphans.length === 0,
    vacuous: false,
    topLevelSpecs,
    extraSpecs,
    specFiles,
    screenshotSpecs,
    metadataKeys,
    missing,
    orphans,
    message: '',
  };
  result.report = formatReport(result);
  return result;
}

function defaultPaths() {
  const repoRoot = process.env.HANDBOOK_REPO_ROOT || path.resolve(__dirname, '..', '..');
  return {
    e2eDir: path.join(repoRoot, 'e2e'),
    metadataPath: path.join(repoRoot, 'scripts', 'handbook', 'metadata.json'),
  };
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(
      'Usage: node scripts/handbook/check-parity.js [--e2e-dir <dir>] [--metadata <file>]',
    );
    return 0;
  }
  const defaults = defaultPaths();
  let result;
  try {
    result = checkParity({
      e2eDir: args.e2eDir || defaults.e2eDir,
      metadataPath: args.metadataPath || defaults.metadataPath,
    });
  } catch (err) {
    fail(err && err.message ? err.message : String(err));
  }
  if (result.ok) {
    console.log(result.report);
    return 0;
  }
  console.error(result.report);
  return 1;
}

module.exports = {
  checkParity,
  formatReport,
  keysMatch,
  specKey,
  ALIAS_MAP,
  DOCS_METADATA_KEY,
  EXTRA_SPEC_REL_PATHS,
  main,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
