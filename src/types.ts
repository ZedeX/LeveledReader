export interface BookInfo {
  id: string;
  title: string;
  level: string;
  collectionId: string;
  url: string;
  coverImage?: string;
  pageCount: number;
  pages: BookPage[];
  audioFiles: string[];
  collectedAt: string;
}

export interface BookPage {
  page: number;
  image?: string;
  text?: string;
  audioFiles?: string[];
}

export interface BookListItem {
  id: string;
  title: string;
  url: string;
}

export interface ScraperConfig {
  cookiesPath: string;
  outputDir: string;
  startUrl: string;
  headless?: boolean;
}
