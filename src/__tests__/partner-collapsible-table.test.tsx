import { cleanup, render, screen } from '@testing-library/react';
import {
  CollapsibleTable,
  TABLE_SCROLL_ROW_LIMIT,
  tableScrollMaxHeight,
} from 'src/partner-dashboard/components/collapsible-table';

function rowsOf(n: number): Array<Record<string, string>> {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    v: String(i),
  }));
}

const columns = [
  { key: 'date', header: 'Date' },
  { key: 'v', header: 'Value', align: 'right' as const },
];

describe('CollapsibleTable scroll cap', () => {
  afterEach(() => {
    cleanup();
  });

  it('exports a scroll limit of 20 rows', () => {
    expect(TABLE_SCROLL_ROW_LIMIT).toBe(20);
  });

  it('derives max-height from line-height and padding, not a fixed pixel row height', () => {
    const css = tableScrollMaxHeight();
    expect(css).toContain('1lh');
    expect(css).toContain('0.75rem');
    expect(css).toContain(String(TABLE_SCROLL_ROW_LIMIT + 1));
    expect(css).not.toMatch(/\d+px/);
  });

  it('does not enable a scroll region at exactly 20 body rows', () => {
    // Literal 20 — not TABLE_SCROLL_ROW_LIMIT — so a raised limit still fails this case.
    render(<CollapsibleTable title="t" columns={columns} rows={rowsOf(20)} defaultOpen />);
    const region = screen.getByTestId('collapsible-table-scroll');
    expect(region).toHaveAttribute('data-scrollable', 'false');
    expect(region.style.maxHeight).toBe('');
    expect(region.className).not.toMatch(/\boverflow-auto\b/);
    expect(region.className).toMatch(/\boverflow-x-auto\b/);
    expect(region.querySelector('thead')?.className ?? '').not.toMatch(/sticky/);
  });

  it('enables vertical scroll, max-height, and sticky header at 21 body rows', () => {
    // Literal 21 — not limit+1 — so a raised limit still fails this case.
    render(<CollapsibleTable title="t" columns={columns} rows={rowsOf(21)} defaultOpen />);
    const region = screen.getByTestId('collapsible-table-scroll');
    expect(region).toHaveAttribute('data-scrollable', 'true');
    expect(region.className).toMatch(/\boverflow-auto\b/);
    expect(region.style.maxHeight).toBe(tableScrollMaxHeight(20));
    expect(region.querySelector('thead')?.className).toMatch(/sticky/);
  });
});
