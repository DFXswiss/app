'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test, after } = require('node:test');

const { checkParity } = require('./check-parity.js');

const SCRIPT = path.join(__dirname, 'check-parity.js');
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'handbook-parity-'));

after(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

function writeFixture(name, files) {
  const root = path.join(TMP_ROOT, name);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return {
    e2eDir: path.join(root, 'e2e'),
    metadataPath: path.join(root, 'metadata.json'),
    root,
  };
}

const SCREENSHOT_SPEC = `
const { test, expect } = require('@playwright/test');
test('shot', async ({ page }) => {
  await expect(page).toHaveScreenshot('page.png');
});
`;

const PLAIN_SPEC = `
const { test } = require('@playwright/test');
test('no shot', async ({ page }) => {
  await page.goto('/');
});
`;

function runCli(fixture) {
  return spawnSync(process.execPath, [SCRIPT, '--e2e-dir', fixture.e2eDir, '--metadata', fixture.metadataPath], {
    encoding: 'utf8',
  });
}

test('(a) spec plus matching metadata key passes', () => {
  const fixture = writeFixture('a-pass', {
    'e2e/buy-process.spec.ts': SCREENSHOT_SPEC,
    'metadata.json': JSON.stringify({ 'buy-process': { title: 'Buy' } }),
  });
  const result = checkParity(fixture);
  assert.equal(result.ok, true);
  assert.equal(result.vacuous, false);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.orphans, []);
  assert.equal(runCli(fixture).status, 0);
});

test('(b) screenshot spec without metadata key fails and names the file', () => {
  const fixture = writeFixture('b-missing', {
    'e2e/new-screen.spec.ts': SCREENSHOT_SPEC,
    'metadata.json': JSON.stringify({}),
  });
  const result = checkParity(fixture);
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('new-screen.spec.ts'));
  assert.match(result.report, /new-screen\.spec\.ts/);
  const cli = runCli(fixture);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /new-screen\.spec\.ts/);
});

test('(c) metadata key without a matching spec file fails as an orphan', () => {
  const fixture = writeFixture('c-orphan', {
    'e2e/buy-process.spec.ts': SCREENSHOT_SPEC,
    'metadata.json': JSON.stringify({
      'buy-process': { title: 'Buy' },
      buy: { title: 'orphan substring' },
    }),
  });
  const result = checkParity(fixture);
  assert.equal(result.ok, false);
  assert.ok(result.orphans.includes('buy'));
  assert.match(result.report, /"buy"/);
  const cli = runCli(fixture);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /"buy"/);
});

test('(d) spec without toHaveScreenshot and without a key passes', () => {
  const fixture = writeFixture('d-plain', {
    'e2e/check-console.spec.ts': PLAIN_SPEC,
    'metadata.json': JSON.stringify({}),
  });
  const result = checkParity(fixture);
  assert.equal(result.ok, true);
  assert.deepEqual(result.screenshotSpecs, []);
  assert.equal(runCli(fixture).status, 0);
});

test('(e) empty e2e directory fails instead of passing vacuously', () => {
  const fixture = writeFixture('e-empty', {
    'e2e/.keep': '',
    'metadata.json': JSON.stringify({}),
  });
  fs.unlinkSync(path.join(fixture.e2eDir, '.keep'));
  const result = checkParity(fixture);
  assert.equal(result.ok, false);
  assert.equal(result.vacuous, true);
  assert.match(result.report, /empty input set/);
  const cli = runCli(fixture);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /empty input set/);
});

test('(f) reserved docs key is documentation metadata, not an orphan spec key', () => {
  const fixture = writeFixture('f-docs', {
    'e2e/buy-process.spec.ts': SCREENSHOT_SPEC,
    'metadata.json': JSON.stringify({
      'buy-process': { title: 'Buy' },
      docs: { 'README.md': { title: 'Readme' } },
    }),
  });
  const result = checkParity(fixture);
  assert.equal(result.ok, true);
  assert.ok(result.metadataKeys.includes('docs'));
  assert.ok(!result.orphans.includes('docs'));
  assert.equal(runCli(fixture).status, 0);
});

test('(f2) reserved docs key does not satisfy a screenshot spec that has no key', () => {
  const fixture = writeFixture('f-docs-not-a-cover', {
    'e2e/new-screen.spec.ts': SCREENSHOT_SPEC,
    'metadata.json': JSON.stringify({
      docs: { 'README.md': { title: 'Readme' } },
    }),
  });
  const result = checkParity(fixture);
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('new-screen.spec.ts'));
  assert.ok(!result.orphans.includes('docs'));
});

test('(g) historical alias maps a metadata key onto a differently named spec', () => {
  const fixture = writeFixture('g-alias', {
    'e2e/swap-bitcoin-to-lightning.spec.ts': SCREENSHOT_SPEC,
    'metadata.json': JSON.stringify({
      'swap-btc-to-ln': { title: 'Swap BTC to LN' },
    }),
  });
  const result = checkParity(fixture);
  assert.equal(result.ok, true, result.report);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.orphans, []);
  assert.ok(result.screenshotSpecs.includes('swap-bitcoin-to-lightning.spec.ts'));
  assert.equal(runCli(fixture).status, 0);
});

test('(h) sell-complete is the one confirmed extra spec path, not a synpress glob', () => {
  const fixture = writeFixture('h-extra', {
    'e2e/buy-process.spec.ts': PLAIN_SPEC,
    'e2e/synpress/sell-complete.spec.ts': SCREENSHOT_SPEC,
    'e2e/synpress/other.spec.ts': SCREENSHOT_SPEC,
    'metadata.json': JSON.stringify({
      'sell-complete': { title: 'Sell complete' },
    }),
  });
  const result = checkParity(fixture);
  assert.equal(result.ok, true, result.report);
  assert.ok(result.extraSpecs.includes('synpress/sell-complete.spec.ts'));
  assert.ok(!result.extraSpecs.includes('synpress/other.spec.ts'));
  assert.ok(!result.screenshotSpecs.includes('synpress/other.spec.ts'));
  assert.equal(runCli(fixture).status, 0);
});
