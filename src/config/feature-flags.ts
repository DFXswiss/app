// Hard-coded switches. Intentionally not settable by env var or remote setting:
// changing one needs a reviewed PR and a redeploy.
export const FeatureFlags: { serviceNotice: boolean } = {
  serviceNotice: true, // service notice banner (on /sell and /swap only) — remove when the old deposit addresses need no warning
};
