'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { targetIdFromLocation, findTarget, revealTarget } = require('./deep-link.js');

test('prefers ?shot= over the hash (Basic Auth drops fragments)', () => {
  assert.equal(
    targetIdFromLocation({
      search: '?shot=shot-compliance-call-queue-outcome-spec-ts-compliance-call-queue-outcome-signature-chromium-darwin',
      hash: '#group-buy-process',
    }),
    'shot-compliance-call-queue-outcome-spec-ts-compliance-call-queue-outcome-signature-chromium-darwin',
  );
});

test('accepts ?group= and a leftover hash', () => {
  assert.equal(targetIdFromLocation({ search: '?group=group-compliance-call-queue-outcome', hash: '' }), 'group-compliance-call-queue-outcome');
  assert.equal(targetIdFromLocation({ search: '', hash: '#shot-abc' }), 'shot-abc');
  assert.equal(targetIdFromLocation({ search: '', hash: '' }), '');
});

test('findTarget tries shot- and group- prefixes', () => {
  const doc = {
    getElementById(id) {
      if (id === 'shot-abc') return { id };
      if (id === 'group-foo') return { id };
      return null;
    },
  };
  assert.equal(findTarget(doc, 'abc').id, 'shot-abc');
  assert.equal(findTarget(doc, 'group-foo').id, 'group-foo');
  assert.equal(findTarget(doc, 'missing'), null);
});

test('revealTarget closes other groups and opens the match', () => {
  const other = { open: true, id: 'group-other' };
  const group = { open: false, id: 'group-hit', tagName: 'DETAILS' };
  const shot = {
    id: 'shot-hit',
    tagName: 'DIV',
    classList: { added: [], add(c) { this.added.push(c); } },
    closest(sel) {
      return sel === 'details.spec' ? group : null;
    },
    scrollIntoView() {
      this.scrolled = true;
    },
  };
  const doc = {
    getElementById(id) {
      if (id === 'shot-hit') return shot;
      return null;
    },
    querySelectorAll() {
      return [other, group];
    },
  };
  const found = revealTarget(doc, { search: '?shot=shot-hit', hash: '' });
  assert.equal(found, shot);
  assert.equal(other.open, false);
  assert.equal(group.open, true);
  assert.equal(shot.scrolled, true);
  assert.deepEqual(shot.classList.added, ['handbook-target']);
});
