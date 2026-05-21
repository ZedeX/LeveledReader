/**
 * 批量音频下载器 - 直接HTTP访问CDN，无需Playwright
 *
 * 策略：
 * 1. 对已知content_id+theme的书，直接按规律探测p3..pN直到404
 * 2. 对未知content_id的书，用Playwright进入Listen模式捕获第一个音频URL
 * 3. 随机抽查验证
 *
 * 音频URL模式: https://mi.content.kidsa-z.com/audio/{content_id}/raz_{slug}_{theme}_{page}_text.mp3
 * page: title, p3, p4, p5, ...
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';

const CDN_BASE = 'https://mi.content.kidsa-z.com/audio';

// 已知theme列表（从已下载的3本书收集）
const KNOWN_THEMES = ['th03', 'lk11', 'lk16', 'lk01', 'lk02', 'lk03', 'lk04', 'lk05', 'lk06', 'lk07', 'lk08', 'lk09', 'lk10', 'lk12', 'lk13', 'lk14', 'lk15', 'lk17', 'lk18', 'lk19', 'lk20', 'th01', 'th02', 'th04', 'th05'];

interface BookAudioInfo {
  resourceId: number;
  title: string;
  slug: string;
  contentId?: number;
  theme?: string;
  bookDir: string;
}

interface AudioFileResult {
  page: string | number;
  file: string;
  size: number;
  url: string;
}

// ============ HTTP工具 ============

function httpHead(url: string): Promise<{ status: number; contentLength?: number }> {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, { method: 'HEAD', timeout: 10000 }, (res) => {
      resolve({
        status: res.statusCode || 0,
        contentLength: res.headers['content-length'] ? parseInt(res.headers['content-length']) : undefined
      });
    });
    req.on('error', () => resolve({ status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0 }); });
    req.end();
  });
}

function httpDownload(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const chunks: Buffer[] = [];
    const req = mod.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve(buf.length > 500 ? buf : null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ============ 核心逻辑 ============

/** 探测theme: 对已知content_id+slug，尝试所有theme找title音频 */
async function probeTheme(contentId: number, slug: string): Promise<string | null> {
  console.log(`  [probe] 探测theme for content_id=${contentId} slug=${slug}`);

  // 并行探测所有theme
  const tasks = KNOWN_THEMES.map(async (theme) => {
    const url = `${CDN_BASE}/${contentId}/raz_${slug}_${theme}_title_text.mp3`;
    const { status, contentLength } = await httpHead(url);
    if (status === 200 && contentLength && contentLength > 1000) {
      return { theme, ok: true };
    }
    return { theme, ok: false };
  });

  const results = await Promise.all(tasks);
  const hit = results.find(r => r.ok);
  if (hit) {
    console.log(`  [probe] ✓ 找到theme: ${hit.theme}`);
    return hit.theme;
  }

  console.log(`  [probe] ✗ 未找到theme`);
  return null;
}

/** 按规律逐页下载音频，直到404 */
async function downloadPagesSequentially(
  contentId: number, slug: string, theme: string, outputDir: string
): Promise<AudioFileResult[]> {
  const audioDir = path.join(outputDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  const results: AudioFileResult[] = [];

  // 先下载title
  const titleUrl = `${CDN_BASE}/${contentId}/raz_${slug}_${theme}_title_text.mp3`;
  const titleFile = `raz_${slug}_${theme}_title_text.mp3`;
  const titlePath = path.join(audioDir, titleFile);

  if (!fs.existsSync(titlePath) || fs.statSync(titlePath).size < 500) {
    console.log(`  [download] title_text.mp3 ...`);
    const buf = await httpDownload(titleUrl);
    if (buf) {
      fs.writeFileSync(titlePath, buf);
      results.push({ page: 'title', file: titleFile, size: buf.length, url: titleUrl });
      console.log(`  [download] ✓ title (${(buf.length / 1024).toFixed(0)}KB)`);
    }
  } else {
    results.push({ page: 'title', file: titleFile, size: fs.statSync(titlePath).size, url: titleUrl });
    console.log(`  [skip] title已存在`);
  }

  // 逐页探测p3, p4, p5...直到404
  let consecutive404 = 0;
  for (let pageNum = 3; pageNum <= 50; pageNum++) {
    const url = `${CDN_BASE}/${contentId}/raz_${slug}_${theme}_p${pageNum}_text.mp3`;
    const file = `raz_${slug}_${theme}_p${pageNum}_text.mp3`;
    const filePath = path.join(audioDir, file);

    // 已存在且大于500字节则跳过
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 500) {
      results.push({ page: pageNum, file, size: fs.statSync(filePath).size, url });
      consecutive404 = 0;
      continue;
    }

    // HEAD探测
    const { status } = await httpHead(url);
    if (status !== 200) {
      consecutive404++;
      if (consecutive404 >= 2) {
        console.log(`  [probe] p${pageNum} 404, 连续${consecutive404}次404, 停止`);
        break;
      }
      continue;
    }

    consecutive404 = 0;

    // 下载
    const buf = await httpDownload(url);
    if (buf) {
      fs.writeFileSync(filePath, buf);
      results.push({ page: pageNum, file, size: buf.length, url });
      console.log(`  [download] ✓ p${pageNum} (${(buf.length / 1024).toFixed(0)}KB)`);
    }
  }

  return results;
}

