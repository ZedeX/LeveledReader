/**
 * 统计downloads目录下的书籍资源
 */

const fs = require('fs');
const path = require('path');

const DOWNLOADS_DIR = path.resolve(__dirname, '../downloads');
const OUTPUT_FILE = path.resolve(__dirname, '../downloads-stats-2.txt');

function scanAndStats() {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    console.log('Downloads directory not found');
    return;
  }

  const levels = fs.readdirSync(DOWNLOADS_DIR).filter(f =>
    fs.statSync(path.join(DOWNLOADS_DIR, f)).isDirectory()
  );

  const stats = {
    totalBooks: 0,
    totalImages: 0,
    totalAudio: 0,
    levels: [],
  };

  for (const level of levels) {
    const levelDir = path.join(DOWNLOADS_DIR, level);
    const bookDirs = fs.readdirSync(levelDir).filter(f =>
      fs.statSync(path.join(levelDir, f)).isDirectory()
    );

    const levelStats = {
      level,
      bookCount: bookDirs.length,
      totalImages: 0,
      totalAudio: 0,
      books: [],
    };

    for (const bookDir of bookDirs) {
      const imgDir = path.join(levelDir, bookDir, 'images');
      const audioDir = path.join(levelDir, bookDir, 'audio');

      const images = fs.existsSync(imgDir)
        ? fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg')).length
        : 0;

      const audio = fs.existsSync(audioDir)
        ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).length
        : 0;

      levelStats.totalImages += images;
      levelStats.totalAudio += audio;
      levelStats.books.push({ bookDir, images, audio });

      stats.totalImages += images;
      stats.totalAudio += audio;
    }

    stats.totalBooks += bookDirs.length;
    stats.levels.push(levelStats);
  }

  // Sort levels
  const LEVEL_ORDER = ['aa','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','Z1','Z2'];
  stats.levels.sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));

  // Generate output
  let output = `KidsA-Z Downloads Statistics\n`;
  output += `Generated: ${new Date().toISOString()}\n`;
  output += `${'='.repeat(80)}\n\n`;
  output += `SUMMARY\n`;
  output += `-`.repeat(40) + `\n`;
  output += `Total Levels: ${stats.levels.length}\n`;
  output += `Total Books:  ${stats.totalBooks}\n`;
  output += `Total Images: ${stats.totalImages}\n`;
  output += `Total Audio:  ${stats.totalAudio}\n\n`;
  output += `${'='.repeat(80)}\n\n`;

  for (const level of stats.levels) {
    output += `\nLevel ${level.level} - ${level.bookCount} books, ${level.totalImages} images, ${level.totalAudio} audio\n`;
    output += `-`.repeat(60) + `\n`;

    for (const book of level.books) {
      output += `  ${book.bookDir.padEnd(35)} ${String(book.images).padStart(3)} imgs, ${String(book.audio).padStart(3)} audio\n`;
    }
  }

  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');
  console.log(`Stats saved to: ${OUTPUT_FILE}`);
  console.log(`\nSummary:`);
  console.log(`  Levels: ${stats.levels.length}`);
  console.log(`  Books:  ${stats.totalBooks}`);
  console.log(`  Images: ${stats.totalImages}`);
  console.log(`  Audio:  ${stats.totalAudio}`);
}

scanAndStats();
