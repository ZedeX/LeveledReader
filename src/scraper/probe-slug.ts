/**
 * 从book API数据提取content_id，然后暴力探测slug
 * content_id从image URL的/readonly/{id}/路径提取
 * slug通过CDN HEAD请求探测
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const CDN = 'https://mi.content.kidsa-z.com/audio';

function httpHead(url: string): Promise<number> {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
      resolve(res.statusCode || 0);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.end();
  });
}

async function parallelProbe(tasks: { url: string; label: string }[], concurrency: number = 30): Promise<{ label: string; status: number }[]> {
  const results: { label: string; status: number }[] = [];
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      const task = tasks[i];
      const status = await httpHead(task.url);
      if (status === 200) results.push({ label: task.label, status });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

function generateSlugVariants(title: string): string[] {
  const base = title.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const variants: string[] = [];

  // 全连在一起
  variants.push(base.replace(/\s+/g, ''));

  // 驼峰
  variants.push(base.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('').replace(/^./, c => c.toLowerCase()));

  // 只取第一个词
  variants.push(base.split(/\s+/)[0]);

  // 取前两个词连在一起
  const words = base.split(/\s+/);
  if (words.length >= 2) {
    variants.push(words.slice(0, 2).join(''));
    variants.push(words[0] + words[words.length - 1]);
  }

  // 去掉常见停用词
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with']);
  const filteredWords = words.filter(w => !stopWords.has(w));
  if (filteredWords.length > 0) {
    variants.push(filteredWords.join(''));
    if (filteredWords.length >= 2) {
      variants.push(filteredWords[0] + filteredWords[filteredWords.length - 1]);
    }
  }

  // 去重
  return [...new Set(variants)];
}

const THEMES = [
  'th01','th02','th03','th04','th05','th06','th07','th08','th09','th10',
  'th11','th12','th13','th14','th15','th16','th17','th18','th19','th20',
  'lk01','lk02','lk03','lk04','lk05','lk06','lk07','lk08','lk09','lk10',
  'lk11','lk12','lk13','lk14','lk15','lk16','lk17','lk18','lk19','lk20',
];

async function main() {
  // 读取API数据
  const apiDataPath = 'data/debug/level-K-full-api.json';
  if (!fs.existsSync(apiDataPath)) {
    console.error('请先运行get-content-id-v3.ts生成API数据');
    return;
  }

  const allBooks = JSON.parse(fs.readFileSync(apiDataPath, 'utf-8'));
  console.log(`加载 ${allBooks.length} 本Level K书籍\n`);

  // 找需要处理的书籍（没有content_id或slug的）
  const targets = [
    { resourceId: 57, title: 'Ratty Rats' },
    { resourceId: 58, title: 'Slithery and Slimy' }
  ];

  for (const target of targets) {
    const book = allBooks.find((b: any) => b.resource_id === target.resourceId);
    if (!book) { console.log(`✗ 未找到 ${target.title}`); continue; }

    // 从image URL提取content_id
    const imgUrl = book.image?.large?.url || '';
    const cidMatch = imgUrl.match(/\/readonly\/(\d+)\//);
    const contentId = cidMatch ? parseInt(cidMatch[1]) : null;
    if (!contentId) { console.log(`✗ 无法提取content_id for ${target.title}`); continue; }

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`${target.title} (content_id=${contentId})`);

    // 生成slug变体
    const slugVariants = generateSlugVariants(target.title);
    console.log(`  slug变体: ${slugVariants.join(', ')}`);

    // 对每个slug变体 + theme组合探测
    const tasks: { url: string; label: string }[] = [];
    for (const slug of slugVariants) {
      for (const theme of THEMES) {
        const url = `${CDN}/${contentId}/raz_${slug}_${theme}_title_text.mp3`;
        tasks.push({ url, label: `slug=${slug},theme=${theme}` });
      }
    }

    console.log(`  探测 ${tasks.length} 个组合...`);
    const hits = await parallelProbe(tasks, 30);

    if (hits.length > 0) {
      const m = hits[0].label.match(/slug=(\w+),theme=(\w+)/);
      if (m) {
        const slug = m[1];
        const theme = m[2];
        console.log(`  ✓ 找到! slug=${slug}, theme=${theme}`);

        // 更新metadata
        const dirs = ['data/downloads/level-K', 'data/downloads/level-K-full'];
        for (const base of dirs) {
          if (!fs.existsSync(base)) continue;
          for (const d of fs.readdirSync(base)) {
            if (d.startsWith(`${target.resourceId}-`)) {
              const metaPath = path.join(base, d, 'metadata.json');
              if (fs.existsSync(metaPath)) {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                meta.content_id = contentId;
                meta.slug = slug;
                meta.audio_theme = theme;
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
                console.log(`  ✓ 更新 ${metaPath}`);
              }
            }
          }
        }
      }
    } else {
      console.log(`  ✗ 未找到匹配的slug+theme`);
    }
  }
}

main().catch(console.error);
