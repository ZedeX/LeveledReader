import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { Auth } from './auth';
import { BookAPI } from './book-api';
import { Downloader } from './downloader';
import { StudentAccount, Book, DownloadedBook } from './types';

const ALL_LEVELS = ['aa','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','Z1','Z2'];
const ALL_THEME_IDS = Array.from({ length: 22 }, (_, i) => i + 1);

interface AccountWithLevel extends StudentAccount {
  currentLevel: string;
}

interface BatchProgress {
  lastCompletedLevel: string;
  lastCompletedBookIndex: number;
  totalBooksDownloaded: number;
  totalPagesDownloaded: number;
  failedLevels: string[];
  failedBooks: Array<{ level: string; title: string; error: string }>;
  levelStats: Record<string, { total: number; downloaded: number; failed: number }>;
  startedAt: string;
  updatedAt: string;
}

export interface BatchDownloaderOptions {
  proxy: string;
  headless: boolean;
  outputBase: string;
  csvPath: string;
  maxBooksPerLevel: number;
  maxRetries: number;
  delayBetweenBooksMs: number;
  delayBetweenLevelsMs: number;
  testMode: boolean;
  testLevel?: string;
  testMaxBooks?: number;
}

const DEFAULT_OPTIONS: BatchDownloaderOptions = {
  proxy: 'http://localhost:1082',
  headless: true,
  outputBase: 'data/downloads',
  csvPath: 'data/probe/probe-results.csv',
  maxBooksPerLevel: 9999,
  maxRetries: 3,
  delayBetweenBooksMs: 1000,
  delayBetweenLevelsMs: 5000,
  testMode: false
};

