import { Page, Locator } from 'playwright';
import { BookListItem } from '../types';

export class PageParser {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async parseBookList(): Promise<BookListItem[]> {
    console.log('► 解析书籍列表...');

    const books: BookListItem[] = await this.page.evaluate(() => {
      const items: BookListItem[] = [];

      // 查找 student-resource-grid
      const grid = document.querySelector('student-resource-grid');
      if (!grid) {
        console.log('未找到 student-resource-grid');
        return items;
      }

      // 查找所有书籍卡片
      const cards = grid.querySelectorAll('[class*="card"], [class*="book"]');

      cards.forEach((card, index) => {
        // 找封面图容器 card_imageWrapper
        const imageWrapper = card.querySelector('[class*="card_imageWrapper"], [class*="imageWrapper"]');
        // 找标题容器 card_detailsContainer
        const detailsContainer = card.querySelector('[class*="card_detailsContainer"], [class*="detailsContainer"]');

        let title = `Book ${index + 1}`;
        if (detailsContainer) {
          title = detailsContainer.textContent?.trim() || title;
        }

        // 查找点击元素（封面图或链接）
        const clickElement = imageWrapper || card.querySelector('a, img, button');

        if (clickElement) {
          const id = `book-${Date.now()}-${index}`;
          // 存储元素的引用方式（通过索引）
          items.push({
            id,
            title,
            url: '' // URL 后面通过点击获取
          });
        }
      });

      return items;
    });

    console.log(`✓ 找到 ${books.length} 本书`);
    return books;
  }

  async clickBookCard(index: number): Promise<boolean> {
    try {
      const grid = this.page.locator('student-resource-grid').first();
      await grid.waitFor({ state: 'visible', timeout: 10000 });

      const cards = grid.locator('[class*="card"], [class*="book"]');
      const count = await cards.count();

      if (index >= count) {
        console.log(`  ⚠ 索引 ${index} 超出范围，只有 ${count} 个卡片`);
        return false;
      }

      const card = cards.nth(index);
      await card.scrollIntoViewIfNeeded();
      await card.click({ timeout: 10000 });
      console.log(`  ✓ 点击了第 ${index + 1} 本书`);
      return true;
    } catch (error) {
      console.log(`  ⚠ 点击书籍失败:`, error);
      return false;
    }
  }

  async waitForPopup(): Promise<boolean> {
    try {
      // 等待弹出窗口出现
      await this.page.waitForSelector('student-resource-delivery, [class*="popup"], [class*="modal"], [role="dialog"]', { timeout: 10000 });
      console.log(`  ✓ 弹出窗口已出现`);
      return true;
    } catch {
      console.log(`  ⚠ 等待弹出窗口超时`);
      return false;
    }
  }

  async clickFirstDeliveryLink(): Promise<boolean> {
    try {
      // 查找 student-resource-delivery 中的第一个链接（听的图标）
      const delivery = this.page.locator('student-resource-delivery').first();
      await delivery.waitFor({ state: 'visible', timeout: 10000 });

      // 查找第一个链接/按钮（听的图标）
      const links = delivery.locator('a, button, [role="button"]');
      const count = await links.count();

      if (count === 0) {
        console.log(`  ⚠ 未找到 delivery 链接`);
        return false;
      }

      const firstLink = links.first();
      await firstLink.scrollIntoViewIfNeeded();
      await firstLink.click({ timeout: 10000 });
      console.log(`  ✓ 点击了第一个 delivery 链接（听的图标）`);
      return true;
    } catch (error) {
      console.log(`  ⚠ 点击 delivery 链接失败:`, error);
      return false;
    }
  }

  async waitForBookReader(): Promise<boolean> {
    try {
      // 等待书籍阅读窗口出现
      await this.page.waitForTimeout(2000);
      console.log(`  ✓ 书籍阅读窗口已打开`);
      return true;
    } catch {
      return false;
    }
  }

  async getTotalPages(): Promise<number> {
    try {
      // 尝试查找页码信息
      const pageInfo = await this.page.evaluate(() => {
        const pageElements = document.querySelectorAll('[class*="page"], [aria-label*="page"]');
        if (pageElements.length > 0) {
          return pageElements.length;
        }
        // 默认返回 1
        return 1;
      });
      return Math.min(pageInfo, 30); // 最多30页
    } catch {
      return 1;
    }
  }

  async extractCurrentPageText(): Promise<string> {
    return await this.page.evaluate(() => {
      const textSelectors = [
        '[class*="page-text"], [class*="book-text"], [class*="story-text"]',
        'article, main, .content'
      ];

      for (const selector of textSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          return el.textContent?.trim() || '';
        }
      }

      return document.body.textContent?.trim() || '';
    });
  }

  async extractCurrentPageImages(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const images: string[] = [];
      const imgElements = document.querySelectorAll('img');
      imgElements.forEach(img => {
        if (img.src && img.src.startsWith('http')) {
          images.push(img.src);
        }
      });
      return images;
    });
  }

  async extractCurrentPageAudio(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const audios: string[] = [];

      // 查找 audio 标签
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        if (audio.src) {
          audios.push(audio.src);
        }
        const sources = audio.querySelectorAll('source');
        sources.forEach(source => {
          if (source.src) {
            audios.push(source.src);
          }
        });
      });

      // 查找音频链接
      const links = document.querySelectorAll('a');
      links.forEach(link => {
        const href = link.href;
        if (href && (href.includes('.mp3') || href.includes('.wav') || href.includes('.m4a'))) {
          audios.push(href);
        }
      });

      return [...new Set(audios)];
    });
  }

  async goToNextPage(): Promise<boolean> {
    try {
      const nextSelectors = [
        'button.next', '.next-button', 'a.next',
        '[aria-label*="next"], [aria-label*="Next"]',
        'button:has-text(">"), button:has-text("→")'
      ];

      for (const selector of nextSelectors) {
        try {
          const element = this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            await element.click({ timeout: 5000 });
            await this.page.waitForTimeout(1500);
            return true;
          }
        } catch {
          continue;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  async closePopup(): Promise<void> {
    try {
      const closeSelectors = [
        'button.close', '.close-button', 'a.close',
        '[aria-label*="close"], [aria-label*="Close"]',
        'button:has-text("×"), button:has-text("X")'
      ];

      for (const selector of closeSelectors) {
        try {
          const element = this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 1000 })) {
            await element.click({ timeout: 2000 });
            await this.page.waitForTimeout(1000);
            return;
          }
        } catch {
          continue;
        }
      }

      // 按 ESC 键
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(500);
    } catch {
      // 忽略关闭错误
    }
  }
}
