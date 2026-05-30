const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_ROOT = path.resolve(__dirname, '..', 'downloads');
const READER_HTML = path.resolve(__dirname, '..', 'reader.html');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sanitize = (n) => n.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 80);

function httpGetBuffer(url, timeout = 30000) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGetBuffer(res.headers.location, timeout).then(resolve);
        return;
      }
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

function parseReaderData() {
  const html = fs.readFileSync(READER_HTML, 'utf-8');
  const dataMatch = html.match(/var DATA=(\{.*?\});\s*var allBooks/);
  if (!dataMatch) { console.error('Cannot find DATA in reader.html'); process.exit(1); }
  return JSON.parse(dataMatch[1]);
}

function findBookDir(level, resourceId, title) {
  const levelDir = path.join(OUTPUT_ROOT, level);
  if (!fs.existsSync(levelDir)) return null;
  const prefix = `${resourceId}-`;
  for (const d of fs.readdirSync(levelDir)) {
    if (d.startsWith(prefix)) return path.join(levelDir, d);
  }
  return null;
}

function getExistingFiles(dir, ext, minSize) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(ext) && fs.statSync(path.join(dir, f)).size > minSize);
}

function buildImageUrls(book) {
  const urls = [];
  for (let j = 0; j < book.pageCount; j++) {
    urls.push(`https://mi.content.kidsa-z.com/readonly/${book.id}/projectable/large/1/book/page-${j}.jpg`);
  }
  return urls;
}

function buildAudioUrls(book) {
  const urls = [];
  if (!book.audioUrls) return urls;
  if (book.audioUrls.title) urls.push(book.audioUrls.title);
  if (book.audioUrls.pages) {
    const pageNums = Object.keys(book.audioUrls.pages).map(Number).sort((a, b) => a - b);
    for (const p of pageNums) {
      urls.push(book.audioUrls.pages[p]);
    }
  }
  return urls;
}

