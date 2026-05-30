/**
 * 批量补充缺失的图片和音频
 * 
 * 功能:
 * 1. 扫描downloads目录找出缺少资源的书籍
 * 2. 对于有slug/theme的书籍，直接下载缺失资源
 * 3. 对于缺少slug/theme的书籍，通过Playwright获取
 * 
 * Usage:
 *   node scripts/batch-supplement.js
 *   node scripts/batch-supplement.js --headed
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const BASE = 'https://www.kidsa-z.com';
const CDN = 'https://mi.content.kidsa-z.com';
const DOWNLOADS_DIR = path.resolve(__dirname, '..', 'downloads');
const JSON_PATH = path.resolve(__dirname, '..', 'data', 'probe', 'probe-results.json');
const COOKIES_DIR = path.resolve(__dirname, '..', 'data', 'cookies');

fs.mkdirSync(COOKIES_DIR, { recursive: true });

const LEVEL_ORDER = ['aa','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','Z1','Z2'];

function scanBooks() {
  const books = [];
  if (!fs.existsSync(DOWNLOADS_DIR)) return books;

  const levels = fs.readdirSync(DOWNLOADS_DIR).filter(f =>
    fs.statSync(path.join(DOWNLOADS_DIR, f)).isDirectory()
  );

  for (const level of levels) {
    const levelDir = path.join(DOWNLOADS_DIR, level);
    const bookDirs = fs.readdirSync(levelDir).filter(f =>
      fs.statSync(path.join(levelDir, f)).isDirectory()
    );

    for (const bookDir of bookDirs) {
      const metaPath = path.join(levelDir, bookDir, 'meta.json');
      if (!fs.existsSync(metaPath)) continue;

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const imgDir = path.join(levelDir, bookDir, 'images');
        const audioDir = path.join(levelDir, bookDir, 'audio');

        const existingImages = fs.existsSync(imgDir)
          ? fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg')).length
          : 0;

        const existingAudio = fs.existsSync(audioDir)
          ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).length
          : 0;

        const expectedImages = meta.images || 20;
        const hasSlug = meta.slug && meta.theme;
        const missingImages = Math.max(0, expectedImages - existingImages);
        const missingAudio = existingAudio < 5;

        books.push({
          level,
          bookDir,
          resourceId: meta.resourceId,
          contentId: meta.contentId || meta.resourceId,
          title: meta.title,
          meta,
          hasSlug,
          existingImages,
          existingAudio,
          expectedImages,
          missingImages,
          missingAudio,
          priority: LEVEL_ORDER.indexOf(level)
        });
      } catch {}
    }
  }

  return books.sort((a, b) => a.priority - b.priority);
}

function downloadFile(url, destPath) {
  return new Promise((resolve) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(destPath)) { resolve(true); return; }

    const file = fs.createWriteStream(destPath);
    const timeout = setTimeout(() => { 
      file.close(); 
      try { fs.unlinkSync(destPath); } catch {} 
      resolve(false); 
    }, 20000);

    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        clearTimeout(timeout); 
        file.close(); 
        fs.unlinkSync(destPath, () => {});
        https.get(res.headers.location, (res2) => {
          if (res2.statusCode !== 200) { resolve(false); return; }
          res2.pipe(file);
          file.on('finish', () => { clearTimeout(timeout); file.close(); resolve(true); });
        }).on('error', () => resolve(false));
        return;
      }
      if (res.statusCode !== 200) { 
        clearTimeout(timeout); 
        file.close(); 
        fs.unlinkSync(destPath, () => {}); 
        resolve(res.statusCode === 404 ? '404' : false); 
        return; 
      }
      res.pipe(file);
      file.on('finish', () => { clearTimeout(timeout); file.close(); resolve(true); });
    }).on('error', () => { 
      clearTimeout(timeout); 
      file.close(); 
      try { fs.unlinkSync(destPath); } catch {} 
      resolve(false); 
    });
  });
}

async function downloadImages(contentId, outDir, expected) {
  let count = 0;
  let consecutiveFails = 0;
  const maxPages = Math.max(expected + 5, 30);
  
  for (let i = 0; i < maxPages && consecutiveFails < 3; i++) {
    const padded = String(i).padStart(2, '0');
    const url = `${CDN}/readonly/${contentId}/projectable/large/1/book/page-${i}.jpg`;
    const dest = path.join(outDir, `page-${padded}.jpg`);
    
    if (fs.existsSync(dest)) { 
      count++; 
      continue; 
    }
    
    const ok = await downloadFile(url, dest);
    if (ok === true) { 
      count++; 
      consecutiveFails = 0; 
    } else if (ok === '404' || ok === false) {
      consecutiveFails++;
    }
    
    if (i % 5 === 0) process.stdout.write('.');
  }
  
  return count;
}

async function downloadAudio(contentId, slug, theme, outDir) {
  let count = 0;
  
  // Title audio
  const titleUrl = `${CDN}/audio/${contentId}/raz_${slug}_${theme}_title_text.mp3`;
  const titleDest = path.join(outDir, `raz_${slug}_${theme}_title_text.mp3`);
  const titleResult = await downloadFile(titleUrl, titleDest);
  if (titleResult === true) count++;

  // Page audio
  let consecutiveFails = 0;
  for (let p = 1; p <= 30 && consecutiveFails < 5; p++) {
    const url = `${CDN}/audio/${contentId}/raz_${slug}_${theme}_p${p}_text.mp3`;
    const dest = path.join(outDir, `raz_${slug}_${theme}_p${p}_text.mp3`);
    
    if (fs.existsSync(dest)) { 
      count++; 
      continue; 
    }
    
    const ok = await downloadFile(url, dest);
    if (ok === true) { 
      count++; 
      consecutiveFails = 0; 
    } else {
      consecutiveFails++;
    }
    
    if (p % 5 === 0) process.stdout.write('.');
  }
  
  return count;
}

async function main() {
  const args = process.argv.slice(2);
  const headed = args.includes('--headed');
  const dryRun = args.includes('--dry-run');

  console.log('\n=== KidsA-Z Batch Supplement ===\n');
  
  // Scan books
  const books = scanBooks();
  console.log(`Total books: ${books.length}`);

  // Categorize
  const needsSlug = books.filter(b => !b.hasSlug && (b.missingImages > 0 || b.missingAudio));
  const needsContent = books.filter(b => b.hasSlug && (b.missingImages > 0 || b.missingAudio));
  const complete = books.filter(b => !b.missingImages && !b.missingAudio);

  console.log(`  Complete: ${complete.length}`);
  console.log(`  Need slug/theme: ${needsSlug.length}`);
  console.log(`  Need content (has slug): ${needsContent.length}`);

  if (dryRun) {
    console.log('\n--- Books needing slug/theme ---');
    for (const b of needsSlug.slice(0, 20)) {
      console.log(`  [${b.level}] ${b.bookDir}: ${b.existingImages} imgs, ${b.existingAudio} audio`);
    }
    if (needsSlug.length > 20) console.log(`  ... and ${needsSlug.length - 20} more`);

    console.log('\n--- Books needing content ---');
    for (const b of needsContent.slice(0, 20)) {
      console.log(`  [${b.level}] ${b.bookDir}: ${b.existingImages}/${b.expectedImages} imgs, ${b.existingAudio} audio`);
    }
    if (needsContent.length > 20) console.log(`  ... and ${needsContent.length - 20} more`);
    return;
  }

  // Process books with slug/theme
  if (needsContent.length > 0) {
    console.log('\n--- Downloading content for books with slug ---');
    
    let processed = 0;
    let totalImages = 0;
    let totalAudio = 0;

    for (const book of needsContent) {
      processed++;
      console.log(`\n[${processed}/${needsContent.length}] [${book.level}] ${book.title}`);
      console.log(`  Current: ${book.existingImages} imgs, ${book.existingAudio} audio`);
      console.log(`  Slug: ${book.meta.slug}, Theme: ${book.meta.theme}`);

      const imgDir = path.join(DOWNLOADS_DIR, book.level, book.bookDir, 'images');
      const audioDir = path.join(DOWNLOADS_DIR, book.level, book.bookDir, 'audio');

      process.stdout.write('  Downloading images');
      const imgs = await downloadImages(book.contentId, imgDir, book.expectedImages);
      console.log(` ${imgs} total`);

      process.stdout.write('  Downloading audio');
      const audios = await downloadAudio(book.contentId, book.meta.slug, book.meta.theme, audioDir);
      console.log(` ${audios} total`);

      totalImages += imgs;
      totalAudio += audios;

      // Update meta
      book.meta.images = imgs;
      book.meta.audio = audios;
      fs.writeFileSync(path.join(DOWNLOADS_DIR, book.level, book.bookDir, 'meta.json'), JSON.stringify(book.meta, null, 2));
    }

    console.log(`\n  Total downloaded: ${totalImages} images, ${totalAudio} audio`);
  }

  // For books without slug/theme, we need Playwright
  if (needsSlug.length > 0) {
    console.log(`\n--- ${needsSlug.length} books need slug/theme from Activity page ---`);
    console.log('Running Playwright script to get slug/theme...\n');

    // Run the TypeScript supplement script
    const tsxPath = path.resolve(__dirname, '..', 'node_modules', '.bin', 'tsx');
    const scriptPath = path.resolve(__dirname, '..', 'src', 'scraper', 'supplement-missing.ts');
    
    const tsx = spawn(tsxPath, [scriptPath, headed ? '--headed' : '--headless'], {
      stdio: 'inherit',
      shell: true
    });

    await new Promise((resolve) => {
      tsx.on('close', resolve);
    });
  }

  console.log('\n=== Done ===\n');
}

main().catch(console.error);
