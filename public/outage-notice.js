/**
 * Two independent parts in public/index.html:
 *
 * Bar (#outage-notice): the time-limited outage notice. It is shown only if the visitor's clock is
 * before the end of the announced outage when the page loads; loaded at or after the end, the bar
 * stays hidden and no timer, visibilitychange or pageshow listener is registered. While it is shown,
 * a timer hides it at the end instant in a tab that stays open, and because browsers pause or
 * stretch timers while a page is frozen or the device sleeps, the wall clock is re-checked whenever
 * the page becomes visible (visibilitychange) or is shown again (pageshow, e.g. restored from the
 * back/forward cache). Every re-check before the end, and a timer that fires early, replaces the
 * pending timer with one for the remaining time, so at most one timer is pending. Removing the bar
 * therefore needs no second deployment. While the bar is shown, body carries the class
 * has-outage-notice (see the style block in index.html), so #root takes only the height left below
 * the bar; it is removed again together with the bar.
 *
 * Popup (#outage-popup): the security notice. It applies until further notice, so it is not tied to
 * the end of the outage: it is shown on every load of the page, before and after that instant, until
 * a later deployment removes it. The dialog box itself (tabindex="-1") is focused without scrolling
 * and its own scroll position is reset to the top, so it always opens at its heading and warning, also
 * on small screens where the box scrolls inside; focusing the Mehr Infos button at the end of the long
 * text would make the browser scroll the box to its bottom. The visitor closes it with the close
 * button in the box, a click on the backdrop itself or Escape. Closing hides the popup and removes
 * its listeners; it comes back on the next page load. Nothing is stored. The expiry of the bar never
 * touches it.
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

  var popup = document.getElementById('outage-popup');
  if (!popup) {
    throw new Error('Outage notice: element #outage-popup is missing');
  }

  var popupDialog = popup.querySelector('.outage-popup__dialog');
  if (!popupDialog) {
    throw new Error('Outage notice: dialog box .outage-popup__dialog in #outage-popup is missing');
  }

  var popupCloseButton = popup.querySelector('.outage-popup__close');
  if (!popupCloseButton) {
    throw new Error('Outage notice: button .outage-popup__close in #outage-popup is missing');
  }

  // Class on body while the bar is shown; makes body a flex column so #root fills the rest.
  var BODY_CLASS = 'has-outage-notice';

  // The single pending timer while the bar is shown, null otherwise.
  var timer = null;

  // --- Popup: security notice, shown on every load until removed by a deployment ---

  // Hides the popup and removes both of its listeners. Safe to call more than once: removing a
  // listener that is no longer registered does nothing.
  function closePopup() {
    popup.setAttribute('hidden', '');
    popup.removeEventListener('click', onPopupClick);
    document.removeEventListener('keydown', onPopupKeydown);
  }

  // One click listener for the whole popup: the close button closes it, and so does a click on the
  // backdrop itself. A click anywhere inside the dialog box other than the close button does not,
  // so the Mehr Infos link navigates normally.
  function onPopupClick(event) {
    if (event.target === popup || popupCloseButton.contains(event.target)) {
      closePopup();
    }
  }

  function onPopupKeydown(event) {
    if (event.key === 'Escape') {
      closePopup();
    }
  }

  // --- Bar: time-limited outage notice ---

  function scheduleTimer(now) {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(onTimer, OUTAGE_NOTICE_END.getTime() - now.getTime());
  }

  // Re-evaluates the wall clock. While the outage is still active, it replaces the pending timer with
  // one for the remaining time, so a timer delayed by sleep or a frozen tab (or one that fired early)
  // is corrected. Once it is over, it hides the bar and removes the timer and the bar's listeners.
  // The popup is not touched here.
  function syncNotice() {
    var now = new Date();
    if (isOutageNoticeActive(now)) {
      scheduleTimer(now);
      return;
    }

    notice.setAttribute('hidden', '');
    document.body.classList.remove(BODY_CLASS);
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
    document.body.classList.add(BODY_CLASS);
    // The app is a single-page app, so a tab opened before the end can stay open past it.
    scheduleTimer(loadedAt);
    // Timers do not run while the page is frozen or the device sleeps; re-check on wake-up/return.
    document.addEventListener('visibilitychange', syncNotice);
    window.addEventListener('pageshow', syncNotice);
  }

  // The popup is shown on every load, independent of the bar.
  popup.removeAttribute('hidden');
  popup.addEventListener('click', onPopupClick);
  document.addEventListener('keydown', onPopupKeydown);
  // Focus the box, not the Mehr Infos button at its end: the browser would scroll the button into view
  // and the box would open at its last paragraphs. preventScroll and the reset keep it at its beginning.
  popupDialog.focus({ preventScroll: true });
  popupDialog.scrollTop = 0;
})();
