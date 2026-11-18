// Hard-coded switches. Intentionally not settable by env var or remote setting:
// changing one needs a reviewed PR and a redeploy.
export const FeatureFlags: { serviceNotice: boolean } = {
  serviceNotice: true, // service notice banner (slim everywhere, prominent on /sell and /swap) — remove when sell/swap and deposit addresses are back
};
