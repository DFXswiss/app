import { SERIES_COLORS, STATE_COLORS } from 'src/config/partner-dashboard.config';
import { stageASegments, stageBSegments } from 'src/partner-dashboard/components/completion-block';

describe('completion state colours (D1)', () => {
  const stageA = stageASegments({
    requested: 100,
    paymentReceived: 20,
    waitingForPayment: 10,
    noPaymentReceived: 70,
    receivedRate: 0.2,
  });

  const stageB = stageBSegments({
    received: 20,
    delivered: 15,
    rejected: 2,
    inProgress: 3,
    deliveredRate: 0.75,
  });

  it('uses the same "good" colour in Stage A and Stage B', () => {
    const goodA = stageA.find((s) => s.state === 'good');
    const goodB = stageB.find((s) => s.state === 'good');
    expect(goodA).toBeDefined();
    expect(goodB).toBeDefined();
    expect(goodA?.color).toBe(STATE_COLORS.good);
    expect(goodB?.color).toBe(STATE_COLORS.good);
    expect(goodA?.color).toBe(goodB?.color);
  });

  it('maps states identically across stages (good / pending / rejected)', () => {
    expect(stageA.find((s) => s.label === 'Zahlung eingegangen')?.state).toBe('good');
    expect(stageB.find((s) => s.label === 'Ausgeliefert')?.state).toBe('good');
    expect(stageA.find((s) => s.label === 'Wartet auf Zahlung')?.state).toBe('pending');
    expect(stageB.find((s) => s.label === 'In Bearbeitung')?.state).toBe('pending');
    expect(stageB.find((s) => s.label === 'Abgelehnt')?.state).toBe('rejected');
    expect(stageA.find((s) => s.label === 'Keine Zahlung')?.state).toBe('absent');
  });

  it('uses red only for rejected — never for a positive or neutral completion state', () => {
    // Category red (Kauf) may share the hex with rejected, but must not code "good"/"pending"/"absent"
    const nonRejected = [...stageA, ...stageB].filter((s) => s.state !== 'rejected');
    for (const seg of nonRejected) {
      expect(seg.color).not.toBe(SERIES_COLORS.buy);
      expect(seg.color).not.toBe(STATE_COLORS.rejected);
    }
    const rejected = stageB.find((s) => s.state === 'rejected');
    expect(rejected?.color).toBe(STATE_COLORS.rejected);
  });

  it('draws every colour from STATE_COLORS only', () => {
    const statePalette = new Set(Object.values(STATE_COLORS));
    for (const seg of [...stageA, ...stageB]) {
      expect(statePalette.has(seg.color as (typeof STATE_COLORS)[keyof typeof STATE_COLORS])).toBe(
        true,
      );
    }
  });

  it('has no green or yellow in the state scale', () => {
    const forbidden = ['#27AE60', '#EAB308', '#229954', '#A16207'];
    for (const color of Object.values(STATE_COLORS)) {
      expect(forbidden).not.toContain(color);
    }
  });
});
