'use strict';

/**
 * Handbook deep-link helper. Inlined into index.html by build.js.
 * Query params survive HTTP Basic Auth; location.hash often does not.
 *
 *   ?shot=<element-id>   — isolate and scroll to one screenshot card
 *   ?group=<element-id>  — isolate and open one screenshot group
 *   #element-id          — same, if the fragment is still present
 */

function targetIdFromLocation(loc) {
  if (!loc) return '';
  var search = loc.search || '';
  if (typeof URLSearchParams === 'function') {
    var raw = search.charAt(0) === '?' ? search.slice(1) : search;
    var params = new URLSearchParams(raw);
    var q = params.get('shot') || params.get('group');
    if (q) return q;
  }
  var hash = loc.hash || '';
  if (!hash) return '';
  var h = hash.charAt(0) === '#' ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(h);
  } catch (e) {
    return h;
  }
}

function findTarget(doc, id) {
  if (!id || !doc || typeof doc.getElementById !== 'function') return null;
  return doc.getElementById(id) || doc.getElementById('shot-' + id) || doc.getElementById('group-' + id);
}

function revealTarget(doc, loc) {
  var id = targetIdFromLocation(loc);
  if (!id) return null;
  var el = findTarget(doc, id);
  if (!el) return null;
  var list = doc.querySelectorAll ? doc.querySelectorAll('details.spec') : [];
  for (var i = 0; i < list.length; i++) list[i].open = false;
  var details = el.closest ? el.closest('details.spec') : null;
  if (!details && el.tagName === 'DETAILS') details = el;
  if (details) details.open = true;
  var prev = doc.querySelectorAll ? doc.querySelectorAll('.handbook-target') : [];
  for (var j = 0; j < prev.length; j++) {
    if (prev[j].classList && typeof prev[j].classList.remove === 'function') {
      prev[j].classList.remove('handbook-target');
    }
  }
  if (el.classList && typeof el.classList.add === 'function') el.classList.add('handbook-target');
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  return el;
}

var handbookDeepLink = {
  targetIdFromLocation: targetIdFromLocation,
  findTarget: findTarget,
  revealTarget: revealTarget,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = handbookDeepLink;
}
if (typeof globalThis !== 'undefined') {
  globalThis.handbookDeepLink = handbookDeepLink;
}
