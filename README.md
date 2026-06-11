# LeveledReader

自托管分级阅读书籍管理器，内置网页阅读器。自动化下载分级阅读平台资源，提供沉浸式本地阅读体验。同时包含基于排除推理逻辑的自动答题功能。

> **免责声明**：本工具仅供个人教育用途。请尊重所使用阅读平台的服务条款，不要重新分发下载的内容。

---

## 功能特性

- **书架界面** — 按阅读级别（aa 至 Z2）浏览书籍
- **沉浸式阅读** — 全屏阅读，自动播放音频
- **键盘导航** — 方向键翻页，空格键播放/暂停音频
- **后台预加载** — 自动预加载所有书籍封面，然后按序预加载页面图片和音频；优先响应用户操作（如切换级别），从中断处继续
- **阅读进度** — 追踪每本书的阅读状态（未读/阅读中/已读完），localStorage 持久化
- **成就系统** — 解锁里程碑（1-700本、级别完成），彩色徽章展示
- **访问控制** — 设备绑定的8位密钥验证，离线算法
- **批量下载** — 通过 Playwright 浏览器自动化下载资源
- **CDN 直连下载** — 无需认证，直接从 CDN 下载图片和音频
- **模式匹配补全** — 自动发现并下载所有页面（p0-pN），直到 404 为止
- **多用户 Worker** — Cloudflare Worker 后端，支持认证、进度追踪和管理面板
- **Quiz 自动答题** — 基于排除推理的自动答题，支持 Level Loop 和答案提取

---

## 快速开始

### 安装

```bash
npm install
npx playwright install chromium
```

### 启动阅读器

```bash
npm run reader
```

打开 http://localhost:3000

### 下载书籍

```bash
# 完整下载（带浏览器界面，方便调试）
npm run download

# 恢复中断的下载
npm run download:resume

# 仅提取书籍列表（不下载）
npm run download:extract

# 跳过图片或音频
npx tsx src/scraper/download-all-books-v2.ts --headed --skip-audio
npx tsx src/scraper/download-all-books-v2.ts --headed --skip-images
```

### 手动登录模式

```bash
npx tsx src/scraper/download-all-books-v2.ts --headed --teacher YOUR_TEACHER --student YOUR_STUDENT --password "icon1,icon2"
```

密码为图标名称，逗号分隔（顺序无关）。Cookie 自动保存，后续运行无需重新登录。

---

## Quiz 抓取器 (quiz-scraper-v8.js)

自动化 kidsa-z.com 答题。使用教师账号登录，选择学生，进入 Level Up! 站点，完成当前级别所有书籍的 Listen、Read 和 Quiz 活动。当所有书籍变绿（三项活动全部完成）时，级别自动升级，循环继续。

### 用法

```bash
# 全自动运行（推荐）
.\auto-run.ps1

# 手动运行 — 处理当前级别的所有书籍
node scripts/quiz-scraper-v8.js

# 带参数手动运行
node scripts/quiz-scraper-v8.js <起始索引> <数量> <站点> <最大循环次数>

# 示例：
# 从索引0处理1本书，level-up站点，1次循环
node scripts/quiz-scraper-v8.js 0 1 level-up 1

# 处理所有书籍，reading-room站点，99次循环
node scripts/quiz-scraper-v8.js 0 999 bookroom 99

# 调试模式 — 保存每页截图
$env:DEBUG=1; node scripts/quiz-scraper-v8.js 0 1 level-up 1
```

### 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `<起始索引>` | `0` | 第一本书的索引（从0开始） |
| `<数量>` | `999` | 最多处理的书籍数量 |
| `<站点>` | `level-up` | 站点：`level-up` 或 `bookroom` |
| `<最大循环次数>` | `99` | Level Loop 最大迭代次数 |

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `KIDSAZ_CLASS_NAME` | 是 | 教师班级名，如 `msummer17` |
| `KIDSAZ_STUDENT_ID` | 是 | 学生数字ID，如 `276393548` |
| `KIDSAZ_SCREEN_NAME` | 是 | 学生显示名，如 `Zahra` |
| `KIDSAZ_PASSWORD` | 是 | 密码图标名，逗号分隔，如 `rabbit` |
| `TESSERACT_PATH` | 否 | Tesseract OCR 路径（默认 `tesseract`） |
| `DEBUG` | 否 | 设为 `1` 启用截图（生成数百MB） |

