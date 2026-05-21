/**
 * 全级别音频下载器 (aa ~ Z2, 共29个级别)
 *
 * 流程:
 * 1. Playwright登录 -> 获取所有级别书籍列表API数据
 * 2. 每本书: 从image URL提取content_id -> 探测slug+theme -> 逐页下载音频
 * 3. 断点续传: 跳过已有完整audio的书
 * 4. 并发: 级别间并行(最多3), 同级别内串行
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const CDN_BASE = 'https://mi.content.kidsa-z.com/audio';
const SITE_BASE = 'https://www.kidsa-z.com';
const OUTPUT_ROOT = 'data/downloads';
const STUDENT_ID = 276393584;
const CLASS_NAME = 'msummer17';
const PASSWORD = [1];

const ALL_LEVELS = [
  'aa','A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z'
];

const THEMES = [
  'th01','th02','th03','th04','th05','th06','th07','th08','th09','th10',
  'th11','th12','th13','th14','th15','th16','th17','th18','th19','th20',
  'lk01','lk02','lk03','lk04','lk05','lk06','lk07','lk08','lk09','lk10',
  'lk11','lk12','lk13','lk14','lk15','lk16','lk17','lk18','lk19','lk20',
];

interface BookInfo {
  resource_id: number;
  title: string;
  level: string;
  levelId: number;
  content_id?: number;
  slug?: string;
  theme?: string;
  imageLargeUrl?: string;
}

interface AudioFile {
  page: string | number;
  file: string;
  size: number;
  url: string;
}

interface LevelStats {
  total: number;
  downloaded: number;
  skipped: number;
  failed: number;
  noAudio: number;
}

interface Progress {
  lastCompletedLevel: string;
  lastCompletedBookIndex: number;
  totalBooksDownloaded: number;
  totalPagesDownloaded: number;
  failedBooks: { level: string; resourceId: number; title: string; reason: string }[];
  levelStats: Record<string, LevelStats>;
  startedAt: string;
  updatedAt: string;
}

// ============ HTTP工具 ============

function httpHead(url: string): Promise<{ status: number; contentLength?: number }> {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: 10000 }, (res) => {
      resolve({
        status: res.statusCode || 0,
        contentLength: res.headers['content-length'] ? parseInt(res.headers['content-length']) : undefined
      });
    });
    req.on('error', () => resolve({ status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0 }); });
    req.end();
  });
}

function httpDownload(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve(buf.length > 500 ? buf : null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ============ Slug生成 ============

function generateSlugVariants(title: string): string[] {
  let base = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const variants: string[] = [];
  const words = base.split(/\s+/).filter(w => w.length > 0);

  if (words.length === 0) return [''];

  // 全连在一起
  variants.push(words.join(''));

  // 驼峰式
  variants.push(words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('').replace(/^./, c => c.toLowerCase()));

  // 只取第一个词
  variants.push(words[0]);

  // 取前两个词
  if (words.length >= 2) {
    variants.push(words.slice(0, 2).join(''));
    variants.push(words[0] + words[words.length - 1]);
  }

  // 去掉常见停用词后连接
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were']);
  const filtered = words.filter(w => !stopWords.has(w));
  if (filtered.length > 0) {
    variants.push(filtered.join(''));
    if (filtered.length >= 2) {
      variants.push(filtered[0] + filtered[filtered.length - 1]);
      variants.push(filtered.slice(0, 2).join(''));
    }
  }

  // 每种2词组合
  for (let i = 0; i < words.length - 1; i++) {
    variants.push(words[i] + words[i + 1]);
  }

  // 第1+第3词, 第1+最后词(跳过停用词)
  const sigWords = words.filter(w => !stopWords.has(w));
  if (sigWords.length >= 3) {
    variants.push(sigWords[0] + sigWords[2]);
  }

  return [...new Set(variants)].filter(v => v.length > 0);
}

// ============ 探测逻辑 ============

async function probeSlugAndTheme(contentId: number, title: string): Promise<{ slug: string; theme: string } | null> {
  const slugs = generateSlugVariants(title);
  console.log(`  [probe] ${slugs.length}个slug变体 x ${THEMES.length}个theme = ${slugs.length * THEMES.length}组合`);

  for (const slug of slugs) {
    for (const theme of THEMES) {
      const url = `${CDN_BASE}/${contentId}/raz_${slug}_${theme}_title_text.mp3`;
      const { status, contentLength } = await httpHead(url);
      if (status === 200 && contentLength && contentLength > 1000) {
        console.log(`  [probe] ✓ 找到! slug=${slug}, theme=${theme}`);
        return { slug, theme };
      }
    }
  }
  return null;
}

// ============ 音频下载 ============

async function downloadAudioPages(contentId: number, slug: string, theme: string, bookDir: string): Promise<AudioFile[]> {
  const audioDir = path.join(bookDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  const results: AudioFile[] = [];

  const titleUrl = `${CDN_BASE}/${contentId}/raz_${slug}_${theme}_title_text.mp3`;
  const titleFile = `raz_${slug}_${theme}_title_text.mp3`;
  const titlePath = path.join(audioDir, titleFile);

  if (!fs.existsSync(titlePath) || fs.statSync(titlePath).size < 500) {
    console.log(`  [dl] title ...`);
    const buf = await httpDownload(titleUrl);
    if (buf) {
      fs.writeFileSync(titlePath, buf);
      results.push({ page: 'title', file: titleFile, size: buf.length, url: titleUrl });
      console.log(`  [dl] ✓ title (${(buf.length / 1024).toFixed(0)}KB)`);
    }
  } else {
    results.push({ page: 'title', file: titleFile, size: fs.statSync(titlePath).size, url: titleUrl });
  }

  let consecutive404 = 0;
  for (let p = 3; p <= 50; p++) {
    const url = `${CDN_BASE}/${contentId}/raz_${slug}_${theme}_p${p}_text.mp3`;
    const file = `raz_${slug}_${theme}_p${p}_text.mp3`;
    const fp = path.join(audioDir, file);

    if (fs.existsSync(fp) && fs.statSync(fp).size > 500) {
      results.push({ page: p, file, size: fs.statSync(fp).size, url });
      consecutive404 = 0;
      continue;
    }

    const { status } = await httpHead(url);
    if (status !== 200) {
      consecutive404++;
      if (consecutive404 >= 2) break;
      continue;
    }

    consecutive404 = 0;
    const buf = await httpDownload(url);
    if (buf) {
      fs.writeFileSync(fp, buf);
      results.push({ page: p, file, size: buf.length, url });
      console.log(`  [dl] ✓ p${p} (${(buf.length / 1024).toFixed(0)}KB)`);
    }
  }

  return results;
}

// ============ Metadata操作 ============

function extractContentId(imageUrl: string): number | null {
  const m = imageUrl.match(/\/readonly\/(\d+)\//);
  return m ? parseInt(m[1]) : null;
}

function loadMetadata(bookDir: string): any | null {
  const mp = path.join(bookDir, 'metadata.json');
  if (!fs.existsSync(mp)) return null;
  try { return JSON.parse(fs.readFileSync(mp, 'utf-8')); } catch { return null; }
}

function saveMetadata(bookDir: string, meta: any): void {
  fs.writeFileSync(path.join(bookDir, 'metadata.json'), JSON.stringify(meta, null, 2));
}

function isAudioComplete(meta: any, bookDir: string): boolean {
  if (!meta.audio?.files || meta.audio.files.length === 0) return false;
  const audioDir = path.join(bookDir, 'audio');
  if (!fs.existsSync(audioDir)) return false;
  const mp3Count = fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).length;
  return mp3Count >= meta.audio.files.length;
}

function ensureBookDir(level: string, resourceId: number, title: string): string {
  const dirName = `${resourceId}-${title}`;
  const levelDir = path.join(OUTPUT_ROOT, `level-${level}`);
  fs.mkdirSync(levelDir, { recursive: true });
  const bookDir = path.join(levelDir, dirName);
  fs.mkdirSync(bookDir, { recursive: true });
  return bookDir;
}

// ============ Progress管理 ============

function loadProgress(): Progress {
  const pp = path.join(OUTPUT_ROOT, 'progress-audio-all.json');
  if (fs.existsSync(pp)) {
    try { return JSON.parse(fs.readFileSync(pp, 'utf-8')); } catch {}
  }
  return {
    lastCompletedLevel: '',
    lastCompletedBookIndex: -1,
    totalBooksDownloaded: 0,
    totalPagesDownloaded: 0,
    failedBooks: [],
    levelStats: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function saveProgress(prog: Progress): void {
  prog.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'progress-audio-all.json'), JSON.stringify(prog, null, 2));
}

// ============ Playwright登录+API获取 ============

async function loginAndFetchAllLevels(): Promise<Map<string, BookInfo[]>> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await ctx.newPage();

  console.log('[auth] 启动浏览器...');

  // 登录
  await page.goto(`${SITE_BASE}/ng/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(5000);

  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(() => !!document.querySelector('input[type="text"]'))) break;
    await page.waitForTimeout(5000);
  }

  await page.locator('input[type="text"]').first().fill(CLASS_NAME);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(5000);

  const loginOk = await page.evaluate(async (base: string) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('XSRF-TOKEN='))?.split('=').slice(1).join('=') || '';
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (csrf) h['X-XSRF-TOKEN'] = decodeURIComponent(csrf);

    const cr = await (await fetch(`${base}/ng/api/kids/member/classrooms`, {
      method: 'POST', credentials: 'include', headers: h,
      body: JSON.stringify({ username: 'msummer17' })
    })).json();
    const cid = cr[0]?.classroomId;
    if (!cid) return false;

    await fetch(`${base}/ng/api/kids/member/class-chart`, { method: 'POST', credentials: 'include', headers: h, body: JSON.stringify({ username: 'msummer17', classroomId: cid }) });
    await fetch(`${base}/ng/api/kids/student/class-chart`, { method: 'POST', credentials: 'include', headers: h, body: JSON.stringify({ username: 'msummer17', studentId: 276393584 }) });
    await fetch(`${base}/ng/api/kids/student/password-type`, { method: 'POST', credentials: 'include', headers: h, body: JSON.stringify({ studentId: 276393584, username: 'msummer17' }) });

    const r = await (await fetch(`${base}/ng/api/kids/tokens`, {
      method: 'POST', credentials: 'include', headers: h,
      body: JSON.stringify({ studentId: 276393584, username: 'msummer17', iconicPassword: [1] })
    })).json();

    return r?.state?.accessGranted === true;
  }, SITE_BASE);

  if (!loginOk) {
    console.error('[auth] ✗ 登录失败');
    await browser.close();
    throw new Error('登录失败');
  }
  console.log('[auth] ✓ 登录成功');

  // 激活完整session: stats -> student-portal -> 点击Reading Room
  await page.goto(`${SITE_BASE}/ng/stats/reading`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  await page.goto(`${SITE_BASE}/ng/student-portal/reading`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(8000);

  const rrBtn = page.getByText('Reading Room', { exact: true });
  if (await rrBtn.count() > 0) {
    await rrBtn.first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await rrBtn.first().click({ timeout: 10000 }).catch(() => {});
    console.log('[auth] ✓ 已点击 Reading Room');
    await page.waitForTimeout(5000);
    try { await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}); } catch {}
    for (let w = 0; w < 15; w++) {
      const imgCount = await page.evaluate(() => document.querySelectorAll('img[src*="resource-cards"]').length);
      if (imgCount > 3) { console.log(`[auth] ✓ 书架已加载 (${imgCount}张封面)`); break; }
      await page.waitForTimeout(2000);
    }
  } else {
    console.log('[auth] ⚠ 未找到Reading Room按钮，继续尝试API');
  }

  // 获取CSRF token (在page.evaluate外获取)
  const getCsrf = async () => page.evaluate(() => {
    const c = document.cookie.split(';').find((c: string) => c.trim().startsWith('XSRF-TOKEN='));
    return c ? decodeURIComponent(c.split('=').slice(1).join('=')) : '';
  });

  // 获取所有级别的书籍数据
  const allLevelsData = new Map<string, BookInfo[]>();

  for (const level of ALL_LEVELS) {
    console.log(`\n[api] 获取 Level ${level} 书籍列表...`);

    try {
      const csrf = await getCsrf();
      const themeIds = Array.from({ length: 22 }, (_, i) => i + 1);
      const params = themeIds.map(t => ({ collectionId: 1, level, themeId: t }));
      const books = await page.evaluate(({ base, params, csrf }: { base: string; params: any[]; csrf: string }) => {
        const h: Record<string, string> = { 'Content-Type': 'application/json' };
        if (csrf) h['X-XSRF-TOKEN'] = csrf;
        return fetch(`${base}/api/student-bookroom/processed-booklist-multiple?params=${encodeURIComponent(JSON.stringify(params))}`, { credentials: 'include', headers: h })
          .then(r => r.json().catch(() => null));
      }, { base: SITE_BASE, params, csrf });

      if (!books || !Array.isArray(books)) {
        console.log(`[api] ✗ Level ${level}: API返回异常`);
        allLevelsData.set(level, []);
        continue;
      }

      const rawBooks: any[] = [];
      const seen = new Set<number>();
      for (const arr of books) {
        if (!Array.isArray(arr)) continue;
        for (const item of arr) {
          if (item?.resource_id && item.title && !seen.has(item.resource_id)) {
            seen.add(item.resource_id);
            rawBooks.push(item);
          }
        }
      }

      const bookInfos: BookInfo[] = rawBooks.map((b: any) => ({
        resource_id: b.resource_id,
        title: b.title,
        level: b.level,
        levelId: b.levelId,
        imageLargeUrl: b.image?.large?.url || '',
        _rawImage: b.image || {}
      }));

      console.log(`[api] ✓ Level ${level}: ${bookInfos.length} 本书`);

      // 保存API原始数据供调试
      fs.mkdirSync('data/debug', { recursive: true });
      fs.writeFileSync(`data/debug/level-${level}-api.json`, JSON.stringify(rawBooks, null, 2));

      // 检查有多少本书有imageLargeUrl
      const withImg = bookInfos.filter(b => b.imageLargeUrl).length;
      if (withImg < bookInfos.length) {
        console.log(`[api] ⚠ ${bookInfos.length - withImg}本书缺少image.large.url`);
        // 输出前3本没有imageLargeUrl的书的信息
        bookInfos.filter(b => !b.imageLargeUrl).slice(0, 3).forEach(b => {
          console.log(`    [${b.resource_id}] "${b.title}" image keys: ${Object.keys(b._rawImage).join(',')}`);
        });
      }

      allLevelsData.set(level, bookInfos);
    } catch (err: any) {
      console.error(`[api] ✗ Level ${level} 失败: ${err.message}`);
      allLevelsData.set(level, []);
    }

    await page.waitForTimeout(500);
  }

  await browser.close();
  return allLevelsData;
}

// ============ 处理单本书 ============

async function processBook(book: BookInfo, stats: LevelStats): Promise<'ok' | 'skip' | 'fail' | 'no-audio'> {
  const bookDir = ensureBookDir(book.level, book.resource_id, book.title);
  const meta = loadMetadata(bookDir);

  // 从image URL提取content_id（尝试多个URL字段）
  let contentId = book.content_id || meta?.content_id;
  if (!contentId && book.imageLargeUrl) {
    contentId = extractContentId(book.imageLargeUrl);
  }
  if (!contentId && (book as any)._rawImage) {
    const img = (book as any)._rawImage;
    for (const key of ['xlarge.url', 'medium.url', 'large_cover_thumbnail.url', 'medium_cover_thumbnail.url', 'cover_thumbnail.url']) {
      const url = key.split('.').reduce((o: any, k: string) => o?.[k], img);
      if (url) {
        contentId = extractContentId(url);
        if (contentId) { console.log(`  [cid] 从 ${key} 提取 content_id=${contentId}`); break; }
      }
    }
  }
  if (!contentId) {
    const imgUrlPreview = JSON.stringify((book as any)._rawImage || {}).substring(0, 200);
    console.log(`  ✗ 无法提取content_id (image=${imgUrlPreview}) → 跳过(可能无音频)`);
    stats.noAudio++;
    return 'no-audio';
  }
  book.content_id = contentId;

  // 检查是否已完成
  if (meta && isAudioComplete(meta, bookDir)) {
    stats.skipped++;
    return 'skip';
  }

  // 已有slug和theme
  let slug = book.slug || meta?.slug;
  let theme = book.theme || meta?.audio_theme;

  if (!slug || !theme) {
    console.log(`  [probe] 探测slug+theme (content_id=${contentId})...`);
    const result = await probeSlugAndTheme(contentId, book.title);
    if (!result) {
      console.log(`  ✗ 探测失败 → 可能无音频(单词书?)`);
      stats.noAudio++;
      return 'no-audio';
    }
    slug = result.slug;
    theme = result.theme;
    book.slug = slug;
    book.theme = theme;
  }

  // 下载音频
  console.log(`  [dl] 下载音频 (slug=${slug}, theme=${theme})...`);
  const files = await downloadAudioPages(contentId, slug, theme, bookDir);

  if (files.length === 0) {
    console.log(`  ✗ 未下载到任何音频`);
    stats.failed++;
    return 'fail';
  }

  // 更新metadata
  const newMeta = meta || {
    resource_id: book.resource_id,
    title: book.title,
    level: book.level,
    levelId: book.levelId,
    deliveries: {},
    cover_path: 'cover.jpg',
    pages_count: 0,
    page_files: []
  };

  newMeta.content_id = contentId;
  newMeta.slug = slug;
  newMeta.audio_theme = theme;
  newMeta.downloaded_at = new Date().toISOString();
  newMeta.audio = {
    baseUrl: CDN_BASE,
    theme,
    contentId,
    files: files.map(f => ({ page: f.page, file: f.file }))
  };

  saveMetadata(bookDir, newMeta);
  stats.downloaded++;

  console.log(`  ✓ 完成: ${files.length}个音频文件`);
  return 'ok';
}

// ============ 主流程 ============

async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const targetLevel = args.find(a => !a.startsWith('--') && a !== '');
  const maxConcurrentLevels = 3;

  console.log('═══════════════════════════════════════');
  console.log('  全级别音频下载器 (aa ~ Z)');
  console.log('═══════════════════════════════════════');
  console.log(`测试模式: ${testMode}`);
  console.log(`目标级别: ${targetLevel || '全部'}`);
  console.log('');

  const progress = loadProgress();
  console.log(`[progress] 已下载: ${progress.totalBooksDownloaded}本书, ${progress.totalPagesDownloaded}页`);

  // Step 1: 登录并获取所有级别数据
  console.log('\n═══ Phase 1: 登录 + 获取书籍数据 ═══');
  const allLevelsData = await loginAndFetchAllLevels();

  let totalBooks = 0;
  for (const [, books] of allLevelsData) totalBooks += books.length;
  console.log(`\n总计: ${allLevelsData.size} 个级别, ${totalBooks} 本书`);

  // Step 2: 按级别处理
  console.log('\n═══ Phase 2: 批量下载音频 ═══');

  const levelsToProcess = targetLevel
    ? ALL_LEVELS.filter(l => l === targetLevel)
    : ALL_LEVELS;

  if (testMode) {
    console.log('[test] 测试模式: 只处理Level K');
  }

  for (const level of levelsToProcess) {
    if (testMode && level !== 'K') continue;

    const books = allLevelsData.get(level) || [];
    if (books.length === 0) {
      console.log(`\n[${level}] 无书籍，跳过`);
      continue;
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[Level ${level}] ${books.length} 本书`);
    console.log(`${'─'.repeat(60)}`);

    const stats: LevelStats = { total: books.length, downloaded: 0, skipped: 0, failed: 0, noAudio: 0 };
    progress.levelStats[level] = stats;

    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      console.log(`\n  [${i + 1}/${books.length}] ${book.title} (id=${book.resource_id})`);

      try {
        const result = await processBook(book, stats);
        if (result === 'fail') {
          progress.failedBooks.push({ level, resourceId: book.resource_id, title: book.title, reason: 'download or probe failed' });
        }
        if (result === 'ok') {
          progress.totalBooksDownloaded++;
          progress.totalPagesDownloaded += stats.downloaded;
        }
      } catch (err: any) {
        console.error(`  ✗ 异常: ${err.message}`);
        stats.failed++;
        progress.failedBooks.push({ level, resourceId: book.resource_id, title: book.title, reason: err.message });
      }

      progress.lastCompletedLevel = level;
      progress.lastCompletedBookIndex = i;
      saveProgress(progress);
    }

    console.log(`\n  [Level ${level} 完成] 总:${stats.total} 下载:${stats.downloaded} 跳过:${stats.skipped} 失败:${stats.failed} 无音频:${stats.noAudio}`);
  }

  // Step 3: 最终报告
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  最终报告');
  console.log(`${'═'.repeat(60)}`);

  let grandTotal = 0, grandDl = 0, grandSkip = 0, grandFail = 0, grandNoAudio = 0;
  for (const [level, s] of Object.entries(progress.levelStats)) {
    console.log(`  Level ${level.padEnd(3)} | 总:${String(s.total).padStart(4)} 下载:${String(s.downloaded ?? 0).padStart(4)} 跳过:${String(s.skipped ?? 0).padStart(4)} 失败:${String(s.failed ?? 0).padStart(4)} 无音频:${String(s.noAudio ?? 0).padStart(4)}`);
    grandTotal += s.total ?? 0;
    grandDl += s.downloaded ?? 0;
    grandSkip += s.skipped ?? 0;
    grandFail += s.failed ?? 0;
    grandNoAudio += s.noAudio ?? 0;
  }

  console.log(`  ${'─'.repeat(70)}`);
  console.log(`  合计       | 总:${String(grandTotal).padStart(4)} 下载:${String(grandDl).padStart(4)} 跳过:${String(grandSkip).padStart(4)} 失败:${String(grandFail).padStart(4)} 无音频:${String(grandNoAudio).padStart(4)}`);
  console.log(`  总下载数: ${progress.totalBooksDownloaded}本书, ${progress.totalPagesDownloaded}页`);

  if (progress.failedBooks.length > 0) {
    console.log(`\n  失败列表:`);
    for (const fb of progress.failedBooks) {
      console.log(`    - [${fb.level}] ${fb.title} (id=${fb.resourceId}): ${fb.reason}`);
    }
  }

  saveProgress(progress);
  console.log(`\n进度已保存到: ${OUTPUT_ROOT}/progress-audio-all.json`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
