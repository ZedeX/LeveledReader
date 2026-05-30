/**
 * KidsA-Z 本地阅读网站
 * 扫描downloads目录，生成书籍索引，提供在线阅读体验
 * 仿RAZ官网风格：书架式布局、级别导航、沉浸式阅读器
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DOWNLOADS_DIR = path.resolve(__dirname, '../downloads');

// Level排序
const LEVEL_ORDER = ['aa','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','Z1','Z2'];

function levelSortKey(l) {
  const i = LEVEL_ORDER.indexOf(l);
  return i === -1 ? 999 : i;
}

// 扫描所有书籍
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

        const images = fs.existsSync(imgDir)
          ? fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg')).sort()
          : [];

        const audio = fs.existsSync(audioDir)
          ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).sort()
          : [];

        const coverFile = fs.readdirSync(path.join(levelDir, bookDir))
          .find(f => f.startsWith('cover-'));

        books.push({
          resourceId: meta.resourceId,
          title: meta.title,
          level: meta.level || level,
          slug: meta.slug,
          theme: meta.theme,
          contentId: meta.contentId,
          imageCount: images.length,
          audioCount: audio.length,
          images: images,
          audioFiles: audio,
          cover: coverFile ? `/books/${level}/${bookDir}/${coverFile}` : '',
          path: `${level}/${bookDir}`,
        });
      } catch {}
    }
  }

  return books;
}

// 获取书籍详情（含实际文件列表）
function getBookDetail(bookPath) {
  const fullPath = path.join(DOWNLOADS_DIR, bookPath);
  if (!fs.existsSync(fullPath)) return null;

  const metaPath = path.join(fullPath, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const imgDir = path.join(fullPath, 'images');
    const audioDir = path.join(fullPath, 'audio');

    const images = fs.existsSync(imgDir)
      ? fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg')).sort()
      : [];
    const audio = fs.existsSync(audioDir)
      ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).sort()
      : [];

    const coverFile = fs.readdirSync(fullPath).find(f => f.startsWith('cover-'));

    // Encode the book path for URLs (handles special characters like ! and ')
    const encodedBookPath = bookPath.split('/').map(encodeURIComponent).join('/');

    const audioMap = {};
    for (const af of audio) {
      const pageMatch = af.match(/_p(\d+)_text\.mp3$/);
      const titleMatch = af.match(/_title_text\.mp3$/);
      if (pageMatch) {
        audioMap[parseInt(pageMatch[1], 10)] = `/books/${encodedBookPath}/audio/${encodeURIComponent(af)}`;
      } else if (titleMatch) {
        audioMap[0] = `/books/${encodedBookPath}/audio/${encodeURIComponent(af)}`;
      }
    }

    return {
      meta,
      images: images.map(f => `/books/${encodedBookPath}/images/${encodeURIComponent(f)}`),
      audioMap,
      cover: coverFile ? `/books/${encodedBookPath}/${encodeURIComponent(coverFile)}` : '',
      imageCount: images.length,
      audioCount: audio.length,
    };
  } catch {
    return null;
  }
}

// MIME类型
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

// 缓存策略：静态资源长期缓存（30天），HTML不缓存
const CACHE_LONG = 'public, max-age=2592000, immutable';  // 30天
const CACHE_SHORT = 'public, max-age=3600';                // 1小时

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');

  // API: 获取书籍列表
  if (url.pathname === '/api/books') {
    const books = scanBooks();
    const light = books.map(b => ({
      resourceId: b.resourceId,
      title: b.title,
      level: b.level,
      imageCount: b.imageCount,
      audioCount: b.audioCount,
      cover: b.cover,
      path: b.path,
    }));
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': CACHE_SHORT,
    });
    res.end(JSON.stringify(light));
    return;
  }

  // API: 获取书籍详情
  const detailMatch = url.pathname.match(/^\/api\/book\/(.+)$/);
  if (detailMatch) {
    const rawPath = detailMatch[1];
    const bookPath = decodeURIComponent(rawPath);
    console.log(`[API] /api/book/${rawPath} -> decoded: ${bookPath}`);
    const detail = getBookDetail(bookPath);
    if (!detail) {
      console.log(`[API] NOT FOUND: ${bookPath}`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Book not found' }));
      return;
    }
    console.log(`[API] SUCCESS: ${detail.meta.title}`);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': CACHE_SHORT,
    });
    res.end(JSON.stringify(detail));
    return;
  }

  // 静态文件服务
  let urlPath = url.pathname === '/' ? '/index.html' : url.pathname;
  urlPath = decodeURIComponent(urlPath);
  let filePath = path.join(__dirname, 'public', urlPath);

  // 如果public目录没有，尝试从downloads目录提供
  if (!fs.existsSync(filePath)) {
    const booksPath = path.join(DOWNLOADS_DIR, urlPath.replace(/^\/books\//, ''));
    if (fs.existsSync(booksPath)) {
      filePath = booksPath;
    }
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  // 音频文件支持range请求 + 长期缓存
  if (ext === '.mp3') {
    const stat = fs.statSync(filePath);
    const range = req.headers.range;
    // 音频长期缓存
    const cacheHeaders = { 'Cache-Control': CACHE_LONG };
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': 'audio/mpeg',
        ...cacheHeaders,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      ...cacheHeaders,
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // 图片等静态资源 - 长期缓存（30天 immutable）
  if (['.jpg', '.jpeg', '.png', '.svg', '.woff2', '.woff', '.ttf'].includes(ext)) {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': CACHE_LONG,
    });
  } else if (ext === '.html') {
    // HTML不缓存，确保始终获取最新版本
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
  } else {
    res.writeHead(200, { 'Content-Type': contentType });
  }

  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  const books = scanBooks();
  const levels = [...new Set(books.map(b => b.level))].sort((a, b) => levelSortKey(a) - levelSortKey(b));
  console.log(`\n  KidsA-Z Reader`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  ${books.length} books | ${levels.length} levels (${levels.join(', ')})\n`);
});
