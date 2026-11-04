const mockStartStandaloneApp = jest.fn();
const mockReportWebVitals = jest.fn();
const mockLoadFont = jest.fn();

jest.mock('../util/boot-standalone', () => ({
  startStandaloneApp: (...args: unknown[]) => mockStartStandaloneApp(...args),
}));

jest.mock('../reportWebVitals', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockReportWebVitals(...args),
}));

jest.mock('../index.css', () => ({}));

// The font package is plain CSS, which Jest cannot load; the factory runs when the entry imports it.
jest.mock('@fontsource-variable/inter', () => {
  mockLoadFont();
  return {};
});

describe('index', () => {
  beforeEach(() => {
    mockStartStandaloneApp.mockClear();
    mockReportWebVitals.mockClear();
    mockLoadFont.mockClear();
  });

  it('calls startStandaloneApp then reportWebVitals on module load', () => {
    jest.isolateModules(() => {
      require('../index');
    });

    expect(mockStartStandaloneApp).toHaveBeenCalledTimes(1);
    expect(mockReportWebVitals).toHaveBeenCalledTimes(1);
    expect(mockStartStandaloneApp.mock.invocationCallOrder[0]).toBeLessThan(
      mockReportWebVitals.mock.invocationCallOrder[0],
    );
  });

  it('loads the self-hosted Inter before the app starts', () => {
    jest.isolateModules(() => {
      require('../index');
    });

    expect(mockLoadFont).toHaveBeenCalledTimes(1);
    expect(mockLoadFont.mock.invocationCallOrder[0]).toBeLessThan(mockStartStandaloneApp.mock.invocationCallOrder[0]);
  });
});