function parsePassword(passwordStr: string): number[] {
  const cleaned = passwordStr.replace(/\u{1f}/g, '').trim();
  if (cleaned.includes('-') || cleaned.includes('–')) {
    return cleaned.split(/[-–]/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  }
  if (/^\d+$/.test(cleaned)) {
    return [parseInt(cleaned, 10)];
  }
  const nums = cleaned.match(/\d+/g);
  return nums ? nums.map(n => parseInt(n, 10)) : [];
}

export class BatchDownloader {
  private options: BatchDownloaderOptions;
  private browser!: Browser;
  private page!: Page;
  private auth!: Auth;
  private bookApi!: BookAPI;
  private downloader!: Downloader;
  private accounts: AccountWithLevel[] = [];
  private levelAccountMap: Map<string, AccountWithLevel[]> = new Map();
  private progress: BatchProgress;
  private progressPath: string;

  constructor(options: Partial<BatchDownloaderOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.progressPath = path.join(this.options.outputBase, 'progress.json');
    this.progress = this.loadProgress();
  }

  async init(): Promise<void> {
    console.log('=== Phase3 Batch Downloader 初始化 ===');
    console.log(`代理: ${this.options.proxy}`);
    console.log(`输出: ${this.options.outputBase}`);
    console.log(`CSV: ${this.options.csvPath}`);
    console.log(`测试模式: ${this.options.testMode}`);
    if (this.options.testMode) {
      console.log(`测试级别: ${this.options.testLevel}, 最大书籍: ${this.options.testMaxBooks}`);
    }
    console.log('');

    this.loadAccounts();
    this.buildLevelMap();
    this.printAccountSummary();

    this.browser = await chromium.launch({
      headless: this.options.headless,
      args: ['--start-maximized', `--proxy-server=${this.options.proxy}`]
    });

    const ctx = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    this.page = await ctx.newPage();
    this.auth = new Auth(this.page);
    this.bookApi = new BookAPI(this.auth);
    this.downloader = new Downloader(this.page, this.options.outputBase, this.options.maxRetries);

    console.log('✓ 浏览器已启动\n');
  }

  async run(): Promise<void> {
    const levels = this.getTargetLevels();
    console.log(`\n━━━ 开始批量下载 ━━━`);
    console.log(`目标级别: ${levels.join(', ')}`);
    console.log(`总账号数: ${this.accounts.length}\n`);

    for (const level of levels) {
      await this.processLevel(level);
    }

    this.printFinalSummary();
  }

  private getTargetLevels(): string[] {
    if (this.options.testMode && this.options.testLevel) {
      return [this.options.testLevel];
    }
    const startIdx = this.progress.lastCompletedLevel
      ? Math.max(0, ALL_LEVELS.indexOf(this.progress.lastCompletedLevel))
      : 0;
    return ALL_LEVELS.slice(startIdx);
  }

  private async processLevel(level: string): Promise<void> {
    const startTime = Date.now();
    const account = this.selectAccount(level);

    if (!account) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`[Level ${level}] ✗ 无可用账号，跳过`);
      this.progress.failedLevels.push(level);
      this.saveProgress();
      return;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Level ${level}] 使用账号: ${account.screenName} (${account.className})`);
    console.log(`${'='.repeat(60)}`);

    try {
      await this.auth.login(account as StudentAccount);
      await this.auth.visitStatsPage();
      await this.auth.enterReadingRoom();

      const books = await this.bookApi.fetchBookList(level, ALL_THEME_IDS);
      const maxBooks = this.options.testMode ? (this.options.testMaxBooks || 9999) : this.options.maxBooksPerLevel;
      const targetBooks = books.slice(0, maxBooks);

      console.log(`[Level ${level}] 获取 ${targetBooks.length}/${books.length} 本书`);

      this.progress.levelStats[level] = { total: targetBooks.length, downloaded: 0, failed: 0 };

      let startBookIdx = 0;
      if (level === this.progress.lastCompletedLevel) {
        startBookIdx = this.progress.lastCompletedBookIndex + 1;
      }

      for (let i = startBookIdx; i < targetBooks.length; i++) {
        const book = targetBooks[i];
        await this.downloadSingleBook(level, i, targetBooks.length, book);
        this.progress.lastCompletedBookIndex = i;

        if (i < targetBooks.length - 1) {
          await this.sleep(this.options.delayBetweenBooksMs + Math.random() * 1000);
        }
      }

      this.progress.lastCompletedLevel = level;
      this.progress.lastCompletedBookIndex = -1;

    } catch (err: any) {
      console.error(`[Level ${level}] ✗ 级别处理失败: ${err.message?.substring(0, 200)}`);
      this.progress.failedLevels.push(level);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const stats = this.progress.levelStats[level];
    console.log(`[Level ${level}] ✓ 完成 ${stats?.downloaded || 0}/${stats?.total || 0}本书, 耗时 ${elapsed}s`);
    this.saveProgress();

    if (!this.options.testMode || this.getTargetLevels().indexOf(level) < this.getTargetLevels().length - 1) {
      console.log(`[Level ${level}] 等待 ${this.options.delayBetweenLevelsMs / 1000}s 后继续...`);
      await this.sleep(this.options.delayBetweenLevelsMs);
    }
  }

  private async downloadSingleBook(level: string, index: number, total: number, book: Book): Promise<void> {
    const tag = `[Level ${level}] Book ${index + 1}/${total}`;
    console.log(`\n── ${tag}: "${book.title}" (id=${book.resource_id}) ──`);

    const bookDir = path.join(this.options.outputBase, `${book.resource_id}-${this.sanitizeName(book.title)}`);
    if (fs.existsSync(path.join(bookDir, 'metadata.json'))) {
      console.log(`${tag} 已下载，跳过`);
      this.progress.levelStats[level].downloaded++;
      return;
    }

    try {
      const result = await this.downloader.downloadFullBook(book);
      this.downloader.saveMetadata(result);
      this.progress.totalBooksDownloaded++;
      this.progress.totalPagesDownloaded += result.pagePaths.length;
      this.progress.levelStats[level].downloaded++;
      console.log(`${tag} ✓ 封面:${result.coverPath ? 'OK' : '-'} 页数:${result.pagePaths.length}`);
    } catch (err: any) {
      this.progress.levelStats[level].failed++;
      this.progress.failedBooks.push({ level, title: book.title, error: err.message?.substring(0, 150) });
      console.error(`${tag} ✗ 失败: ${err.message?.substring(0, 150)}`);
    }

    this.saveProgress();
  }

  private selectAccount(level: string): AccountWithLevel | null {
    const candidates = this.levelAccountMap.get(level);
    if (candidates && candidates.length > 0) {
      return candidates[0];
    }

    let best: AccountWithLevel | null = null;
    let bestScore = -1;

    for (const acc of this.accounts) {
      const accLevelNum = this.levelToNumber(acc.currentLevel);
      const targetLevelNum = this.levelToNumber(level);
      const diff = Math.abs(accLevelNum - targetLevelNum);

      if (diff === 0 && bestScore !== 0) {
        best = acc;
        bestScore = 0;
      } else if (diff <= 2 && (bestScore < 0 || diff < bestScore)) {
        best = acc;
        bestScore = diff;
      }
    }

    return best;
  }

  private levelToNumber(lvl: string): number {
    if (lvl === 'aa') return 0;
    if (lvl === 'Z1') return 27;
    if (lvl === 'Z2') return 28;
    if (lvl.length === 1) return lvl.charCodeAt(0) - 64;
    return 14;
  }

  private loadAccounts(): void {
    if (!fs.existsSync(this.options.csvPath)) {
      throw new Error(`CSV文件不存在: ${this.options.csvPath}`);
    }

    const raw = fs.readFileSync(this.options.csvPath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV文件为空或只有表头');

    const headers = lines[0].split(',').map(h => h.trim());
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',');
      if (vals.length < 13) continue;

      const className = vals[0]?.trim();
      const studentId = parseInt(vals[1]?.trim(), 10);
      const screenName = vals[2]?.trim();
      const passwordRaw = vals[3]?.trim() || '';
      const currentLevel = vals[11]?.trim() || '';

      if (!className || isNaN(studentId) || !screenName || !currentLevel) continue;
      if (currentLevel === '' || currentLevel === '-') continue;

      const passwordArray = parsePassword(passwordRaw);
      if (passwordArray.length === 0) continue;

      this.accounts.push({
        className,
        studentId,
        screenName,
        passwordArray,
        currentLevel
      });
    }

    console.log(`✓ 加载 ${this.accounts.length} 个有效账号`);
  }

  private buildLevelMap(): void {
    this.levelAccountMap.clear();
    for (const acc of this.accounts) {
      const lvl = acc.currentLevel;
      if (!this.levelAccountMap.has(lvl)) {
        this.levelAccountMap.set(lvl, []);
      }
      this.levelAccountMap.get(lvl)!.push(acc);
    }

    let coveredCount = 0;
    for (const lvl of ALL_LEVELS) {
      if (this.levelAccountMap.has(lvl)) coveredCount++;
    }
    console.log(`✓ 覆盖 ${coveredCount}/${ALL_LEVELS.length} 个级别`);
  }

  private printAccountSummary(): void {
    console.log('\n账号池概览:');
    for (const lvl of ALL_LEVELS) {
      const accs = this.levelAccountMap.get(lvl);
      if (accs && accs.length > 0) {
        const names = accs.map(a => a.screenName).join(', ');
        console.log(`  Level ${lvl}: ${accs.length}个账号 → ${names.substring(0, 80)}${names.length > 80 ? '...' : ''}`);
      }
    }
    console.log('');
  }

  private loadProgress(): BatchProgress {
    if (fs.existsSync(this.progressPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.progressPath, 'utf-8'));
        console.log(`✓ 加载进度: level=${data.lastCompletedLevel}, books=${data.totalBooksDownloaded}`);
        return data;
      } catch { return this.emptyProgress(); }
    }
    return this.emptyProgress();
  }

  private emptyProgress(): BatchProgress {
    return {
      lastCompletedLevel: '',
      lastCompletedBookIndex: -1,
      totalBooksDownloaded: 0,
      totalPagesDownloaded: 0,
      failedLevels: [],
      failedBooks: [],
      levelStats: {},
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  private saveProgress(): void {
    this.progress.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(this.progressPath), { recursive: true });
    fs.writeFileSync(this.progressPath, JSON.stringify(this.progress, null, 2));
  }

  private printFinalSummary(): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log('  批量下载最终报告');
    console.log(`${'='.repeat(60)}`);
    console.log(`  总书籍下载: ${this.progress.totalBooksDownloaded}`);
    console.log(`  总页面下载: ${this.progress.totalPagesDownloaded}`);
    console.log(`  失败级别: ${this.progress.failedLevels.join(', ') || '无'}`);
    console.log(`  失败书籍: ${this.progress.failedBooks.length}`);

    for (const [lvl, stats] of Object.entries(this.progress.levelStats)) {
      console.log(`  Level ${lvl}: ${stats.downloaded}/${stats.total} OK, ${stats.failed} 失败`);
    }

    const elapsed = ((Date.now() - new Date(this.progress.startedAt).getTime()) / 1000).toFixed(0);
    console.log(`  总耗时: ${parseInt(elapsed)}s`);
    console.log(`  输出目录: ${this.options.outputBase}`);
    console.log(`${'='.repeat(60)}\n`);
  }

  async close(): Promise<void> {
    if (this.browser) await this.browser.close();
  }

  private sanitizeName(n: string): string { return n.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80); }
  private sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
}
