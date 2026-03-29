import { BrowserController } from './browser';
import { PageParser } from './parser';
import { Downloader } from './downloader';
import { Storage } from './storage';
import { BookInfo, BookPage, ScraperConfig, BookListItem } from '../types';
import * as path from 'path';
import * as readline from 'readline';

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
    console.log('请在浏览器中:');
    console.log('  1. 手动导航到包含书籍列表的页面');
    console.log('  2. 确保能看到 <student-resource-grid>');
    console.log('  3. 在此终端按回车键开始采集');
    console.log('');

    // 等待用户按回车
    await this.waitForEnter();

    // 解析书籍列表（只获取数量，不获取详细信息）
    console.log('► 解析书籍列表...');
    const bookCount = await this.getBookCountFromGrid();

    if (bookCount === 0) {
      console.log('⚠ 未找到书籍，请确保在正确的页面');
      return;
    }

    console.log(`✓ 找到 ${bookCount} 本书`);
    console.log('');

    for (let i = 0; i < bookCount; i++) {
      const bookId = `book-${String(i + 1).padStart(3, '0')}`;
      console.log(`━━━ 书籍 ${i + 1}/${bookCount} ━━━`);

      if (this.storage.bookExists(bookId)) {
        console.log(`  跳过（已存在）`);
        console.log('');
        continue;
      }

      try {
        await this.scrapeSingleBook(i, bookId);
      } catch (error) {
        console.error(`  ✗ 采集失败:`, error);
      }

      console.log('');
    }

    console.log('========================================');
    console.log('  采集完成！');
    console.log('========================================');
  }

  private async getBookCountFromGrid(): Promise<number> {
    return await this.browser.getPage().evaluate(() => {
      const grid = document.querySelector('student-resource-grid');
      if (!grid) return 0;
      const cards = grid.querySelectorAll('[class*="card"], [class*="book"]');
      return cards.length;
    });
  }

  private async waitForEnter(): Promise<void> {
    return new Promise(resolve => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.question('', () => {
        rl.close();
        resolve();
      });
    });
  }

  private async scrapeSingleBook(bookIndex: number, bookId: string): Promise<void> {
    this.storage.ensureBookDirs(bookId);

    const pages: BookPage[] = [];
    const allAudioFiles: string[] = [];
    let bookTitle = bookId;

    try {
      // 步骤1: 点击书籍卡片
      console.log(`  点击书籍卡片...`);
      const clicked = await this.parser.clickBookCard(bookIndex);
      if (!clicked) {
        console.log(`  ⚠ 无法点击书籍`);
        return;
      }

      // 步骤2: 等待弹出窗口
      console.log(`  等待弹出窗口...`);
      await this.parser.waitForPopup();
      await this.browser.sleep(2000);

      // 步骤3: 点击第一个 delivery 链接（听的图标）
      console.log(`  点击听的图标...`);
      const deliveryClicked = await this.parser.clickFirstDeliveryLink();
      if (!deliveryClicked) {
        console.log(`  ⚠ 无法点击 delivery 链接`);
        await this.parser.closePopup();
        return;
      }

      // 步骤4: 等待书籍阅读窗口
      console.log(`  等待书籍阅读窗口...`);
      await this.parser.waitForBookReader();
      await this.browser.sleep(3000);

      // 获取总页数
      const totalPages = await this.parser.getTotalPages();
      console.log(`  共 ${totalPages} 页`);

      // 采集封面（第一页）
      console.log(`  采集第 1 页...`);
      const firstPageData = await this.scrapePage(bookId, 1);
      pages.push(firstPageData);
      if (firstPageData.audioFiles) {
        allAudioFiles.push(...firstPageData.audioFiles);
      }

      // 保存封面引用
      const coverPath = firstPageData.image;

      // 翻页采集剩余页
      for (let currentPage = 2; currentPage <= Math.min(totalPages, 30); currentPage++) {
        console.log(`  采集第 ${currentPage} 页...`);

        // 翻页
        const hasNext = await this.parser.goToNextPage();
        if (!hasNext) {
          console.log(`  没有下一页了`);
          break;
        }

        await this.browser.sleep(1500);

        // 采集当前页
        const pageData = await this.scrapePage(bookId, currentPage);
        pages.push(pageData);
        if (pageData.audioFiles) {
          allAudioFiles.push(...pageData.audioFiles);
        }
      }

      // 保存书籍信息
      const bookInfo: BookInfo = {
        id: bookId,
        title: bookTitle,
        level: 'L',
        collectionId: '1',
        url: '',
        coverImage: coverPath,
        pageCount: pages.length,
        pages,
        audioFiles: [...new Set(allAudioFiles)].map(f => path.basename(f)),
        collectedAt: new Date().toISOString()
      };

      this.storage.saveBookInfo(bookId, bookInfo);
      console.log(`  ✓ 保存完成: ${bookInfo.pageCount} 页`);

    } finally {
      // 关闭弹出窗口，准备下一本
      await this.parser.closePopup();
      await this.browser.sleep(1000);
    }
  }

  private async scrapePage(bookId: string, pageNum: number): Promise<BookPage> {
    const result: BookPage = { page: pageNum };

    // 截图
    const imagePath = this.storage.getPageImagePath(bookId, pageNum);
    await this.downloader.captureScreenshot(this.browser.getPage(), imagePath);
    result.image = path.basename(imagePath);

    // 提取文字
    const text = await this.parser.extractCurrentPageText();
    if (text) {
      result.text = text;
      this.storage.savePageText(bookId, pageNum, text);
    }

    // 提取图片（除了截图，也下载 img 标签的图片）
    const images = await this.parser.extractCurrentPageImages();
    if (images.length > 0) {
      for (let i = 0; i < Math.min(images.length, 3); i++) {
        const imgExt = images[i].split('.').pop() || 'jpg';
        const imgPath = this.storage.getPageImagePath(bookId, pageNum, imgExt);
        try {
          await this.downloader.downloadImage(this.browser.getPage(), images[i], imgPath);
        } catch {
          // 忽略下载错误
        }
      }
    }

    // 提取音频
    const audioUrls = await this.parser.extractCurrentPageAudio();
    if (audioUrls.length > 0) {
      result.audioFiles = [];
      for (let i = 0; i < audioUrls.length; i++) {
        const audioExt = audioUrls[i].split('.').pop() || 'mp3';
        const audioPath = this.storage.getPageAudioPath(bookId, pageNum, i, audioExt);
        try {
          await this.downloader.downloadAudio(this.browser.getPage(), audioUrls[i], audioPath);
          result.audioFiles.push(path.basename(audioPath));
        } catch {
          // 忽略下载错误
        }
      }
    }

    return result;
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
