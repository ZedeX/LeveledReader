/**
 * 根据all-download-urls.txt检查并下载缺失的文件
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const URL_FILE = path.resolve(__dirname, '../all-download-urls.txt');
const DOWNLOADS_DIR = path.resolve(__dirname, '../downloads');

// 读取URL列表
const content = fs.readFileSync(URL_FILE, 'utf-8');
const lines = content.split('\n').filter(line => line.trim());
console.log(`Total lines: ${lines.length}`);

// 解析并检查
const missing = [];
let existing = 0;

for (const line of lines) {
  const parts = line.split('\t');
  if (parts.length < 3) continue;

  const type = parts[0];
  const url = parts[1];
  const localPath = parts[2];

  if (!url || !localPath) continue;

  const localFullPath = path.join(DOWNLOADS_DIR, localPath);

  if (fs.existsSync(localFullPath)) {
    existing++;
  } else {
    missing.push({ type, url, localPath, localFullPath });
  }
}

console.log(`Existing files: ${existing}`);
console.log(`Missing files: ${missing.length}`);

if (missing.length === 0) {
  console.log('All files exist!');
  process.exit(0);
}

// 下载函数
function downloadFile(url, destPath) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(destPath);
    let finished = false;

    const cleanup = (err) => {
      if (finished) return;
      finished = true;
      file.close();
      try { fs.unlinkSync(destPath); } catch {}
      resolve({ ok: false, error: err?.message || 'Unknown' });
    };

    const timeout = setTimeout(() => cleanup(new Error('Timeout')), 30000);

    protocol.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        clearTimeout(timeout);
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        // Follow redirect
        protocol.get(res.headers.location, (res2) => {
          if (res2.statusCode !== 200) {
            cleanup(new Error(`HTTP ${res2.statusCode}`));
            return;
          }
          res2.pipe(file);
          file.on('finish', () => {
            clearTimeout(timeout);
            finished = true;
            file.close();
            resolve({ ok: true });
          });
        }).on('error', cleanup);
        return;
      }

      if (res.statusCode !== 200) {
        cleanup(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      res.pipe(file);
      file.on('finish', () => {
        clearTimeout(timeout);
        finished = true;
        file.close();
        resolve({ ok: true });
      });
    }).on('error', cleanup);
  });
}

// 主函数
(async () => {
  console.log('\nStarting download...\n');
  const startTime = Date.now();

  let downloaded = 0;
  let failed = 0;
  const failedUrls = [];

  for (let i = 0; i < missing.length; i++) {
    const item = missing[i];
    const result = await downloadFile(item.url, item.localFullPath);

    if (result.ok) {
      downloaded++;
    } else {
      failed++;
      failedUrls.push({ url: item.url, error: result.error });
    }

    // 进度报告
    if ((i + 1) % 50 === 0 || i === missing.length - 1) {
      console.log(`Progress: ${i + 1}/${missing.length} (OK: ${downloaded}, Failed: ${failed})`);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  console.log(`\n========== RESULT ==========`);
  console.log(`Total missing: ${missing.length}`);
  console.log(`Downloaded OK: ${downloaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Time: ${elapsed}s`);

  // 写入失败列表
  if (failedUrls.length > 0) {
    const failedFile = path.resolve(__dirname, '../failed-downloads.txt');
    const failedContent = failedUrls.map(f => `${f.url}\t${f.error}`).join('\n');
    fs.writeFileSync(failedFile, failedContent, 'utf-8');
    console.log(`\nFailed URLs saved to: ${failedFile}`);
  }
})();
