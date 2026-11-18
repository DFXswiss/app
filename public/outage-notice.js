/**
 * Shows the outage notice in public/index.html only if the visitor's clock is before the end of the
 * announced outage when the page loads; loaded at or after the end, nothing is shown and no timer or
 * listener is registered. While it is shown, a timer hides it at the end instant in a tab that stays
 * open, and because browsers pause or stretch timers while a page is frozen or the device sleeps, the
 * wall clock is re-checked whenever the page becomes visible (visibilitychange) or is shown again
 * (pageshow, e.g. restored from the back/forward cache). Every re-check before the end, and a timer
 * that fires early, replaces the pending timer with one for the remaining time, so at most one timer
 * is pending. Removing the notice therefore needs no second deployment.
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

  // The single pending timer while the notice is shown, null otherwise.
  var timer = null;

  function scheduleTimer(now) {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(onTimer, OUTAGE_NOTICE_END.getTime() - now.getTime());
  }

  // Re-evaluates the wall clock. While the outage is still active, it replaces the pending timer with
  // one for the remaining time, so a timer delayed by sleep or a frozen tab (or one that fired early)
  // is corrected. Once it is over, it hides the notice and removes the timer and both listeners.
  function syncNotice() {
    var now = new Date();
    if (isOutageNoticeActive(now)) {
      scheduleTimer(now);
      return;
    }

    notice.setAttribute('hidden', '');
    document.removeEventListener('visibilitychange', syncNotice);
    window.removeEventListener('pageshow', syncNotice);
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function onTimer() {
    timer = null;
    syncNotice();
  }

  var loadedAt = new Date();
  if (isOutageNoticeActive(loadedAt)) {
    notice.removeAttribute('hidden');
    // The app is a single-page app, so a tab opened before the end can stay open past it.
    scheduleTimer(loadedAt);
    // Timers do not run while the page is frozen or the device sleeps; re-check on wake-up/return.
    document.addEventListener('visibilitychange', syncNotice);
    window.addEventListener('pageshow', syncNotice);
  }
})();
