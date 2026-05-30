const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.kidsa-z.com';
const LEVEL_ORDER = ['aa','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','Z1','Z2'];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadStudentsByLevel() {
  const studentsPath = path.join(__dirname, '..', 'data', 'probe', 'students-by-level.json');
  if (!fs.existsSync(studentsPath)) {
    console.error('students-by-level.json not found!');
    return [];
  }
  return JSON.parse(fs.readFileSync(studentsPath, 'utf-8'));
}

async function findMissingBooks() {
  const missing = [];
  const downloadsDir = path.join(__dirname, '..', 'downloads');
  
  if (!fs.existsSync(downloadsDir)) {
    console.log('downloads directory not found:', downloadsDir);
    return missing;
  }
  
  const levels = fs.readdirSync(downloadsDir);
  
  for (const level of levels) {
    const levelDir = path.join(downloadsDir, level);
    if (!fs.statSync(levelDir).isDirectory()) continue;
    
    const books = fs.readdirSync(levelDir);
    
    for (const book of books) {
      const bookDir = path.join(levelDir, book);
      if (!fs.statSync(bookDir).isDirectory()) continue;
      
      const metaPath = path.join(bookDir, 'meta.json');
      if (!fs.existsSync(metaPath)) continue;
      
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      
      if (!meta.slug || !meta.theme) {
        const match = book.match(/^(\d+)-(.+)$/);
        if (match) {
          missing.push({
            resourceId: parseInt(match[1], 10),
            title: match[2],
            level: level
          });
        }
      }
    }
  }
  
  return missing;
}

async function loginStudent(page, context, teacher, student, password) {
  console.log(`  Logging in as ${student} (${teacher})...`);
  
  await context.clearCookies();
  console.log(`    Cleared cookies`);
  
  const loginUrl = `https://www.kidsa-z.com/ng/`;
  console.log(`    Navigating to: ${loginUrl}`);
  
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);

  let currentUrl = page.url();
  console.log(`    Current URL: ${currentUrl}`);

  const teacherInput = page.locator('input#username').first();
  await teacherInput.click();
  await teacherInput.fill(teacher);
  await sleep(500);
  console.log(`    Filled teacher username: ${teacher}`);

  const goBtn = page.locator('button[type="submit"][aria-label="Go"]').first();
  await goBtn.click();
  await sleep(3000);
  console.log(`    Clicked Go button`);

  await page.waitForSelector('button.class-chart__students-link', { timeout: 15000 }).catch(() => {});
  
  currentUrl = page.url();
  console.log(`    After Go, URL: ${currentUrl}`);

  const studentCard = page.locator(`button.class-chart__students-link:has-text("${student}")`).first();
  await studentCard.click();
  await sleep(2000);
  console.log(`    Clicked student card: ${student}`);

  await page.waitForURL('**/login/student**', { timeout: 10000 }).catch(() => {});
  await sleep(2000);

  const passwordParts = password.split(',').map(p => p.trim().toLowerCase());
  console.log(`    Password icons: ${passwordParts.join(', ')}`);
  
  for (const pwd of passwordParts) {
    const passwordBtn = page.locator(`button[aria-label="${pwd}"]`).first();
    if (await passwordBtn.isVisible().catch(() => false)) {
      await passwordBtn.click();
      await sleep(500);
      console.log(`    Clicked password: ${pwd}`);
    }
  }
  
  await sleep(1000);

  const submitBtn = page.locator('button[type="submit"], button:has-text("Go")').first();
  if (await submitBtn.isVisible().catch(() => false)) {
    await submitBtn.click();
    console.log(`    Clicked submit button`);
    await sleep(5000);
  }

  // Wait for navigation to complete
  await page.waitForURL('**/student-portal**', { timeout: 30000 }).catch(() => {});
  await sleep(3000);

  const finalUrl = page.url();
  console.log(`    Final URL: ${finalUrl}`);
  
  // Check if we're on student portal or if page has student content
  const isLoggedIn = await page.evaluate(() => {
    // Check for student header elements
    const screenName = document.querySelector('app-screenname span, .header__screenname span');
    const avatar = document.querySelector('app-avatar-portrait, .avatar-portrait');
    return !!(screenName || avatar);
  });
  
  if (finalUrl.includes('student-portal') || isLoggedIn) {
    console.log(`  Login success!`);
    return true;
  }
  
  console.log(`  Login failed - not on student portal`);
  return false;
}

