/**
 * 扫描downloads目录并生成数据库更新SQL
 * 
 * 功能:
 * 1. 扫描downloads目录下的所有书籍
 * 2. 读取每本书的meta.json
 * 3. 生成INSERT OR REPLACE SQL语句
 * 
 * Usage:
 *   node scripts/generate-books-sql.js > books-update.sql
 *   npx wrangler d1 execute kids-az-db --local --file=books-update.sql
 */

const fs = require('fs');
const path = require('path');

const DOWNLOADS_DIR = path.resolve(__dirname, '..', 'downloads');
const LEVEL_ORDER = ['aa','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','Z1','Z2'];

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function scanBooks() {
  const books = [];
  
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    console.error('Downloads directory not found:', DOWNLOADS_DIR);
    return books;
  }

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

        const imageCount = fs.existsSync(imgDir)
          ? fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg')).length
          : 0;

        const audioCount = fs.existsSync(audioDir)
          ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).length
          : 0;

        // Determine cover_bucket (usually 190 for most books)
        const coverBucket = meta.coverUrl?.match(/books\/(\d+)\//)?.[1] || '190';

        books.push({
          resource_id: meta.resourceId,
          title: meta.title,
          level: level,
          slug: meta.slug || null,
          theme: meta.theme || null,
          content_id: meta.contentId || meta.resourceId,
          cover_bucket: coverBucket,
          image_count: imageCount,
          audio_count: audioCount,
        });
      } catch (e) {
        console.error(`Error reading ${metaPath}:`, e.message);
      }
    }
  }

  return books.sort((a, b) => {
    const ld = LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);
    return ld !== 0 ? ld : a.title.localeCompare(b.title);
  });
}

function generateSql(books) {
  const lines = [];
  
  lines.push('-- Books update SQL');
  lines.push('-- Generated: ' + new Date().toISOString());
  lines.push('-- Total books: ' + books.length);
  lines.push('');
  lines.push('BEGIN TRANSACTION;');
  lines.push('');

  for (const book of books) {
    const sql = `INSERT OR REPLACE INTO books (resource_id, title, level, slug, theme, content_id, cover_bucket, image_count, audio_count) VALUES (${book.resource_id}, ${escapeSql(book.title)}, ${escapeSql(book.level)}, ${escapeSql(book.slug)}, ${escapeSql(book.theme)}, ${book.content_id}, ${escapeSql(book.cover_bucket)}, ${book.image_count}, ${book.audio_count});`;
    lines.push(sql);
  }

  lines.push('');
  lines.push('COMMIT;');
  lines.push('');
  lines.push('-- Summary by level:');
  
  const levelCounts = {};
  for (const book of books) {
    levelCounts[book.level] = (levelCounts[book.level] || 0) + 1;
  }
  
  for (const level of LEVEL_ORDER) {
    if (levelCounts[level]) {
      lines.push(`-- Level ${level}: ${levelCounts[level]} books`);
    }
  }

  return lines.join('\n');
}

function main() {
  const books = scanBooks();
  console.error(`Found ${books.length} books`);
  
  const sql = generateSql(books);
  
  // Write to file
  const outputPath = path.resolve(__dirname, '..', 'books-update.sql');
  fs.writeFileSync(outputPath, sql, 'utf8');
  console.error(`SQL written to ${outputPath}`);
  console.error(`Total INSERT statements: ${sql.split('\n').filter(l => l.includes('INSERT')).length}`);
}

main();
