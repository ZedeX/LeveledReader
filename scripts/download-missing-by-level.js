/**
 * KidsA-Z 按Level补充下载缺失书籍脚本
 * 
 * 基于 download-all-books-v2.ts 的逻辑，增加按Level选择学生下载指定书籍的能力
 * 
 * 流程:
 * 1. 扫描 downloads 目录，找出缺少 slug/theme 或音频不足的书籍
 * 2. 按 Level 分组，从 students-by-level.json 找到对应学生
 * 3. 登录学生 → Reading Room → Leveled Books → 选择Level
 * 4. 找到书籍卡片 → 点击 → overlay → 获取Activity链接
 * 5. 导航到Activity页面 → 拦截请求获取 slug/theme/contentId
 * 6. CDN批量下载图片和音频
 * 
 * Usage:
 *   node scripts/download-missing-by-level.js
 *   node scripts/download-missing-by-level.js --headed
 *   node scripts/download-missing-by-level.js --level E --level H
 *   node scripts/download-missing-by-level.js --max-books 5
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { chromium } = require('playwright');

const BASE = 'https://www.kidsa-z.com';
const CDN = 'https://mi.content.kidsa-z.com';
const OUTPUT_ROOT = path.resolve(__dirname, '..', 'downloads');
const STUDENTS_PATH = path.resolve(__dirname, '..', 'data', 'probe', 'students-by-level.json');
const COOKIES_DIR = path.resolve(__dirname, '..', 'data', 'cookies');
const LEVEL_ORDER = ['aa','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','Z1','Z2'];

fs.mkdirSync(COOKIES_DIR, { recursive: true });

// ============ Args ============

function parseArgs() {
  const a = process.argv.slice(2);
  const getArg = (name) => { const i = a.indexOf(name); return i >= 0 && i + 1 < a.length ? a[i + 1] : ''; };
  const levels = [];
  for (let i = 0; i < a.length; i++) { if (a[i] === '--level' && i + 1 < a.length) levels.push(a[i + 1]); }
  return {
    headed: a.includes('--headed'),
    maxBooks: (() => { const v = parseInt(getArg('--max-books'), 10); return isNaN(v) ? 9999 : v; })(),
    levels,
    skipDownload: a.includes('--skip-download'),
    audioOnly: a.includes('--audio-only'),
  };
}

// ============ Utils ============

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sanitize = (n) => n.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 80);

function httpGetBuffer(url, timeout = 30000) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { httpGetBuffer(res.headers.location, timeout).then(resolve); return; }
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ============ Cookies ============

function cookiesPath(teacher, student, password) {
  const pwdHash = password.sort().join('_');
  return path.join(COOKIES_DIR, `${teacher}_${student}_${pwdHash}.json`);
}

async function saveCookies(context, teacher, student, password) {
  const cookies = await context.cookies();
  fs.writeFileSync(cookiesPath(teacher, student, password), JSON.stringify(cookies, null, 2), 'utf-8');
}

async function loadCookies(context, teacher, student, password) {
  const fpath = cookiesPath(teacher, student, password);
  if (!fs.existsSync(fpath)) return false;
  try {
    const cookies = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
    await context.addCookies(cookies);
    return true;
  } catch { return false; }
}

// ============ CDN Download ============

async function downloadImages(contentId, imgDir) {
  fs.mkdirSync(imgDir, { recursive: true });
  let count = 0;
  let consecutiveMissing = 0;
  for (let page = 0; page <= 60; page++) {
    const url = `${CDN}/readonly/${contentId}/projectable/large/1/book/page-${page}.jpg`;
    const fpath = path.join(imgDir, `page-${String(page).padStart(2, '0')}.jpg`);
    if (fs.existsSync(fpath) && fs.statSync(fpath).size > 10000) { count++; consecutiveMissing = 0; continue; }
    const buf = await httpGetBuffer(url);
    if (!buf || buf.length < 500) { consecutiveMissing++; if (consecutiveMissing >= 3) break; continue; }
    fs.writeFileSync(fpath, buf);
    count++; consecutiveMissing = 0;
    await sleep(50);
  }
  return count;
}

async function downloadAudio(contentId, slug, theme, audioDir) {
  fs.mkdirSync(audioDir, { recursive: true });
  let count = 0;
  // Title audio
  const titleUrl = `${CDN}/audio/${contentId}/raz_${slug}_${theme}_title_text.mp3`;
  const titleFp = path.join(audioDir, `raz_${slug}_${theme}_title_text.mp3`);
  if (!fs.existsSync(titleFp) || fs.statSync(titleFp).size < 100) {
    const buf = await httpGetBuffer(titleUrl);
    if (buf && buf.length > 100) { fs.writeFileSync(titleFp, buf); count++; }
  } else { count++; }
  // Page audio
  let c404 = 0;
  for (let p = 1; p <= 60; p++) {
    const url = `${CDN}/audio/${contentId}/raz_${slug}_${theme}_p${p}_text.mp3`;
    const fp = path.join(audioDir, `raz_${slug}_${theme}_p${p}_text.mp3`);
    if (fs.existsSync(fp) && fs.statSync(fp).size > 1000) { count++; c404 = 0; continue; }
    const buf = await httpGetBuffer(url);
    if (!buf || buf.length < 100) { c404++; if (c404 >= 5) break; continue; }
    fs.writeFileSync(fp, buf);
    count++; c404 = 0;
    await sleep(50);
  }
  return count;
}

// ============ Login (v2 logic) ============

async function loginWithCookies(page, context, teacher, student, password) {
  // Try cookies first
  const cookiesLoaded = await loadCookies(context, teacher, student, password);
  if (cookiesLoaded) {
    console.log(`  尝试cookies登录...`);
    try {
      await page.goto(`${BASE}/ng/student-portal/reading`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      if (page.url().includes('student-portal')) {
        console.log(`  ✓ Cookies登录成功`);
        return true;
      }
    } catch {}
    console.log(`  ✗ Cookies已过期，重新登录`);
  }

  // Normal login
  await context.clearCookies();
  await page.goto(`${BASE}/ng/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(5000);

  // Wait for input
  for (let i = 0; i < 10; i++) {
    if (await page.evaluate(() => !!document.querySelector('input[type="text"], input#username'))) break;
    await sleep(5000);
  }

  // Fill teacher username
  await page.locator('input[type="text"], input#username').first().fill(teacher);
  await page.keyboard.press('Enter');
  await sleep(8000);

  // Click student button
  await page.evaluate((name) => {
    for (const btn of document.querySelectorAll('button, [role="button"]')) {
      if ((btn.textContent || '').trim() === name && btn.offsetWidth > 20) { btn.click(); return true; }
    }
    return false;
  }, student);
  await sleep(5000);

  // Click password icons (mat-icon with data-mat-icon-name)
  await page.waitForFunction(() => !!document.querySelector('mat-icon[data-mat-icon-name], button[aria-label]'), { timeout: 20000 });
  
  const passwordParts = password.map(p => p.toLowerCase());
  for (const n of passwordParts) {
    // Try mat-icon first (v2 way)
    const clickedIcon = await page.evaluate((iconName) => {
      for (const icon of document.querySelectorAll(`mat-icon[data-mat-icon-name="${iconName}"]`)) {
        const btn = icon.closest('button');
        if (btn && btn.offsetWidth > 10) { btn.click(); return true; }
      }
      return false;
    }, n);
    
    if (!clickedIcon) {
      // Fallback: try aria-label (new login page)
      const clickedAria = await page.evaluate((iconName) => {
        for (const btn of document.querySelectorAll('button[aria-label]')) {
          if (btn.getAttribute('aria-label').toLowerCase() === iconName && btn.offsetWidth > 10) {
            btn.click();
            return true;
          }
        }
        return false;
      }, n);
    }
    await sleep(1000);
  }

  // Click submit button
  await page.evaluate(() => {
    const b = document.querySelector('.student-password__submit-button, button[type="submit"]');
    if (b) b.click();
  });
  await sleep(10000);

  // Wait for student portal
  await page.waitForURL('**/student-portal**', { timeout: 30000 }).catch(() => {});
  await sleep(3000);

  const ok = page.url().includes('student-portal') || page.url().includes('portal');
  console.log(`  登录${ok ? '成功' : '可能失败'}: ${page.url()}`);

  if (ok) {
    await saveCookies(context, teacher, student, password);
  }
  return ok;
}

