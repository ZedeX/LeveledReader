/**
 * KidsA-Z 完整书籍下载脚本 (ReadingRoom版 v6)
 *
 * 流程:
 * 1. 登录学生账号（支持cookies复用）
 * 2. ReadingRoom → Leveled Books → 遍历书籍
 * 3. 逐本操作:
 *    a. 点击书籍 → overlay → 获取cover URL → 下载cover
 *    b. 点击Listen → Activity页面 → 拦截请求获取contentId(从img)和slug+theme(从mp3)
 *    c. CDN批量下载图片(page-0~直到404)和音频(title+p1~直到404)
 *    d. 返回ReadingRoom → 下一本
 *
 * Usage:
 *   # 从probe-results.json自动选择学生
 *   npx tsx src/scraper/download-all-books-v2.ts --headed
 *   npx tsx src/scraper/download-all-books-v2.ts --headed --max-books 3
 *   npx tsx src/scraper/download-all-books-v2.ts --headed --resume
 *
 *   # 手动指定老师/学生/密码（cookies自动保存复用）
 *   npx tsx src/scraper/download-all-books-v2.ts --headed --teacher msummer11 --student Mia --password cat,rabbit,fish
 *   npx tsx src/scraper/download-all-books-v2.ts --headed --teacher msummer11 --student Mia --password "cat, rabbit, fish"
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { chromium, Page, BrowserContext } from 'playwright';

const BASE = 'https://www.kidsa-z.com';
const CDN = 'https://mi.content.kidsa-z.com';
const OUTPUT_ROOT = path.resolve('E:\\git\\kids-a-z', 'downloads');
const JSON_PATH = path.resolve('E:\\git\\kids-a-z', 'data', 'probe', 'probe-results.json');
const BOOKLIST_DIR = path.resolve('E:\\git\\kids-a-z', 'data', 'booklists');
const COOKIES_DIR = path.resolve('E:\\git\\kids-a-z', 'data', 'cookies');
const PROGRESS_PATH = path.resolve('E:\\git\\kids-a-z', 'data', 'download-progress-v2.json');
fs.mkdirSync(BOOKLIST_DIR, { recursive: true });
fs.mkdirSync(COOKIES_DIR, { recursive: true });

interface StudentRow { className: string; studentId: number; screenName: string; passwordNames: string[]; level: string; }
interface BookEntry { resourceId: number; title: string; level: string; activityUrl: string; coverUrl: string; slug: string; theme: string; contentId: number; className?: string; studentName?: string; }
interface BookListFile { student: string; className: string; levels: string[]; extractedAt: string; books: BookEntry[]; }
interface ProgressRecord { resourceId: number; title: string; level: string; status: string; images: number; audio: number; activityUrl: string; slug: string; theme: string; contentId: number; timestamp: string; error?: string; }
interface ProgressFile { version: number; records: ProgressRecord[]; completedBooks: string[]; }
interface ManualStudent { teacher: string; student: string; password: string[]; }

function parseArgs() {
  const a = process.argv.slice(2);
  const getArg = (name: string): string => {
    const i = a.indexOf(name);
    return i >= 0 && i + 1 < a.length ? a[i + 1] : '';
  };
  const passwordStr = getArg('--password');
  return {
    headed: a.includes('--headed'),
    resume: a.includes('--resume'),
    maxBooks: (() => { const v = parseInt(getArg('--max-books'), 10); return isNaN(v) ? 9999 : v; })(),
    skipAudio: a.includes('--skip-audio'),
    skipImages: a.includes('--skip-images'),
    studentName: getArg('--student'),
    extractOnly: a.includes('--extract-only'),
    // 新增手动登录参数
    teacher: getArg('--teacher'),
    password: passwordStr ? passwordStr.split(',').map(s => s.trim()).filter(Boolean) : [],
  };
}

// ============ Cookies Management ============

const cookiesPath = (teacher: string, student: string, password: string[]) => {
  const pwdHash = password.sort().join('_');
  return path.join(COOKIES_DIR, `${teacher}_${student}_${pwdHash}.json`);
};

async function saveCookies(context: BrowserContext, teacher: string, student: string, password: string[]): Promise<void> {
  const cookies = await context.cookies();
  const fpath = cookiesPath(teacher, student, password);
  fs.writeFileSync(fpath, JSON.stringify(cookies, null, 2), 'utf-8');
  console.log(`  [COOKIES] 已保存: ${fpath}`);
}

async function loadCookies(context: BrowserContext, teacher: string, student: string, password: string[]): Promise<boolean> {
  const fpath = cookiesPath(teacher, student, password);
  if (!fs.existsSync(fpath)) return false;
  try {
    const cookies = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
    await context.addCookies(cookies);
    console.log(`  [COOKIES] 已加载: ${fpath}`);
    return true;
  } catch {
    return false;
  }
}

function hasCookies(teacher: string, student: string, password: string[]): boolean {
  return fs.existsSync(cookiesPath(teacher, student, password));
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const sanitize = (n: string) => n.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 80);

function httpGetBuffer(url: string, timeout = 30000): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { httpGetBuffer(res.headers.location, timeout).then(resolve); return; }
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

const booklistPath = (cls: string, name: string) => path.join(BOOKLIST_DIR, `${cls}_${name}.json`);

function loadProgress(): ProgressFile {
  if (!fs.existsSync(PROGRESS_PATH)) return { version: 8, records: [], completedBooks: [] };
  return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
}
function saveProgress(p: ProgressFile) { fs.writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2), 'utf-8'); }
function isBookDone(p: ProgressFile, rid: number) { return (p.completedBooks || []).includes(String(rid)); }

// ============ CDN Download ============

async function downloadCover(coverUrl: string, dir: string, resourceId: number): Promise<boolean> {
  fs.mkdirSync(dir, { recursive: true });
  const ext = coverUrl.endsWith('.png') ? 'png' : 'jpg';
  const fpath = path.join(dir, `cover-${resourceId}.${ext}`);
  if (fs.existsSync(fpath) && fs.statSync(fpath).size > 1000) return true;
  const buf = await httpGetBuffer(coverUrl);
  if (buf && buf.length > 500) {
    fs.writeFileSync(fpath, buf);
    console.log(`    [COVER] ${buf.length} bytes`);
    return true;
  }
  return false;
}

async function downloadImages(contentId: number, imgDir: string): Promise<number> {
  fs.mkdirSync(imgDir, { recursive: true });
  let count = 0;
  let consecutiveMissing = 0;
  for (let page = 0; page <= 60; page++) {
    const url = `${CDN}/readonly/${contentId}/projectable/large/1/book/page-${page}.jpg`;
    const fpath = path.join(imgDir, `page-${String(page).padStart(2, '0')}.jpg`);
    if (fs.existsSync(fpath) && fs.statSync(fpath).size > 10000) { count++; consecutiveMissing = 0; continue; }
    const buf = await httpGetBuffer(url);
    if (!buf || buf.length < 500) {
      consecutiveMissing++;
      if (consecutiveMissing >= 3) break;
      continue;
    }
    fs.writeFileSync(fpath, buf);
    count++;
    consecutiveMissing = 0;
    if (page % 5 === 0) process.stdout.write(`\r    [IMG] ${count} pages`);
    await sleep(50);
  }
  process.stdout.write(`\r    [IMG] ${count} pages\n`);
  return count;
}

async function downloadAudio(contentId: number, slug: string, theme: string, audioDir: string): Promise<number> {
  fs.mkdirSync(audioDir, { recursive: true });
  let count = 0;
  const titleUrl = `${CDN}/audio/${contentId}/raz_${slug}_${theme}_title_text.mp3`;
  const titleFp = path.join(audioDir, `raz_${slug}_${theme}_title_text.mp3`);
  if (!fs.existsSync(titleFp) || fs.statSync(titleFp).size < 100) {
    const buf = await httpGetBuffer(titleUrl);
    if (buf && buf.length > 100) { fs.writeFileSync(titleFp, buf); count++; }
  } else { count++; }
  let c404 = 0;
  for (let p = 1; p <= 60; p++) {
    const url = `${CDN}/audio/${contentId}/raz_${slug}_${theme}_p${p}_text.mp3`;
    const fp = path.join(audioDir, `raz_${slug}_${theme}_p${p}_text.mp3`);
    if (fs.existsSync(fp) && fs.statSync(fp).size > 1000) { count++; c404 = 0; continue; }
    const buf = await httpGetBuffer(url);
    if (!buf || buf.length < 100) { c404++; if (c404 >= 5) break; continue; }
    fs.writeFileSync(fp, buf);
    count++; c404 = 0;
    if (p % 3 === 0) process.stdout.write(`\r    [AUDIO] ${count} files (p${p})`);
    await sleep(50);
  }
  process.stdout.write(`\r    [AUDIO] ${count} files\n`);
  return count;
}

// ============ Login ============

async function login(page: Page, student: StudentRow): Promise<boolean> {
  try {
    await page.goto(`${BASE}/ng/student-portal/reading`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);
    if (page.url().includes('student-portal')) {
      console.log(`  已登录，跳过`);
      return true;
    }
  } catch {}

  await page.goto(`${BASE}/ng/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(5000);
  for (let i = 0; i < 10; i++) {
    if (await page.evaluate(() => !!document.querySelector('input[type="text"]'))) break;
    await sleep(5000);
  }
  await page.locator('input[type="text"]').first().fill(student.className);
  await page.keyboard.press('Enter');
  await sleep(8000);

  await page.evaluate((name) => {
    for (const btn of document.querySelectorAll('button, [role="button"]')) {
      if ((btn.textContent || '').trim() === name && btn.offsetWidth > 20) { (btn as HTMLElement).click(); return true; }
    }
    return false;
  }, student.screenName);
  await sleep(5000);

  await page.waitForFunction(() => !!document.querySelector('mat-icon[data-mat-icon-name]'), { timeout: 20000 });
  for (const n of student.passwordNames) {
    await page.evaluate((name) => {
      for (const icon of document.querySelectorAll(`mat-icon[data-mat-icon-name="${name}"]`)) {
        const btn = icon.closest('button');
        if (btn && btn.offsetWidth > 10) { (btn as HTMLElement).click(); return true; }
      }
      return false;
    }, n);
    await sleep(1000);
  }
  await page.evaluate(() => { const b = document.querySelector('.student-password__submit-button'); if (b) (b as HTMLElement).click(); });
  await sleep(10000);

  const ok = page.url().includes('student-portal') || page.url().includes('portal');
  console.log(`  登录${ok ? '成功' : '可能失败'}: ${page.url()}`);
  return ok;
}

// ============ Login with Cookies ============

async function loginWithCookies(
  page: Page, 
  context: BrowserContext, 
  teacher: string, 
  student: string, 
  password: string[]
): Promise<boolean> {
  // 尝试加载cookies
  const cookiesLoaded = await loadCookies(context, teacher, student, password);
  
  if (cookiesLoaded) {
    // 用cookies访问页面验证登录状态
    console.log(`  尝试cookies登录...`);
    await page.goto(`${BASE}/ng/student-portal/reading`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    
    if (page.url().includes('student-portal')) {
      console.log(`  ✓ Cookies登录成功`);
      return true;
    }
    console.log(`  ✗ Cookies已过期，重新登录`);
  }

  // cookies不存在或已过期，正常登录
  await page.goto(`${BASE}/ng/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(5000);
  for (let i = 0; i < 10; i++) {
    if (await page.evaluate(() => !!document.querySelector('input[type="text"]'))) break;
    await sleep(5000);
  }
  
  await page.locator('input[type="text"]').first().fill(teacher);
  await page.keyboard.press('Enter');
  await sleep(8000);

  await page.evaluate((name) => {
    for (const btn of document.querySelectorAll('button, [role="button"]')) {
      if ((btn.textContent || '').trim() === name && btn.offsetWidth > 20) { (btn as HTMLElement).click(); return true; }
    }
    return false;
  }, student);
  await sleep(5000);

  await page.waitForFunction(() => !!document.querySelector('mat-icon[data-mat-icon-name]'), { timeout: 20000 });
  for (const n of password) {
    await page.evaluate((iconName) => {
      for (const icon of document.querySelectorAll(`mat-icon[data-mat-icon-name="${iconName}"]`)) {
        const btn = icon.closest('button');
        if (btn && btn.offsetWidth > 10) { (btn as HTMLElement).click(); return true; }
      }
      return false;
    }, n);
    await sleep(1000);
  }
  await page.evaluate(() => { const b = document.querySelector('.student-password__submit-button'); if (b) (b as HTMLElement).click(); });
  await sleep(10000);

  const ok = page.url().includes('student-portal') || page.url().includes('portal');
  console.log(`  登录${ok ? '成功' : '可能失败'}: ${page.url()}`);
  
  // 登录成功后保存cookies
  if (ok) {
    await saveCookies(context, teacher, student, password);
  }
  
  return ok;
}

// ============ Navigate to Reading Room ============

async function navigateToReadingRoom(page: Page): Promise<boolean> {
  await page.goto(`${BASE}/ng/student-portal/reading`, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);

  // 点击Reading按钮（如果有的话）
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('a, button, [role="button"]')) {
      if ((btn.textContent || '').trim() === 'Reading') { (btn as HTMLElement).click(); return; }
    }
  });
  await sleep(3000);

  // 点击Reading Room
  const rrClicked = await page.evaluate(() => {
    for (const btn of document.querySelectorAll('a, button, [role="button"]')) {
      const text = (btn.textContent || '').trim();
      if (text.includes('Reading Room') || text.includes('Bookroom')) { (btn as HTMLElement).click(); return text; }
    }
    return '';
  });
  console.log(`  点击Reading Room: "${rrClicked}"`);
  await sleep(5000);

  // 点击Leveled Books
  for (let attempt = 0; attempt < 5; attempt++) {
    const lbClicked = await page.evaluate(() => {
      for (const el of document.querySelectorAll('a, button, [role="button"], [class*="tab"]')) {
        const text = (el.textContent || '').trim();
        if (text.includes('Leveled Books') || text.includes('Leveled Book')) { (el as HTMLElement).click(); return text; }
      }
      return '';
    });
    if (lbClicked) {
      console.log(`  点击Leveled Books: "${lbClicked}"`);
      break;
    }
    console.log(`  等待Leveled Books标签... (${attempt + 1})`);
    await sleep(3000);
  }
  await sleep(3000);

  const url = page.url();
  console.log(`  当前URL: ${url}`);
  return url.includes('ReadingBookRoom') || rrClicked !== '';
}

// ============ Extract Levels ============

async function extractLevels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const levels: string[] = [];
    const ul = document.querySelector('ul.levels');
    if (!ul) return levels;
    ul.querySelectorAll('a.active, a[class*="active"]').forEach(a => {
      if (!a.classList.contains('notActive')) {
        const text = (a.textContent || '').trim();
        if (text) levels.push(text);
      }
    });
    return levels;
  });
}

// ============ Select a Level ============

async function selectLevel(page: Page, level: string): Promise<boolean> {
  // 点击Level链接，不检查active类
  const clicked = await page.evaluate((lvl) => {
    const link = document.getElementById(`level-${lvl}`) as HTMLAnchorElement;
    if (link) {
      link.click();
      return true;
    }
    return false;
  }, level);
  if (clicked) {
    await sleep(3000);
    // 等待书籍卡片加载
    for (let i = 0; i < 10; i++) {
      const count = await page.evaluate(() => document.querySelectorAll('img.card_image[src*="resource-cards/books"]').length);
      if (count > 0) break;
      await sleep(2000);
    }
    await sleep(2000);
  }
  return clicked;
}

// ============ Extract Book List from current page ============

async function extractBooksFromPage(page: Page, level: string): Promise<BookEntry[]> {
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await sleep(600);
  }

  return page.evaluate((lvl) => {
    const result: BookEntry[] = [];
    const seen = new Set<number>();
    document.querySelectorAll('img.card_image[src*="resource-cards/books"]').forEach(img => {
      const src = (img as HTMLImageElement).src || '';
      const m = src.match(/\/(\d+)\.png$/);
      if (!m) return;
      const rid = parseInt(m[1], 10);
      if (seen.has(rid)) return;
      seen.add(rid);
      const card = img.closest('div.card');
      const titleEl = card ? card.querySelector('.card_title') : null;
      const title = titleEl?.textContent?.trim() || (img as HTMLImageElement).alt || `Book ${rid}`;
      result.push({ resourceId: rid, title, level: lvl, activityUrl: '', coverUrl: src, slug: '', theme: '', contentId: rid });
    });
    return result;
  }, level);
}

// ============ Extract full book list for a student ============

async function extractBookList(page: Page, student: StudentRow): Promise<BookEntry[]> {
  const blPath = booklistPath(student.className, student.screenName);

  if (fs.existsSync(blPath)) {
    const existing: BookListFile = JSON.parse(fs.readFileSync(blPath, 'utf-8'));
    if (existing.books.length > 0) {
      console.log(`  已有书单: ${existing.books.length} 本书 (${existing.levels.join(',')})`);
      return existing.books;
    }
  }

  const navOk = await navigateToReadingRoom(page);
  if (!navOk) { console.log('  ✗ 无法导航到Reading Room'); return []; }

  const levels = await extractLevels(page);
  console.log(`  可用Level: ${levels.join(', ')}`);

  const allBooks: BookEntry[] = [];

  for (const level of levels) {
    console.log(`  提取Level ${level}...`);
    const selected = await selectLevel(page, level);
    if (!selected) { console.log(`    ✗ 未找到Level ${level}`); continue; }
    await sleep(3000);

    const books = await extractBooksFromPage(page, level);
    console.log(`    ${books.length} 本书`);

    const dupes = books.filter(b => allBooks.some(ab => ab.resourceId === b.resourceId));
    if (dupes.length > 0) {
      console.log(`    ⚠ ${dupes.length} 本重复（可能是level切换未生效）`);
    }

    allBooks.push(...books);
  }

  const bookListFile: BookListFile = {
    student: student.screenName,
    className: student.className,
    levels,
    extractedAt: new Date().toISOString(),
    books: allBooks,
  };
  fs.writeFileSync(blPath, JSON.stringify(bookListFile, null, 2));
  console.log(`  书单已保存: ${blPath} (${allBooks.length} 本书)`);
  return allBooks;
}

// ============ Find play button on Activity page ============

async function findAndClickPlay(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const cands: { el: Element; s: number }[] = [];
    document.querySelectorAll('button, mat-icon, [role="button"], a').forEach(el => {
      let s = 0;
      const icon = (el.getAttribute('data-mat-icon-name') || '').toLowerCase();
      const cls = (el.className || '').toString().toLowerCase();
      const text = (el.textContent || '').trim().toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      if (icon.includes('play') || icon.includes('arrow_right') || icon.includes('start')) s += 60;
      if (cls.includes('play') || cls.includes('arrow') || cls.includes('start')) s += 50;
      if (text.includes('play') || text.includes('start')) s += 40;
      if (aria.includes('play') || aria.includes('start')) s += 40;
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width > 30 && rect.height > 30) s += 20;
      if (icon.includes('next') || icon.includes('previous') || cls.includes('next') || cls.includes('prev')) s -= 30;
      if (s > 0) cands.push({ el, s });
    });
    cands.sort((a, b) => b.s - a.s);
    if (cands.length > 0) { (cands[0].el as HTMLElement).click(); return true; }
    return false;
  });
}

// ============ Click Next button on Activity page ============

async function clickNext(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    for (const btn of document.querySelectorAll('button, mat-icon, [role="button"]')) {
      const icon = btn.getAttribute('data-mat-icon-name') || '';
      const cls = (btn.className || '').toString().toLowerCase();
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (icon.includes('next') || icon.includes('arrow_right') || aria.includes('next')) {
        if ((btn as HTMLElement).offsetWidth > 10) { (btn as HTMLElement).click(); return true; }
      }
      if (cls.includes('next') && (btn as HTMLElement).offsetWidth > 10) { (btn as HTMLElement).click(); return true; }
    }
    return false;
  });
}

// ============ Process one book: click → overlay → cover → Listen → Activity → intercept → download ============

async function processBookInReadingRoom(
  page: Page, book: BookEntry, args: ReturnType<typeof parseArgs>
): Promise<{ coverUrl: string; contentId: number; slug: string; theme: string; activityUrl: string }> {
  const result = { coverUrl: book.coverUrl || '', contentId: book.contentId || book.resourceId, slug: '', theme: '', activityUrl: '' };

  // 1. 确保在ReadingRoom页面
  if (!page.url().includes('ReadingBookRoom')) {
    await navigateToReadingRoom(page);
  }

  // 2. 选择对应Level
  const levelSelected = await selectLevel(page, book.level);
  if (!levelSelected) {
    console.log(`    ✗ 无法选择Level ${book.level}`);
    return result;
  }

  // 3. 滚动找到并点击书籍卡片
  let cardClicked = false;
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  for (let scroll = 0; scroll < 20; scroll++) {
    cardClicked = await page.evaluate((rid) => {
      for (const img of document.querySelectorAll('img.card_image[src*="resource-cards/books"]')) {
        if ((img as HTMLImageElement).src.includes(`/${rid}.png`)) {
          const container = img.closest('a.card_container') || img.closest('div.card') || img;
          (container as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, book.resourceId);

    if (cardClicked) break;
    await page.evaluate(() => window.scrollBy(0, 400));
    await sleep(500);
  }

  if (!cardClicked) {
    console.log(`    ✗ 未找到书籍卡片 rid=${book.resourceId}`);
    return result;
  }

  // 4. 等待overlay/dialog → 提取cover URL和Activity链接
  await page.waitForSelector('[role="dialog"], mat-dialog-container, .body-overlay', { timeout: 10000 }).catch(() => {});
  await sleep(3000);

  // 提取cover URL
  const overlayCoverUrl = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"], mat-dialog-container, .body-overlay');
    if (!dialog) return '';
    for (const img of dialog.querySelectorAll('img[src*="resource-cards/books"]')) {
      const src = (img as HTMLImageElement).src;
      if (src) return src;
    }
    return '';
  });

  if (overlayCoverUrl) {
    result.coverUrl = overlayCoverUrl;
    console.log(`    [COVER] ${overlayCoverUrl}`);
  }

  // 5. 在页面中查找Listen Activity链接
  // Activity链接是 <a href="/main/Activity/id/XXXX"> 格式
  let activityHref = '';
  const listenInfo = await page.evaluate(() => {
    // 在整个页面中找Activity链接
    const links: { href: string; text: string }[] = [];
    document.querySelectorAll('a[href*="/main/Activity/id/"]').forEach(a => {
      links.push({ href: (a as HTMLAnchorElement).href, text: (a.textContent || '').trim().toLowerCase() });
    });
    
    // 找Listen Activity
    const listenLink = links.find(l => l.text.includes('listen'));
    if (listenLink) return { found: true, href: listenLink.href };
    
    // 如果没有Listen，返回第一个Activity链接
    if (links.length > 0) return { found: true, href: links[0].href };
    
    return { found: false };
  });

  if (listenInfo.found) {
    activityHref = listenInfo.href;
    result.activityUrl = activityHref;
    console.log(`    ✓ Activity链接: ${activityHref}`);
  } else {
    console.log(`    ✗ 未找到Activity链接`);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(1000);
    return result;
  }

  // 6. 设置请求拦截器（在导航前！）
  const interceptedImgs: string[] = [];
  const interceptedMp3s: string[] = [];
  const reqHandler = (req: any) => {
    const u = req.url();
    if (u.includes('mi.content.kidsa-z.com/readonly/') && u.includes('/book/page-')) interceptedImgs.push(u);
    if (u.includes('mi.content.kidsa-z.com/audio/') && u.includes('.mp3')) interceptedMp3s.push(u);
  };
  page.on('request', reqHandler);

  try {
    // 7. 导航到Activity页面
    if (activityHref) {
      console.log(`    导航到Activity页面...`);
      await page.goto(activityHref, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
    }

    // 点击绿色箭头/播放按钮
    await findAndClickPlay(page);
    await sleep(3000);

    const currentUrl = page.url();
    if (!currentUrl.includes('Activity')) {
      console.log(`    ✗ 未到达Activity: ${currentUrl}`);
      return result;
    }

    result.activityUrl = currentUrl;
    console.log(`    ✓ Activity: ${currentUrl}`);

    // 8. 从拦截的img请求中提取contentId
    await sleep(3000);
    if (interceptedImgs.length > 0) {
      const imgMatch = interceptedImgs[0].match(/\/readonly\/(\d+)\//);
      if (imgMatch) {
        result.contentId = parseInt(imgMatch[1], 10);
        console.log(`    ✓ contentId from img: ${result.contentId}`);
      }
    }

    // 9. 拦截mp3：等待自动播放 → 点击play → 翻页Next → 再找play
    if (!args.skipAudio) {
      // 先等待5秒看是否自动播放
      console.log(`    等待音频自动播放...`);
      for (let w = 0; w < 5; w++) { if (interceptedMp3s.length > 0) break; await sleep(2000); }

      for (let attempt = 0; attempt < 15; attempt++) {
        if (interceptedMp3s.length > 0) break;

        // 先找绿色大按钮点击
        const playClicked = await findAndClickPlay(page);
        if (playClicked) {
          console.log(`      [attempt ${attempt + 1}] 点击play，等待mp3...`);
          for (let w = 0; w < 10; w++) { if (interceptedMp3s.length > 0) break; await sleep(1000); }
          if (interceptedMp3s.length > 0) break;
        }

        // 点击Next翻页
        const nextClicked = await clickNext(page);
        if (nextClicked) {
          console.log(`      [attempt ${attempt + 1}] 点击Next...`);
          await sleep(3000);
          // 翻页后再找play
          const playAfterNext = await findAndClickPlay(page);
          if (playAfterNext) {
            console.log(`      翻页后点击play...`);
            for (let w = 0; w < 8; w++) { if (interceptedMp3s.length > 0) break; await sleep(1000); }
          }
          // 即使没有play按钮，翻页后也可能触发音频
          for (let w = 0; w < 5; w++) { if (interceptedMp3s.length > 0) break; await sleep(1000); }
        } else {
          // 没有Next按钮，用键盘
          await page.keyboard.press('ArrowRight');
          await sleep(3000);
        }
      }

      // 最终等待
      for (let i = 0; i < 5; i++) { if (interceptedMp3s.length > 0) break; await sleep(2000); }

      if (interceptedMp3s.length > 0) {
        const mp3 = interceptedMp3s.find(u => u.includes('_title_text.mp3')) || interceptedMp3s[0];
        const m = mp3.match(/\/audio\/(\d+)\/raz_(.+?)_(.+?)_(?:title|p\d+)_text\.mp3/);
        if (m) {
          result.slug = m[2];
          result.theme = m[3];
          if (!result.contentId || result.contentId === book.resourceId) {
            result.contentId = parseInt(m[1], 10);
          }
          console.log(`    ✓ slug=${result.slug}, theme=${result.theme}, contentId=${result.contentId}`);
        }
      } else {
        console.log(`    ✗ 未拦截到mp3，记录失败`);
      }
    }
  } finally {
    page.off('request', reqHandler);
  }

  return result;
}

// ============ Return to ReadingRoom from Activity page ============

async function returnToReadingRoom(page: Page): Promise<void> {
  await page.goto(`${BASE}/main/ReadingBookRoom#!/collectionId/1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
}

// ============ Download a single book ============

async function downloadBook(page: Page, book: BookEntry, student: StudentRow, args: ReturnType<typeof parseArgs>, progress: ProgressFile): Promise<void> {
  if (isBookDone(progress, book.resourceId)) { console.log(`  [SKIP] ${book.title} 已完成`); return; }

  // 检查本地文件是否已存在
  const bookDir = path.join(OUTPUT_ROOT, book.level, `${book.resourceId}-${sanitize(book.title)}`);
  const imgDir = path.join(bookDir, 'images');
  const audioDir = path.join(bookDir, 'audio');
  
  const existingImgs = fs.existsSync(imgDir) ? fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg') && fs.statSync(path.join(imgDir, f)).size > 10000).length : 0;
  const existingAudio = fs.existsSync(audioDir) ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3') && fs.statSync(path.join(audioDir, f)).size > 1000).length : 0;
  
  if (existingImgs > 0 && existingAudio > 0) {
    console.log(`  [SKIP] ${book.title} 已有 ${existingImgs} imgs, ${existingAudio} audio`);
    // 更新progress
    progress.records.push({ 
      resourceId: book.resourceId, title: book.title, level: book.level, 
      status: 'done', images: existingImgs, audio: existingAudio, 
      activityUrl: book.activityUrl || '', slug: book.slug || '', theme: book.theme || '', contentId: book.contentId || book.resourceId, 
      timestamp: new Date().toISOString() 
    });
    progress.completedBooks.push(String(book.resourceId));
    saveProgress(progress);
    return;
  }

  let { contentId } = book;
  let slug = '', theme = '';
  let coverUrl = book.coverUrl || '';
  let imgCount = 0, audioCount = 0, errorMsg = '';

  // 创建本地目录
  fs.mkdirSync(imgDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  try {
    // Step 1: 在ReadingRoom中点击书籍 → overlay获取cover → Activity页面 → 拦截img/mp3
    const info = await processBookInReadingRoom(page, book, args);
    coverUrl = info.coverUrl || coverUrl;
    contentId = info.contentId || contentId;
    slug = info.slug;
    theme = info.theme;
    book.activityUrl = info.activityUrl;

    // Step 2: 并行下载cover、img、audio（捕获到什么下载什么）
    console.log(`    并行下载: cover=${!!coverUrl}, img=${!!contentId}, audio=${!!slug && !!theme}`);
    
    const [coverOk, imgs, audios] = await Promise.all([
      // 下载cover
      coverUrl ? downloadCover(coverUrl, bookDir, book.resourceId).then(() => true).catch(() => false) : Promise.resolve(false),
      // 下载图片
      !args.skipImages && contentId ? downloadImages(contentId, imgDir) : Promise.resolve(0),
      // 下载音频
      !args.skipAudio && slug && theme && contentId ? downloadAudio(contentId, slug, theme, audioDir) : Promise.resolve(0),
    ]);
    
    imgCount = imgs;
    audioCount = audios;

    // Step 3: 保存meta
    fs.writeFileSync(path.join(bookDir, 'meta.json'), JSON.stringify({
      resourceId: book.resourceId, contentId, title: book.title, level: book.level,
      slug, theme, activityUrl: book.activityUrl, coverUrl, images: imgCount, audio: audioCount,
      downloadedAt: new Date().toISOString(),
    }, null, 2));

    console.log(`  ✓ 完成: ${imgCount} imgs, ${audioCount} audio`);
  } catch (e: any) {
    errorMsg = e.message?.substring(0, 200) || '';
    console.log(`  ✗ 错误: ${errorMsg}`);
  }

  // Step 6: 返回ReadingRoom
  await returnToReadingRoom(page);

  const status = imgCount > 0 || audioCount > 0 ? (audioCount > 0 ? 'done' : 'partial') : 'failed';
  progress.records.push({ resourceId: book.resourceId, title: book.title, level: book.level, status, images: imgCount, audio: audioCount, activityUrl: book.activityUrl, slug, theme, contentId, timestamp: new Date().toISOString(), error: errorMsg || undefined });
  if (status === 'done') progress.completedBooks.push(String(book.resourceId));
  saveProgress(progress);

  // 更新booklist文件中的activityUrl
  if (book.activityUrl) {
    const blPath = booklistPath(student.className, student.screenName);
    if (fs.existsSync(blPath)) {
      const blData: BookListFile = JSON.parse(fs.readFileSync(blPath, 'utf-8'));
      const bookInList = blData.books.find(b => b.resourceId === book.resourceId);
      if (bookInList) {
        bookInList.activityUrl = book.activityUrl;
        bookInList.slug = slug;
        bookInList.theme = theme;
        bookInList.contentId = contentId;
        fs.writeFileSync(blPath, JSON.stringify(blData, null, 2));
      }
    }
  }
}

// ============ Main ============

async function main() {
  const args = parseArgs();
  const progress = loadProgress();

  // 判断是否手动登录模式
  const isManualMode = args.teacher && args.studentName && args.password.length > 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`KidsA-Z 书籍下载 (ReadingRoom版 v6)`);
  if (isManualMode) {
    console.log(`模式: 手动登录`);
    console.log(`老师: ${args.teacher} | 学生: ${args.studentName} | 密码: ${args.password.join(',')}`);
    console.log(`Cookies: ${hasCookies(args.teacher, args.studentName, args.password) ? '已存在' : '不存在'}`);
  } else {
    console.log(`模式: 自动选择学生 (从probe-results.json)`);
  }
  console.log(`${'='.repeat(60)}\n`);

  const browser = await chromium.launch({ headless: !args.headed, args: ['--mute-audio'] });
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Audio.setMuted', { muted: true }).catch(() => {});
  } catch {}

  try {
    if (isManualMode) {
      // 手动登录模式
      console.log(`\n${'#'.repeat(50)}`);
      console.log(`手动登录: ${args.studentName} (${args.teacher})`);
      console.log(`${'#'.repeat(50)}`);

      // 登录
      console.log('\n[1] 登录...');
      const loginOk = await loginWithCookies(page, context, args.teacher, args.studentName, args.password);
      if (!loginOk) { console.log('登录失败，退出'); return; }

      // 提取书单
      console.log('\n[2] 提取书单...');
      const student: StudentRow = {
        className: args.teacher,
        studentId: 0,
        screenName: args.studentName,
        passwordNames: args.password,
        level: '' // 未知level，后续从页面提取
      };
      const books = await extractBookList(page, student);
      if (books.length === 0) { console.log('未找到书籍'); return; }

      if (args.extractOnly) { console.log('[EXTRACT-ONLY] 跳过下载'); return; }

      // 统计各Level数量
      const levelCounts: Record<string, number> = {};
      books.forEach(b => { levelCounts[b.level] = (levelCounts[b.level] || 0) + 1; });
      console.log(`  可下载: ${Object.entries(levelCounts).map(([l, c]) => `${l}(${c})`).join(', ')}`);

      // 下载所有可用Level的书籍
      let toDownload = books;
      if (args.resume) { 
        toDownload = toDownload.filter(b => !isBookDone(progress, b.resourceId)); 
        console.log(`[RESUME] 跳过已完成 ${books.length - toDownload.length} 本`); 
      }
      toDownload = toDownload.slice(0, args.maxBooks);

      console.log(`\n[3] 下载 ${toDownload.length} 本书...\n`);

      for (let i = 0; i < toDownload.length; i++) {
        const book = toDownload[i];
        console.log(`\n[${i + 1}/${toDownload.length}] ${book.title} (rid=${book.resourceId}, level=${book.level})`);
        await downloadBook(page, book, student, args, progress);
        await sleep(500);
      }

    } else {
      // 自动模式：从probe-results.json读取
      const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));

      let students: StudentRow[] = data
        .filter((s: any) => s.loginStatus === 'success' && s.assignmentStatus?.currentLevel)
        .map((s: any) => ({ className: s.className, studentId: s.studentId, screenName: s.screenName, passwordNames: s.passwordNames || [], level: (s.assignmentStatus?.currentLevel || '').toUpperCase() }))
        .filter((s: StudentRow) => s.className && s.studentId && s.level);

      if (args.studentName) students = students.filter(s => s.screenName === args.studentName);

      let uniqueStudents: StudentRow[];
      if (args.studentName) {
        uniqueStudents = students;
      } else {
        uniqueStudents = [students[0]];
        console.log(`自动选择学生: ${uniqueStudents[0].screenName} (${uniqueStudents[0].className})`);
      }

      console.log(`Level: ${uniqueStudents.map(s => s.level).join(', ')} (${uniqueStudents.length}个)`);

      for (const student of uniqueStudents) {
        console.log(`\n${'#'.repeat(50)}`);
        console.log(`Level ${student.level} | ${student.screenName} (${student.className})`);
        console.log(`${'#'.repeat(50)}`);

        // 登录
        console.log('\n[1] 登录...');
        const loginOk = await login(page, student);
        if (!loginOk) { console.log('登录失败，跳过'); continue; }

        // 提取书单
        console.log('\n[2] 提取书单...');
        const books = await extractBookList(page, student);
        if (books.length === 0) { console.log('未找到书籍'); continue; }

        if (args.extractOnly) { console.log('[EXTRACT-ONLY] 跳过下载'); continue; }

        // 下载所有可用Level的书籍
        let toDownload = books;
        // 统计各Level数量
        const levelCounts: Record<string, number> = {};
        toDownload.forEach(b => { levelCounts[b.level] = (levelCounts[b.level] || 0) + 1; });
        console.log(`  可下载: ${Object.entries(levelCounts).map(([l, c]) => `${l}(${c})`).join(', ')}`);
        
        if (args.resume) { 
          toDownload = toDownload.filter(b => !isBookDone(progress, b.resourceId)); 
          console.log(`[RESUME] 跳过已完成 ${books.length - toDownload.length} 本`); 
        }
        toDownload = toDownload.slice(0, args.maxBooks);

        console.log(`\n[3] 下载 ${toDownload.length} 本书...\n`);

        for (let i = 0; i < toDownload.length; i++) {
          const book = toDownload[i];
          console.log(`\n[${i + 1}/${toDownload.length}] ${book.title} (rid=${book.resourceId}, level=${book.level})`);
          await downloadBook(page, book, student, args, progress);
          await sleep(500);
        }
      }
    }
  } finally { await browser.close(); }

  const done = progress.records.filter(r => r.status === 'done');
  const partial = progress.records.filter(r => r.status === 'partial');
  const fail = progress.records.filter(r => r.status === 'failed');
  console.log(`\n${'='.repeat(60)}`);
  console.log(`汇总: ${done.length} 完成 | ${partial.length} 部分 | ${fail.length} 失败`);
  console.log(`图片: ${done.reduce((s, r) => s + r.images, 0)} | 音频: ${done.reduce((s, r) => s + r.audio, 0)}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
