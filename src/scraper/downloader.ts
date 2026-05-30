import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { Book, DownloadedBook } from './types';

export class Downloader {
  private page: Page;
  private outputDir: string;
  private maxRetries: number;

  constructor(page: Page, outputDir: string, maxRetries = 3) {
    this.page = page;
    this.outputDir = outputDir;
    this.maxRetries = maxRetries;
    this.ensureDir(outputDir);
  }

  async downloadBookCover(book: Book): Promise<string | null> {
    const coverUrl = book.image.large_cover_thumbnail?.url || book.image.cover_thumbnail?.url || null;
    if (!coverUrl) {
      console.log(`  [DL] 封面URL为空: ${book.title}`);
      return null;
    }

    const bookDir = this.getBookDir(book);
    const coverPath = path.join(bookDir, 'cover.jpg');

    if (fs.existsSync(coverPath)) {
      console.log(`  [DL] 封面已存在: ${book.title}`);
      return coverPath;
    }

    console.log(`  [DL] 下载封面: ${book.title}`);
    const ok = await this.downloadWithRetry(coverUrl, coverPath);
    return ok ? coverPath : null;
  }

  async downloadBookPages(book: Book): Promise<string[]> {
    const bookDir = this.getBookDir(book);
    const pagesDir = path.join(bookDir, 'pages');
    this.ensureDir(pagesDir);

    const pageUrls = this.buildPageUrls(book);
    if (pageUrls.length === 0) {
      console.log(`  [DL] 无页面URL: ${book.title}`);
      return [];
    }

    const existingFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith('.jpg'));
    if (existingFiles.length >= pageUrls.length) {
      console.log(`  [DL] 页面已全部存在 (${existingFiles.length}/${pageUrls.length}): ${book.title}`);
      return existingFiles.sort().map(f => path.join(pagesDir, f));
    }

    console.log(`  [DL] 下载页面 ${book.title}: ${pageUrls.length}页`);
    const downloaded: string[] = [];

    for (let i = 0; i < pageUrls.length; i++) {
      const outPath = path.join(pagesDir, `page-${String(i).padStart(3, '0')}.jpg`);

      if (fs.existsSync(outPath)) {
        downloaded.push(outPath);
        continue;
      }

      process.stdout.write(`\r    [DL] ${i + 1}/${pageUrls.length} ${book.title.substring(0, 20)}`);
      const ok = await this.downloadWithRetry(pageUrls[i], outPath);
      if (ok) {
        downloaded.push(outPath);
        await this.delay(150);
      }
    }

    console.log(`\r    [DL] ✓ ${downloaded.length}/${pageUrls.length} 页 ${' '.repeat(30)}`);
    return downloaded;
  }

  async downloadFullBook(book: Book): Promise<DownloadedBook> {
    const coverPath = await this.downloadBookCover(book);
    const pagePaths = await this.downloadBookPages(book);
    return { book, coverPath, pagePaths, downloadedAt: new Date().toISOString() };
  }

  saveMetadata(result: DownloadedBook): void {
    const bookDir = this.getBookDir(result.book);
    fs.writeFileSync(path.join(bookDir, 'metadata.json'), JSON.stringify({
      resource_id: result.book.resource_id,
      title: result.book.title,
      level: result.book.level,
      levelId: result.book.levelId,
      deliveries: result.book.deliveries,
      cover_path: result.coverPath ? path.basename(result.coverPath) : null,
      pages_count: result.pagePaths.length,
      page_files: result.pagePaths.map(p => path.basename(p)),
      downloaded_at: result.downloadedAt
    }, null, 2));
  }

  private getBookDir(book: Book): string {
    const d = path.join(this.outputDir, `${book.resource_id}-${this.sanitizeName(book.title)}`);
    this.ensureDir(d);
    return d;
  }

  private buildPageUrls(book: Book): string[] {
    const urls: string[] = [];
    const tpl = book.image.large?.url;
    if (!tpl) return urls;

    const pages = book.deliveries['1']?.pages || book.deliveries['2']?.pages;
    if (pages && Array.isArray(pages)) {
      for (const p of pages) urls.push(tpl.replace(/page-\d+\.jpg/, `page-${p}.jpg`));
    } else {
      for (let p = 0; p <= 20; p++) urls.push(tpl.replace(/page-\d+\.jpg/, `page-${p}.jpg`));
    }
    return urls;
  }

  private async downloadWithRetry(url: string, outputPath: string): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const b64 = await this.fetchAsBase64(url);
        if (b64 && b64.length > 100) {
          fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
          return true;
        }
        console.log(`      [DL] attempt ${attempt}: b64=${b64?.length || 0} chars (need >100)`);
      } catch (err: any) {
        console.log(`      [DL] attempt ${attempt} error: ${err.message?.substring(0, 100)}`);
      }
      if (attempt < this.maxRetries) await this.delay(800 * attempt);
    }

    const buf = await this.directPageGoto(url);
    if (buf && buf.length > 1000) {
      fs.writeFileSync(outputPath, buf);
      return true;
    }
    return false;
  }

  private async fetchAsBase64(url: string): Promise<string | null> {
    return this.page.evaluate(async (u: string) => {
      try {
        const r = await fetch(u, { credentials: 'include' });
        if (!r.ok) return `ERR_STATUS_${r.status}`;
        const blob = await r.blob();
        if (blob.size === 0) return 'ERR_EMPTY';
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string)?.split(',')[1] || null);
          reader.onerror = () => resolve('ERR_READER');
          reader.readAsDataURL(blob);
        });
      } catch (e: any) { return `ERR_${e.message?.substring(0, 50)}`; }
    }, url);
  }

  private async directPageGoto(url: string): Promise<Buffer | null> {
    try {
      const resp = await this.page.goto(url, { waitUntil: 'load', timeout: 30000 });
      if (!resp) return null;
      const buf = await resp.body();
      return buf;
    } catch { return null; }
  }

  private ensureDir(dir: string): void { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
  private sanitizeName(n: string): string { return n.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80); }
  private delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
}
