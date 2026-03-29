import { Page, Response } from 'playwright';
import { Storage } from './storage';

export class Downloader {
  private storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  async downloadImage(page: Page, url: string, savePath: string): Promise<void> {
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle' });
      if (response) {
        const buffer = await response.body();
        await this.storage.saveBinaryFile(savePath, buffer);
      }
    } catch (error) {
      console.warn(`  ⚠ 下载图片失败: ${url}`);
    }
  }

  async downloadAudio(page: Page, url: string, savePath: string): Promise<void> {
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle' });
      if (response) {
        const buffer = await response.body();
        await this.storage.saveBinaryFile(savePath, buffer);
      }
    } catch (error) {
      console.warn(`  ⚠ 下载音频失败: ${url}`);
    }
  }

  async captureScreenshot(page: Page, savePath: string): Promise<void> {
    try {
      await page.screenshot({ path: savePath, fullPage: false });
    } catch (error) {
      console.warn(`  ⚠ 截图失败: ${savePath}`);
    }
  }

  async captureElementScreenshot(page: Page, selector: string, savePath: string): Promise<void> {
    try {
      const element = await page.locator(selector).first();
      if (await element.isVisible()) {
        await element.screenshot({ path: savePath });
      }
    } catch (error) {
      console.warn(`  ⚠ 元素截图失败: ${selector}`);
    }
  }
}
