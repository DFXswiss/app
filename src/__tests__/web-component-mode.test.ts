type WebComponentModule = typeof import('../util/web-component-mode');

function loadWebComponent(): WebComponentModule {
  let webComponent: WebComponentModule | undefined;

  jest.isolateModules(() => {
    webComponent = jest.requireActual<WebComponentModule>('../util/web-component-mode');
  });

  if (!webComponent) throw new Error('failed to load web-component');
  return webComponent;
}

describe('web-component-mode', () => {
  it('is false by default', () => {
    expect(loadWebComponent().isWebComponent()).toBe(false);
  });

  it('can be marked as web component', () => {
    const webComponent = loadWebComponent();

    webComponent.markWebComponent();

    expect(webComponent.isWebComponent()).toBe(true);
  });
});