// ============ Navigate to Reading Room (v2 logic) ============

async function navigateToReadingRoom(page) {
  // First go to student-portal home to find Reading button
  await page.goto(`${BASE}/ng/student-portal`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);

  // Click Reading button on student portal home
  try {
    const readingClicked = await page.evaluate(() => {
      for (const btn of document.querySelectorAll('a, button, [role="button"]')) {
        const text = (btn.textContent || '').trim();
        if (text === 'Reading' || text.includes('Reading')) { btn.click(); return text; }
      }
      return '';
    });
    console.log(`  点击Reading: "${readingClicked}"`);
  } catch {}
  await sleep(3000);

  // Now navigate to reading page
  await page.goto(`${BASE}/ng/student-portal/reading`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);

  // Click Reading Room
  let rrClicked = '';
  try {
    rrClicked = await page.evaluate(() => {
      for (const btn of document.querySelectorAll('a, button, [role="button"]')) {
        const text = (btn.textContent || '').trim();
        if (text.includes('Reading Room') || text.includes('Bookroom')) { btn.click(); return text; }
      }
      return '';
    });
  } catch {
    await sleep(5000);
    try {
      rrClicked = await page.evaluate(() => {
        for (const btn of document.querySelectorAll('a, button, [role="button"]')) {
          const text = (btn.textContent || '').trim();
          if (text.includes('Reading Room') || text.includes('Bookroom')) { btn.click(); return text; }
        }
        return '';
      });
    } catch {}
  }
  console.log(`  点击Reading Room: "${rrClicked}"`);
  await sleep(5000);

  // Click Leveled Books
  for (let attempt = 0; attempt < 5; attempt++) {
    let lbClicked = '';
    try {
      lbClicked = await page.evaluate(() => {
        for (const el of document.querySelectorAll('a, button, [role="button"], [class*="tab"]')) {
          const text = (el.textContent || '').trim();
          if (text.includes('Leveled Books') || text.includes('Leveled Book')) { el.click(); return text; }
        }
        return '';
      });
    } catch {
      await sleep(3000);
      continue;
    }
    if (lbClicked) {
      console.log(`  点击Leveled Books: "${lbClicked}"`);
      break;
    }
    console.log(`  等待Leveled Books标签... (${attempt + 1})`);
    await sleep(3000);
  }
  await sleep(3000);
  return true;
}