### 认证配置

运行前设置环境变量：

```powershell
$env:KIDSAZ_CLASS_NAME = "your_class_name"
$env:KIDSAZ_STUDENT_ID = "123456789"
$env:KIDSAZ_SCREEN_NAME = "StudentName"
$env:KIDSAZ_PASSWORD = "rabbit"

# 或在项目根目录创建 .env 文件：
# KIDSAZ_CLASS_NAME=your_class_name
# KIDSAZ_STUDENT_ID=123456789
# KIDSAZ_SCREEN_NAME=StudentName
# KIDSAZ_PASSWORD=rabbit
```

**如何获取账号信息：**
1. **班级名**：以教师身份登录 kidsa-z.com → 班级名出现在 URL 或班级列表中
2. **学生ID**：打开学生页面 → 数字ID在 API 响应或 URL 中
3. **显示名**：登录页面上显示的学生名称
4. **密码**：学生登录时使用的图标（见下方密码图标参考）

首次运行时，脚本会打开浏览器进行手动登录（Cloudflare Turnstile 验证）。登录后 Cookie 保存到 `data/cookies/`，后续运行自动复用。

### 并行抓取（多账号）

要并行抓取所有级别（aa–Z2），打开 **5个独立终端窗口**，每个进程使用不同账号。每个进程使用独立的浏览器实例和 Cookie 目录。

```powershell
# 终端1: Joe (aa → D)
$env:KIDSAZ_CLASS_NAME="msummer17"; $env:KIDSAZ_STUDENT_ID="276393595"; $env:KIDSAZ_SCREEN_NAME="Joe"; $env:KIDSAZ_PASSWORD="rabbit"; $env:KIDSAZ_COOKIE_DIR="data/cookies/msummer17_Joe"
node scripts/quiz-scraper-v8.js 0 999 level-up 99

# 终端2: Lisa (E → H)
$env:KIDSAZ_CLASS_NAME="msummer15"; $env:KIDSAZ_STUDENT_ID="276408235"; $env:KIDSAZ_SCREEN_NAME="Lisa"; $env:KIDSAZ_PASSWORD="car,rocket"; $env:KIDSAZ_COOKIE_DIR="data/cookies/msummer15_Lisa"
node scripts/quiz-scraper-v8.js 0 999 level-up 99

# 终端3: Amiee (I → L)
$env:KIDSAZ_CLASS_NAME="msummer13"; $env:KIDSAZ_STUDENT_ID="276393775"; $env:KIDSAZ_SCREEN_NAME="Amiee"; $env:KIDSAZ_PASSWORD="watermelon"; $env:KIDSAZ_COOKIE_DIR="data/cookies/msummer13_Amiee"
node scripts/quiz-scraper-v8.js 0 999 level-up 99

# 终端4: Annie (M → Q)
$env:KIDSAZ_CLASS_NAME="msummer15"; $env:KIDSAZ_STUDENT_ID="276408241"; $env:KIDSAZ_SCREEN_NAME="Annie"; $env:KIDSAZ_PASSWORD="strawberry,banana"; $env:KIDSAZ_COOKIE_DIR="data/cookies/msummer15_Annie"
node scripts/quiz-scraper-v8.js 0 999 level-up 99

# 终端5: Jim (R → Z2)
$env:KIDSAZ_CLASS_NAME="msummer17"; $env:KIDSAZ_STUDENT_ID="276410409"; $env:KIDSAZ_SCREEN_NAME="Jim"; $env:KIDSAZ_PASSWORD="rabbit"; $env:KIDSAZ_COOKIE_DIR="data/cookies/msummer17_Jim"
node scripts/quiz-scraper-v8.js 0 999 level-up 99
```

