# KidsA-Z Scraper

KidsA-Z 学生密码探测 + 书籍资源批量下载工具。

## 安装

```bash
npm install
npx playwright install chromium
```

## 脚本使用指南

### 1. 书籍下载（推荐）— `download-all-books-v2.ts`

从学生账号自动登录，提取可访问的Leveled Book书单，CDN直连下载图片+音频。

**模式一：自动模式（从probe-results.json读取）**

```bash
# 全量下载（有头浏览器）
npx tsx src/scraper/download-all-books-v2.ts --headed

# 只提取书单不下载
npx tsx src/scraper/download-all-books-v2.ts --headed --extract-only

# 断点续传（跳过已完成的书籍）
npx tsx src/scraper/download-all-books-v2.ts --headed --resume

# 指定学生下载
npx tsx src/scraper/download-all-books-v2.ts --headed --student Mia

# 限制下载数量
npx tsx src/scraper/download-all-books-v2.ts --headed --max-books 3

# 跳过音频/图片
npx tsx src/scraper/download-all-books-v2.ts --headed --skip-audio
npx tsx src/scraper/download-all-books-v2.ts --headed --skip-images
```

**模式二：手动登录模式（指定老师/学生/密码）**

```bash
# 手动指定凭据（首次登录会保存cookies）
npx tsx src/scraper/download-all-books-v2.ts --headed \
  --teacher msummer11 \
  --student Mia \
  --password "duck,cat"

# 密码用逗号分隔（顺序不限）
npx tsx src/scraper/download-all-books-v2.ts --headed \
  --teacher msummer11 \
  --student Zehong \
  --password "cat, rabbit, fish"

# 第二次运行相同凭据时，自动使用cookies登录（秒进）
npx tsx src/scraper/download-all-books-v2.ts --headed \
  --teacher msummer11 \
  --student Mia \
  --password "duck,cat"
```

**Cookies说明**：
- 登录成功后自动保存cookies到 `data/cookies/{teacher}_{student}_{password}.json`
- 下次运行相同凭据时自动加载cookies，跳过登录流程
- Cookies过期后会自动重新登录并更新

**工作流程**:
```
probe-results.json → 选学生 → 自动登录
→ ReadingRoom → Leveled Books → 逐Level提取书单
→ 逐本: 点击卡片 → overlay获取cover → Listen → Activity页面
  → 拦截img请求获取contentId → CDN批量下载图片(直到404)
  → 点击play/Next捕获mp3 → 提取slug+theme → CDN批量下载音频(直到404)
  → 返回ReadingRoom → 下一本
```

**CLI参数**:

| 参数 | 说明 |
|------|------|
| `--headed` | 显示浏览器窗口（调试必用） |
| `--resume` | 断点续传，跳过已完成书籍 |
| `--extract-only` | 只提取书单，不下载 |
| `--student NAME` | 只处理指定学生 |
| `--max-books N` | 每学生最多下载N本书 |
| `--skip-audio` | 跳过音频下载 |
| `--skip-images` | 跳过图片下载 |

**输出目录**:
```
downloads/
├── {Level}/                        # K, E, N, ...
│   └── {resourceId}-{书名}/
│       ├── cover-{resourceId}.png  # 封面图（从overlay获取）
│       ├── meta.json               # 书籍元数据
│       ├── images/                 # 书籍内页图片
│       │   ├── page-00.jpg         # 从page-0开始，直到404
│       │   └── ...
│       └── audio/                  # 朗读音频
│           ├── raz_{slug}_{theme}_title_text.mp3
│           ├── raz_{slug}_{theme}_p1_text.mp3  # 直到连续5次404
│           └── ...
└── data/
    ├── booklists/                  # 提取的书单缓存
    │   └── {className}_{screenName}.json
    └── download-progress-v2.json   # 下载进度
```

**CDN URL模式**（无需认证，直接HTTP GET）:
- 图片: `https://mi.content.kidsa-z.com/readonly/{contentId}/projectable/large/1/book/page-{0..N}.jpg`
- 音频: `https://mi.content.kidsa-z.com/audio/{contentId}/raz_{slug}_{theme}_{title|pN}_text.mp3`
- 封面: `https://mi.content.kidsa-z.com/resource-cards/books/{bucket}/{resourceId}.png`

---

### 2. 全级别音频下载 — `download-all-audio.ts`

用固定学生账号登录，通过API获取所有级别书籍列表，暴力探测slug+theme下载音频。

```bash
npx tsx src/scraper/download-all-audio.ts --headed
```

**注意**: 此脚本用slug暴力探测法，低级别(aa/A)成功率接近0%，K级以上约50-70%。推荐使用 `download-all-books-v2.ts` 通过mp3拦截获取准确slug。

---

### 3. CDN URL验证 — `_test-cdn-urls.js`

验证CDN URL是否有效，测试图片和音频的可访问性。

