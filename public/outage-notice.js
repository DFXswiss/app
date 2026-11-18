/**
 * Shows the outage notice in public/index.html only if the visitor's clock is before the end of the
 * announced outage when the page loads, and hides it again at the end instant in a tab that stays
 * open, so removing it needs no second deployment.
 *
 * Deliberately a plain ES5 script without dependencies, loaded by its own <script> tag outside the
 * React root: it must run while the static loader is still on screen and must not depend on the app
 * bundle, the API or any app state.
 */
(function () {
  'use strict';

  // End of the outage: 18 November 2026, 12:00 CET (UTC+1).
  var OUTAGE_NOTICE_END = new Date('2026-11-18T12:00:00+01:00');

  function isOutageNoticeActive(now) {
    if (Object.prototype.toString.call(now) !== '[object Date]' || isNaN(now.getTime())) {
      throw new TypeError('Outage notice: isOutageNoticeActive expects a valid Date');
    }

    return now.getTime() < OUTAGE_NOTICE_END.getTime();
  }

  window.isOutageNoticeActive = isOutageNoticeActive;

  var notice = document.getElementById('outage-notice');
  if (!notice) {
    throw new Error('Outage notice: element #outage-notice is missing');
  }

  var now = new Date();
  if (isOutageNoticeActive(now)) {
    notice.removeAttribute('hidden');
    // The app is a single-page app, so a tab opened before the end can stay open past it.
    setTimeout(function () {
      notice.setAttribute('hidden', '');
    }, OUTAGE_NOTICE_END.getTime() - now.getTime());
  }
})();
