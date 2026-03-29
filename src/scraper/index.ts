import { BrowserController } from './browser';
import { PageParser } from './parser';
import { Downloader } from './downloader';
import { Storage } from './storage';
import { BookInfo, BookPage, ScraperConfig, BookListItem } from '../types';
import * as path from 'path';

export class KidsAZScraper {
  private config: ScraperConfig;
  private browser!: BrowserController;
  private parser!: PageParser;
  private downloader!: Downloader;
  private storage!: Storage;

  constructor(config: Partial<ScraperConfig> = {}) {
    this.config = {
      cookiesPath: config.cookiesPath || path.join(process.cwd(), 'cookies.json'),
      outputDir: config.outputDir || path.join(process.cwd(), 'data'),
      startUrl: config.startUrl || 'https://www.kidsa-z.com/main/ReadingBookRoom#!/collectionId/1?level=L',
      headless: config.headless ?? false
    };

    this.storage = new Storage(this.config.outputDir);
  }

  async initialize(): Promise<void> {
    this.browser = new BrowserController(this.config);
    await this.browser.launch();
    this.parser = new PageParser(this.browser.getPage());
    this.downloader = new Downloader(this.storage);
  }

  async scrapeAllBooks(): Promise<void> {
    console.log('========================================');
    console.log('  KidsA-Z Book Scraper');
    console.log('========================================');
    console.log('');

    // 导航到起始页面
    await this.browser.navigate(this.config.startUrl);
    await this.browser.sleep(3000);

    // 解析书籍列表
    const books = await this.parser.parseBookList();

    if (books.length === 0) {
      console.log('⚠ 未找到书籍，请确保已登录并在正确的页面');
      return;
    }

    console.log('');
    console.log(`开始采集 ${books.length} 本书...`);
    console.log('');

    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      console.log(`━━━ 书籍 ${i + 1}/${books.length}: ${book.title} ━━━`);

      if (this.storage.bookExists(book.id)) {
        console.log(`  跳过（已存在）`);
        console.log('');
        continue;
      }

      try {
        await this.scrapeSingleBook(book);
      } catch (error) {
        console.error(`  ✗ 采集失败:`, error);
      }

      console.log('');
    }

    console.log('========================================');
    console.log('  采集完成！');
    console.log('========================================');
  }

  private async scrapeSingleBook(book: BookListItem): Promise<void> {
    this.storage.ensureBookDirs(book.id);

    // 导航到书籍页面
    console.log(`  导航到书籍页面...`);
    try {
      await this.browser.navigate(book.url, 'domcontentloaded');
    } catch {
      console.log(`  ⚠ 导航超时，继续...`);
    }
    await this.browser.sleep(3000);

    const pages: BookPage[] = [];
    const allAudioFiles: string[] = [];

    // 采集封面
    console.log(`  采集封面...`);
    const coverImages = await this.parser.extractImages();
    let coverPath: string | undefined;
    if (coverImages.length > 0) {
      coverPath = this.storage.getCoverPath(book.id);
      await this.downloader.downloadImage(this.browser.getPage(), coverImages[0], coverPath);
    }

    // 翻页采集
    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages && currentPage <= 50) {
      console.log(`  采集第 ${currentPage} 页...`);

      await this.browser.sleep(2000);

      // 采集当前页
      const pageData = await this.scrapePage(book.id, currentPage);
      pages.push(pageData);

      // 收集音频
      if (pageData.audioFiles) {
        allAudioFiles.push(...pageData.audioFiles);
      }

      // 尝试翻页
      hasMorePages = await this.parser.clickNextPage();
      if (hasMorePages) {
        currentPage++;
        await this.browser.sleep(1500);
      }
    }

    // 保存书籍信息
    const bookInfo: BookInfo = {
      id: book.id,
      title: book.title,
      level: 'L',
      collectionId: '1',
      url: book.url,
      coverImage: coverPath ? path.basename(coverPath) : undefined,
      pageCount: pages.length,
      pages,
      audioFiles: [...new Set(allAudioFiles)].map(f => path.basename(f)),
      collectedAt: new Date().toISOString()
    };

    this.storage.saveBookInfo(book.id, bookInfo);
    console.log(`  ✓ 保存完成: ${bookInfo.pageCount} 页`);
  }

  private async scrapePage(bookId: string, pageNum: number): Promise<BookPage> {
    const result: BookPage = { page: pageNum };

    // 截图
    const imagePath = this.storage.getPageImagePath(bookId, pageNum);
    await this.downloader.captureScreenshot(this.browser.getPage(), imagePath);
    result.image = path.basename(imagePath);

    // 提取文字
    const text = await this.parser.extractPageText();
    if (text) {
      result.text = text;
      this.storage.savePageText(bookId, pageNum, text);
    }

    // 提取音频
    const audioUrls = await this.parser.extractAudioUrls();
    if (audioUrls.length > 0) {
      result.audioFiles = [];
      for (let i = 0; i < audioUrls.length; i++) {
        const audioPath = this.storage.getPageAudioPath(bookId, pageNum, i);
        await this.downloader.downloadAudio(this.browser.getPage(), audioUrls[i], audioPath);
        result.audioFiles.push(path.basename(audioPath));
      }
    }

    return result;
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