```bash
node src/scraper/_test-cdn-urls.js
```

输出示例:
```
=== Amelia Earhart (2583, lq40) ===
  title: 200
  p1: 200
  p2: 200
  ...
=== Images ===
  page-0: 200
  page-1: 200
  ...
  page-18: 404 (STOP)
```

---

### 4. 密码探测 — `probe-multi-class.ts`

自动探测学生图标密码组合（1位/2位/3位）。

```bash
# 探测所有班级
npx tsx src/probe-multi-class.ts

# 重试失败的学生（3位密码）
npx tsx src/retry-failed-3digit.ts
```

**前提**: 先获取学生列表:
```bash
npx tsx src/fetch-all-class-students.ts
```

**输出**:
- `data/probe/probe-results.json` — 成功结果
- `data/probe/probe-results.csv` — CSV报告
- `data/probe/probe-failed.json` — 失败记录

---

### 5. 其他辅助脚本

| 命令 | 用途 |
|------|------|
| `npx tsx src/check-progress.ts` | 检查密码探测进度 |
| `npx tsx src/fetch-missing-data.ts` | 补充缺失的学生数据 |
| `npx tsx src/generate-report.ts` | 生成CSV报告 |
| `npx tsx src/clean-failed.ts` | 清理失败记录 |

---

## 密码图标对照表

| ID | 图标 | ID | 图标 | ID | 图标 |
|----|------|----|------|----|------|
| 1 | rabbit | 7 | dog | 13 | strawberry |
| 2 | duck | 8 | truck | 14 | apple |
| 3 | fish | 9 | rocket | 15 | carrot |
| 4 | lizard | 10 | train | 16 | banana |
| 5 | turtle | 11 | plane | 17 | watermelon |
| 6 | cat | 12 | boat | 18 | spoon |

## 项目结构

```
kids-a-z/
├── src/
│   ├── scraper/
│   │   ├── download-all-books-v2.ts    # ⭐ 推荐书籍下载脚本
│   │   ├── download-all-audio.ts       # 全级别音频下载
│   │   ├── _test-cdn-urls.js           # CDN URL验证工具
│   │   ├── auth.ts                     # 登录模块
│   │   ├── types.ts                    # 类型定义
│   │   ├── probe-slug.ts               # slug探测工具
│   │   ├── batch-audio-downloader.ts   # CDN音频下载器
│   │   │
│   │   │  # ── 以下为旧脚本，方法已过时，不要再用 ──
│   │   ├── download-all-books.ts       # ❌ v1版，slug暴力探测成功率低
│   │   ├── download-content-images.ts  # ❌ Playwright截图法
│   │   ├── batch-download-queue.ts     # ❌ 基于截图法的队列系统
│   │   ├── audio-intercept-research.ts # ❌ CDP拦截法，不需要
│   │   ├── extract-activity-links.ts   # ❌ 旧版Activity提取
│   │   └── _debug-*.ts                # ❌ 调试辅助脚本
│   │
│   ├── probe/
│   │   ├── combinations.ts             # 密码组合生成
│   │   ├── prober.ts                   # 探测引擎
│   │   └── types.ts                    # 类型定义
│   │
│   ├── probe-multi-class.ts            # 多班级密码探测入口
│   ├── retry-failed-3digit.ts          # 3位密码重试
│   ├── fetch-all-class-students.ts     # 获取学生列表
│   ├── fetch-missing-data.ts           # 补充缺失数据
│   ├── check-progress.ts               # 进度检查
│   ├── generate-report.ts              # 生成CSV报告
│   └── clean-failed.ts                 # 清理失败记录
│
├── data/
│   ├── probe/                          # 密码探测数据
│   │   ├── probe-results.json          # 探测结果（书籍下载脚本读取此文件）
│   │   ├── probe-results.csv           # CSV报告
│   │   ├── probe-failed.json           # 失败记录
│   │   └── probe-live.json             # 实时状态
│   ├── booklists/                      # 书单缓存（v2脚本生成）
│   └── download-progress-v2.json       # 下载进度（v2脚本）
│
├── downloads/                          # 资源输出目录
│   └── {Level}/{resourceId}-{书名}/
│       ├── meta.json
│       ├── images/
│       └── audio/
│
├── docs/
│   └── resource-patterns.md            # URL模式文档
├── zx-pics/                            # 密码图标截图
├── package.json
└── tsconfig.json
```

## 注意事项

- 密码组合为无序（1-2-3 等同于 3-2-1）
- API有速率限制（10次/窗口），脚本已自动处理
- CDN下载无需认证，直接HTTP GET
- 浏览器启动时已静音（`--mute-audio` + CDP `Audio.setMuted`）
- 书单提取后缓存到 `data/booklists/`，后续运行直接读取不重复提取
- 音频页码可能不连续（p1/p2可能404），脚本用连续5次404判断结束

## License

ISC
