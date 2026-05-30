const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.kidsa-z.com';

const STUDENTS = [
  { name: 'Grace', teacher: 'msummer11', password: 'summer', levels: ['aa', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] },
  { name: 'Evan', teacher: 'msummer11', password: 'summer', levels: ['K', 'L', 'M', 'N', 'O'] },
  { name: 'Cassie', teacher: 'msummer11', password: 'summer', levels: ['P', 'Q', 'R', 'S', 'T', 'U'] },
  { name: 'Dylan', teacher: 'msummer11', password: 'summer', levels: ['V', 'W', 'X', 'Y', 'Z', 'Z1', 'Z2'] },
];

const LEVEL_ORDER = ['aa','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','Z1','Z2'];

function getStudentForLevel(level) {
  return STUDENTS.find(s => s.levels.includes(level));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadCookies(page, studentName) {
  const cookiePath = path.join(__dirname, '..', 'cookies', `${studentName}.json`);
  if (fs.existsSync(cookiePath)) {
    const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
    await page.context().addCookies(cookies);
    return true;
  }
  return false;
}

async function saveCookies(page, studentName) {
  const cookies = await page.context().cookies();
  const cookieDir = path.join(__dirname, '..', 'cookies');
  if (!fs.existsSync(cookieDir)) {
    fs.mkdirSync(cookieDir, { recursive: true });
  }
  fs.writeFileSync(path.join(cookieDir, `${studentName}.json`), JSON.stringify(cookies, null, 2));
}

async function loginStudent(page, student) {
  console.log(`  Logging in as ${student.name}...`);
  
  await page.goto(`${BASE}/main/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  const teacherInput = page.locator('input[name="teacherUsername"], input[placeholder*="teacher"], input[id*="teacher"]').first();
  await teacherInput.fill(student.teacher);
  await sleep(500);

  const goBtn = page.locator('button:has-text("Go"), input[type="submit"][value*="Go"], button[type="submit"]').first();
  await goBtn.click();
  await sleep(2000);

  const studentCard = page.locator(`div.student-card:has-text("${student.name}"), div.student:has-text("${student.name}"), [class*="student"]:has-text("${student.name}")`).first();
  await studentCard.click();
  await sleep(1000);

  const passwordIcon = page.locator(`img[alt*="${student.password}"], img[title*="${student.password}"], img[src*="${student.password.toLowerCase()}"]`).first();
  await passwordIcon.click();
  await sleep(2000);

  await page.waitForURL('**/student-portal**', { timeout: 15000 }).catch(() => {});
  
  if (page.url().includes('student-portal')) {
    console.log(`  Login success: ${page.url()}`);
    await saveCookies(page, student.name);
    return true;
  }
  return false;
}

async function navigateToReadingRoom(page) {
  console.log(`    Navigating to Reading Room...`);
  await page.goto(`${BASE}/ng/student-portal/reading`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  // Click "Reading Room" button if present
  const readingRoomBtn = page.locator('button:has-text("Reading Room"), a:has-text("Reading Room")').first();
  if (await readingRoomBtn.isVisible().catch(() => false)) {
    await readingRoomBtn.click();
    await sleep(2000);
  }

  // Click "Leveled Books" if present
  const leveledBooksBtn = page.locator('button:has-text("Leveled Books"), a:has-text("Leveled Books"), span:has-text("Leveled Books")').first();
  if (await leveledBooksBtn.isVisible().catch(() => false)) {
    await leveledBooksBtn.click();
    await sleep(2000);
    console.log(`    Clicked Leveled Books`);
  }
}

async function selectLevel(page, level) {
  console.log(`    Selecting level ${level}...`);
  
  // Try different selectors for level buttons
  const selectors = [
    `button:has-text("${level}")`,
    `[class*="level-btn"]:has-text("${level}")`,
    `[class*="levelTab"]:has-text("${level}")`,
    `span:has-text("${level}")`,
    `div:has(> span:has-text("${level}"))`,
  ];

  for (const selector of selectors) {
    try {
      const levelBtn = page.locator(selector).first();
      if (await levelBtn.isVisible({ timeout: 1000 })) {
        await levelBtn.click();
        await sleep(1500);
        console.log(`    Level ${level} selected`);
        return true;
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  // Try to find level by evaluating all buttons/spans
  const levelFound = await page.evaluate((lvl) => {
    const elements = document.querySelectorAll('button, span, div[class*="level"]');
    for (const el of elements) {
      if (el.textContent?.trim() === lvl) {
        el.click();
        return true;
      }
    }
    return false;
  }, level);

  if (levelFound) {
    await sleep(1500);
    console.log(`    Level ${level} selected via evaluate`);
    return true;
  }

  console.log(`    Cannot select level ${level}`);
  return false;
}

async function findBookCard(page, resourceId) {
  console.log(`    Finding book card for ${resourceId}...`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  for (let scroll = 0; scroll < 30; scroll++) {
    const cardFound = await page.evaluate((rid) => {
      // Try multiple selectors for book cards
      const selectors = [
        `img.card_image[src*="resource-cards/books"]`,
        `img[src*="${rid}.png"]`,
        `img[src*="resource-cards/books/${rid}"]`,
      ];

      for (const selector of selectors) {
        const imgs = document.querySelectorAll(selector);
        for (const img of imgs) {
          if (img.src.includes(`/${rid}.png`)) {
            const container = img.closest('a.card_container') || img.closest('div.card') || img.closest('[class*="card"]') || img;
            container.click();
            return true;
          }
        }
      }
      return false;
    }, resourceId);

    if (cardFound) {
      console.log(`    Book card found`);
      return true;
    }
    
    await page.evaluate(() => window.scrollBy(0, 500));
    await sleep(300);
  }

  console.log(`    Book card not found`);
  return false;
}

async function getSlugThemeFromActivity(page, book) {
  let slug = '';
  let theme = '';
  let contentId = 0;

  const requestHandler = (req) => {
    const u = req.url();
    if (u.includes('mi.content.kidsa-z.com/audio/') && u.includes('.mp3')) {
      const match = u.match(/\/audio\/(\d+)\/raz_([^_]+)_([^_]+)_/);
      if (match) {
        contentId = parseInt(match[1], 10);
        slug = match[2];
        theme = match[3];
        console.log(`    Intercepted audio: slug=${slug}, theme=${theme}, contentId=${contentId}`);
      }
    }
    if (u.includes('mi.content.kidsa-z.com/readonly/') && u.includes('/book/page-')) {
      const match = u.match(/\/readonly\/(\d+)\/book\/page-/);
      if (match && !contentId) {
        contentId = parseInt(match[1], 10);
        console.log(`    Intercepted readonly: contentId=${contentId}`);
      }
    }
  };

  page.on('request', requestHandler);

  try {
    // Wait for dialog/overlay
    await page.waitForSelector('[role="dialog"], mat-dialog-container, .body-overlay, .cdk-overlay-pane', { timeout: 10000 });
    await sleep(2000);

    // Find and click Listen link
    const listenLink = page.locator('a[href*="/main/Activity/id/"]').first();
    const linkCount = await page.locator('a[href*="/main/Activity/id/"]').count();
    console.log(`    Found ${linkCount} Activity links`);

    if (linkCount > 0) {
      // Try to find Listen link first
      const listenLinks = await page.locator('a[href*="/main/Activity/id/"]').all();
      let clicked = false;
      
      for (const link of listenLinks) {
        const text = await link.textContent();
        if (text?.toLowerCase().includes('listen')) {
          await link.click();
          clicked = true;
          break;
        }
      }
      
      if (!clicked && listenLinks.length > 0) {
        await listenLinks[0].click();
      }

      await sleep(3000);

      // Try to click play button
      const playBtn = page.locator('button[class*="play"], [class*="play-button"], img[src*="play"], [aria-label*="play"]').first();
      if (await playBtn.isVisible().catch(() => false)) {
        await playBtn.click();
        await sleep(3000);
      }

      // Navigate through pages to trigger audio requests
      for (let i = 0; i < 10 && (!slug || !theme); i++) {
        await page.keyboard.press('ArrowRight');
        await sleep(2000);
      }
    }
  } catch (e) {
    console.log(`    Error getting slug/theme: ${e.message}`);
  } finally {
    page.removeListener('request', requestHandler);
  }

  if (slug && theme) {
    return { slug, theme, contentId };
  }
  return null;
}

async function downloadAudioFiles(book, slug, theme, contentId) {
  const bookDir = path.join(__dirname, '..', 'downloads', book.level, `${book.resourceId}-${book.title}`);
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
      } catch (e) {
        // Ignore errors
      }
    }
  }

  return downloaded;
}

function updateMetaJson(book, slug, theme, contentId, audioCount, newTitle) {
  const bookDir = path.join(__dirname, '..', 'downloads', book.level, `${book.resourceId}-${book.title}`);
  const metaPath = path.join(bookDir, 'meta.json');
  
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    meta.slug = slug;
    meta.theme = theme;
    meta.contentId = contentId;
    meta.audio = audioCount;
    if (newTitle && newTitle !== meta.title) {
      meta.title = newTitle;
      // Rename directory
      const newBookDir = path.join(__dirname, '..', 'downloads', book.level, `${book.resourceId}-${newTitle}`);
      if (bookDir !== newBookDir && !fs.existsSync(newBookDir)) {
        fs.renameSync(bookDir, newBookDir);
        console.log(`    Renamed directory to: ${newBookDir}`);
      }
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
}

function findMissingBooks() {
  const downloadsDir = path.join(__dirname, '..', 'downloads');
  const missingBooks = [];

  for (const level of LEVEL_ORDER) {
    const levelDir = path.join(downloadsDir, level);
    if (!fs.existsSync(levelDir)) continue;

    const books = fs.readdirSync(levelDir).filter(f => fs.statSync(path.join(levelDir, f)).isDirectory());
    
    for (const bookDir of books) {
      const metaPath = path.join(levelDir, bookDir, 'meta.json');
      if (!fs.existsSync(metaPath)) continue;

      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const audioDir = path.join(levelDir, bookDir, 'audio');
      const audioCount = fs.existsSync(audioDir) ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).length : 0;

      const needsSlugTheme = !meta.slug || !meta.theme || meta.slug === '' || meta.theme === '';
      const hasWrongTitle = /^Book \d+$/.test(meta.title);

      if (needsSlugTheme || hasWrongTitle) {
        console.log(`  [${level}] ${bookDir} - slug: "${meta.slug}", theme: "${meta.theme}", audio: ${audioCount}, wrongTitle: ${hasWrongTitle}`);
        missingBooks.push({
          resourceId: meta.resourceId,
          title: meta.title,
          level: meta.level || level,
          slug: meta.slug || '',
          theme: meta.theme || '',
          contentId: meta.contentId || 0,
          audioCount: audioCount
        });
      }
    }
  }

  return missingBooks;
}

function titleFromSlug(slug) {
  if (!slug) return null;
  return slug
    .split(/(?=[A-Z])/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function main() {
  console.log('Finding books that need slug/theme and audio...');
  const missingBooks = findMissingBooks();
  
  console.log(`\nFound ${missingBooks.length} books needing attention.`);

  if (missingBooks.length === 0) {
    console.log('No books need processing.');
    return;
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const booksByStudent = new Map();
  
  for (const book of missingBooks) {
    const student = getStudentForLevel(book.level);
    if (student) {
      if (!booksByStudent.has(student)) {
        booksByStudent.set(student, []);
      }
      booksByStudent.get(student).push(book);
    } else {
      console.log(`No student found for level ${book.level}`);
    }
  }

  let totalDownloaded = 0;
  const results = [];

  for (const [student, books] of booksByStudent) {
    console.log(`\n[Student: ${student.name}] Processing ${books.length} books (Levels: ${student.levels.join(', ')})`);

    await loadCookies(page, student.name);
    await page.goto(`${BASE}/ng/student-portal`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    if (!page.url().includes('student-portal')) {
      const loginSuccess = await loginStudent(page, student);
      if (!loginSuccess) {
        console.log(`  Failed to login as ${student.name}`);
        continue;
      }
    }

    for (const book of books) {
      console.log(`\n  [${book.resourceId}-${book.title}] (Level: ${book.level}, audio: ${book.audioCount})`);
      
      try {
        await navigateToReadingRoom(page);
        
        const levelSelected = await selectLevel(page, book.level);
        if (!levelSelected) {
          results.push({ book, status: 'failed', reason: 'Cannot select level' });
          continue;
        }

        const cardFound = await findBookCard(page, book.resourceId);
        if (!cardFound) {
          results.push({ book, status: 'failed', reason: 'Book card not found' });
          continue;
        }

        const result = await getSlugThemeFromActivity(page, book);
        if (result) {
          console.log(`    SUCCESS: slug=${result.slug}, theme=${result.theme}`);
          
          const downloaded = await downloadAudioFiles(book, result.slug, result.theme, result.contentId);
          console.log(`    Downloaded ${downloaded} audio files`);
          totalDownloaded += downloaded;

          const newTitle = titleFromSlug(result.slug);
          updateMetaJson(book, result.slug, result.theme, result.contentId, downloaded, newTitle);
          if (newTitle && newTitle !== book.title) {
            console.log(`    Updated title: ${book.title} -> ${newTitle}`);
          }
          
          results.push({ book, status: 'success', slug: result.slug, theme: result.theme, downloaded });
        } else {
          console.log(`    FAILED: Could not get slug/theme`);
          results.push({ book, status: 'failed', reason: 'Could not get slug/theme' });
        }

        // Close dialog and go back
        await page.keyboard.press('Escape').catch(() => {});
        await sleep(500);

      } catch (e) {
        console.log(`    Error: ${e.message}`);
        results.push({ book, status: 'error', reason: e.message });
      }
    }
  }

  await browser.close();
  
  console.log(`\n========== RESULTS ==========`);
  console.log(`Total audio files downloaded: ${totalDownloaded}`);
  
  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status !== 'success');
  
  console.log(`\nSuccessful: ${successful.length}`);
  successful.forEach(r => console.log(`  [${r.book.level}] ${r.book.resourceId}-${r.book.title}: slug=${r.slug}, downloaded=${r.downloaded}`));
  
  console.log(`\nFailed: ${failed.length}`);
  failed.forEach(r => console.log(`  [${r.book.level}] ${r.book.resourceId}-${r.book.title}: ${r.reason}`));
}

main().catch(console.error);
