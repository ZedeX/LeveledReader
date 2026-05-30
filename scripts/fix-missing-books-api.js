const fs = require('fs');
const path = require('path');

const LEVEL_ORDER = ['aa','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','Z1','Z2'];

function findMissingBooks() {
  const downloadsDir = path.join(__dirname, '..', 'downloads');
  const missingBooks = [];

  for (const level of LEVEL_ORDER) {
    const levelDir = path.join(downloadsDir, level);
    if (!fs.existsSync(levelDir)) continue;

    const books = fs.readdirSync(levelDir).filter(f => fs.statSync(path.join(levelDir, f)).isDirectory());
    
    for (const bookDir of books) {
      const metaPath = path.join(levelDir, bookDir, 'meta.json');
      if (!fs.existsSync(metaPath)) continue;

      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const audioDir = path.join(levelDir, bookDir, 'audio');
      const audioCount = fs.existsSync(audioDir) ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).length : 0;

      const needsSlugTheme = !meta.slug || !meta.theme || meta.slug === '' || meta.theme === '';
      const hasWrongTitle = /^Book \d+$/.test(meta.title);

      if (needsSlugTheme || hasWrongTitle) {
        missingBooks.push({
          resourceId: meta.resourceId,
          title: meta.title,
          level: meta.level || level,
          slug: meta.slug || '',
          theme: meta.theme || '',
          contentId: meta.contentId || 0,
          audioCount: audioCount,
          wrongTitle: hasWrongTitle
        });
      }
    }
  }

  return missingBooks;
}

function titleFromSlug(slug) {
  if (!slug) return null;
  return slug
    .split(/(?=[A-Z])/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function downloadAudioFiles(book, slug, theme, contentId) {
  const bookDir = path.join(__dirname, '..', 'downloads', book.level, `${book.resourceId}-${book.title}`);
  const audioDir = path.join(bookDir, 'audio');
  
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }

  let downloaded = 0;
  for (let p = 1; p <= 30; p++) {
    const url = `https://mi.content.kidsa-z.com/audio/${contentId}/raz_${slug}_${theme}_p${p}_text.mp3`;
    const filePath = path.join(audioDir, `raz_${slug}_${theme}_p${p}_text.mp3`);
    
    if (!fs.existsSync(filePath)) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          fs.writeFileSync(filePath, Buffer.from(buffer));
          downloaded++;
        }
      } catch (e) {
        // Ignore errors
      }
    }
  }

  return downloaded;
}

function updateMetaJsonAndRename(book, slug, theme, contentId, audioCount, newTitle) {
  const oldBookDir = path.join(__dirname, '..', 'downloads', book.level, `${book.resourceId}-${book.title}`);
  const metaPath = path.join(oldBookDir, 'meta.json');
  
  if (!fs.existsSync(metaPath)) {
    console.log(`    meta.json not found: ${metaPath}`);
    return false;
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  meta.slug = slug;
  meta.theme = theme;
  meta.contentId = contentId;
  meta.audio = audioCount;
  
  if (newTitle && newTitle !== meta.title) {
    meta.title = newTitle;
  }
  
  // Write meta.json first
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  
  // Then rename directory if needed
  if (newTitle && newTitle !== book.title) {
    const newBookDir = path.join(__dirname, '..', 'downloads', book.level, `${book.resourceId}-${newTitle}`);
    if (oldBookDir !== newBookDir && !fs.existsSync(newBookDir)) {
      fs.renameSync(oldBookDir, newBookDir);
      console.log(`    Renamed directory to: ${newBookDir}`);
    }
  }
  
  return true;
}

async function main() {
  console.log('Finding books that need slug/theme and audio...');
  const missingBooks = findMissingBooks();
  
  console.log(`\nFound ${missingBooks.length} books needing attention.`);

  if (missingBooks.length === 0) {
    console.log('No books need processing.');
    return;
  }

  // For books with wrong title but have slug/theme, just fix the title
  console.log('\n=== Fixing books with wrong title ===');
  for (const book of missingBooks) {
    if (book.wrongTitle && book.slug && book.theme) {
      console.log(`\n[${book.level}] ${book.resourceId}-${book.title}`);
      console.log(`  Has slug/theme: ${book.slug}/${book.theme}`);
      
      const newTitle = titleFromSlug(book.slug);
      if (newTitle) {
        updateMetaJsonAndRename(book, book.slug, book.theme, book.contentId, book.audioCount, newTitle);
        console.log(`  Updated title: ${book.title} -> ${newTitle}`);
      }
    }
  }

  // For books without slug/theme, try to find them from existing data
  console.log('\n\n=== Finding slug/theme from existing data ===');
  
  // Build a map of resourceId -> { slug, theme, contentId } from existing books
  const downloadsDir = path.join(__dirname, '..', 'downloads');
  const knownBooks = new Map();
  
  for (const level of LEVEL_ORDER) {
    const levelDir = path.join(downloadsDir, level);
    if (!fs.existsSync(levelDir)) continue;

    const books = fs.readdirSync(levelDir).filter(f => fs.statSync(path.join(levelDir, f)).isDirectory());
    
    for (const bookDir of books) {
      const metaPath = path.join(levelDir, bookDir, 'meta.json');
      if (!fs.existsSync(metaPath)) continue;

      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (meta.slug && meta.theme && meta.resourceId) {
        if (!knownBooks.has(meta.resourceId)) {
          knownBooks.set(meta.resourceId, {
            slug: meta.slug,
            theme: meta.theme,
            contentId: meta.contentId,
            title: meta.title
          });
        }
      }
    }
  }

  console.log(`Found ${knownBooks.size} books with known slug/theme`);

  // Try to match missing books with known books
  let matched = 0;
  for (const book of missingBooks) {
    if (!book.slug || !book.theme) {
      const known = knownBooks.get(book.resourceId);
      if (known) {
        console.log(`\n[${book.level}] ${book.resourceId}-${book.title}`);
        console.log(`  Matched with known: ${known.slug}/${known.theme}`);
        
        // Download audio
        const downloaded = await downloadAudioFiles(book, known.slug, known.theme, known.contentId);
        console.log(`  Downloaded ${downloaded} audio files`);
        
        // Update meta.json
        const newTitle = book.wrongTitle ? titleFromSlug(known.slug) : null;
        updateMetaJsonAndRename(book, known.slug, known.theme, known.contentId, downloaded, newTitle);
        
        matched++;
      }
    }
  }

  console.log(`\n\nMatched ${matched} books with known slug/theme`);
  
  // List remaining books that still need attention
  const remaining = missingBooks.filter(b => {
    if (b.wrongTitle && b.slug && b.theme) return false;
    if (knownBooks.has(b.resourceId)) return false;
    return true;
  });

  console.log(`\nRemaining ${remaining.length} books still need manual processing:`);
  remaining.forEach(b => console.log(`  [${b.level}] ${b.resourceId}-${b.title}`));
}

main().catch(console.error);
