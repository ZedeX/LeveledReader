/**
 * 针对audio小于5个的书籍，重新下载音频
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DOWNLOADS_DIR = path.resolve(__dirname, '../downloads');
const CDN_BASE = 'https://mi.content.kidsa-z.com';

function scanBooksWithLowAudio() {
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
        const audioDir = path.join(levelDir, bookDir, 'audio');

        const existingAudio = fs.existsSync(audioDir)
          ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).length
          : 0;

        if (existingAudio < 5) {
          books.push({
            level,
            bookDir,
            meta,
            audioDir,
            existingAudio,
            contentId: meta.contentId || meta.resourceId,
            slug: meta.slug,
            theme: meta.theme,
          });
        }
      } catch {}
    }
  }

  return books;
}

function downloadFile(url, destPath) {
  return new Promise((resolve) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Skip if exists
    if (fs.existsSync(destPath)) {
      resolve({ ok: true, skipped: true });
      return;
    }

    const file = fs.createWriteStream(destPath);
    let finished = false;

    const cleanup = (ok, error) => {
      if (finished) return;
      finished = true;
      file.close();
      if (!ok) {
        try { fs.unlinkSync(destPath); } catch {}
      }
      resolve({ ok, error });
    };

    const timeout = setTimeout(() => cleanup(false, 'Timeout'), 15000);

    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        clearTimeout(timeout);
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        https.get(res.headers.location, (res2) => {
          if (res2.statusCode !== 200) {
            cleanup(false, `HTTP ${res2.statusCode}`);
            return;
          }
          res2.pipe(file);
          file.on('finish', () => {
            clearTimeout(timeout);
            finished = true;
            file.close();
            resolve({ ok: true });
          });
        }).on('error', (e) => cleanup(false, e.message));
        return;
      }

      if (res.statusCode !== 200) {
        cleanup(false, `HTTP ${res.statusCode}`);
        return;
      }

      res.pipe(file);
      file.on('finish', () => {
        clearTimeout(timeout);
        finished = true;
        file.close();
        resolve({ ok: true });
      });
    }).on('error', (e) => cleanup(false, e.message));
  });
}

(async () => {
  const books = scanBooksWithLowAudio();
  console.log(`Books with < 5 audio: ${books.length}\n`);

  let totalDownloaded = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const book of books) {
    console.log(`\n[${book.level}/${book.bookDir}] existing: ${book.existingAudio} audio`);
    const { contentId, slug, theme, audioDir } = book;

    if (!slug || !theme) {
      console.log(`  Skipping: no slug/theme in meta.json`);
      continue;
    }

    // Download title audio
    const titleFile = `raz_${slug}_${theme}_title_text.mp3`;
    const titleUrl = `${CDN_BASE}/audio/${contentId}/${titleFile}`;
    const titleDest = path.join(audioDir, titleFile);

    let result = await downloadFile(titleUrl, titleDest);
    if (result.skipped) {
      totalSkipped++;
    } else if (result.ok) {
      console.log(`  + ${titleFile}`);
      totalDownloaded++;
    } else {
      console.log(`  x ${titleFile} (${result.error})`);
      totalFailed++;
    }

    // Download page audio (p1-p20)
    for (let p = 1; p <= 20; p++) {
      const fileName = `raz_${slug}_${theme}_p${p}_text.mp3`;
      const url = `${CDN_BASE}/audio/${contentId}/${fileName}`;
      const dest = path.join(audioDir, fileName);

      result = await downloadFile(url, dest);
      if (result.skipped) {
        totalSkipped++;
      } else if (result.ok) {
        console.log(`  + ${fileName}`);
        totalDownloaded++;
      }
      // Don't count 404 as failed - audio simply doesn't exist
    }
  }

  console.log(`\n========== RESULT ==========`);
  console.log(`Downloaded: ${totalDownloaded}`);
  console.log(`Skipped (already exists): ${totalSkipped}`);
  console.log(`Failed: ${totalFailed}`);
})();
