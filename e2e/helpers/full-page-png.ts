import { Page } from '@playwright/test';
import { deflateSync, inflateSync } from 'zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * The booking list is taller than one Chromium capture. Expand the inner
 * scroller and stitch viewport slices so the baseline contains every row.
 */
export async function captureExpandedPage(page: Page): Promise<Buffer> {
  await page.addStyleTag({
    content: [
      'html, body { height: auto !important; overflow: visible !important; scroll-behavior: auto !important; }',
      '#app-root, #app-root > div, .overflow-auto {',
      '  height: auto !important; max-height: none !important; overflow: visible !important; flex: none !important;',
      '}',
    ].join('\n'),
  });
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });

  const viewport = page.viewportSize();
  if (!viewport) throw new Error('viewport missing');
  const metrics = await page.evaluate(() => ({
    width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
    height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
  }));
  if (metrics.width > viewport.width + 1) {
    throw new Error(`page is wider than the viewport (${metrics.width} > ${viewport.width})`);
  }

  const total = Math.ceil(metrics.height);
  if (total < 20000) throw new Error(`expanded page is only ${total}px; the voucher list was clipped`);
  const slices: Buffer[] = [];
  for (let y = 0; y < total; ) {
    const remaining = total - y;
    const height = Math.min(viewport.height, remaining);
    const maxScroll = Math.max(0, total - viewport.height);
    const scrollTop = Math.min(y, maxScroll);
    const clipY = y - scrollTop;
    await page.evaluate((top) => window.scrollTo(0, top), scrollTop);
    await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    slices.push(
      await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        clip: { x: 0, y: clipY, width: viewport.width, height },
      }),
    );
    y += height;
  }
  return stitchVertically(slices);
}

export function stitchVertically(pngs: Buffer[]): Buffer {
  const decoded = pngs.map(decodePng);
  const width = decoded[0]?.width ?? 0;
  if (decoded.some((image) => image.width !== width)) throw new Error('slice widths differ');
  const height = decoded.reduce((sum, image) => sum + image.height, 0);
  return encodePng(width, height, Buffer.concat(decoded.map((image) => image.raw)));
}

function decodePng(png: Buffer): { width: number; height: number; raw: Buffer } {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a png');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported png');
      if (data[9] === 2) channels = 3;
      else if (data[9] === 6) channels = 4;
      else throw new Error(`unsupported png color ${data[9]}`);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (!channels) throw new Error('png header missing');
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const decoded = Buffer.alloc(height * stride);
  let source = 0;
  for (let row = 0; row < height; row++) {
    const filter = inflated[source];
    source += 1;
    const start = row * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? decoded[start + x - channels] : 0;
      const up = row > 0 ? decoded[start - stride + x] : 0;
      const upLeft = row > 0 && x >= channels ? decoded[start - stride + x - channels] : 0;
      decoded[start + x] = (inflated[source] + predictor(filter, left, up, upLeft)) & 255;
      source += 1;
    }
  }
  if (channels === 4) return { width, height, raw: decoded };
  const raw = Buffer.alloc(height * width * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    raw[pixel * 4] = decoded[pixel * 3];
    raw[pixel * 4 + 1] = decoded[pixel * 3 + 1];
    raw[pixel * 4 + 2] = decoded[pixel * 3 + 2];
    raw[pixel * 4 + 3] = 255;
  }
  return { width, height, raw };
}

function predictor(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, upLeft);
  throw new Error(`unsupported png filter ${filter}`);
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const dl = Math.abs(estimate - left);
  const du = Math.abs(estimate - up);
  const dul = Math.abs(estimate - upLeft);
  if (dl <= du && dl <= dul) return left;
  if (du <= dul) return up;
  return upLeft;
}

function encodePng(width: number, height: number, raw: Buffer): Buffer {
  const stride = width * 4;
  const filtered = Buffer.alloc(height * (stride + 1));
  for (let row = 0; row < height; row++) {
    const target = row * (stride + 1);
    filtered[target] = 0;
    raw.copy(filtered, target + 1, row * stride, (row + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(filtered)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function crc32(data: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return ~crc >>> 0;
}
