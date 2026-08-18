/**
 * App 2.0 handbook screenshot comparison.
 *
 * Measured 2026-08-18 against the local e2e stack: two consecutive runs with
 * maxDiffPixels: 0 against the current baselines, all 18 screens. Highest
 * observed noise: 0 px (18/18 green both runs).
 *
 * Four of those 18 used to be compared against pictures from a live session
 * on the production API. The current baselines are from this local stack and
 * a fresh account, so that gap was data, not raster noise — they now also
 * measure 0 px.
 *
 * Signal: kycNoteOpen "Verification open" → "Verification pending" = 45 px
 * on app2-account-in. 15 sits between 0 (noise) and 45 (that line change).
 * A 2000 budget swallowed the line change. No screen is near 15, so one
 * budget covers all 18.
 */
export const app2ScreenshotOpts = { maxDiffPixels: 15, fullPage: true } as const;