// ============ Select Level (v2 logic) ============

async function selectLevel(page, level) {
  const clicked = await page.evaluate((lvl) => {
    const link = document.getElementById(`level-${lvl}`);
    if (link) { link.click(); return true; }
    return false;
  }, level);
  if (clicked) {
    await sleep(3000);
    for (let i = 0; i < 10; i++) {
      const count = await page.evaluate(() => document.querySelectorAll('img.card_image[src*="resource-cards/books"]').length);
      if (count > 0) break;
      await sleep(2000);
    }
    await sleep(2000);
  }
  return clicked;
}

// ============ Find and Click Play (v2 logic) ============

async function findAndClickPlay(page) {
  return page.evaluate(() => {
    const cands = [];
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
      const rect = el.getBoundingClientRect();
      if (rect.width > 30 && rect.height > 30) s += 20;
      if (icon.includes('next') || icon.includes('previous') || cls.includes('next') || cls.includes('prev')) s -= 30;
      if (s > 0) cands.push({ el, s });
    });
    cands.sort((a, b) => b.s - a.s);
    if (cands.length > 0) { cands[0].el.click(); return true; }
    return false;
  });
}

async function clickNext(page) {
  return page.evaluate(() => {
    for (const btn of document.querySelectorAll('button, mat-icon, [role="button"]')) {
      const icon = btn.getAttribute('data-mat-icon-name') || '';
      const cls = (btn.className || '').toString().toLowerCase();
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (icon.includes('next') || icon.includes('arrow_right') || aria.includes('next')) {
        if (btn.offsetWidth > 10) { btn.click(); return true; }
      }
      if (cls.includes('next') && btn.offsetWidth > 10) { btn.click(); return true; }
    }
    return false;
  });
}

