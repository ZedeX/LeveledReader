# Kids A-Z Scripts Reference / 脚本参考

> Auto-generated: 2026-06-07 | All paths relative to project root `e:\git\kids-a-z`

---

## 1. Scraping & Data Collection / 抓取与数据收集

### reading-room-quiz-scraper.js
**EN**: Main quiz scraper — logs into Kids A-Z via Playwright, navigates Reading Room by level, answers quizzes to extract questions and correct answers.
**CN**: 主Quiz抓取器 — 通过Playwright登录Kids A-Z，按级别浏览Reading Room，答题以提取题目和正确答案。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| `KIDSAZ_CLASS_NAME` | env | Yes | — | Teacher class name, e.g. `msummer17` / 教师班级名 |
| `KIDSAZ_STUDENT_ID` | env | Yes | — | Numeric student ID / 学生数字ID |
| `KIDSAZ_SCREEN_NAME` | env | Yes | — | Student screen name / 学生显示名 |
| `KIDSAZ_PASSWORD` | env | Yes | — | Comma-separated password icon names / 逗号分隔的密码图标名 |
| `KIDSAZ_COOKIE_DIR` | env | No | `data/cookies` | Cookie storage directory / Cookie存储目录 |
| `KIDSAZ_LEVELS` | env | No | All levels (aa-Z2) | Comma-separated levels to scrape / 要抓取的级别 |
| `KIDSAZ_SKIP_EXISTING` | env | No | `1` | Skip books with existing passed quizzes (`0`=no skip) / 跳过已通过的quiz |
| `KIDSAZ_SPEED` | env | No | `1.0` | Speed factor (2.0 = twice as fast) / 速度因子 |
| `DEBUG` | env | No | `0` | Set `1` to enable debug mode / 设为1启用调试 |
| `TESSERACT_PATH` | env | No | `tesseract` | Path to Tesseract OCR binary / Tesseract路径 |

**Usage / 用法**:
```bash
set KIDSAZ_CLASS_NAME=msummer17
set KIDSAZ_STUDENT_ID=276393595
set KIDSAZ_SCREEN_NAME=Joe
set KIDSAZ_PASSWORD=rabbit
set KIDSAZ_LEVELS=A,B,C,D
set KIDSAZ_SPEED=1.2
node scripts/reading-room-quiz-scraper.js
```

---

### quiz-scraper-v8.js
**EN**: Earlier version of the quiz scraper using Level-Up station navigation. Accepts CLI args for level range and loop count.
**CN**: 早期版本的Quiz抓取器，使用Level-Up站点导航。接受CLI参数指定级别范围和循环次数。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| `argv[2]` | CLI | No | `0` | Start level index / 起始级别索引 |
| `argv[3]` | CLI | No | `999` | End level index / 结束级别索引 |
| `argv[4]` | CLI | No | `level-up` | Station name (`level-up` or `reading-room`) / 站点名 |
| `argv[5]` | CLI | No | `99` | Max level loop count / 最大级别循环次数 |
| `KIDSAZ_CLASS_NAME` | env | Yes | — | Teacher class name / 教师班级名 |
| `KIDSAZ_STUDENT_ID` | env | Yes | — | Numeric student ID / 学生数字ID |
| `KIDSAZ_SCREEN_NAME` | env | Yes | — | Student screen name / 学生显示名 |
| `KIDSAZ_PASSWORD` | env | Yes | — | Comma-separated password icon names / 密码图标名 |
| `KIDSAZ_COOKIE_DIR` | env | No | `data/cookies` | Cookie storage directory / Cookie目录 |
| `KIDSAZ_SPEED` | env | No | `1.0` | Speed factor / 速度因子 |
| `DEBUG` | env | No | `0` | Enable debug mode / 调试模式 |
| `TESSERACT_PATH` | env | No | `tesseract` | Tesseract OCR path / Tesseract路径 |

**Usage / 用法**:
```bash
set KIDSAZ_CLASS_NAME=msummer17&& set KIDSAZ_SCREEN_NAME=Joe&& set KIDSAZ_PASSWORD=rabbit&& set KIDSAZ_STUDENT_ID=276393595
node scripts/quiz-scraper-v8.js 0 999 level-up 99
```

---

### download-and-quiz-N-O.js
**EN**: Combined script to download missing book images and scrape quizzes for Level N (Lucas) and Level O (Eva) using hardcoded accounts.
**CN**: 组合脚本，使用硬编码账号下载Level N (Lucas) 和 Level O (Eva) 缺失的书籍图片并抓取Quiz。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Accounts hardcoded: Lucas(msummer11)/Eva(msummer11) / 账号硬编码 |

**Usage / 用法**:
```bash
node scripts/download-and-quiz-N-O.js
```

---

### supplement-from-reader.js
**EN**: Download missing images and audio from CDN using data parsed from `reader.html`. No browser automation needed.
**CN**: 从`reader.html`解析数据，通过CDN下载缺失的图片和音频。无需浏览器自动化。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| `reader.html` | file | Yes | — | Must exist in project root / 必须存在于项目根目录 |

**Usage / 用法**:
```bash
node scripts/supplement-from-reader.js
```

---

### batch-supplement.js
**EN**: Batch supplement missing images and audio. Scans downloads dir, downloads via CDN for books with slug/theme, uses Playwright for books without.
**CN**: 批量补充缺失的图片和音频。扫描downloads目录，有slug/theme的直接CDN下载，没有的通过Playwright获取。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| `--headed` | CLI | No | headless | Run browser in headed mode / 以有头模式运行浏览器 |