/** 随机抽查验证 */
async function spotCheck(results: AudioFileResult[], count: number = 3): Promise<boolean> {
  if (results.length === 0) return false;

  const sampleSize = Math.min(count, results.length);
  const indices = new Set<number>();
  while (indices.size < sampleSize) {
    indices.add(Math.floor(Math.random() * results.length));
  }

  console.log(`\n[spot-check] 随机抽查 ${sampleSize} 个文件...`);

  for (const idx of indices) {
    const r = results[idx];
    const { status, contentLength } = await httpHead(r.url);
    const ok = status === 200 && contentLength && contentLength > 1000;
    console.log(`  ${ok ? '✓' : '✗'} ${r.file}: HTTP ${status}, size=${contentLength || '?'}`);
    if (!ok) return false;
  }

  return true;
}

/** 更新metadata.json中的audio字段 */
function updateMetadata(bookDir: string, contentId: number, theme: string, files: AudioFileResult[]): void {
  const metaPath = path.join(bookDir, 'metadata.json');
  if (!fs.existsSync(metaPath)) {
    console.log(`  [meta] ✗ metadata.json不存在: ${metaPath}`);
    return;
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  meta.content_id = contentId;
  meta.audio_theme = theme;
  meta.audio = {
    baseUrl: CDN_BASE,
    theme,
    contentId,
    files: files.map(f => ({ page: f.page, file: f.file }))
  };

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log(`  [meta] ✓ metadata.json已更新 (${files.length}个音频文件)`);
}

// ============ 主流程 ============

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '')
    .substring(0, 40);
}

function findBookDirs(dataRoot: string): BookAudioInfo[] {
  const books: BookAudioInfo[] = [];
  const absRoot = path.resolve(dataRoot);

  // 递归搜索所有包含metadata.json的目录
  function walk(dir: string, depth: number) {
    if (depth > 3) return;
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (!fs.statSync(full).isDirectory()) continue;
      if (fs.existsSync(path.join(full, 'metadata.json'))) {
        const meta = JSON.parse(fs.readFileSync(path.join(full, 'metadata.json'), 'utf-8'));
        books.push({
          resourceId: meta.resource_id,
          title: meta.title,
          slug: meta.slug || titleToSlug(meta.title),
          contentId: meta.content_id,
          theme: meta.audio_theme || meta.audio?.theme,
          bookDir: full
        });
      } else {
        walk(full, depth + 1);
      }
    }
  }

  walk(absRoot, 0);
  return books;
}

async function main() {
  const dataRoot = process.argv[2] || 'data/downloads';
  const maxBooks = parseInt(process.argv[3] || '999');
  const skipKnown = process.argv.includes('--skip-known');

  console.log('=== 批量音频下载器 ===');
  console.log(`数据目录: ${dataRoot}`);
  console.log(`最大书籍: ${maxBooks}`);
  console.log(`跳过已知: ${skipKnown}`);
  console.log('');

  const books = findBookDirs(dataRoot);
  console.log(`找到 ${books.length} 本书\n`);

  let processed = 0;
  let success = 0;
  let failed = 0;

  for (const book of books) {
    if (processed >= maxBooks) break;

    // 检查是否已有完整音频
    const audioDir = path.join(book.bookDir, 'audio');
    const hasAudio = fs.existsSync(audioDir) && fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).length > 0;

    if (skipKnown && hasAudio && book.contentId && book.theme) {
      console.log(`[skip] ${book.title} - 已有音频`);
      continue;
    }

    processed++;
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`[${processed}] ${book.title} (id=${book.resourceId})`);
    console.log(`  slug=${book.slug}, contentId=${book.contentId || '?'}, theme=${book.theme || '?'}`);

    // Step 1: 如果没有content_id，需要Playwright获取（暂跳过）
    if (!book.contentId) {
      console.log(`  ✗ 无content_id，需要Playwright获取，暂跳过`);
      failed++;
      continue;
    }

    // Step 2: 如果没有theme，探测
    if (!book.theme) {
      const found = await probeTheme(book.contentId, book.slug);
      if (!found) {
        console.log(`  ✗ 无法确定theme`);
        failed++;
        continue;
      }
      book.theme = found;
    }

    // Step 3: 逐页下载
    try {
      const files = await downloadPagesSequentially(book.contentId, book.slug, book.theme, book.bookDir);

      if (files.length === 0) {
        console.log(`  ✗ 未下载到任何音频`);
        failed++;
        continue;
      }

      // Step 4: 更新metadata
      updateMetadata(book.bookDir, book.contentId, book.theme, files);

      // Step 5: 随机抽查
      const checkOk = await spotCheck(files);
      console.log(`  ${checkOk ? '✓' : '⚠'} 抽查结果: ${checkOk ? '通过' : '有异常'}`);

      success++;
      console.log(`  ✓ 完成: ${files.length}个音频文件`);
    } catch (err: any) {
      console.error(`  ✗ 错误: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`处理: ${processed}, 成功: ${success}, 失败: ${failed}`);
  console.log(`${'═'.repeat(50)}`);
}

main().catch(console.error);
