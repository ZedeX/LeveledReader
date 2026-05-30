/**
 * 扫描downloads目录，检查缺失的mp3文件并下载
 * 同时输出所有img/mp3下载地址到文件
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DOWNLOADS_DIR = path.resolve(__dirname, '../downloads');
const OUTPUT_FILE = path.resolve(__dirname, '../all-download-urls.txt');

const CDN_BASE = 'https://mi.content.kidsa-z.com';

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
          ? fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg')).map(f => f.replace('.jpg', ''))
          : [];

        // Check existing audio
        const existingAudio = fs.existsSync(audioDir)
          ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).map(f => f.replace('.mp3', ''))
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

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(destPath);
    protocol.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(true);
      });
    }).on('error', (e) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch {}
      reject(e);
    });
  });
}

async function main() {
  const books = scanBooks();
  console.log(`Found ${books.length} books\n`);

  const allUrls = [];
  const missingAudio = [];

  for (const book of books) {
    const { meta, level, bookDir, existingImages, existingAudio, imgDir, audioDir } = book;
    const contentId = meta.contentId || meta.resourceId;
    const slug = meta.slug;
    const theme = meta.theme;

    // Generate image URLs
    const imageCount = meta.images || existingImages.length || 20;
    for (let i = 0; i < imageCount; i++) {
      const padded = String(i).padStart(2, '0');
      const fileName = `page-${padded}.jpg`;
      const url = `${CDN_BASE}/readonly/${contentId}/projectable/large/1/book/page-${i}.jpg`;
      allUrls.push({ type: 'img', url, localPath: `${level}/${bookDir}/images/${fileName}` });

      // Check if missing
      if (!existingImages.includes(`page-${padded}`)) {
        // Will download later if needed
      }
    }

    // Generate audio URLs
    if (slug && theme) {
      // Title audio
      const titleFileName = `raz_${slug}_${theme}_title_text.mp3`;
      const titleUrl = `${CDN_BASE}/audio/${contentId}/${titleFileName}`;
      allUrls.push({ type: 'audio', url: titleUrl, localPath: `${level}/${bookDir}/audio/${titleFileName}` });

      if (!existingAudio.includes(titleFileName.replace('.mp3', ''))) {
        missingAudio.push({ book: `${level}/${bookDir}`, url: titleUrl, dest: path.join(audioDir, titleFileName) });
      }

      // Page audio
      const audioCount = meta.audio || 20;
      for (let p = 1; p <= audioCount; p++) {
        const fileName = `raz_${slug}_${theme}_p${p}_text.mp3`;
        const url = `${CDN_BASE}/audio/${contentId}/${fileName}`;
        allUrls.push({ type: 'audio', url, localPath: `${level}/${bookDir}/audio/${fileName}` });

        if (!existingAudio.includes(fileName.replace('.mp3', ''))) {
          missingAudio.push({ book: `${level}/${bookDir}`, url, dest: path.join(audioDir, fileName) });
        }
      }
    }
  }

  // Write all URLs to file
  const urlLines = allUrls.map(u => `${u.type}\t${u.url}\t${u.localPath}`).join('\n');
  fs.writeFileSync(OUTPUT_FILE, urlLines, 'utf-8');
  console.log(`All URLs written to: ${OUTPUT_FILE}`);
  console.log(`Total URLs: ${allUrls.length}\n`);

  // Download missing audio
  console.log(`Missing audio files: ${missingAudio.length}`);
  console.log('Starting download...\n');

  let downloaded = 0;
  let failed = 0;

  for (const item of missingAudio) {
    process.stdout.write(`Downloading: ${path.basename(item.dest)} ... `);
    try {
      await downloadFile(item.url, item.dest);
      console.log('OK');
      downloaded++;
    } catch (e) {
      console.log(`FAILED (${e.message})`);
      failed++;
    }
  }

  console.log(`\nDownload complete: ${downloaded} OK, ${failed} failed`);
}

main().catch(console.error);