async function main() {
  const DATA = parseReaderData();
  const readerBooks = DATA.books;
  console.log(`reader.html: ${readerBooks.length} 本书`);

  let totalMissingImgs = 0;
  let totalMissingAudios = 0;
  let totalDownloadedImgs = 0;
  let totalDownloadedAudios = 0;
  let totalSkippedImgs = 0;
  let totalSkippedAudios = 0;
  let totalFailedImgs = 0;
  let totalFailedAudios = 0;
  let booksProcessed = 0;
  let booksWithMissing = 0;

  const results = [];

  for (const book of readerBooks) {
    const bookDir = findBookDir(book.level, book.id, book.title);
    if (!bookDir) continue;

    const imgDir = path.join(bookDir, 'images');
    const audioDir = path.join(bookDir, 'audio');

    const existingImgs = new Set(getExistingFiles(imgDir, '.jpg', 5000));
    const existingAudios = new Set(getExistingFiles(audioDir, '.mp3', 1000));

    const readerImgUrls = buildImageUrls(book);
    const readerAudioUrls = buildAudioUrls(book);

    const missingImgUrls = [];
    const missingAudioUrls = [];

    for (const url of readerImgUrls) {
      const m = url.match(/\/page-(\d+)\.jpg/);
      if (!m) continue;
      const filename = `page-${m[1].padStart(2, '0')}.jpg`;
      if (!existingImgs.has(filename)) {
        missingImgUrls.push({ url, filename });
      }
    }

    for (const url of readerAudioUrls) {
      const m = url.match(/\/(raz_.+\.mp3)/);
      const filename = m ? m[1] : url.split('/').pop();
      if (!existingAudios.has(filename)) {
        missingAudioUrls.push({ url, filename });
      }
    }

    if (missingImgUrls.length === 0 && missingAudioUrls.length === 0) continue;

    booksWithMissing++;
    totalMissingImgs += missingImgUrls.length;
    totalMissingAudios += missingAudioUrls.length;

    const bookResult = {
      id: book.id,
      title: book.title,
      level: book.level,
      missingImgs: missingImgUrls.length,
      missingAudios: missingAudioUrls.length,
      downloadedImgs: 0,
      downloadedAudios: 0,
      failedImgs: 0,
      failedAudios: 0,
    };

    console.log(`\n[${booksWithMissing}] ${book.level}/${book.id}-${book.title}: 缺 ${missingImgUrls.length} imgs, ${missingAudioUrls.length} audios`);

    // Download missing images
    fs.mkdirSync(imgDir, { recursive: true });
    for (const { url, filename } of missingImgUrls) {
      const fp = path.join(imgDir, filename);
      const buf = await httpGetBuffer(url);
      if (buf && buf.length > 500) {
        fs.writeFileSync(fp, buf);
        bookResult.downloadedImgs++;
        totalDownloadedImgs++;
      } else {
        bookResult.failedImgs++;
        totalFailedImgs++;
      }
      await sleep(30);
    }

    // Download missing audios
    fs.mkdirSync(audioDir, { recursive: true });
    for (const { url, filename } of missingAudioUrls) {
      const fp = path.join(audioDir, filename);
      const buf = await httpGetBuffer(url);
      if (buf && buf.length > 100) {
        fs.writeFileSync(fp, buf);
        bookResult.downloadedAudios++;
        totalDownloadedAudios++;
      } else {
        bookResult.failedAudios++;
        totalFailedAudios++;
      }
      await sleep(30);
    }

    // Update meta.json
    const metaPath = path.join(bookDir, 'meta.json');
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const actualImgCount = getExistingFiles(imgDir, '.jpg', 5000).length;
      const actualAudioCount = getExistingFiles(audioDir, '.mp3', 1000).length;
      meta.images = actualImgCount;
      meta.audio = actualAudioCount;

      // Extract slug/theme from audio URLs if missing
      if ((!meta.slug || !meta.theme) && readerAudioUrls.length > 0) {
        const mp3 = readerAudioUrls.find(u => u.includes('_title_text.mp3')) || readerAudioUrls[0];
        const m = mp3.url ? mp3.url.match(/\/audio\/(\d+)\/raz_(.+?)_(.+?)_(?:title|p\d+)_text\.mp3/) : null;
        if (m) {
          meta.contentId = parseInt(m[1], 10);
          meta.slug = m[2];
          meta.theme = m[3];
        }
      }

      meta.supplementedAt = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    }

    if (bookResult.downloadedImgs > 0 || bookResult.downloadedAudios > 0) {
      console.log(`  ✓ 下载: ${bookResult.downloadedImgs} imgs, ${bookResult.downloadedAudios} audios`);
    }
    if (bookResult.failedImgs > 0 || bookResult.failedAudios > 0) {
      console.log(`  ✗ 失败: ${bookResult.failedImgs} imgs, ${bookResult.failedAudios} audios`);
    }

    results.push(bookResult);
    booksProcessed++;

    if (booksProcessed % 20 === 0) {
      console.log(`\n--- 进度: ${booksProcessed} 本处理中, 已下载 ${totalDownloadedImgs} imgs + ${totalDownloadedAudios} audios ---\n`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('补完结果汇总');
  console.log('='.repeat(70));
  console.log(`  处理书籍: ${booksWithMissing} 本有缺失`);
  console.log(`  缺失图片: ${totalMissingImgs} 个 → 下载成功: ${totalDownloadedImgs}, 失败: ${totalFailedImgs}`);
  console.log(`  缺失音频: ${totalMissingAudios} 个 → 下载成功: ${totalDownloadedAudios}, 失败: ${totalFailedAudios}`);

  if (totalFailedImgs > 0 || totalFailedAudios > 0) {
    console.log('\n  失败详情:');
    for (const r of results) {
      if (r.failedImgs > 0 || r.failedAudios > 0) {
        console.log(`    ${r.level}/${r.id}-${r.title}: 失败 ${r.failedImgs} imgs, ${r.failedAudios} audios`);
      }
    }
  }

  // Save results
  const reportPath = path.resolve(__dirname, '..', 'supplement-results.json');
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), totalMissingImgs, totalMissingAudios, totalDownloadedImgs, totalDownloadedAudios, totalFailedImgs, totalFailedAudios, books: results }, null, 2));
  console.log(`\n结果已保存到: ${reportPath}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
