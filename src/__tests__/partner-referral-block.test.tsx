import { render, screen } from '@testing-library/react';
import { ReferralBlock } from 'src/partner-dashboard/components/referral-block';
import { PartnerReferral } from 'src/dto/partner-statistic.dto';

function referral(overrides: Partial<PartnerReferral> = {}): PartnerReferral {
  return {
    volume: 42_180.5,
    creditEarned: 1_265.4,
    creditPaid: 980.0,
    creditOpen: 285.4,
    currency: 'EUR',
    ...overrides,
  };
}

describe('ReferralBlock — creditOpen is the hero', () => {
  it('keeps the outer testid and gives creditOpen a clearly larger type than paid/earned/volume', () => {
    render(<ReferralBlock referral={referral()} />);
    expect(screen.getByTestId('referral-block')).toBeInTheDocument();

    const hero = screen.getByTestId('referral-credit-open');
    expect(hero).toHaveTextContent('285.40 EUR');
    // Hero uses a materially larger type scale than the supporting figures
    expect(hero.className).toMatch(/text-2xl|text-3xl/);
    expect(hero.className).toContain('tabular-nums');

    const earned = screen.getByTestId('referral-credit-earned');
    const paid = screen.getByTestId('referral-credit-paid');
    const volume = screen.getByTestId('referral-volume');
    for (const el of [earned, paid, volume]) {
      expect(el.className).not.toMatch(/text-2xl|text-3xl/);
    }
  });

  it('repeats the EUR currency directly next to the hero number, plus the header badge', () => {
    render(<ReferralBlock referral={referral()} />);
    expect(screen.getByTestId('referral-currency-badge')).toHaveTextContent('EUR');
    // The hero figure's own container also carries a currency marker beside it
    const heroBlock = screen.getByTestId('referral-credit-open').closest('div');
    expect(heroBlock).toHaveTextContent('EUR');
  });
});

describe('ReferralBlock — earned/paid/open as one split bar', () => {
  it('sizes the paid and open segments proportionally to their share of earned', () => {
    render(<ReferralBlock referral={referral({ creditEarned: 1000, creditPaid: 750, creditOpen: 250 })} />);
    const paidSegment = screen.getByTestId('referral-split-paid');
    const openSegment = screen.getByTestId('referral-split-open');
    expect(paidSegment.style.width).toBe('75%');
    expect(openSegment.style.width).toBe('25%');
  });

  it('labels both segments directly with their exact amounts, not just the bar', () => {
    render(<ReferralBlock referral={referral({ creditEarned: 1000, creditPaid: 750, creditOpen: 250 })} />);
    expect(screen.getByTestId('referral-credit-paid')).toHaveTextContent('750.00 EUR');
    expect(screen.getByTestId('referral-credit-open')).toHaveTextContent('250.00 EUR');
    expect(screen.getByTestId('referral-credit-earned')).toHaveTextContent('1,000.00 EUR');
  });

  it('renders no segments (a flat empty track) when nothing has been earned yet', () => {
    render(<ReferralBlock referral={referral({ creditEarned: 0, creditPaid: 0, creditOpen: 0 })} />);
    expect(screen.queryByTestId('referral-split-paid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('referral-split-open')).not.toBeInTheDocument();
    expect(screen.getByTestId('referral-credit-split')).toBeInTheDocument();
  });

  it('never uses a status (green/red) colour for the paid/open split', () => {
    render(<ReferralBlock referral={referral({ creditEarned: 1000, creditPaid: 750, creditOpen: 250 })} />);
    // jsdom's CSS engine drops `background-color: var(...)` from the serialized style
    // attribute entirely (a jsdom/cssstyle limitation, not a real-browser behaviour), so the
    // exact token is asserted via a plain data attribute instead of parsing computed CSS.
    const paidToken = screen.getByTestId('referral-split-paid').getAttribute('data-fill-token') ?? '';
    const openToken = screen.getByTestId('referral-split-open').getAttribute('data-fill-token') ?? '';
    const forbidden = /#16a34a|#dc2626|#27ae60|#eab308|green|red/i;
    expect(paidToken).not.toMatch(forbidden);
    expect(openToken).not.toMatch(forbidden);
    // Only theme-neutral tokens back the two segments
    expect(paidToken).toBe('var(--surface-2)');
    expect(openToken).toBe('var(--text)');
  });
});

describe('ReferralBlock — volume is context, not a credit figure', () => {
  it('renders volume in its own row, separated from the credit numbers', () => {
    render(<ReferralBlock referral={referral()} />);
    const volumeRow = screen.getByTestId('referral-volume-row');
    expect(volumeRow).toContainElement(screen.getByTestId('referral-volume'));
    // The credit split lives in a different container than the volume row
    const split = screen.getByTestId('referral-credit-split');
    expect(volumeRow).not.toContainElement(split);
    expect(split).not.toContainElement(volumeRow);
  });
});