**注意事项：**
- 每个进程必须在**独立终端**中运行（独立浏览器实例，不是标签页）
- 如遇限流（403错误），减少并行进程数
- `KIDSAZ_COOKIE_DIR` 隔离各账号 Cookie，避免会话冲突
- 完整覆盖计划见 [docs/quiz-scrape-plan.md](docs/quiz-scrape-plan.md)

### 其他脚本

```bash
# OCR 所有已下载书籍为 Markdown 文本
node scripts/ocr-books.js                    # 所有书籍
node scripts/ocr-books.js --level R          # 仅 Level R
node scripts/ocr-books.js --limit 10         # 仅前10本

# 格式化 OCR 输出（修复换行、OCR错误、噪点）
node scripts/format-book-texts.js            # 所有文件
node scripts/format-book-texts.js --dry-run  # 预览更改

# 从现有数据构建 SQLite 数据库
node scripts/build-database.js

# 汇总 Quiz 结果
node scripts/summarize-results.js
```

### Level Loop 工作流

```
Level Loop #N
├── 阶段1: LISTEN — 完成所有未绿的 Listen 活动
│   └── 快速模式：点击播放，设置 playbackRate=16，跳到末尾，翻页
├── 阶段2: READ — 完成所有未绿的 Read 活动
│   └── 快速模式：每页1秒，自动翻页
├── 阶段3: QUIZ — 答题直到所有书籍变绿
│   ├── 对每本书：
│   │   ├── 第1次尝试：阅读书籍（OCR文本提取），然后随机答题
│   │   ├── 第2次及以后：基于排除法选择
│   │   └── 重复直到 10/10 或达到最大尝试次数（8次）
│   └── 所有 Quiz 变绿 → 进入阶段4
└── 阶段4: 升级检测
    └── 检查是否出现新书籍 → 从阶段1重复
```

### Quiz 答题逻辑

核心排除算法通过追踪已知正确答案和错误选项，在多次尝试中收敛到 10/10：

| 尝试次数 | 机制 | 获得的知识 |
|----------|------|-----------|
| 1 | 随机选择 | 提交 → 获取分数 + correctMap |
| 2 | 每题排除1个错误选项 | correctMap 识别错误答案 |
| 3 | 每题排除2-3个错误选项 | 排除法缩小到1-2个候选 |
| 4 | 每题仅剩1个选项 | 100%正确（排除确定性） |

**设计原则**（v8.3）：
- **确定性**：仅信任 `correctMap`（基于CSS类的正确/错误标记）和 `newCorrect === 0`（确认全部错误）
- **不猜测**：不确定时不排除任何选项 — 避免污染排除列表
- **自愈性**：发现正确答案时，立即从 `_wrongOptions` 中移除

**关键数据结构**：
- `knownCorrectAnswers`：`{ questionIndex: { letter, text, optionIndex } }`
- `_wrongOptions`：`{ questionIndex: [excludedOptionIndex, ...] }`
- `correctMap`：页面CSS类提供的每题 `isCorrect`/`isIncorrect` 状态

### 输出文件

| 路径 | 说明 |
|------|------|
| `data/quiz-results/{Book_Title}.json` | 每本书的Quiz尝试历史（分数、答案、correctMap） |
| `data/quiz-results-summary.json` | 所有结果的紧凑汇总 |
| `data/book-texts/{Book_Title}.txt` | OCR提取的书籍文本（仅首次阅读） |
| `data/book-texts/{Book_Title}.json` | 逐页书籍文本及元数据 |
| `data/reports/{Book_Title}.md` | 每本书的Markdown报告（Quiz问答 + 书籍文本） |
| `data/timing.log` | 带时间戳的操作日志 |
| `data/auto-run.log` | 自动运行会话日志 |
| `data/deployment-ids.json` | 缓存的部署ID，加速导航 |
| `data/cookies/` | 浏览器会话Cookie |

### 汇总结果

```bash
node scripts/summarize-results.js
```

生成紧凑的 `data/quiz-results-summary.json`，包含每本书的分数和尝试次数。

---

## CLI 参考（书籍下载器）

