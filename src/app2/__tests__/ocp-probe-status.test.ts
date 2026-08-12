import { probeFailureKind } from '../screens/ocp/probe-status';

describe('probeFailureKind', () => {
  it('maps only 403 to not-activated', () => {
    expect(probeFailureKind(403)).toBe('not-activated');
  });

  it('maps network/5xx/401 and unknown to error (retry, keep config)', () => {
    expect(probeFailureKind(undefined)).toBe('error');
    expect(probeFailureKind(0)).toBe('error');
    expect(probeFailureKind(401)).toBe('error');
    expect(probeFailureKind(500)).toBe('error');
    expect(probeFailureKind(502)).toBe('error');
  });
});