**Usage / 用法**:
```bash
node scripts/batch-supplement.js
node scripts/batch-supplement.js --headed
```

---

### process-missing-books.js
**EN**: Find and process books missing slug/theme or with wrong titles, using Playwright to fetch correct metadata from the website.
**CN**: 查找并处理缺少slug/theme或标题错误的书籍，通过Playwright从网站获取正确元数据。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads from `data/probe/students-by-level.json` / 从students-by-level.json读取 |

**Usage / 用法**:
```bash
node scripts/process-missing-books.js
```

---

### guess-slug-download.js
**EN**: Download missing audio by guessing slug/theme patterns from book titles (lowercase, no spaces, no special chars).
**CN**: 通过猜测slug/theme模式下载缺失音频（小写、去空格、去特殊字符）。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Scans `downloads/` directory / 扫描downloads目录 |

**Usage / 用法**:
```bash
node scripts/guess-slug-download.js
```

---

### fix-missing-books.js
**EN**: Early template for fixing missing books using Playwright with hardcoded student accounts and level assignments.
**CN**: 早期模板，使用Playwright和硬编码的学生账号/级别分配来修复缺失书籍。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Student data hardcoded in STUDENTS array / 学生数据硬编码 |

**Usage / 用法**:
```bash
node scripts/fix-missing-books.js
```

---

## 2. Database & Import / 数据库与导入

### build-database.js
**EN**: Build SQLite database from scratch. Scans `downloads/` for book metadata, `data/quiz-results/` for quiz data, and `quiz-results-summary.json` for answer supplementation.
**CN**: 从零构建SQLite数据库。扫描downloads/获取书籍元数据，data/quiz-results/获取quiz数据，quiz-results-summary.json补充答案。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads from `downloads/` and `data/quiz-results/` / 从downloads和quiz-results读取 |

**Output / 输出**: `data/kidsa-z.db`, `data/build-database.log`

**Usage / 用法**:
```bash
node scripts/build-database.js
```

---

### import-quizzes.js
**EN**: Import quiz data from JSON files in `data/quiz-results/` into the existing SQLite database. Extracts correct answers from retry chains.
**CN**: 将`data/quiz-results/`中的JSON quiz数据导入到现有SQLite数据库。从重试链中提取正确答案。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads from `data/quiz-results/*.json` / 从quiz-results JSON读取 |

**Output / 输出**: Updates `data/kidsa-z.db`, logs to `data/import-quizzes.log`

**Usage / 用法**:
```bash
node scripts/import-quizzes.js
```

---

### generate-books-sql.js
**EN**: Scan downloads directory and generate SQL INSERT statements for D1 database deployment.
**CN**: 扫描downloads目录并生成D1数据库部署用的SQL INSERT语句。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Outputs SQL to stdout / SQL输出到stdout |

**Usage / 用法**:
```bash
node scripts/generate-books-sql.js > books-update.sql
npx wrangler d1 execute kids-az-db --local --file=books-update.sql
```

---

### show-schema.js
**EN**: Display the SQLite database schema (all CREATE TABLE statements).
**CN**: 显示SQLite数据库架构（所有CREATE TABLE语句）。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/kidsa-z.db` / 读取kidsa-z.db |

**Usage / 用法**:
```bash
node scripts/show-schema.js
```

---

### fix-missing-answers.js
**EN**: Check quiz JSON files for correct answers not yet in DB, update DB directly, mark Level aa as "no quiz", and list books needing re-scraping.
**CN**: 检查quiz JSON文件中尚未入库的正确答案，直接更新DB，标记Level aa为"无quiz"，列出需要重新抓取的书籍。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/quiz-results/` and `data/kidsa-z.db` |

**Usage / 用法**:
```bash
node scripts/fix-missing-answers.js
```

---

### prepare-answer-extraction.js
**EN**: Create Level aa marker JSON files (no quiz available), delete JSON files for books needing answer re-extraction, and generate scraper commands.
**CN**: 为Level aa创建标记JSON文件（无quiz），删除需要重新提取答案的JSON文件，生成抓取器命令。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads DB and quiz-results / 读取DB和quiz-results |

**Usage / 用法**:
```bash
node scripts/prepare-answer-extraction.js
```

---

### fix-sea-turtles.js
**EN**: Fix the unmatched Sea Turtles quiz file by renaming bookTitle from CSS garbage to "Sea Turtles".
**CN**: 修复Sea Turtles quiz文件，将bookTitle从CSS垃圾文本改为"Sea Turtles"。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Fixes specific file in `data/quiz-results/` / 修复特定文件 |

**Usage / 用法**:
```bash
node scripts/fix-sea-turtles.js
```

---

### fix-polluted-files.js
**EN**: Fix polluted quiz result filenames and bookTitles that contain CSS class garbage or activity status text.
**CN**: 修复被CSS类垃圾文本或活动状态文本污染的quiz结果文件名和bookTitle。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Processes `data/quiz-results/` / 处理quiz-results目录 |

**Usage / 用法**:
```bash
node scripts/fix-polluted-files.js
```

---