| 参数 | 说明 |
|------|------|
| `--headed` | 显示浏览器窗口（推荐用于调试） |
| `--resume` | 跳过已下载的书籍 |
| `--extract-only` | 仅提取书籍列表，不下载 |
| `--student NAME` | 仅处理指定学生 |
| `--max-books N` | 限制每学生下载数量 |
| `--skip-audio` | 跳过音频下载 |
| `--skip-images` | 跳过图片下载 |

## 密码图标参考

| ID | 图标 | ID | 图标 | ID | 图标 |
|----|------|----|------|----|------|
| 1 | rabbit | 7 | dog | 13 | strawberry |
| 2 | duck | 8 | truck | 14 | apple |
| 3 | fish | 9 | rocket | 15 | carrot |
| 4 | lizard | 10 | train | 16 | banana |
| 5 | turtle | 11 | plane | 17 | watermelon |
| 6 | cat | 12 | boat | 18 | spoon |

## Cloudflare Worker（高级）

```bash
cd worker
npm install
npm run dev
```

打开 http://localhost:8787

功能：
- 卡密系统用户认证
- 阅读进度追踪
- 管理面板
- 多用户支持
- CDN 资源代理

初始化：
```bash
npm run db:init    # 初始化数据库架构
npm run db:seed    # 填充初始数据
```

## 项目结构

```
leveled-reader/
├── reader/                             # 简易HTTP阅读服务器
│   ├── server.js                       # Express 服务器 (端口3000)
│   └── public/                         # 前端页面
│
├── worker/                             # Cloudflare Worker（高级）
│   ├── src/
│   │   ├── index.ts                    # 入口
│   │   ├── routes/                     # API路由
│   │   │   ├── auth.ts                 # 认证
│   │   │   ├── books.ts                # 书籍资源 & CDN代理
│   │   │   ├── progress.ts             # 阅读进度
│   │   │   └── admin.ts                # 管理面板
│   │   ├── db/                         # 数据库
│   │   │   ├── schema.sql
│   │   │   └── seed.sql
│   │   └── utils/                      # JWT、密码、卡密
│   ├── wrangler.toml
│   └── package.json
│
├── src/
│   ├── scraper/
│   │   ├── download-all-books-v2.ts    # 主书籍下载器
│   │   ├── download-all-audio.ts       # 仅音频下载器
│   │   ├── auth.ts                     # 登录模块
│   │   ├── browser.ts                  # 浏览器设置
│   │   ├── book-api.ts                 # 书籍API客户端
│   │   ├── downloader.ts               # 下载模块
│   │   ├── batch-downloader.ts         # 批量下载调度器
│   │   ├── batch-audio-downloader.ts   # 批量音频下载器
│   │   ├── audio-downloader.ts         # 单书音频下载器
│   │   ├── storage.ts                  # 存储工具
│   │   ├── parser.ts                   # HTML解析器
│   │   ├── types.ts                    # 类型定义
│   │   └── index.ts                    # 抓取器入口
│   │
│   ├── probe/
│   │   ├── combinations.ts             # 密码组合生成器
│   │   ├── prober.ts                   # 探测引擎
│   │   └── types.ts                    # 类型定义
│   │
│   ├── probe-multi-class.ts            # 多班级密码探测
│   ├── retry-failed-3digit.ts          # 3图标密码重试
│   ├── fetch-all-class-students.ts     # 获取学生列表
│   ├── fetch-all-students.ts           # 获取所有学生
│   ├── fetch-missing-data.ts           # 补充缺失数据
│   ├── check-progress.ts               # 检查探测进度
│   ├── generate-report.ts              # 生成CSV报告
│   ├── clean-failed.ts                 # 清理失败记录
│   └── types.ts                        # 共享类型
│
├── scripts/
│   ├── quiz-scraper-v8.js              # ★ Quiz自动答题（主脚本）
│   ├── summarize-results.js            # Quiz结果汇总生成器
│   ├── download-missing-by-level.js    # 按级别下载缺失书籍
│   ├── supplement-from-reader.js       # 从reader数据补充
│   ├── generate-book-list.js           # 生成书籍统计
│   ├── stats-downloads.js              # 下载统计
│   ├── check-and-download-missing.js   # 检查并下载缺失文件
│   ├── download-low-audio.js           # 下载低音频书籍
│   ├── batch-supplement.js             # 批量补充资源
│   ├── fix-missing-books.js            # 修复缺失slug/theme
│   ├── fix-missing-books-api.js        # 通过API推理修复
│   ├── check-missing-files.js          # 检查缺失文件
│   ├── download-missing-files.js       # 从URL列表下载
│   ├── guess-slug-download.js          # 猜测slug并下载
│   ├── process-missing-books.js        # 通过Playwright处理缺失书籍
│   ├── generate-books-sql.js           # 生成书籍导入SQL
│   └── sanitize-data.js                # 脱敏数据
│
├── auto-run.ps1                        # ★ 自动化Quiz抓取运行器
│
├── data/
│   ├── quiz-results/                   # ★ 每本书的Quiz尝试历史
│   │   ├── {Book_Title}.json
│   │   └── _summary.json
│   ├── quiz-results-summary.json       # ★ 紧凑Quiz汇总
│   ├── book-texts/                     # ★ OCR提取的书籍文本
│   │   ├── {Book_Title}.txt
│   │   └── {Book_Title}.json
│   ├── reports/                        # ★ 每本书的Markdown报告
│   │   └── {Book_Title}.md
│   ├── deployment-ids.json             # ★ 缓存的部署ID
│   ├── timing.log                      # ★ 带时间戳的操作日志
│   ├── auto-run.log                    # ★ 自动运行会话日志
│   ├── cookies/                        # 会话Cookie
│   ├── booklists/                      # 书籍列表缓存
│   └── probe/                          # 探测数据
│       └── probe-results.public.json   # 匿名化样本
│
├── docs/
│   ├── program-flow.md                 # ★ Quiz抓取器程序流程图
│   ├── login-flow.md                   # kids-a-z登录流程文档
│   ├── resource-patterns.md            # 资源URL模式
│   └── 获取quiz.md                     # Quiz获取笔记
│
├── downloads/                          # 已下载资源（gitignored）
│   └── {Level}/{resourceId}-{title}/
│       ├── meta.json
│       ├── images/
│       │   ├── page-00.jpg
│       │   └── ...
│       └── audio/
│           ├── raz_{slug}_{theme}_title_text.mp3
│           ├── raz_{slug}_{theme}_p1_text.mp3
│           └── ...
│
├── package.json
├── tsconfig.json
└── .gitignore
```

