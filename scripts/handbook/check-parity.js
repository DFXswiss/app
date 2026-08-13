#!/usr/bin/env node
/**
 * Handbook coverage: every screenshot spec under e2e/*.spec.ts must have a
 * metadata.json key equal to its file name without .spec.ts, and every
 * metadata key must name an existing top-level spec file.
 *
 * Screenshot spec = top-level e2e/*.spec.ts whose contents call
 * toHaveScreenshot(. Nested trees (helpers/, synpress/, wallet-setup/)
 * and non-.spec.ts files are ignored.
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
  return fileName.slice(0, -SPEC_SUFFIX.length);
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
  return specName === metadataKey;
}

function formatReport(result) {
  const lines = [
    'Handbook spec ↔ metadata parity',
    '',
    'Top-level specs: ' + result.specFiles.length,
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

  const specFiles = listTopLevelSpecs(e2eDir);
  if (specFiles.length === 0) {
    const result = {
      ok: false,
      vacuous: true,
      specFiles,
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

  const orphans = metadataKeys.filter(
    (key) => !Array.from(specNames).some((name) => keysMatch(name, key)),
  );

  const result = {
    ok: missing.length === 0 && orphans.length === 0,
    vacuous: false,
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
  main,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