### summarize-results.js
**EN**: Collect all correct answers from quiz result JSON files (including retry chains) and write a summary file.
**CN**: 从quiz结果JSON文件（含重试链）收集所有正确答案，写入汇总文件。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/quiz-results/` |

**Output / 输出**: `data/quiz-results-summary.json`

**Usage / 用法**:
```bash
node scripts/summarize-results.js
```

---

### generate-missing-books.js
**EN**: Generate lists of books needing quiz scraping: no-quiz-books, incomplete-quiz-books, and combined supplement-books grouped by level.
**CN**: 生成需要Quiz抓取的书籍列表：无quiz书籍、不完整quiz书籍、按级别分组的补充书籍。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/kidsa-z.db` |

**Output / 输出**: `data/no-quiz-books.json`, `data/incomplete-quiz-books.json`, `data/supplement-books.json`

**Usage / 用法**:
```bash
node scripts/generate-missing-books.js
```

---

### export-quiz-questions.js
**EN**: Export all quiz questions with correct answers from DB to a JSON file.
**CN**: 从数据库导出所有带正确答案的quiz题目到JSON文件。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/kidsa-z.db` |

**Output / 输出**: `data/all-quiz-questions.json`

**Usage / 用法**:
```bash
node scripts/export-quiz-questions.js
```

---

## 3. OCR & Text Processing / OCR与文本处理

### ocr-books.js
**EN**: OCR book page images using Tesseract and generate clean Markdown files. Supports filtering by level, limit, and force re-processing.
**CN**: 使用Tesseract对书籍页面图片进行OCR，生成干净的Markdown文件。支持按级别、数量过滤和强制重新处理。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| `--limit N` | CLI | No | all | Only process N books / 只处理N本书 |
| `--level LEVEL` | CLI | No | all | Only process given level / 只处理指定级别 |
| `--force` | CLI | No | false | Re-process even if MD exists / 即使MD已存在也重新处理 |
| `--book TITLE` | CLI | No | all | Process book with matching title (partial) / 按标题匹配 |

**Usage / 用法**:
```bash
node scripts/ocr-books.js
node scripts/ocr-books.js --level R --limit 10
node scripts/ocr-books.js --force --book "Sea Turtles"
```

---

### ocr-missing-text.js
**EN**: OCR books that are missing text in the database. Imports existing MD files into DB first, then runs Tesseract on remaining books.
**CN**: 对数据库中缺少文本的书籍进行OCR。先将已有MD文件导入DB，再对其余书籍运行Tesseract。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Tesseract path hardcoded to `D:\_program\Tesseract-OCR\tesseract.exe` |

**Usage / 用法**:
```bash
node scripts/ocr-missing-text.js
```

---

### import-corrected-text.js
**EN**: Merge LLM-corrected OCR parts (1-5) and write corrected text into the database's book_pages table.
**CN**: 合并LLM校正后的OCR部分(1-5)，将校正文本写入数据库的book_pages表。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/ocr-corrected-{1..5}.json` / 读取校正文件 |

**Usage / 用法**:
```bash
node scripts/import-corrected-text.js
```

---

### clean-ocr-text.js
**EN**: Basic OCR cleanup before LLM polishing — removes garbage patterns, ligatures, isolated special character lines.
**CN**: LLM润色前的基础OCR清理 — 移除垃圾模式、连字、孤立特殊字符行。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/ocr-results.json`, outputs `data/ocr-cleaned.json` |

**Usage / 用法**:
```bash
node scripts/clean-ocr-text.js
```

---

### rechunk-ocr.js
**EN**: Re-split OCR cleaned data into exactly 5 balanced chunks for parallel LLM processing, sorted by level and title.
**CN**: 将OCR清理后的数据重新分割为5个均衡块，用于并行LLM处理，按级别和标题排序。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/ocr-cleaned.json`, outputs `data/ocr-part-{1..5}.json` |

**Usage / 用法**:
```bash
node scripts/rechunk-ocr.js
```

---

### split-ocr-results.js
**EN**: Split OCR results into 4 level-based groups for parallel LLM processing (Low/Mid-low/Mid-high/High).
**CN**: 将OCR结果按级别分为4组用于并行LLM处理（低/中低/中高/高）。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/ocr-results.json`, outputs `data/ocr-groups/group{1..4}.json` |

**Usage / 用法**:
```bash
node scripts/split-ocr-results.js
```

---

### split-ocr-files.js
**EN**: Split OCR text MD files into 20 batches for parallel cleaning.
**CN**: 将OCR文本MD文件分为20批用于并行清理。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/book-texts/*.md`, outputs `data/ocr-batches/batch-{01..20}/` |

**Usage / 用法**:
```bash
node scripts/split-ocr-files.js
```

---

