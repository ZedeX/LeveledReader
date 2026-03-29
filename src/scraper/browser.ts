import { chromium, Browser, BrowserContext, Page, Cookie } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { ScraperConfig } from '../types';

export class BrowserController {
  private config: ScraperConfig;
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

  constructor(config: ScraperConfig) {
    this.config = config;
  }

  async launch(): Promise<void> {
    console.log('► 启动浏览器...');

    this.browser = await chromium.launch({
      headless: this.config.headless ?? false,
      args: ['--start-maximized']
    });

    this.context = await this.browser.newContext({
      viewport: null
    });

    // 加载 cookies
    await this.loadCookies();

    this.page = await this.context.newPage();
    console.log('✓ 浏览器已启动');
  }

  private async loadCookies(): Promise<void> {
    const cookiesPath = this.config.cookiesPath;
    if (fs.existsSync(cookiesPath)) {
      console.log('► 加载 cookies...');
      const cookies: Cookie[] = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
      await this.context!.addCookies(cookies);
      console.log(`✓ 已加载 ${cookies.length} 个 cookies`);
    } else {
      console.warn('⚠ 未找到 cookies 文件，可能需要先登录');
    }
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not launched');
    }
    return this.page;
  }

  getContext(): BrowserContext {
    if (!this.context) {
      throw new Error('Browser not launched');
    }
    return this.context;
  }

  async navigate(url: string, waitUntil: 'networkidle' | 'load' | 'domcontentloaded' = 'networkidle'): Promise<void> {
    console.log(`► 导航到: ${url}`);
    await this.page!.goto(url, { waitUntil, timeout: 60000 });
    console.log('✓ 页面加载完成');
  }

  async waitForSelector(selector: string, timeout: number = 30000): Promise<void> {
    await this.page!.waitForSelector(selector, { timeout });
  }

  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    console.log('► 关闭浏览器...');
    if (this.browser) {
      await this.browser.close();
    }
    console.log('✓ 浏览器已关闭');
  }
}
