import { Page } from 'playwright';
import { Auth, ApiResponse } from './auth';
import { Book } from './types';

const BASE = 'https://www.kidsa-z.com';

const ALL_LEVELS = ['aa','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
const ALL_THEME_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export class BookAPI {
  private auth: Auth;

  constructor(auth: Auth) {
    this.auth = auth;
  }

  async fetchBookList(level: string, themeIds?: number[]): Promise<Book[]> {
    const themes = themeIds || ALL_THEME_IDS;
    const params = themes.map(t => ({ collectionId: 1, level, themeId: t }));

    console.log(`[BookAPI] 获取 Level ${level} 书籍列表 (themes: ${themes.length})...`);

    const resp: ApiResponse = await this.auth.browserFetch(
      'GET',
      `${BASE}/api/student-bookroom/processed-booklist-multiple?params=${encodeURIComponent(JSON.stringify(params))}`
    );

    if (resp.status !== 200 || !resp.json) {
      console.log(`[BookAPI] ✗ status=${resp.status} body=${(resp.body || '').substring(0, 300)}`);
      throw new Error(`获取书籍列表失败: status=${resp.status}`);
    }

    const books: Book[] = [];
    const arrays = Array.isArray(resp.json) ? resp.json : [];

    for (const levelArray of arrays) {
      if (Array.isArray(levelArray)) {
        for (const item of levelArray) {
          if (item && item.resource_id && item.title) {
            books.push(this.parseBook(item));
          }
        }
      }
    }

    const uniqueBooks = this.deduplicateBooks(books);
    console.log(`[BookAPI] ✓ 获取到 ${uniqueBooks.length} 本书籍 (Level ${level})`);
    return uniqueBooks;
  }

  private parseBook(raw: any): Book {
    const deliveries: Record<string, Delivery> = {};
    if (raw.deliveries) {
      for (const [key, val] of Object.entries(raw.deliveries)) {
        deliveries[key] = val as any;
      }
    }

    return {
      resource_id: raw.resource_id,
      title: raw.title,
      level: raw.level,
      levelId: raw.levelId,
      image: raw.image || {
        cover_thumbnail: { url: '' },
        medium_cover_thumbnail: { url: '' },
        large_cover_thumbnail: { url: '' },
        large: { url: '' },
        xlarge: { url: '' }
      },
      deliveries
    };
  }

  private deduplicateBooks(books: Book[]): Book[] {
    const seen = new Set<number>();
    return books.filter(b => {
      if (seen.has(b.resource_id)) return false;
      seen.add(b.resource_id);
      return true;
    });
  }

  getPageUrls(book: Book): string[] {
    const urls: string[] = [];
    const basePattern = book.image.large?.url;

    if (!basePattern) return urls;

    const listenDelivery = book.deliveries['1'] || book.deliveries['2'];
    if (listenDelivery?.pages) {
      for (const p of listenDelivery.pages) {
        urls.push(basePattern.replace(/page-\d+\.jpg/, `page-${p}.jpg`));
      }
    } else {
      for (let p = 0; p <= 20; p++) {
        urls.push(basePattern.replace(/page-\d+\.jpg/, `page-${p}.jpg`));
      }
    }

    return urls;
  }

  getCoverUrl(book: Book): string | null {
    return book.image.large_cover_thumbnail?.url || book.image.cover_thumbnail?.url || null;
  }
}
