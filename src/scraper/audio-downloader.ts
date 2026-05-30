import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const CDN = 'https://mi.content.kidsa-z.com';

export interface AudioFile {
  page: string | number;
  file: string;
  path: string;
  duration?: number;
}

export interface DownloadBookAudioOptions {
  contentId: number;
  slug: string;
  pages: number;
  outputDir: string;
  proxy?: string;
}

function buildAudioUrl(contentId: number, slug: string, pageKey: string): string {
  return `${CDN}/audio/${contentId}/raz_${slug}_th03_${pageKey}_text.mp3`;
}

async function probeUrl(page: Page, url: string): Promise<boolean> {
  try {
    const ok = await page.evaluate(async (u) => {
      try {
        const r = await fetch(u, { method: 'HEAD' });
        return r.ok && (r.status === 200 || r.status === 206);
      } catch { return false; }
    }, url);
    return ok;
  } catch { return false; }
}

async function downloadViaFetch(page: Page, url: string, destPath: string): Promise<boolean> {
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });

  const buf = await page.evaluate(async (u) => {
    const r = await fetch(u);
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    return new Uint8Array(ab);
  }, url);

  if (!buf || buf.length < 1000) return false;

  fs.writeFileSync(destPath, buf);
  return true;
}

export async function downloadBookAudio(opts: DownloadBookAudioOptions): Promise<AudioFile[]> {
  const { contentId, slug, pages, outputDir, proxy } = opts;
  const audioDir = path.join(outputDir, String(contentId), 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: proxy ? [`--proxy-server=${proxy}`, '--no-sandbox'] : ['--no-sandbox']
  });
  const p = await browser.newPage();

  const results: AudioFile[] = [];

  const pageKeys: (string | number)[] = ['title'];
  for (let i = 3; i <= pages + 2; i++) {
    pageKeys.push(i);
  }
  pageKeys.push(0);

  console.log(`[audio] Probing ${pageKeys.length} audio files for content_id=${contentId} slug=${slug}`);

  for (const pk of pageKeys) {
    const url = buildAudioUrl(contentId, slug, String(pk));
    const filename = `raz_${slug}_th03_${pk}_text.mp3`;
    const filePath = path.join(audioDir, filename);

    const exists = await probeUrl(p, url);
    if (!exists) continue;

    console.log(`[audio] Found: ${filename}`);
    const ok = await downloadViaFetch(p, url, filePath);
    if (!ok) continue;

    results.push({ page: pk, file: filename, path: filePath });
  }

  await browser.close();
  console.log(`[audio] Downloaded ${results.length} files`);
  return results;
}
