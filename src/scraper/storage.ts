import * as fs from 'fs';
import * as path from 'path';
import { BookInfo } from '../types';

export class Storage {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.ensureDir(this.baseDir);
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  getBookDir(bookId: string): string {
    return path.join(this.baseDir, 'books', bookId);
  }

  getPagesDir(bookId: string): string {
    return path.join(this.getBookDir(bookId), 'pages');
  }

  getAudioDir(bookId: string): string {
    return path.join(this.getBookDir(bookId), 'audio');
  }

  ensureBookDirs(bookId: string): void {
    this.ensureDir(this.getBookDir(bookId));
    this.ensureDir(this.getPagesDir(bookId));
    this.ensureDir(this.getAudioDir(bookId));
  }

  saveBookInfo(bookId: string, info: BookInfo): void {
    const infoPath = path.join(this.getBookDir(bookId), 'info.json');
    fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
  }

  savePageText(bookId: string, pageNum: number, text: string): void {
    const textPath = path.join(this.getPagesDir(bookId), `page-${String(pageNum).padStart(3, '0')}.txt`);
    fs.writeFileSync(textPath, text);
  }

  async saveBinaryFile(filePath: string, data: Buffer): Promise<void> {
    this.ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, data);
  }

  getCoverPath(bookId: string, ext: string = 'jpg'): string {
    return path.join(this.getBookDir(bookId), `cover.${ext}`);
  }

  getPageImagePath(bookId: string, pageNum: number, ext: string = 'jpg'): string {
    return path.join(this.getPagesDir(bookId), `page-${String(pageNum).padStart(3, '0')}.${ext}`);
  }

  getAudioPath(bookId: string, audioIndex: number, ext: string = 'mp3'): string {
    return path.join(this.getAudioDir(bookId), `audio-${String(audioIndex).padStart(3, '0')}.${ext}`);
  }

  getPageAudioPath(bookId: string, pageNum: number, audioIndex: number, ext: string = 'mp3'): string {
    return path.join(this.getAudioDir(bookId), `page-${String(pageNum).padStart(3, '0')}-audio-${String(audioIndex).padStart(3, '0')}.${ext}`);
  }

  bookExists(bookId: string): boolean {
    return fs.existsSync(path.join(this.getBookDir(bookId), 'info.json'));
  }
}
