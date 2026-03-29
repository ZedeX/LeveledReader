import { Page } from 'playwright';
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

      // 尝试多种选择器模式
      const selectors = [
        'a.book-item',
        'a[href*="book"]',
        '.book-list a',
        '.collection-item a',
        '[class*="book"] a'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach((el, index) => {
            const anchor = el as HTMLAnchorElement;
            const title = anchor.textContent?.trim() || `Book ${index + 1}`;
            const url = anchor.href;
            if (url && url.includes('http')) {
              const id = `book-${Date.now()}-${index}`;
              items.push({ id, title, url });
            }
          });
          break;
        }
      }

      // 如果没找到，尝试所有链接
      if (items.length === 0) {
        const allLinks = document.querySelectorAll('a');
        allLinks.forEach((el, index) => {
          const anchor = el as HTMLAnchorElement;
          const href = anchor.href;
          const text = anchor.textContent?.trim() || '';
          // 过滤出看起来像书籍的链接
          if (href && (text.length > 0 && text.length < 100)) {
            const id = `book-${Date.now()}-${index}`;
            items.push({ id, title: text, url: href });
          }
        });
      }

      return items;
    });

    console.log(`✓ 找到 ${books.length} 本书`);
    return books;
  }

  async extractPageText(): Promise<string> {
    return await this.page.evaluate(() => {
      // 尝试获取页面文本
      const textSelectors = [
        '.page-text',
        '.book-text',
        '.story-text',
        'article',
        'main',
        '.content'
      ];

      for (const selector of textSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          return el.textContent?.trim() || '';
        }
      }

      //  fallback: 获取 body 文本
      return document.body.textContent?.trim() || '';
    });
  }

  async extractImages(): Promise<string[]> {
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

  async extractAudioUrls(): Promise<string[]> {
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

      // 查找包含 audio/mp3 的链接
      const links = document.querySelectorAll('a');
      links.forEach(link => {
        const href = link.href;
        if (href && (href.includes('.mp3') || href.includes('.wav') || href.includes('.m4a'))) {
          audios.push(href);
        }
      });

      // 查找 data 属性中的音频
      const allElements = document.querySelectorAll('[data-audio], [data-mp3], [data-src*="mp3"]');
      allElements.forEach(el => {
        const audioUrl = el.getAttribute('data-audio') || el.getAttribute('data-mp3') || el.getAttribute('data-src');
        if (audioUrl && audioUrl.startsWith('http')) {
          audios.push(audioUrl);
        }
      });

      return [...new Set(audios)]; // 去重
    });
  }

  async findNextPageButton(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const nextSelectors = [
        'button.next',
        '.next-button',
        'a.next',
        '[aria-label*="next"], [aria-label*="Next"]',
        'button:has-text("Next"), button:has-text("next")'
      ];

      for (const selector of nextSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          return true;
        }
      }
      return false;
    });
  }

  async clickNextPage(): Promise<boolean> {
    const nextSelectors = [
      'button.next',
      '.next-button',
      'a.next',
      '[aria-label*="next"], [aria-label*="Next"]'
    ];

    for (const selector of nextSelectors) {
      try {
        const element = this.page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          await element.click();
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }
}
