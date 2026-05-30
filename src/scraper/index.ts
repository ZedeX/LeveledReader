import { chromium, Browser, Page } from 'playwright';
import { Auth } from './auth';
import { BookAPI } from './book-api';
import { Downloader } from './downloader';
import { StudentAccount, ScraperOptions, DownloadedBook } from './types';

export class Phase2Scraper {
  private browser!: Browser;
  private page!: Page;
  private auth!: Auth;
  private bookApi!: BookAPI;
  private downloader!: Downloader;
  private options: ScraperOptions;

  constructor(options: Partial<ScraperOptions> = {}) {
    this.options = {
      proxy: options.proxy || 'http://localhost:1082',
      headless: options.headless ?? false,
      outputDir: options.outputDir || 'data/downloads',
      maxBooks: options.maxBooks || 9999,
      maxRetries: options.maxRetries || 3,
      downloadDelayMs: options.downloadDelayMs || 200
    };
  }

  async launch(): Promise<void> {
    console.log('=== Phase2 Scraper 启动 ===');
    console.log(`代理: ${this.options.proxy}`);
    console.log(`输出: ${this.options.outputDir}`);

    this.browser = await chromium.launch({
      headless: this.options.headless,
      args: ['--start-maximized', `--proxy-server=${this.options.proxy}`]
    });

    const ctx = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    this.page = await ctx.newPage();
    this.auth = new Auth(this.page);
    this.bookApi = new BookAPI(this.auth);
    this.downloader = new Downloader(this.page, this.options.outputDir, this.options.maxRetries);

    console.log('✓ 浏览器已启动\n');
  }

  async run(account: StudentAccount, level: string): Promise<DownloadedBook[]> {
    const startTime = Date.now();
    console.log(`\n━━━ 流水线开始: ${account.screenName} / Level ${level} ━━━\n`);

    // Step 1: Login
    await this.auth.login(account);
    await this.auth.visitStatsPage();
    await this.auth.enterReadingRoom();

    // Step 2: Fetch book list
    const books = await this.bookApi.fetchBookList(level);
    const targetBooks = books.slice(0, this.options.maxBooks);
    console.log(`\n目标下载: ${targetBooks.length}/${books.length} 本\n`);

    // Step 3: Download
    const results: DownloadedBook[] = [];
    for (let i = 0; i < targetBooks.length; i++) {
      const book = targetBooks[i];
      console.log(`\n── 书籍 ${i + 1}/${targetBooks.length}: "${book.title}" (id=${book.resource_id}) ──`);

      try {
        const result = await this.downloader.downloadFullBook(book);
        this.downloader.saveMetadata(result);
        results.push(result);
        console.log(`  ✓ 封面:${result.coverPath ? 'OK' : '-'} 页数:${result.pagePaths.length}`);
      } catch (err) {
        console.error(`  ✗ 失败:`, err);
      }

      if (i < targetBooks.length - 1) {
        await this.sleep(this.options.downloadDelayMs);
      }
    }

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  完成! ${results.length}/${targetBooks.length} 本书`);
    console.log(`  耗时: ${elapsed}s`);
    console.log(`  输出目录: ${this.options.outputDir}`);
    console.log(`${'='.repeat(50)}\n`);

    return results;
  }

  async runPipelineAfterLogin(level: string): Promise<DownloadedBook[]> {
    const startTime = Date.now();
    console.log(`\n━━━ 流水线(已登录) / Level ${level} ━━━\n`);

    const books = await this.bookApi.fetchBookList(level);
    const targetBooks = books.slice(0, this.options.maxBooks);
    console.log(`\n目标下载: ${targetBooks.length}/${books.length} 本\n`);

    const results: DownloadedBook[] = [];
    for (let i = 0; i < targetBooks.length; i++) {
      const book = targetBooks[i];
      console.log(`\n── 书籍 ${i + 1}/${targetBooks.length}: "${book.title}" (id=${book.resource_id}) ──`);
      try {
        const result = await this.downloader.downloadFullBook(book);
        this.downloader.saveMetadata(result);
        results.push(result);
        console.log(`  ✓ 封面:${result.coverPath ? 'OK' : '-'} 页数:${result.pagePaths.length}`);
      } catch (err) {
        console.error(`  ✗ 失败:`, err);
      }
      if (i < targetBooks.length - 1) await this.sleep(this.options.downloadDelayMs);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  完成! ${results.length}/${targetBooks.length} 本书, ${elapsed}s`);
    console.log(`${'='.repeat(50)}\n`);
    return results;
  }

  async close(): Promise<void> {
    if (this.browser) await this.browser.close();
  }

  getPage(): Page { return this.page; }
  getAuth(): Auth { return this.auth; }
  getBookAPI(): BookAPI { return this.bookApi; }
  getDownloader(): Downloader { return this.downloader; }

  private sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
}
