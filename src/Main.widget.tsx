import { createMemoryRouter } from 'react-router-dom';
import App, { WidgetParams } from './App';
import { BootErrorBoundary, StorageBlockedBanner } from './components/boot-error-boundary';
import { markEmbedded } from './util/client-error';
import { installStorageFallback } from './util/safe-storage';
import { markWebComponent } from './util/web-component-mode';

// Runs on a third party's page: a chunk failure here is reported, never recovered by reloading
// their page.
markEmbedded();
markWebComponent();
installStorageFallback();

function MainWidget(params: WidgetParams) {
  return (
    <>
      <link type="text/css" rel="stylesheet" href="main-widget.css" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap"
      />
      <BootErrorBoundary>
        <StorageBlockedBanner />
        <App routerFactory={createMemoryRouter} params={params} />
      </BootErrorBoundary>
    </>
  );
}

export default MainWidget;
