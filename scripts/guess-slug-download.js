/**
 * 通过猜测slug/theme来下载缺失的音频
 * 
 * 规律:
 * - slug: 标题的小写、去空格、去特殊字符版本
 * - theme: {level小写字母}{数字}
 * 
 * Usage:
 *   node scripts/guess-slug-download.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const CDN = 'https://mi.content.kidsa-z.com';
const DOWNLOADS_DIR = path.resolve(__dirname, '..', 'downloads');

function downloadFile(url, destPath) {
  return new Promise((resolve) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(destPath)) { resolve(true); return; }

    const file = fs.createWriteStream(destPath);
    const timeout = setTimeout(() => { 
      file.close(); 
      try { fs.unlinkSync(destPath); } catch {} 
      resolve(false); 
    }, 15000);

    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        clearTimeout(timeout); 
        file.close(); 
        fs.unlinkSync(destPath, () => {});
        https.get(res.headers.location, (res2) => {
          if (res2.statusCode !== 200) { resolve(false); return; }
          res2.pipe(file);
          file.on('finish', () => { clearTimeout(timeout); file.close(); resolve(true); });
        }).on('error', () => resolve(false));
        return;
      }
      if (res.statusCode !== 200) { 
        clearTimeout(timeout); 
        file.close(); 
        fs.unlinkSync(destPath, () => {}); 
        resolve(false); 
        return; 
      }
      res.pipe(file);
      file.on('finish', () => { clearTimeout(timeout); file.close(); resolve(true); });
    }).on('error', () => { 
      clearTimeout(timeout); 
      file.close(); 
      try { fs.unlinkSync(destPath); } catch {} 
      resolve(false); 
    });
  });
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s+/g, '');
}

function generateThemePatterns(level) {
  const levelCode = level.toLowerCase().replace(/[^a-z]/g, '');
  const patterns = [];
  
  // Generate theme numbers from 01 to 99
  for (let i = 1; i <= 99; i++) {
    patterns.push(`${levelCode}${String(i).padStart(2, '0')}`);
  }
  
  return patterns;
}

async function tryDownloadAudio(contentId, slug, theme, outDir) {
  // Try title audio first
  const titleUrl = `${CDN}/audio/${contentId}/raz_${slug}_${theme}_title_text.mp3`;
  const titleDest = path.join(outDir, `raz_${slug}_${theme}_title_text.mp3`);
  
  const result = await downloadFile(titleUrl, titleDest);
  if (result) {
    // Download page audio
    let count = 1;
    for (let p = 1; p <= 30; p++) {
      const url = `${CDN}/audio/${contentId}/raz_${slug}_${theme}_p${p}_text.mp3`;
      const dest = path.join(outDir, `raz_${slug}_${theme}_p${p}_text.mp3`);
      if (await downloadFile(url, dest)) count++;
      else if (p > 5) break;
    }
    return count;
  }
  return 0;
}

async function main() {
  console.log('\n=== Guessing slug/theme and downloading audio ===\n');

  const levels = fs.readdirSync(DOWNLOADS_DIR).filter(f =>
    fs.statSync(path.join(DOWNLOADS_DIR, f)).isDirectory()
  );

  let totalFixed = 0;
  let totalFailed = 0;

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
        
        // Skip if already has slug/theme and audio
        if (meta.slug && meta.theme) {
          const audioDir = path.join(levelDir, bookDir, 'audio');
          const existingAudio = fs.existsSync(audioDir)
            ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).length
            : 0;
          if (existingAudio >= 5) continue;
        }

        const audioDir = path.join(levelDir, bookDir, 'audio');
        const contentId = meta.contentId || meta.resourceId;
        const guessedSlug = generateSlug(meta.title);
        
        console.log(`\n[${level}] ${meta.title}`);
        console.log(`  Guessed slug: ${guessedSlug}`);
        console.log(`  ContentId: ${contentId}`);

        // Try different theme patterns
        const themes = generateThemePatterns(level);
        let found = false;

        for (const theme of themes) {
          process.stdout.write(`  Trying theme ${theme}...`);
          const count = await tryDownloadAudio(contentId, guessedSlug, theme, audioDir);
          
          if (count > 0) {
            console.log(` SUCCESS! Downloaded ${count} audio files`);
            
            // Update meta.json
            meta.slug = guessedSlug;
            meta.theme = theme;
            meta.audio = count;
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
            
            totalFixed++;
            found = true;
            break;
          } else {
            process.stdout.write('\r');
          }
        }

        if (!found) {
          console.log(`  Could not find audio for any theme`);
          totalFailed++;
        }

      } catch (e) {
        console.log(`  Error: ${e.message}`);
      }
    }
  }

  console.log(`\n========== RESULT ==========`);
  console.log(`Fixed: ${totalFixed}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`============================\n`);
}

main().catch(console.error);
