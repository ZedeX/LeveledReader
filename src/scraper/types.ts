export interface BookImage {
  cover_thumbnail: ImageUrl;
  medium_cover_thumbnail: ImageUrl;
  large_cover_thumbnail: ImageUrl;
  large: ImageUrl;
  xlarge: ImageUrl;
}

export interface ImageUrl {
  url: string;
}

export interface Delivery {
  name: string;
  pages?: number[];
  has_page_zero?: boolean;
  start_at?: number;
  is_disabled?: boolean;
}

export interface Book {
  resource_id: number;
  title: string;
  level: string;
  levelId: number;
  image: BookImage;
  deliveries: Record<string, Delivery>;
}

export interface DownloadedBook {
  book: Book;
  coverPath: string | null;
  pagePaths: string[];
  downloadedAt: string;
}

export interface StudentAccount {
  className: string;
  studentId: number;
  screenName: string;
  passwordArray: number[];
}

export interface ScraperOptions {
  proxy: string;
  headless: boolean;
  outputDir: string;
  maxBooks: number;
  maxRetries: number;
  downloadDelayMs: number;
}
