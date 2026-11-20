// Hard-coded switches. Intentionally not settable by env var or remote setting:
// changing one needs a reviewed PR and a redeploy.
export const FeatureFlags: { serviceNotice: boolean } = {
  serviceNotice: true, // service notice banner (slim everywhere, prominent on /swap) — remove when swapping is back and the old deposit addresses need no warning
};