async function processBook(page, context, book) {
  console.log(`\n  [${book.resourceId}-${book.title}] Level ${book.level}`);
  
  let slug = '';
  let theme = '';
  let contentId = 0;
  const interceptedMp3s = [];
  const interceptedImgs = [];

  const reqHandler = (req) => {
    const u = req.url();
    if (u.includes('mi.content.kidsa-z.com/readonly/') && u.includes('/book/page-')) {
      interceptedImgs.push(u);
    }
    if (u.includes('mi.content.kidsa-z.com/audio/') && u.includes('.mp3')) {
      interceptedMp3s.push(u);
      console.log(`    Intercepted mp3`);
    }
  };

  try {
    // Navigate to reading page
    await page.goto(`${BASE}/ng/student-portal/reading`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(3000);

    if (!page.url().includes('student-portal')) {
      console.log(`    Not logged in, skipping...`);
      return null;
    }

    // Click Reading Room
    const rrClicked = await page.evaluate(() => {
      for (const btn of document.querySelectorAll('a, button, [role="button"]')) {
        const text = (btn.textContent || '').trim();
        if (text.includes('Reading Room') || text.includes('Bookroom')) {
          btn.click();
          return text;
        }
      }
      return '';
    });
    console.log(`    Clicked Reading Room: "${rrClicked}"`);
    await sleep(5000);

    // Debug: list all tabs/buttons on the page
    const pageTabs = await page.evaluate(() => {
      const tabs = [];
      document.querySelectorAll('a, button, [role="button"], [class*="tab"]').forEach(el => {
        const text = (el.textContent || '').trim();
        if (text && text.length < 50) {
          tabs.push(text);
        }
      });
      return tabs;
    });
    console.log(`    Page tabs: ${pageTabs.slice(0, 10).join(', ')}`);

    // Click Leveled Books
    let lbClicked = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      lbClicked = await page.evaluate(() => {
        for (const el of document.querySelectorAll('a, button, [role="button"], [class*="tab"]')) {
          const text = (el.textContent || '').trim();
          if (text.includes('Leveled Books') || text.includes('Leveled Book')) {
            el.click();
            return text;
          }
        }
        return '';
      });
      if (lbClicked) {
        console.log(`    Clicked Leveled Books: "${lbClicked}"`);
        break;
      }
      console.log(`    Waiting for Leveled Books... (${attempt + 1})`);
      await sleep(3000);
    }
    
    if (!lbClicked) {
      console.log(`    Leveled Books tab not found, skipping...`);
      return null;
    }
    await sleep(3000);

    // Select level
    let levelSelected = await page.evaluate((lvl) => {
      const link = document.getElementById(`level-${lvl}`);
      if (link) {
        link.click();
        return true;
      }
      return false;
    }, book.level);
    
    if (levelSelected) {
      await sleep(3000);
      console.log(`    Level ${book.level} selected`);
    } else {
      console.log(`    Cannot select level ${book.level}`);
      return null;
    }

    // Find book card
    console.log(`    Searching for book card...`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);

    let cardFound = false;
    for (let scroll = 0; scroll < 50 && !cardFound; scroll++) {
      cardFound = await page.evaluate((rid) => {
        const imgs = document.querySelectorAll('img.card_image[src*="resource-cards/books"]');
        for (const img of imgs) {
          if (img.src.includes(`/${rid}.png`)) {
            const container = img.closest('a') || img.closest('div') || img;
            container.click();
            return true;
          }
        }
        return false;
      }, book.resourceId);

      if (!cardFound) {
        await page.evaluate(() => window.scrollBy(0, 500));
        await sleep(300);
      }
    }

    if (!cardFound) {
      console.log(`    Book card not found`);
      return null;
    }

    console.log(`    Book card clicked`);

    await page.waitForSelector('[role="dialog"], mat-dialog-container', { timeout: 10000 });
    await sleep(2000);

    // Get Activity URL
    const activityInfo = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a[href*="/main/Activity/id/"]').forEach(a => {
        links.push({ href: a.href, text: (a.textContent || '').trim().toLowerCase() });
      });
      const listenLink = links.find(l => l.text.includes('listen'));
      if (listenLink) return { found: true, href: listenLink.href };
      if (links.length > 0) return { found: true, href: links[0].href };
      return { found: false };
    });

    if (!activityInfo.found) {
      console.log(`    No Activity links found`);
      return null;
    }

    console.log(`    Activity URL: ${activityInfo.href}`);

    // Set up request interceptor BEFORE navigating to Activity
    page.on('request', reqHandler);

    // Navigate to Activity
    await page.goto(activityInfo.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    console.log(`    Navigated to Activity: ${page.url()}`);

    // Click play button
    const playClicked = await page.evaluate(() => {
      const cands = [];
      document.querySelectorAll('button, mat-icon, [role="button"], a').forEach(el => {
        let s = 0;
        const icon = (el.getAttribute('data-mat-icon-name') || '').toLowerCase();
        const cls = (el.className || '').toString().toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        if (icon.includes('play') || icon.includes('arrow_right')) s += 60;
        if (cls.includes('play') || cls.includes('arrow')) s += 50;
        if (aria.includes('play')) s += 40;
        const rect = el.getBoundingClientRect();
        if (rect.width > 30 && rect.height > 30) s += 20;
        if (icon.includes('next') || cls.includes('next')) s -= 100;
        if (s > 0) cands.push({ el, s });
      });
      cands.sort((a, b) => b.s - a.s);
      if (cands.length > 0) { cands[0].el.click(); return true; }
      return false;
    });
    
    console.log(`    Play clicked: ${playClicked}`);

    // Wait for mp3
    for (let w = 0; w < 15 && interceptedMp3s.length === 0; w++) {
      await sleep(1000);
    }

    // Try next pages if no mp3
    if (interceptedMp3s.length === 0) {
      console.log(`    Trying to navigate pages...`);
      for (let attempt = 0; attempt < 15 && interceptedMp3s.length === 0; attempt++) {
        await page.evaluate(() => {
          for (const btn of document.querySelectorAll('button, mat-icon')) {
            const icon = btn.getAttribute('data-mat-icon-name') || '';
            const aria = btn.getAttribute('aria-label') || '';
            if (icon.includes('next') || aria.includes('next')) {
              btn.click();
              return;
            }
          }
        });
        await sleep(2000);
      }
    }

    // Extract slug/theme
    if (interceptedMp3s.length > 0) {
      const mp3 = interceptedMp3s.find(u => u.includes('_title_text.mp3')) || interceptedMp3s[0];
      const m = mp3.match(/\/audio\/(\d+)\/raz_(.+?)_(.+?)_(?:title|p\d+)_text\.mp3/);
      if (m) {
        contentId = parseInt(m[1], 10);
        slug = m[2];
        theme = m[3];
        console.log(`    Extracted: slug=${slug}, theme=${theme}, contentId=${contentId}`);
      }
    }

    if (!contentId && interceptedImgs.length > 0) {
      const imgMatch = interceptedImgs[0].match(/\/readonly\/(\d+)\//);
      if (imgMatch) {
        contentId = parseInt(imgMatch[1], 10);
        console.log(`    ContentId from img: ${contentId}`);
      }
    }

  } catch (e) {
    console.log(`    Error: ${e.message}`);
  } finally {
    // Remove request handler
    page.removeListener('request', reqHandler);
  }

  if (slug && theme) {
    return { slug, theme, contentId };
  }
  return null;
}

