/**
 * 从downloads目录的meta.json文件导入书籍元数据到D1数据库
 * 用法: node import-books.js
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
        // Extract cover_bucket from coverUrl
        let coverBucket = '';
        if (meta.coverUrl) {
          const m = meta.coverUrl.match(/\/books\/(\d+)\//);
          if (m) coverBucket = m[1];
        }

        books.push({
          resource_id: meta.resourceId,
          title: meta.title,
          level: meta.level || level,
          slug: meta.slug || '',
          theme: meta.theme || '',
          content_id: meta.contentId || meta.resourceId,
          cover_bucket: coverBucket,
          image_count: meta.images || 0,
          audio_count: meta.audio || 0,
        });
      } catch {}
    }
  }
  return books;
}

const books = scanBooks();
console.log(`Found ${books.length} books`);

// Generate SQL INSERT statements
let sql = '';
for (const b of books) {
  const title = b.title.replace(/'/g, "''");
  sql += `INSERT OR IGNORE INTO books (resource_id, title, level, slug, theme, content_id, cover_bucket, image_count, audio_count) VALUES (${b.resource_id}, '${title}', '${b.level}', '${b.slug}', '${b.theme}', ${b.content_id}, '${b.cover_bucket}', ${b.image_count}, ${b.audio_count});\n`;
}

const outPath = path.resolve(__dirname, 'src/db/import-books.sql');
fs.writeFileSync(outPath, sql, 'utf-8');
console.log(`SQL written to ${outPath}`);