## 下载输出格式

```
downloads/
├── {Level}/                        # aa, A, B, ... Z2
│   └── {resourceId}-{title}/
│       ├── cover-{resourceId}.png  # 书籍封面
│       ├── meta.json               # 书籍元数据
│       ├── images/                 # 页面图片
│       │   ├── page-00.jpg         # 零填充页码
│       │   ├── page-01.jpg
│       │   └── ...
│       └── audio/                  # 朗读音频
│           ├── raz_{slug}_{theme}_title_text.mp3
│           ├── raz_{slug}_{theme}_p1_text.mp3
│           └── ...
```

## 备注

- 所有凭据已替换为占位符（`<YOUR_CLASS_NAME>`、`<YOUR_SCREEN_NAME>` 等）— 运行前通过环境变量设置
- 密码组合与顺序无关（1-2-3 等同于 3-2-1）
- API 有速率限制；脚本通过 `safeGoto` 自动处理（403/封锁页面的指数退避）
- CDN 下载无需认证（直接 HTTP GET）
- 浏览器以静音模式启动（`--mute-audio`）
- 书籍列表首次提取后缓存到 `data/booklists/`
- 音频页码可能不连续；脚本使用连续 404 检测书籍结尾
- Quiz 抓取器使用 headless=false 并将窗口置于屏幕外（`--window-position=-2400,-2400`）以避免 Cloudflare 检测
- Quiz 答案通过排除法确定：每次尝试排除错误选项，每题最多4次尝试收敛到正确答案
- 敏感数据（Cookie、Quiz结果、书籍文本、报告）通过 `.gitignore` 排除
- `data/` 子目录使用 `.gitkeep` 文件保留目录结构

## 许可证

MIT