### split-json-files.js
**EN**: Split JSON book text files into 5 batches for parallel MD conversion.
**CN**: 将JSON书籍文本文件分为5批用于并行MD转换。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/book-texts/*.json`, outputs `data/json-batches/batch-{01..05}/` |

**Usage / 用法**:
```bash
node scripts/split-json-files.js
```

---

### format-book-texts.js
**EN**: Post-process OCR-generated Markdown files to fix common OCR errors.
**CN**: 后处理OCR生成的Markdown文件，修复常见OCR错误。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| `--file NAME` | CLI | No | all | Process specific file only / 只处理指定文件 |
| `--dry-run` | CLI | No | false | Show changes without writing / 显示更改但不写入 |

**Usage / 用法**:
```bash
node scripts/format-book-texts.js
node scripts/format-book-texts.js --file R_Alaska.md
node scripts/format-book-texts.js --dry-run
```

---

### test-cleanTitle.js
**EN**: Unit test for the `cleanTitle()` function that strips CSS garbage and status text from book titles.
**CN**: `cleanTitle()`函数的单元测试，该函数用于从书名中去除CSS垃圾文本和状态文本。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Standalone test / 独立测试 |

**Usage / 用法**:
```bash
node scripts/test-cleanTitle.js
```

---

## 4. Analysis & Reporting / 分析与报告

### generate-book-status.js
**EN**: Generate a Markdown report of book status across all levels — showing text coverage, quiz coverage, and pass rates.
**CN**: 生成跨所有级别的书籍状态Markdown报告 — 显示文本覆盖率、Quiz覆盖率和通过率。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/kidsa-z.db`, `data/book-texts/`, `data/quiz-results/` |

**Usage / 用法**:
```bash
node scripts/generate-book-status.js
```

---

### check-progress.js
**EN**: Quick progress check — shows per-level book count, quiz questions, answered questions, and expected vs missing.
**CN**: 快速进度检查 — 显示每级别的书籍数、Quiz题数、已答题数、预期与缺失。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/kidsa-z.db` |

**Usage / 用法**:
```bash
node scripts/check-progress.js
```

---

### check-y.js
**EN**: Simplified progress check showing books, questions, answered, expected, and missing per level.
**CN**: 简化进度检查，显示每级别的书籍、题目、已答、预期和缺失。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/kidsa-z.db` |

**Usage / 用法**:
```bash
node scripts/check-y.js
```

---

### analyze-gaps.js
**EN**: Detailed gap analysis between quiz files, database, and book status. Cross-references all data sources.
**CN**: Quiz文件、数据库和书籍状态之间的详细差距分析。交叉引用所有数据源。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/kidsa-z.db`, `data/quiz-results/`, `data/book-texts/` |

**Usage / 用法**:
```bash
node scripts/analyze-gaps.js
```

---

### integration-report.js
**EN**: Generate a comprehensive integration report for quiz data in the database — answer distribution, anomalies, coverage.
**CN**: 生成数据库中Quiz数据的综合集成报告 — 答案分布、异常、覆盖率。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/kidsa-z.db` |

**Output / 输出**: `data/integration-report.txt`

**Usage / 用法**:
```bash
node scripts/integration-report.js
```

---

### audit-quiz-answers.js
**EN**: Analyze quiz answers for potential errors — answer distribution anomalies, common sense contradictions, option text mismatches.
**CN**: 分析Quiz答案的潜在错误 — 答案分布异常、常识矛盾、选项文本不匹配。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/kidsa-z.db` |

**Usage / 用法**:
```bash
node scripts/audit-quiz-answers.js
```

---

### check-timing.js
**EN**: Analyze timing logs for all scraper accounts — loop counts, books completed, quiz results, elapsed time.
**CN**: 分析所有抓取器账号的计时日志 — 循环次数、完成书籍、Quiz结果、耗时。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/timing-{Name}.log` for Joe, Lisa, Amiee, Annie, Jim |

**Usage / 用法**:
```bash
node scripts/check-timing.js
```

---

### check-n-missing.js
**EN**: Check Level N books for missing images and incomplete quiz data.
**CN**: 检查Level N书籍的缺失图片和不完整Quiz数据。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/kidsa-z.db` and `downloads/N/` |

**Usage / 用法**:
```bash
node scripts/check-n-missing.js
```

---

### check-missing-text.js
**EN**: Find books that have page images but are missing text in the database.
**CN**: 查找有页面图片但数据库中缺少文本的书籍。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/kidsa-z.db` and `downloads/` |

**Usage / 用法**:
```bash
node scripts/check-missing-text.js
```

---

### find-missing-text-books.js
**EN**: Find books in the DB that have zero pages with text (no page_text at all).
**CN**: 查找数据库中没有任何页面有文本的书籍。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/kidsa-z.db` |

**Usage / 用法**:
```bash
node scripts/find-missing-text-books.js
```

---

### debug-missing-text.js
**EN**: Debug specific books (hardcoded list) to check their image and text status in the downloads directory.
**CN**: 调试特定书籍（硬编码列表），检查其在downloads目录中的图片和文本状态。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Book IDs hardcoded in script / 书籍ID硬编码 |

**Usage / 用法**:
```bash
node scripts/debug-missing-text.js
```

---

### stats-downloads.js
**EN**: Statistics for the downloads directory — total books, images, audio per level.
**CN**: downloads目录统计 — 每级别的总书籍数、图片数、音频数。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `downloads/` |

**Output / 输出**: `downloads-stats-2.txt`

**Usage / 用法**:
```bash
node scripts/stats-downloads.js
```

---

### generate-book-list.js
**EN**: Generate a book list with download statistics, identifying books with missing slug/theme, zero audio, or low audio.
**CN**: 生成带下载统计的书籍列表，识别缺少slug/theme、零音频或低音频的书籍。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `downloads/` |

**Usage / 用法**:
```bash
node scripts/generate-book-list.js
```

---

### generate-site-data.js
**EN**: Generate static site data (JSON) from the downloads directory for the Leveled Reader web app.
**CN**: 从downloads目录生成静态站点数据(JSON)，用于Leveled Reader Web应用。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `downloads/`, outputs to `site/` |

**Usage / 用法**:
```bash
node scripts/generate-site-data.js
```

---

## 5. Login & Authentication / 登录与认证

### crack-new-passwords.js
**EN**: Crack passwords for new students in msummer12 by trying all 2-icon combinations (18×17=306 ordered pairs) via the Kids A-Z API.
**CN**: 通过Kids A-Z API尝试所有2图标组合(18×17=306有序对)来破解msummer12中新学生的密码。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Class `msummer12` hardcoded, targets 16 students / 班级硬编码，目标16名学生 |

**Output / 输出**: `data/student-credentials.json`, `data/crack-passwords.log`

**Usage / 用法**:
```bash
node scripts/crack-new-passwords.js
```

---

### get-student-passwords.js
**EN**: Get password info for all students by navigating the class chart page and clicking each student to see their password icons.
**CN**: 通过导航班级图表页面并点击每个学生查看其密码图标，获取所有学生的密码信息。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Class `msummer12` hardcoded / 班级硬编码 |

**Usage / 用法**:
```bash
node scripts/get-student-passwords.js
```

---

### diagnose-login.js
**EN**: Quick login diagnosis — navigates login flow step by step, takes screenshots, and analyzes page structure.
**CN**: 快速登录诊断 — 逐步导航登录流程，截图并分析页面结构。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Class `msummer12` hardcoded / 班级硬编码 |

**Usage / 用法**:
```bash
node scripts/diagnose-login.js
```

---

### test-api-login.js
**EN**: Test API-based login flow (separate from UI login) — uses browser fetch with CSRF tokens to test authentication endpoints.
**CN**: 测试基于API的登录流程（独立于UI登录） — 使用带CSRF令牌的浏览器fetch测试认证端点。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Account `msummer12/Ariel` hardcoded / 账号硬编码 |

**Usage / 用法**:
```bash
node scripts/test-api-login.js
```

---

### check-pw.js
**EN**: Quick check if Playwright is installed and chromium is available.
**CN**: 快速检查Playwright是否已安装且chromium可用。

**Parameters / 参数**: None

**Usage / 用法**:
```bash
node scripts/check-pw.js
```

---

## 6. Download & File Management / 下载与文件管理

### download-missing-files.js
**EN**: Download missing files based on `all-download-urls.txt` — checks which files exist locally and downloads the rest.
**CN**: 根据`all-download-urls.txt`下载缺失文件 — 检查本地已有文件并下载其余的。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `all-download-urls.txt` (tab-separated: type, url, localPath) |

**Usage / 用法**:
```bash
node scripts/download-missing-files.js
```

---

### download-low-audio.js
**EN**: Re-download audio for books with fewer than 5 audio files, using CDN URLs.
**CN**: 为音频文件少于5个的书籍重新下载音频，使用CDN URL。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Scans `downloads/` |

**Usage / 用法**:
```bash
node scripts/download-low-audio.js
```

---

### check-missing-files.js
**EN**: Check which books have missing images or audio files compared to their meta.json expectations.
**CN**: 检查哪些书籍相比meta.json预期缺少图片或音频文件。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Scans `downloads/` |

**Usage / 用法**:
```bash
node scripts/check-missing-files.js
```

---

### rewrite-reader-urls.js
**EN**: Rewrite `reader.html` URLs to point to GitHub raw content for the static site deployment.
**CN**: 将`reader.html`中的URL重写为GitHub raw内容链接，用于静态站点部署。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Reads `data/reader.html`, outputs `site/reader.html` |

**Usage / 用法**:
```bash
node scripts/rewrite-reader-urls.js
```

---

### fix-missing-books-api.js
**EN**: Find books missing slug/theme or with wrong titles (like "Book 123"), report for API-based fixing.
**CN**: 查找缺少slug/theme或标题错误的书籍（如"Book 123"），报告以供API修复。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Scans `downloads/` |

**Usage / 用法**:
```bash
node scripts/fix-missing-books-api.js
```

---

## 7. Utility & Debug / 工具与调试

### optimize-delays.js
**EN**: One-time utility to reduce delay values in quiz-scraper-v8.js for faster scraping.
**CN**: 一次性工具，减少quiz-scraper-v8.js中的延迟值以加快抓取速度。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Modifies `scripts/quiz-scraper-v8.js` in place / 原地修改 |

**Usage / 用法**:
```bash
node scripts/optimize-delays.js
```

---

### debug-card-scope.js
**EN**: Debug Angular scope on Reading Room cards after navigation — check if card data persists.
**CN**: 调试导航后Reading Room卡片上的Angular scope — 检查卡片数据是否持久。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Account `msummer12/Ariel` hardcoded |

**Usage / 用法**:
```bash
node scripts/debug-card-scope.js
```

---

### debug-quiz-dom.js
**EN**: Inspect quiz page DOM structure for option extraction — uses env vars for account config.
**CN**: 检查Quiz页面DOM结构以提取选项 — 使用环境变量配置账号。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| `KIDSAZ_CLASS_NAME` | env | No | `msummer12` | Class name / 班级名 |
| `KIDSAZ_SCREEN_NAME` | env | No | `Ariel` | Screen name / 显示名 |
| `KIDSAZ_PASSWORD` | env | No | `fish,apple` | Password icons / 密码图标 |

**Usage / 用法**:
```bash
node scripts/debug-quiz-dom.js
```

---

### debug-quiz-submit.js
**EN**: Debug quiz submission flow — check what happens after clicking Done button.
**CN**: 调试Quiz提交流程 — 检查点击Done按钮后发生什么。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Account `msummer12/Ariel` hardcoded |

**Usage / 用法**:
```bash
node scripts/debug-quiz-submit.js
```

---

### explore-login-page.js
**EN**: Explore login page structure — takes screenshots and analyzes DOM at each step.
**CN**: 探索登录页面结构 — 每步截图并分析DOM。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| `KIDSAZ_CLASS_NAME` | env | No | `msummer12` | Class name / 班级名 |
| `KIDSAZ_SCREEN_NAME` | env | No | `Ariel` | Screen name / 显示名 |
| `KIDSAZ_PASSWORD` | env | No | `fish,apple` | Password icons / 密码图标 |

**Usage / 用法**:
```bash
node scripts/explore-login-page.js
```

---

### explore-login-page-v2.js
**EN**: Detailed login flow exploration — tests each step and captures detailed analysis.
**CN**: 详细登录流程探索 — 测试每一步并捕获详细分析。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Account `msummer12/Ariel` hardcoded |

**Usage / 用法**:
```bash
node scripts/explore-login-page-v2.js
```

---

### explore-reading-room.js
**EN**: Explore Reading Room page structure — first exploration of the student portal.
**CN**: 探索Reading Room页面结构 — 学生门户的首次探索。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Cookie file hardcoded |

**Usage / 用法**:
```bash
node scripts/explore-reading-room.js
```

---

### explore-reading-room-nav.js
**EN**: Explore Reading Room navigation — improved version with better wait/debug.
**CN**: 探索Reading Room导航 — 改进版，更好的等待/调试。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Account `msummer12/Ariel` hardcoded |

**Usage / 用法**:
```bash
node scripts/explore-reading-room-nav.js
```

---

### explore-reading-room-debug.js
**EN**: Debug Reading Room navigation — find why cards don't load.
**CN**: 调试Reading Room导航 — 查找卡片不加载的原因。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Account `msummer12/Ariel` hardcoded |

**Usage / 用法**:
```bash
node scripts/explore-reading-room-debug.js
```

---

### explore-leveled-books.js
**EN**: Explore Leveled Books section in Reading Room.
**CN**: 探索Reading Room中的Leveled Books部分。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Cookie file hardcoded |

**Usage / 用法**:
```bash
node scripts/explore-leveled-books.js
```

---

### explore-card-detail.js
**EN**: Deep explore Reading Room card structure — get detailed attributes and activity links.
**CN**: 深入探索Reading Room卡片结构 — 获取详细属性和活动链接。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Cookie file hardcoded |

**Usage / 用法**:
```bash
node scripts/explore-card-detail.js
```

---

### explore-angular-scope.js
**EN**: Explore Angular scope to get deploymentIds from Reading Room cards.
**CN**: 探索Angular scope以从Reading Room卡片获取deploymentIds。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Cookie file hardcoded |

**Usage / 用法**:
```bash
node scripts/explore-angular-scope.js
```

---

### explore-angular-scope2.js
**EN**: Explore Angular scope with fresh login (no cached cookies).
**CN**: 使用全新登录（无缓存Cookie）探索Angular scope。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Cookie file hardcoded |

**Usage / 用法**:
```bash
node scripts/explore-angular-scope2.js
```

---

### explore-modal-links.js
**EN**: Explore Reading Room modal links — found Activity URLs like `/main/Activity/id/{deploymentId}/collectionId/{collectionId}`.
**CN**: 探索Reading Room模态链接 — 发现Activity URL格式。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Account `msummer12/Ariel` hardcoded |

**Usage / 用法**:
```bash
node scripts/explore-modal-links.js
```

---

### explore-popover.js
**EN**: Explore Reading Room popover behavior when clicking cards — showAsOverlay=false means popover mode.
**CN**: 探索点击卡片时的Reading Room弹出框行为。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Account `msummer12/Ariel` hardcoded |

**Usage / 用法**:
```bash
node scripts/explore-popover.js
```

---

### explore-activity-url.js
**EN**: Explore the getActivityUrl function and federate URL construction in Reading Room.
**CN**: 探索Reading Room中的getActivityUrl函数和federate URL构造。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Account `msummer12/Ariel` hardcoded |

**Usage / 用法**:
```bash
node scripts/explore-activity-url.js
```

---

### explore-quiz-submit.js
**EN**: Explore what the page looks like after quiz submission — reward page, score display, Try Again button.
**CN**: 探索Quiz提交后的页面外观 — 奖励页面、分数显示、重试按钮。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| `KIDSAZ_CLASS_NAME` | env | No | — | Class name / 班级名 |
| `KIDSAZ_SCREEN_NAME` | env | No | — | Screen name / 显示名 |
| `KIDSAZ_PASSWORD` | env | No | — | Password icons / 密码图标 |

**Usage / 用法**:
```bash
node scripts/explore-quiz-submit.js
```

---

## 8. Wrapper Scripts (BAT / PS1) / 包装脚本

### parallel-quiz-scraper.bat
**EN**: Wrapper that calls `parallel-quiz-scraper.ps1` via PowerShell 7.
**CN**: 通过PowerShell 7调用`parallel-quiz-scraper.ps1`的包装脚本。

**Usage / 用法**:
```bash
parallel-quiz-scraper.bat
```

---

### parallel-quiz-scraper.ps1
**EN**: Launch 5 quiz scraper accounts in parallel using Windows Terminal. Each account runs in its own terminal tab.
**CN**: 使用Windows Terminal并行启动5个Quiz抓取器账号。每个账号在自己的终端标签中运行。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| `-Processes` | CLI | No | `5` | Number of accounts to start / 启动的账号数 |
| `-DelaySeconds` | CLI | No | `3` | Delay between starts (seconds) / 启动间隔(秒) |
| `-Speed` | CLI | No | `1.2` | Speed factor / 速度因子 |
| `-DryRun` | CLI | No | false | Show commands without starting / 只显示命令 |
| `-PwshPath` | CLI | No | `D:\_program\powershell\pwsh.exe` | PowerShell 7 path / PS7路径 |

**Account Mapping / 账号分配**:
| Process | Account | Class | Levels |
|---------|---------|-------|--------|
| P1-Joe | Joe | msummer17 | A-B-C-D |
| P2-Lisa | Lisa | msummer15 | E-F-G-H |
| P3-Amiee | Amiee | msummer13 | I-J-K-L |
| P4-Annie | Annie | msummer15 | M-N-O-P-Q |
| P5-Jim | Jim | msummer17 | R-S-T-U-V-W-X-Y-Z-Z1-Z2 |

**Usage / 用法**:
```powershell
.\parallel-quiz-scraper.ps1
.\parallel-quiz-scraper.ps1 -Processes 3 -Speed 1.5
.\parallel-quiz-scraper.ps1 -DryRun
```

---

### start-single-account.ps1
**EN**: Start a single account quiz scraper in the current terminal.
**CN**: 在当前终端启动单个账号的Quiz抓取器。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| `-Account` | CLI | Yes | — | One of: P1-Joe, P2-Lisa, P3-Amiee, P4-Annie, P5-Jim |
| `-Speed` | CLI | No | `1.2` | Speed factor / 速度因子 |
| `-DryRun` | CLI | No | false | Show command only / 只显示命令 |

**Usage / 用法**:
```powershell
.\start-single-account.ps1 -Account P1-Joe
.\start-single-account.ps1 -Account P3-Amiee -Speed 2.0
```

---

### run-quiz-supplement.bat
**EN**: Complete pipeline to supplement missing/incomplete quiz data. Runs: generate missing list → fix Sea Turtles → parallel scrape → rebuild DB → import quizzes → generate report.
**CN**: 补充缺失/不完整Quiz数据的完整流水线。运行：生成缺失列表→修复Sea Turtles→并行抓取→重建DB→导入Quiz→生成报告。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | Full pipeline | Full pipeline / 完整流水线 |
| `--import-only` | CLI | No | — | Skip scraping, only rebuild DB + report / 跳过抓取，只重建DB+报告 |
| `--report-only` | CLI | No | — | Only generate report / 只生成报告 |

**Pipeline Steps / 流水线步骤**:
1. Generate missing books list (`generate-missing-books.js`)
2. Fix Sea Turtles file (`fix-sea-turtles.js`)
3. Launch parallel quiz scraper (`run-quiz-supplement.ps1`)
4. Rebuild database (`build-database.js` + `import-quizzes.js`)
5. Generate integration report (`integration-report.js`)

**Usage / 用法**:
```bash
run-quiz-supplement.bat
run-quiz-supplement.bat --import-only
run-quiz-supplement.bat --report-only
```

---

### run-quiz-supplement.ps1
**EN**: PowerShell script called by `run-quiz-supplement.bat` to launch 5 accounts in parallel using `reading-room-quiz-scraper.js`.
**CN**: `run-quiz-supplement.bat`调用的PS脚本，使用`reading-room-quiz-scraper.js`并行启动5个账号。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| `-Speed` | CLI | No | `1.2` | Speed factor / 速度因子 |
| `-DelaySeconds` | CLI | No | `5` | Delay between starts / 启动间隔 |
| `-PwshPath` | CLI | No | `D:\_program\powershell\pwsh.exe` | PS7 path |
| `-WtPath` | CLI | No | `D:\_program\WindowsTerminal\wt.exe` | WindowsTerminal path |

**Usage / 用法**:
```powershell
.\run-quiz-supplement.ps1
.\run-quiz-supplement.ps1 -Speed 1.5 -DelaySeconds 10
```

---

### stop-all-quizzes.bat / stop-all-quizzes.ps1
**EN**: Stop all running parallel quiz scraper processes by reading the latest PID file.
**CN**: 通过读取最新的PID文件停止所有运行中的并行Quiz抓取器进程。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| `-LogDir` | CLI(PS1) | No | `data\logs` | Log directory containing PID files / 日志目录 |
| `-Force` | CLI(PS1) | No | false | Skip confirmation / 跳过确认 |

**Usage / 用法**:
```bash
stop-all-quizzes.bat
```
```powershell
.\stop-all-quizzes.ps1
.\stop-all-quizzes.ps1 -Force
```

---

### auto-run.bat / auto-run.ps1
**EN**: Auto-run quiz scraper in level-loop mode with max 99 loops, then summarize results.
**CN**: 以级别循环模式自动运行Quiz抓取器（最多99次循环），然后汇总结果。

**Parameters / 参数**:
| Param | Type | Required | Default | Description / 描述 |
|-------|------|----------|---------|---------------------|
| (none) | — | — | — | Uses `quiz-scraper-v8.js` with env vars set externally / 使用外部设置的环境变量 |

**Usage / 用法**:
```bash
auto-run.bat
```

---

### run-eva-O.bat
**EN**: Run quiz scraper for Level O using Eva account (msummer11) in debug mode.
**CN**: 使用Eva账号(msummer11)在调试模式下运行Level O的Quiz抓取器。

**Parameters / 参数**: Hardcoded env vars for Eva/msummer11/Level O

**Usage / 用法**:
```bash
run-eva-O.bat
```

---

### run-lucas-N.bat
**EN**: Run quiz scraper for Level N using Lucas account (msummer11) in debug mode.
**CN**: 使用Lucas账号(msummer11)在调试模式下运行Level N的Quiz抓取器。

**Parameters / 参数**: Hardcoded env vars for Lucas/msummer11/Level N

**Usage / 用法**:
```bash
run-lucas-N.bat
```

---

### run-explorer.bat
**EN**: Run the quiz explorer script (references `scripts/quiz-explorer.js` which may not exist).
**CN**: 运行Quiz探索脚本（引用`scripts/quiz-explorer.js`，可能不存在）。

**Usage / 用法**:
```bash
run-explorer.bat
```

---

### start-reader.bat
**EN**: Start a local HTTP server (port 8080) to serve the static Leveled Reader site from `site/` directory.
**CN**: 启动本地HTTP服务器(端口8080)，从`site/`目录提供静态Leveled Reader站点。

**Usage / 用法**:
```bash
start-reader.bat
# Opens http://localhost:8080
```

---

## Common Environment Variables / 通用环境变量

| Variable | Description / 描述 | Used By |
|----------|---------------------|---------|
| `KIDSAZ_CLASS_NAME` | Teacher class name (e.g. msummer17) / 教师班级名 | All scraper scripts |
| `KIDSAZ_STUDENT_ID` | Numeric student ID / 学生数字ID | All scraper scripts |
| `KIDSAZ_SCREEN_NAME` | Student display name / 学生显示名 | All scraper scripts |
| `KIDSAZ_PASSWORD` | Comma-separated password icon names / 密码图标名 | All scraper scripts |
| `KIDSAZ_COOKIE_DIR` | Cookie storage directory / Cookie存储目录 | reading-room-quiz-scraper, quiz-scraper-v8 |
| `KIDSAZ_LEVELS` | Comma-separated levels to scrape / 要抓取的级别 | reading-room-quiz-scraper |
| `KIDSAZ_SKIP_EXISTING` | Skip existing passed quizzes (1=yes, 0=no) / 跳过已通过 | reading-room-quiz-scraper |
| `KIDSAZ_SPEED` | Speed factor (1.0=normal, 2.0=2x faster) / 速度因子 | reading-room-quiz-scraper, quiz-scraper-v8 |
| `DEBUG` | Enable debug mode (1=yes) / 调试模式 | reading-room-quiz-scraper, quiz-scraper-v8 |
| `TESSERACT_PATH` | Path to Tesseract OCR binary / Tesseract路径 | reading-room-quiz-scraper, quiz-scraper-v8 |

---

## Password Icon Reference / 密码图标参考

The 18 available password icons / 18个可用密码图标:

| Index | Name |
|-------|------|
| 1 | rabbit |
| 2 | duck |
| 3 | fish |
| 4 | turtle |
| 5 | cat |
| 6 | lizard |
| 7 | car |
| 8 | truck |
| 9 | rocket |
| 10 | train |
| 11 | plane |
| 12 | boat |
| 13 | strawberry |
| 14 | apple |
| 15 | carrot |
| 16 | banana |
| 17 | watermelon |
| 18 | spoon |

---

## Directory Structure / 目录结构

```
kids-a-z/
├── data/
│   ├── kidsa-z.db              # SQLite database / SQLite数据库
│   ├── quiz-results/           # Raw quiz JSON files / 原始Quiz JSON文件
│   ├── quiz-results-summary.json
│   ├── book-texts/             # OCR text files (.md, .json) / OCR文本文件
│   ├── book-pages/             # Book page screenshots / 书籍页面截图
│   ├── cookies/                # Browser cookies / 浏览器Cookie
│   ├── screenshots/            # Debug screenshots / 调试截图
│   ├── reports/                # Generated reports / 生成的报告
│   ├── logs/                   # Scraper logs / 抓取器日志
│   ├── probe/                  # Student/account probe data / 探测数据
│   ├── ocr-results.json        # Raw OCR output / 原始OCR输出
│   ├── ocr-cleaned.json        # Cleaned OCR output / 清理后OCR输出
│   ├── ocr-corrected-{1..5}.json # LLM-corrected OCR parts / LLM校正部分
│   ├── ocr-part-{1..5}.json    # Re-chunked OCR parts / 重新分块OCR部分
│   ├── ocr-groups/             # Level-grouped OCR / 按级别分组的OCR
│   ├── ocr-batches/            # Batch-split OCR files / 批次分割OCR文件
│   ├── json-batches/           # Batch-split JSON files / 批次分割JSON文件
│   ├── integration-report.txt  # Integration report / 集成报告
│   └── timing-{Name}.log       # Per-account timing logs / 每账号计时日志
├── downloads/                  # Downloaded book resources / 下载的书籍资源
│   └── {level}/{id}-{slug}/
│       ├── meta.json
│       ├── images/             # Page images (.jpg) / 页面图片
│       └── audio/              # Page audio (.mp3) / 页面音频
├── site/                       # Static site output / 静态站点输出
├── scripts/                    # All JS scripts / 所有JS脚本
├── reader.html                 # Reader data source / Reader数据源
└── all-download-urls.txt       # URL list for batch download / 批量下载URL列表
```
