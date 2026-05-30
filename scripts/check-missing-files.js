/**
 * 检查真正缺失的文件
 */

const fs = require('fs');
const path = require('path');

const DOWNLOADS_DIR = path.resolve(__dirname, '../downloads');

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

        // Check existing images
        const existingImages = fs.existsSync(imgDir)
          ? fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg'))
          : [];

        // Check existing audio
        const existingAudio = fs.existsSync(audioDir)
          ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3'))
          : [];

        books.push({
          level,
          bookDir,
          meta,
          existingImages,
          existingAudio,
          imgDir,
          audioDir,
        });
      } catch {}
    }
  }

  return books;
}

const CDN_BASE = 'https://mi.content.kidsa-z.com';

function checkUrl(url) {
  return new Promise((resolve) => {
    const https = require('https');
    https.get(url, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

(async () => {
  const books = scanBooks();
  console.log(`Total books: ${books.length}\n`);

  const missingUrls = [];
  let totalMissing = 0;

  for (const book of books) {
    const { meta, level, bookDir, existingImages, existingAudio, imgDir, audioDir } = book;
    const contentId = meta.contentId || meta.resourceId;
    const slug = meta.slug;
    const theme = meta.theme;
    const imageCount = meta.images || existingImages.length || 20;

    // Check images
    for (let i = 0; i < imageCount; i++) {
      const padded = String(i).padStart(2, '0');
      const fileName = `page-${padded}.jpg`;
      if (!existingImages.includes(fileName)) {
        const url = `${CDN_BASE}/readonly/${contentId}/projectable/large/1/book/page-${i}.jpg`;
        missingUrls.push({ type: 'img', url, localPath: `${level}/${bookDir}/images/${fileName}` });
      }
    }

    // Check audio
    if (slug && theme) {
      // Title audio
      const titleFileName = `raz_${slug}_${theme}_title_text.mp3`;
      if (!existingAudio.includes(titleFileName)) {
        const url = `${CDN_BASE}/audio/${contentId}/${titleFileName}`;
        missingUrls.push({ type: 'audio', url, localPath: `${level}/${bookDir}/audio/${titleFileName}` });
      }

      // Page audio (check up to 20 pages)
      for (let p = 1; p <= 20; p++) {
        const fileName = `raz_${slug}_${theme}_p${p}_text.mp3`;
        if (!existingAudio.includes(fileName)) {
          const url = `${CDN_BASE}/audio/${contentId}/${fileName}`;
          missingUrls.push({ type: 'audio', url, localPath: `${level}/${bookDir}/audio/${fileName}` });
        }
      }
    }
  }

  console.log(`Missing files: ${missingUrls.length}`);

  // Test a few URLs to see if they exist on CDN
  console.log('\nTesting CDN availability (first 10 missing)...');
  for (let i = 0; i < Math.min(10, missingUrls.length); i++) {
    const item = missingUrls[i];
    const exists = await checkUrl(item.url);
    console.log(`${exists ? 'OK' : '404'} ${item.type} ${item.url.split('/').pop()}`);
  }

  // Save missing URLs
  const outputFile = path.resolve(__dirname, '../missing-files.txt');
  const content = missingUrls.map(u => `${u.type}\t${u.url}\t${u.localPath}`).join('\n');
  fs.writeFileSync(outputFile, content, 'utf-8');
  console.log(`\nMissing URLs saved to: ${outputFile}`);
})();
