import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as path from 'path';

/**
 * Host page for the real widget build in the visual suite.
 *
 * Build the widget first with `npm run widget:loc` (API http://localhost:3000, output `widget/`,
 * lazy chunks under http://localhost:3001/widget/). `startWidgetHost` serves a minimal host page,
 * the bundle and the widget stylesheet from its own HTTP server on 127.0.0.1, so the page is a real
 * loopback document that may call the API on localhost. The stylesheet is served as
 * `main-widget.css`, the name the deploy workflows rewrite to the published stylesheet.
 * `serveWidgetChunks` fulfils the lazy chunks from the same build via `page.route`, so a spec does
 * not depend on what the configured web server answers on port 3001.
 */

const CHUNK_ORIGIN = 'http://localhost:3001';
const WIDGET_DIR = path.join(__dirname, '..', '..', 'widget');

export interface WidgetHost {
  url: string;
  close(): Promise<void>;
}

function widgetBundle(dir: string, pattern: RegExp): string {
  const matches = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => pattern.test(f)) : [];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${pattern} in ${dir}, found ${matches.length}. Run "npm run widget:loc" first.`,
    );
  }
  return matches[0];
}

/** A file of the widget build for a `/widget/...` path, or undefined if there is none. */
function widgetFile(pathname: string): string | undefined {
  if (!pathname.startsWith('/widget/')) return undefined;
  const file = path.join(WIDGET_DIR, pathname.slice('/widget/'.length));
  return file.startsWith(WIDGET_DIR + path.sep) && fs.existsSync(file) ? file : undefined;
}

/**
 * Starts the host page server. `body` is the page's body markup and contains the
 * `<dfx-services>` element; `bodyStyle` is the body's inline style.
 */
export async function startWidgetHost(body: string, bodyStyle = 'margin: 0'): Promise<WidgetHost> {
  const js = widgetBundle(path.join(WIDGET_DIR, 'static/js'), /^main\.[0-9a-f]+\.js$/);
  const css = widgetBundle(path.join(WIDGET_DIR, 'static/css'), /^main\.[0-9a-f]+\.css$/);
  const host = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script defer src="/widget/static/js/${js}"></script>
  </head>
  <body style="${bodyStyle}">
    ${body}
  </body>
</html>`;

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://host').pathname;
    const file = pathname === '/main-widget.css' ? path.join(WIDGET_DIR, 'static/css', css) : widgetFile(pathname);
    if (file) {
      res.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css' : 'application/javascript' });
      fs.createReadStream(file).pipe(res);
    } else if (pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(host);
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function serveWidgetChunks(page: Page): Promise<void> {
  await page.route(`${CHUNK_ORIGIN}/widget/**`, async (route) => {
    const file = widgetFile(new URL(route.request().url()).pathname);
    return file ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
  });
}
