const fs = require('fs');
const path = require('path');

const LEVEL_ORDER = ['aa','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','Z1','Z2'];

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

function titleFromSlug(slug) {
  if (!slug) return null;
  return slug
    .split(/(?=[A-Z])/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function generateBookList(onlyFailed = false) {
  const downloadsDir = path.join(__dirname, '..', 'downloads');
  const outputFile = path.join(__dirname, '..', onlyFailed ? 'downloads-failed.txt' : 'downloads-stats-2.txt');
  
  const stats = {
    totalBooks: 0,
    totalImages: 0,
    totalAudio: 0,
    levels: [],
    missingSlugTheme: [],
    zeroAudio: [],
    lowAudio: [],
    zeroImages: []
  };

  for (const level of LEVEL_ORDER) {
    const levelDir = path.join(downloadsDir, level);
    if (!fs.existsSync(levelDir)) continue;

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
      const metaPath = path.join(levelDir, bookDir, 'meta.json');
      const imgDir = path.join(levelDir, bookDir, 'images');
      const audioDir = path.join(levelDir, bookDir, 'audio');

      const images = fs.existsSync(imgDir)
        ? fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg')).length
        : 0;

      const audio = fs.existsSync(audioDir)
        ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).length
        : 0;

      let meta = {};
      if (fs.existsSync(metaPath)) {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      }

      const bookInfo = {
        bookDir,
        resourceId: meta.resourceId || 0,
        title: meta.title || bookDir,
        slug: meta.slug || '',
        theme: meta.theme || '',
        contentId: meta.contentId || 0,
        images,
        audio
      };

      levelStats.totalImages += images;
      levelStats.totalAudio += audio;
      levelStats.books.push(bookInfo);

      stats.totalImages += images;
      stats.totalAudio += audio;

      // Check for issues
      if (!meta.slug || !meta.theme || meta.slug === '' || meta.theme === '') {
        stats.missingSlugTheme.push({
          level,
          resourceId: meta.resourceId,
          title: meta.title,
          images,
          audio
        });
      }

      if (audio === 0) {
        stats.zeroAudio.push({
          level,
          resourceId: meta.resourceId,
          title: meta.title,
          slug: meta.slug || '',
          theme: meta.theme || '',
          contentId: meta.contentId || 0,
          images
        });
      } else if (audio < 5) {
        stats.lowAudio.push({
          level,
          resourceId: meta.resourceId,
          title: meta.title,
          slug: meta.slug || '',
          theme: meta.theme || '',
          contentId: meta.contentId || 0,
          audio,
          images
        });
      }

      if (images === 0) {
        stats.zeroImages.push({
          level,
          resourceId: meta.resourceId,
          title: meta.title,
          slug: meta.slug || '',
          theme: meta.theme || '',
          audio
        });
      }
    }

    stats.totalBooks += bookDirs.length;
    stats.levels.push(levelStats);
  }

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
  
  output += `ISSUES\n`;
  output += `-`.repeat(40) + `\n`;
  output += `Missing slug/theme: ${stats.missingSlugTheme.length}\n`;
  output += `Zero audio:         ${stats.zeroAudio.length}\n`;
  output += `Low audio (<5):     ${stats.lowAudio.length}\n`;
  output += `Zero images:        ${stats.zeroImages.length}\n\n`;
  
  output += `${'='.repeat(80)}\n\n`;

  // Full book list (skip in --failed mode)
  if (!onlyFailed) {
    for (const level of stats.levels) {
    output += `\nLevel ${level.level} - ${level.bookCount} books, ${level.totalImages} images, ${level.totalAudio} audio\n`;
    output += `-`.repeat(60) + `\n`;

    for (const book of level.books) {
      const status = (!book.slug || !book.theme) ? ' [NO SLUG/THEME]' : (book.audio < 5 && book.audio > 0) ? ' [LOW AUDIO]' : '';
      output += `  ${book.bookDir.padEnd(40)} ${String(book.images).padStart(3)} imgs, ${String(book.audio).padStart(3)} audio${status}\n`;
    }
  }
  } // end if (!onlyFailed)

  // Add missing slug/theme section
  if (stats.missingSlugTheme.length > 0) {
    output += `\n\n${'='.repeat(80)}\n`;
    output += `BOOKS MISSING SLUG/THEME (${stats.missingSlugTheme.length})\n`;
    output += `  → 无法构建CDN音频URL，需要通过Playwright获取\n`;
    output += `${'='.repeat(80)}\n\n`;
    
    // Group by level
    const byLevel = {};
    for (const book of stats.missingSlugTheme) {
      if (!byLevel[book.level]) byLevel[book.level] = [];
      byLevel[book.level].push(book);
    }
    for (const [level, books] of Object.entries(byLevel)) {
      output += `  Level ${level} (${books.length} books):\n`;
      for (const book of books) {
        output += `    ${book.resourceId}-${book.title}  (${book.images} imgs, ${book.audio} audio)\n`;
      }
      output += `\n`;
    }
  }

  // Add zero audio section
  if (stats.zeroAudio.length > 0) {
    output += `\n\n${'='.repeat(80)}\n`;
    output += `BOOKS WITH ZERO AUDIO (${stats.zeroAudio.length})\n`;
    output += `  → 有slug/theme但无音频文件，可能CDN上不存在或需要重新下载\n`;
    output += `${'='.repeat(80)}\n\n`;
    
    const byLevel = {};
    for (const book of stats.zeroAudio) {
      if (!byLevel[book.level]) byLevel[book.level] = [];
      byLevel[book.level].push(book);
    }
    for (const [level, books] of Object.entries(byLevel)) {
      output += `  Level ${level} (${books.length} books):\n`;
      for (const book of books) {
        const hasSlugTheme = book.slug && book.theme ? `slug=${book.slug}, theme=${book.theme}` : 'NO SLUG/THEME';
        output += `    ${book.resourceId}-${book.title}  (${book.images} imgs)  ${hasSlugTheme}\n`;
      }
      output += `\n`;
    }
  }

  // Add low audio section
  if (stats.lowAudio.length > 0) {
    output += `\n\n${'='.repeat(80)}\n`;
    output += `BOOKS WITH LOW AUDIO - less than 5 files (${stats.lowAudio.length})\n`;
    output += `  → 音频不完整，可能缺少页面音频\n`;
    output += `${'='.repeat(80)}\n\n`;
    
    const byLevel = {};
    for (const book of stats.lowAudio) {
      if (!byLevel[book.level]) byLevel[book.level] = [];
      byLevel[book.level].push(book);
    }
    for (const [level, books] of Object.entries(byLevel)) {
      output += `  Level ${level} (${books.length} books):\n`;
      for (const book of books) {
        output += `    ${book.resourceId}-${book.title}  (${book.images} imgs, ${book.audio} audio)  slug=${book.slug}, theme=${book.theme}\n`;
      }
      output += `\n`;
    }
  }

  // Add zero images section
  if (stats.zeroImages.length > 0) {
    output += `\n\n${'='.repeat(80)}\n`;
    output += `BOOKS WITH ZERO IMAGES (${stats.zeroImages.length})\n`;
    output += `  → 无图片文件，需要重新下载\n`;
    output += `${'='.repeat(80)}\n\n`;
    
    const byLevel = {};
    for (const book of stats.zeroImages) {
      if (!byLevel[book.level]) byLevel[book.level] = [];
      byLevel[book.level].push(book);
    }
    for (const [level, books] of Object.entries(byLevel)) {
      output += `  Level ${level} (${books.length} books):\n`;
      for (const book of books) {
        output += `    ${book.resourceId}-${book.title}  (${book.audio} audio)  slug=${book.slug || 'NONE'}, theme=${book.theme || 'NONE'}\n`;
      }
      output += `\n`;
    }
  }

  // Add actionable summary for download-missing-by-level.js
  const allMissing = [...stats.missingSlugTheme, ...stats.zeroAudio.filter(b => !stats.missingSlugTheme.some(m => m.resourceId === b.resourceId))];
  if (allMissing.length > 0) {
    output += `\n\n${'='.repeat(80)}\n`;
    output += `ACTIONABLE SUMMARY - 需要通过Playwright下载的书籍\n`;
    output += `${'='.repeat(80)}\n\n`;
    
    const byLevel = {};
    for (const book of allMissing) {
      if (!byLevel[book.level]) byLevel[book.level] = [];
      byLevel[book.level].push(book);
    }
    output += `  按Level分组 (可用于 --level 参数):\n\n`;
    for (const [level, books] of Object.entries(byLevel)) {
      output += `  --level ${level}  →  ${books.length} books: ${books.map(b => b.resourceId).join(', ')}\n`;
    }
    output += `\n  运行命令:\n`;
    output += `  node scripts/download-missing-by-level.js --headed\n`;
    output += `  node scripts/download-missing-by-level.js --headed --level E --level H\n`;
  }

  fs.writeFileSync(outputFile, output, 'utf-8');
  console.log(`Stats saved to: ${outputFile}`);
  console.log(`\nSummary:`);
  console.log(`  Levels: ${stats.levels.length}`);
  console.log(`  Books:  ${stats.totalBooks}`);
  console.log(`  Images: ${stats.totalImages}`);
  console.log(`  Audio:  ${stats.totalAudio}`);
  console.log(`  Missing slug/theme: ${stats.missingSlugTheme.length}`);
  console.log(`  Low audio: ${stats.lowAudio.length}`);

  return stats;
}

// Export for use by other scripts
module.exports = { generateBookList, LEVEL_ORDER, sanitizeFileName, titleFromSlug };

// Run if called directly
if (require.main === module) {
  const onlyFailed = process.argv.includes('--failed') || process.argv.includes('--only-failed');
  generateBookList(onlyFailed);
}