// ============ Process one book (v2 logic) ============

async function processBookInReadingRoom(page, book) {
  const result = { contentId: book.resourceId, slug: '', theme: '', activityUrl: '' };

  // 1. Navigate to Reading Room
  await navigateToReadingRoom(page);

  // 2. Select Level
  const levelSelected = await selectLevel(page, book.level);
  if (!levelSelected) {
    console.log(`    ✗ 无法选择Level ${book.level}`);
    return result;
  }

  // 3. Scroll and find book card
  let cardClicked = false;
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  for (let scroll = 0; scroll < 30; scroll++) {
    cardClicked = await page.evaluate((rid) => {
      for (const img of document.querySelectorAll('img.card_image[src*="resource-cards/books"]')) {
        if (img.src.includes(`/${rid}.png`)) {
          const container = img.closest('a.card_container') || img.closest('div.card') || img;
          container.click();
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

  // 4. Wait for overlay/dialog
  await page.waitForSelector('[role="dialog"], mat-dialog-container, .body-overlay', { timeout: 10000 }).catch(() => {});
  await sleep(3000);

  // 5. Find Listen Activity link
  const listenInfo = await page.evaluate(() => {
    const links = [];
    document.querySelectorAll('a[href*="/main/Activity/id/"]').forEach(a => {
      links.push({ href: a.href, text: (a.textContent || '').trim().toLowerCase() });
    });
    const listenLink = links.find(l => l.text.includes('listen'));
    if (listenLink) return { found: true, href: listenLink.href };
    if (links.length > 0) return { found: true, href: links[0].href };
    return { found: false };
  });

  if (!listenInfo.found) {
    console.log(`    ✗ 未找到Activity链接`);
    await page.keyboard.press('Escape').catch(() => {});
    return result;
  }

  result.activityUrl = listenInfo.href;
  console.log(`    ✓ Activity链接: ${listenInfo.href}`);

  // 6. Set up request interceptor BEFORE navigation
  // 使用三种方法捕获 mp3 请求（iframe 内的音频可能只被 CDP 捕获）
  const interceptedImgs = [];
  const interceptedMp3s = [];
  const allInterceptedUrls = [];
  
  // 方法1: page.on('request')
  const reqHandler = (req) => {
    const u = req.url();
    if (u.includes('mi.content.kidsa-z.com/readonly/') && u.includes('/book/page-') && !interceptedImgs.includes(u)) {
      interceptedImgs.push(u);
      if (!allInterceptedUrls.includes(u)) allInterceptedUrls.push(u);
    }
    if (u.includes('mi.content.kidsa-z.com/audio/') && u.includes('.mp3') && !interceptedMp3s.includes(u)) {
      interceptedMp3s.push(u);
      allInterceptedUrls.push(u);
      console.log(`    [request] 拦截mp3: ${u.substring(u.lastIndexOf('/') + 1)}`);
    }
  };
  page.on('request', reqHandler);

  // 方法2: page.on('response')
  const resHandler = (res) => {
    const u = res.url();
    if (u.includes('mi.content.kidsa-z.com/audio/') && u.includes('.mp3') && !interceptedMp3s.includes(u)) {
      interceptedMp3s.push(u);
      allInterceptedUrls.push(u);
      console.log(`    [response] 拦截mp3: ${u.substring(u.lastIndexOf('/') + 1)}`);
    }
    if (u.includes('mi.content.kidsa-z.com/readonly/') && u.includes('/book/page-') && !interceptedImgs.includes(u)) {
      interceptedImgs.push(u);
      if (!allInterceptedUrls.includes(u)) allInterceptedUrls.push(u);
    }
  };
  page.on('response', resHandler);

  // 方法3: CDP Network.requestWillBeSent - 最可靠
  let cdpSession = null;
  try {
    cdpSession = await page.context().newCDPSession(page);
    await cdpSession.send('Network.enable');
    cdpSession.on('Network.requestWillBeSent', (params) => {
      const u = params.request.url;
      if (u.includes('mi.content.kidsa-z.com/audio/') && u.includes('.mp3') && !interceptedMp3s.includes(u)) {
        interceptedMp3s.push(u);
        allInterceptedUrls.push(u);
        console.log(`    [CDP] 拦截mp3: ${u.substring(u.lastIndexOf('/') + 1)}`);
      }
      if (u.includes('mi.content.kidsa-z.com/readonly/') && u.includes('/book/page-') && !interceptedImgs.includes(u)) {
        interceptedImgs.push(u);
        if (!allInterceptedUrls.includes(u)) allInterceptedUrls.push(u);
      }
    });
  } catch (e) {
    console.log(`    CDP session创建失败: ${e.message}`);
  }

  try {
    // 7. Navigate to Activity page
    console.log(`    导航到Activity页面...`);
    await page.goto(listenInfo.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // 8. Click play button
    await findAndClickPlay(page);
    await sleep(3000);

    // 9. Extract contentId from intercepted img requests
    if (interceptedImgs.length > 0) {
      const imgMatch = interceptedImgs[0].match(/\/readonly\/(\d+)\//);
      if (imgMatch) {
        result.contentId = parseInt(imgMatch[1], 10);
        console.log(`    ✓ contentId from img: ${result.contentId}`);
      }
    }

    // 10. Wait for mp3: auto-play → click play → Next → play again
    console.log(`    等待音频自动播放...`);
    for (let w = 0; w < 5; w++) { if (interceptedMp3s.length > 0) break; await sleep(2000); }

    for (let attempt = 0; attempt < 15; attempt++) {
      if (interceptedMp3s.length > 0) break;

      const playClicked = await findAndClickPlay(page);
      if (playClicked) {
        console.log(`      [${attempt + 1}] 点击play，等待mp3...`);
        for (let w = 0; w < 10; w++) { if (interceptedMp3s.length > 0) break; await sleep(1000); }
        if (interceptedMp3s.length > 0) break;
      }

      const nextClicked = await clickNext(page);
      if (nextClicked) {
        console.log(`      [${attempt + 1}] 点击Next...`);
        await sleep(3000);
        const playAfterNext = await findAndClickPlay(page);
        if (playAfterNext) {
          console.log(`      翻页后点击play...`);
          for (let w = 0; w < 8; w++) { if (interceptedMp3s.length > 0) break; await sleep(1000); }
        }
        for (let w = 0; w < 5; w++) { if (interceptedMp3s.length > 0) break; await sleep(1000); }
      } else {
        await page.keyboard.press('ArrowRight');
        await sleep(3000);
      }
    }

    // Final wait
    for (let i = 0; i < 5; i++) { if (interceptedMp3s.length > 0) break; await sleep(2000); }

    // 11. Extract slug/theme from mp3
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
      console.log(`    ✗ 未拦截到mp3`);
    }
  } finally {
    page.off('request', reqHandler);
    page.off('response', resHandler);
    if (cdpSession) {
      try { await cdpSession.detach(); } catch {}
    }
  }

  // 将拦截到的URL加入结果
  result.interceptedImgUrls = interceptedImgs;
  result.interceptedMp3Urls = interceptedMp3s;
  result.allInterceptedUrls = allInterceptedUrls;

  return result;
}

// ============ 从拦截到的URL提取范式 ============

function extractPatternFromIntercepted(interceptedImgs, interceptedMp3s) {
  // 从mp3提取 slug/theme/contentId
  if (interceptedMp3s.length > 0) {
    const mp3 = interceptedMp3s.find(u => u.includes('_title_text.mp3')) || interceptedMp3s[0];
    const m = mp3.match(/\/audio\/(\d+)\/raz_(.+?)_(.+?)_(?:title|p\d+)_text\.mp3/);
    if (m) {
      return { contentId: parseInt(m[1], 10), slug: m[2], theme: m[3] };
    }
  }
  // 从img提取 contentId
  if (interceptedImgs.length > 0) {
    const imgMatch = interceptedImgs[0].match(/\/readonly\/(\d+)\//);
    if (imgMatch) {
      return { contentId: parseInt(imgMatch[1], 10), slug: '', theme: '' };
    }
  }
  return null;
}

// ============ 从拦截到的URL直接下载（仅下载拦截到的URL作为补充） ============

async function downloadFromUrls(urls, dir) {
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;
  for (const url of urls) {
    let filename;
    if (url.includes('/book/page-')) {
      // 图片: 从URL提取page号，补零保持 page-02.jpg 格式（与RAZ网站一致）
      const m = url.match(/\/page-(\d+)\.jpg/);
      if (m) {
        filename = `page-${m[1].padStart(2, '0')}.jpg`;
      } else {
        filename = url.split('/').pop();
      }
    } else if (url.includes('/audio/')) {
      const m = url.match(/\/(raz_.+\.mp3)/);
      filename = m ? m[1] : url.split('/').pop();
    } else {
      filename = url.split('/').pop();
    }
    
    const fp = path.join(dir, filename);
    if (fs.existsSync(fp) && fs.statSync(fp).size > 1000) { count++; continue; }
    
    const buf = await httpGetBuffer(url);
    if (buf && buf.length > 100) {
      fs.writeFileSync(fp, buf);
      count++;
    }
    await sleep(50);
  }
  return count;
}

// ============ URL日志 ============

const INTERCEPTED_URLS_FILE = path.resolve(__dirname, '..', 'intercepted-urls.txt');
const interceptedUrlsLog = [];

function logInterceptedUrls(book, info) {
  const timestamp = new Date().toISOString();
  interceptedUrlsLog.push(`\n[${timestamp}] ${book.resourceId}-${book.title} (Level ${book.level})`);
  
  if (info.interceptedImgUrls?.length > 0) {
    interceptedUrlsLog.push(`  IMAGES (${info.interceptedImgUrls.length}):`);
    for (const u of info.interceptedImgUrls) interceptedUrlsLog.push(`    ${u}`);
  }
  if (info.interceptedMp3Urls?.length > 0) {
    interceptedUrlsLog.push(`  AUDIO (${info.interceptedMp3Urls.length}):`);
    for (const u of info.interceptedMp3Urls) interceptedUrlsLog.push(`    ${u}`);
  }
  interceptedUrlsLog.push(`  TOTAL: ${info.allInterceptedUrls?.length || 0} URLs`);
  
  fs.writeFileSync(INTERCEPTED_URLS_FILE, interceptedUrlsLog.join('\n'), 'utf-8');
}

// ============ Return to ReadingRoom ============

async function returnToReadingRoom(page) {
  await page.goto(`${BASE}/main/ReadingBookRoom#!/collectionId/1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
}

// ============ Find missing books ============

function findMissingBooks() {
  const missing = [];
  if (!fs.existsSync(OUTPUT_ROOT)) return missing;

  for (const level of fs.readdirSync(OUTPUT_ROOT)) {
    const levelDir = path.join(OUTPUT_ROOT, level);
    if (!fs.statSync(levelDir).isDirectory()) continue;

    for (const book of fs.readdirSync(levelDir)) {
      const bookDir = path.join(levelDir, book);
      if (!fs.statSync(bookDir).isDirectory()) continue;

      const metaPath = path.join(bookDir, 'meta.json');
      if (!fs.existsSync(metaPath)) continue;

      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const match = book.match(/^(\d+)-(.+)$/);
      if (!match) continue;

      const resourceId = parseInt(match[1], 10);
      const title = match[2];

      // Check if audio is low (regardless of slug/theme)
      const audioDir = path.join(bookDir, 'audio');
      let audioCount = 0;
      if (fs.existsSync(audioDir)) {
        audioCount = fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3') && fs.statSync(path.join(audioDir, f)).size > 1000).length;
      }

      // Check if slug/theme is missing
      if (!meta.slug || !meta.theme) {
        missing.push({ resourceId, title, level, reason: 'missing-slug-theme', slug: meta.slug || '', theme: meta.theme || '', contentId: meta.contentId, audioCount });
        continue;
      }

      // Check if audio is low (slug/theme exists but audio insufficient)
      if (audioCount < 3) {
        missing.push({ resourceId, title, level, reason: 'low-audio', slug: meta.slug, theme: meta.theme, contentId: meta.contentId, audioCount });
      }
    }
  }
  return missing;
}

// ============ Main ============

async function main() {
  const args = parseArgs();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`KidsA-Z 按Level补充下载缺失书籍`);
  console.log(`${'='.repeat(60)}\n`);

  // Load students
  if (!fs.existsSync(STUDENTS_PATH)) {
    console.error('students-by-level.json not found!');
    return;
  }
  const students = JSON.parse(fs.readFileSync(STUDENTS_PATH, 'utf-8'));
  console.log(`加载 ${students.length} 名学生`);

  // Build student lookup by level
  const studentsByLevel = new Map();
  for (const s of students) {
    if (!studentsByLevel.has(s.currentLevel)) studentsByLevel.set(s.currentLevel, []);
    studentsByLevel.get(s.currentLevel).push(s);
  }

  // Find missing books
  const missingBooks = findMissingBooks();
  console.log(`找到 ${missingBooks.length} 本需要处理的书籍\n`);

  if (missingBooks.length === 0) {
    console.log('没有需要处理的书籍。');
    return;
  }

  // Filter by args.levels
  let booksToProcess = missingBooks;
  if (args.levels.length > 0) {
    booksToProcess = missingBooks.filter(b => args.levels.includes(b.level));
    console.log(`筛选Level: ${args.levels.join(', ')} → ${booksToProcess.length} 本`);
  }
  booksToProcess = booksToProcess.slice(0, args.maxBooks);

  // Group by level
  const booksByLevel = new Map();
  for (const book of booksToProcess) {
    if (!booksByLevel.has(book.level)) booksByLevel.set(book.level, []);
    booksByLevel.get(book.level).push(book);
  }

  // Launch browser
  const browser = await chromium.launch({ headless: !args.headed, args: ['--mute-audio'] });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Mute audio via CDP
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Audio.setMuted', { muted: true }).catch(() => {});
  } catch {}

  const results = { success: 0, failed: 0, totalImgs: 0, totalAudio: 0 };

  for (const level of LEVEL_ORDER) {
    const books = booksByLevel.get(level);
    if (!books || books.length === 0) continue;

    const levelStudents = studentsByLevel.get(level);
    if (!levelStudents || levelStudents.length === 0) {
      console.log(`\n[Level ${level}] 无可用学生，跳过 ${books.length} 本`);
      results.failed += books.length;
      continue;
    }

    console.log(`\n${'#'.repeat(50)}`);
    console.log(`Level ${level} | ${books.length} 本 | ${levelStudents.length} 名学生`);
    console.log(`${'#'.repeat(50)}`);

    // Pick first student for this level
    const student = levelStudents[0];
    const password = student.password.split(',').map(p => p.trim());
    console.log(`使用学生: ${student.student} (${student.teacher})`);

    // Login
    const loginOk = await loginWithCookies(page, context, student.teacher, student.student, password);
    if (!loginOk) {
      console.log(`  登录失败，跳过此Level`);
      results.failed += books.length;
      continue;
    }

    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      console.log(`\n[${i + 1}/${books.length}] ${book.resourceId}-${book.title} (Level ${book.level}, reason: ${book.reason})`);

      const bookDir = path.join(OUTPUT_ROOT, book.level, `${book.resourceId}-${sanitize(book.title)}`);
      const imgDir = path.join(bookDir, 'images');
      const audioDir = path.join(bookDir, 'audio');

      if (book.reason === 'low-audio' && book.slug && book.theme && book.contentId) {
        // Already have slug/theme, just re-download audio
        console.log(`  重新下载音频 (slug=${book.slug}, theme=${book.theme})...`);
        const audioCount = await downloadAudio(book.contentId, book.slug, book.theme, audioDir);
        console.log(`  ✓ 音频: ${audioCount} 个文件`);
        results.success++;
        results.totalAudio += audioCount;

        // Update meta
        const metaPath = path.join(bookDir, 'meta.json');
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          meta.audio = audioCount;
          fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        }
        continue;
      }

      // Need to get slug/theme via Playwright
      const info = await processBookInReadingRoom(page, book);

      // 记录拦截到的URL到文件
      logInterceptedUrls(book, info);

      // Download - 提取范式后按模式下载完整系列（直到404），拦截到的URL作为补充
      let imgCount = 0, audioCount = 0;
      if (!args.skipDownload) {
        // 从拦截到的URL提取范式
        const pattern = extractPatternFromIntercepted(info.interceptedImgUrls || [], info.interceptedMp3Urls || []);
        const effectiveContentId = pattern?.contentId || info.contentId;
        const effectiveSlug = pattern?.slug || info.slug;
        const effectiveTheme = pattern?.theme || info.theme;
        
        console.log(`    范式提取: contentId=${effectiveContentId}, slug=${effectiveSlug}, theme=${effectiveTheme}`);
        
        // 图片：优先按范式下载完整系列（p0-pN直到404），回退到拦截URL直接下载
        if (!args.audioOnly) {
          if (effectiveContentId) {
            imgCount = await downloadImages(effectiveContentId, imgDir);
            console.log(`  ✓ 图片(范式下载 p0-pN): ${imgCount} 页`);
          } else if (info.interceptedImgUrls && info.interceptedImgUrls.length > 0) {
            imgCount = await downloadFromUrls(info.interceptedImgUrls, imgDir);
            console.log(`  ✓ 图片(拦截URL): ${imgCount} 页`);
          }
        }
        // 音频：优先按范式下载完整系列（title+p1-pN直到404），回退到拦截URL直接下载
        if (effectiveContentId && effectiveSlug && effectiveTheme) {
          audioCount = await downloadAudio(effectiveContentId, effectiveSlug, effectiveTheme, audioDir);
          console.log(`  ✓ 音频(范式下载 title+p1-pN): ${audioCount} 个文件`);
        } else if (info.interceptedMp3Urls && info.interceptedMp3Urls.length > 0) {
          audioCount = await downloadFromUrls(info.interceptedMp3Urls, audioDir);
          console.log(`  ✓ 音频(拦截URL): ${audioCount} 个文件`);
        } else {
          console.log(`  ✗ 音频跳过: 无法获取slug/theme（Playwright未拦截到mp3）`);
        }
      }

      // Save meta - 使用实际文件系统计数
      const metaPath = path.join(bookDir, 'meta.json');
      const existingMeta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf-8')) : {};
      // 实际统计本地文件数
      const actualImgCount = fs.existsSync(imgDir) ? fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg') && fs.statSync(path.join(imgDir, f)).size > 5000).length : 0;
      const actualAudioCount = fs.existsSync(audioDir) ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3') && fs.statSync(path.join(audioDir, f)).size > 1000).length : 0;
      const meta = {
        ...existingMeta,
        resourceId: book.resourceId,
        contentId: info.contentId || existingMeta.contentId,
        title: book.title,
        level: book.level,
        slug: info.slug || existingMeta.slug,
        theme: info.theme || existingMeta.theme,
        activityUrl: info.activityUrl || existingMeta.activityUrl,
        images: actualImgCount,
        audio: actualAudioCount,
        interceptedImgCount: info.interceptedImgUrls?.length || 0,
        interceptedMp3Count: info.interceptedMp3Urls?.length || 0,
        downloadedAt: new Date().toISOString(),
      };
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

      const hasContent = imgCount > 0 || audioCount > 0;
      if (hasContent) {
        results.success++;
      } else {
        results.failed++;
      }
      results.totalImgs += imgCount;
      results.totalAudio += audioCount;

      // Return to Reading Room for next book
      await returnToReadingRoom(page);
      await sleep(500);
    }
  }

  await browser.close();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`结果: ${results.success} 成功 | ${results.failed} 失败`);
  console.log(`图片: ${results.totalImgs} | 音频: ${results.totalAudio}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