async function downloadAudioFiles(book, slug, theme, contentId) {
  const bookDir = path.join(__dirname, 'downloads', book.level, `${book.resourceId}-${book.title}`);
  const audioDir = path.join(bookDir, 'audio');
  
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }

  let downloaded = 0;
  for (let p = 1; p <= 30; p++) {
    const url = `https://mi.content.kidsa-z.com/audio/${contentId}/raz_${slug}_${theme}_p${p}_text.mp3`;
    const filePath = path.join(audioDir, `raz_${slug}_${theme}_p${p}_text.mp3`);
    
    if (!fs.existsSync(filePath)) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          fs.writeFileSync(filePath, Buffer.from(buffer));
          downloaded++;
        }
      } catch (e) {}
    }
  }

  return downloaded;
}

function updateMetaJson(book, slug, theme, contentId, audioCount) {
  const bookDir = path.join(__dirname, 'downloads', book.level, `${book.resourceId}-${book.title}`);
  const metaPath = path.join(bookDir, 'meta.json');
  
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    meta.slug = slug;
    meta.theme = theme;
    meta.contentId = contentId;
    meta.audio = audioCount;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    return true;
  }
  return false;
}

async function main() {
  console.log('Loading students by level...');
  const students = loadStudentsByLevel();
  console.log(`Found ${students.length} students\n`);

  console.log('Finding books that need slug/theme...');
  const missingBooks = await findMissingBooks();
  console.log(`Found ${missingBooks.length} books needing attention.\n`);

  if (missingBooks.length === 0) {
    console.log('No books need processing.');
    return;
  }

  const booksByLevel = new Map();
  for (const book of missingBooks) {
    if (!booksByLevel.has(book.level)) {
      booksByLevel.set(book.level, []);
    }
    booksByLevel.get(book.level).push(book);
  }

  const studentsByLevel = new Map();
  for (const student of students) {
    if (!studentsByLevel.has(student.currentLevel)) {
      studentsByLevel.set(student.currentLevel, []);
    }
    studentsByLevel.get(student.currentLevel).push(student);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = { success: 0, failed: 0, totalDownloaded: 0 };

  for (const level of LEVEL_ORDER) {
    const books = booksByLevel.get(level);
    if (!books || books.length === 0) continue;

    const levelStudents = studentsByLevel.get(level);
    if (!levelStudents || levelStudents.length === 0) {
      console.log(`\n[Level ${level}] No students available, skipping ${books.length} books`);
      results.failed += books.length;
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Level ${level}] ${books.length} books, ${levelStudents.length} students`);

    const student = levelStudents[0];
    console.log(`Using student: ${student.student} (${student.teacher})`);

    const loginSuccess = await loginStudent(page, context, student.teacher, student.student, student.password);
    if (!loginSuccess) {
      console.log(`  Failed to login`);
      results.failed += books.length;
      continue;
    }

    for (const book of books) {
      const result = await processBook(page, context, book);
      
      if (result) {
        console.log(`    SUCCESS: slug=${result.slug}, theme=${result.theme}`);
        
        const downloaded = await downloadAudioFiles(book, result.slug, result.theme, result.contentId);
        console.log(`    Downloaded ${downloaded} audio files`);
        
        updateMetaJson(book, result.slug, result.theme, result.contentId, downloaded);
        
        results.success++;
        results.totalDownloaded += downloaded;
      } else {
        console.log(`    FAILED`);
        results.failed++;
      }

      await page.keyboard.press('Escape').catch(() => {});
      await sleep(500);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULTS`);
  console.log(`Success: ${results.success}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Total audio downloaded: ${results.totalDownloaded}`);

  await browser.close();
}

main().catch(console.error);
