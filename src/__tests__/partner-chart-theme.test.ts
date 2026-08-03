import { baseChartOptions, chartChromeColors } from 'src/partner-dashboard/util/chart-theme';
import { readThemeCssVar, themeClassName } from 'src/partner-dashboard/util/theme';

/** Minimal pod theme tokens so jsdom can resolve the same vars the app uses. */
const POD_THEME_STYLE = `
  .theme-light {
    --border: #dde5f0;
    --text: #0b1426;
    --text-secondary: #566174;
    --text-tertiary: #8d98aa;
    --font-sans: Inter, sans-serif;
  }
  .theme-dark {
    --border: rgba(255,255,255,.08);
    --text: #f9fafb;
    --text-secondary: #a8b5c8;
    --text-tertiary: #8a99b7;
    --font-sans: Inter, sans-serif;
  }
`;

describe('chart chrome colours follow the requested theme class', () => {
  let styleEl: HTMLStyleElement;

  beforeEach(() => {
    styleEl = document.createElement('style');
    styleEl.setAttribute('data-testid', 'pod-theme-test-style');
    styleEl.textContent = POD_THEME_STYLE;
    document.head.appendChild(styleEl);

    const existing = document.getElementById('partner-dashboard-root');
    if (existing) existing.remove();
  });

  afterEach(() => {
    styleEl.remove();
    document.getElementById('partner-dashboard-root')?.remove();
    document.querySelectorAll('[aria-hidden="true"].theme-light, [aria-hidden="true"].theme-dark').forEach((n) => n.remove());
  });

  it('readThemeCssVar ignores a stale partner-dashboard-root class', () => {
    // Host is still dark (previous theme) while the next render requests light —
    // the bug that produced white-on-white legend after dark→light.
    const root = document.createElement('div');
    root.id = 'partner-dashboard-root';
    root.className = themeClassName('dark');
    document.body.appendChild(root);

    expect(readThemeCssVar('--text', 'light')).toBe('#0b1426');
    expect(readThemeCssVar('--text', 'dark')).toBe('#f9fafb');
    expect(readThemeCssVar('--border', 'light')).toBe('#dde5f0');
  });

  it('chartChromeColors uses pod text/border for the requested theme even when root is stale', () => {
    const root = document.createElement('div');
    root.id = 'partner-dashboard-root';
    root.className = themeClassName('dark');
    document.body.appendChild(root);

    const light = chartChromeColors('light');
    expect(light.legend).toBe('#0b1426');
    expect(light.grid).toBe('#dde5f0');
    expect(light.axis).toBe('#8d98aa');
    expect(light.mode).toBe('light');

    const dark = chartChromeColors('dark');
    expect(dark.legend).toBe('#f9fafb');
    expect(dark.grid).toBe('rgba(255,255,255,.08)');
    expect(dark.axis).toBe('#8a99b7');
    expect(dark.mode).toBe('dark');
  });

  it('baseChartOptions wires legend, grid, axis and tooltip to the matching theme', () => {
    const root = document.createElement('div');
    root.id = 'partner-dashboard-root';
    // Stale light host while we build dark chart options (light→dark switch).
    root.className = themeClassName('light');
    document.body.appendChild(root);

    const opts = baseChartOptions('dark');
    expect(opts.legend?.labels?.colors).toBe('#f9fafb');
    expect(opts.grid?.borderColor).toBe('rgba(255,255,255,.08)');
    expect(opts.xaxis?.labels?.style?.colors).toBe('#8a99b7');
    expect(opts.theme?.mode).toBe('dark');
    expect(opts.tooltip?.theme).toBe('dark');

    const lightOpts = baseChartOptions('light');
    expect(lightOpts.legend?.labels?.colors).toBe('#0b1426');
    expect(lightOpts.theme?.mode).toBe('light');
    expect(lightOpts.tooltip?.theme).toBe('light');
  });

  it('reads from the live root when its theme class already matches', () => {
    const root = document.createElement('div');
    root.id = 'partner-dashboard-root';
    root.className = themeClassName('light');
    // Override on the element so we can tell live-root path was used (not probe defaults alone).
    root.style.setProperty('--text', '#112233');
    document.body.appendChild(root);

    expect(readThemeCssVar('--text', 'light')).toBe('#112233');
  });
});
