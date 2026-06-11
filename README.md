# LeveledReader

A self-hosted leveled reading book manager with a built-in web reader. Automates resource downloading from leveled reading platforms and provides an immersive local reading experience. Also includes automated quiz answering with elimination-based inference logic.

> **Disclaimer**: This tool is for personal educational use only. Please respect the terms of service of the reading platforms you use. Do not redistribute downloaded content.

---

## Features

- **Bookshelf UI** — Browse books organized by reading level (aa through Z2)
- **Immersive Reader** — Full-screen reading with automatic audio playback
- **Keyboard Navigation** — Arrow keys to turn pages, Space to play/pause audio
- **Background Preloading** — Automatically preloads all book covers, then page images and audio in order; prioritizes user actions (e.g., level selection) and resumes from breakpoint
- **Reading Progress** — Tracks reading status per book (unread/reading/completed) with localStorage persistence
- **Achievement System** — Unlock milestones (1-700 books, level completions) with colorful badges
- **Access Control** — Device-bound 8-character key verification with offline algorithm
- **Batch Download** — Automated resource downloading via Playwright browser automation
- **CDN Direct Download** — Download images and audio directly from CDN without authentication
- **Pattern-based Completion** — Automatically discovers and downloads all pages (p0-pN) until 404
- **Multi-user Worker** — Cloudflare Worker backend with auth, progress tracking, and admin panel
- **Quiz Auto-Answering** — Automated quiz completion with elimination-based inference, Level Loop, and answer extraction

---

## Quick Start

### Install

```bash
npm install
npx playwright install chromium
```

### Start the Reader

```bash
npm run reader
```

Open http://localhost:3000

### Download Books

```bash
# Full download (with browser UI for debugging)
npm run download

# Resume interrupted downloads
npm run download:resume

# Extract book list only (no downloading)
npm run download:extract

# Skip images or audio
npx tsx src/scraper/download-all-books-v2.ts --headed --skip-audio
npx tsx src/scraper/download-all-books-v2.ts --headed --skip-images
```

### Manual Login Mode

```bash
npx tsx src/scraper/download-all-books-v2.ts --headed \
  --teacher YOUR_TEACHER \
  --student YOUR_STUDENT \
  --password "icon1,icon2"
```

Passwords are icon names separated by commas (order does not matter). Cookies are saved automatically for subsequent runs.

---

## Quiz Scraper (quiz-scraper-v8.js)

Automated quiz answering for kidsa-z.com. Logs in with a teacher account, selects a student, enters the Level Up! station, and completes all Listen, Read, and Quiz activities for every book at the current level. When all books are green (all three activities complete), the level advances and the cycle repeats.

### Usage

```bash
# Full auto-run (recommended)
.\auto-run.ps1

# Manual run — process all books at current level
node scripts/quiz-scraper-v8.js

# Manual run with parameters
node scripts/quiz-scraper-v8.js <startIdx> <count> <station> <maxLevelLoops>

# Examples:
# Process 1 book from index 0, level-up station, 1 cycle
node scripts/quiz-scraper-v8.js 0 1 level-up 1

# Process all books, reading-room station, 99 cycles
node scripts/quiz-scraper-v8.js 0 999 bookroom 99

# Debug mode — save screenshots of each page
$env:DEBUG=1; node scripts/quiz-scraper-v8.js 0 1 level-up 1
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `<startIdx>` | `0` | Index of the first book to process (0-based) |
| `<count>` | `999` | Maximum number of books to process |
| `<station>` | `level-up` | Station to use: `level-up` or `bookroom` |
| `<maxLevelLoops>` | `99` | Maximum Level Loop iterations before stopping |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `KIDSAZ_CLASS_NAME` | Yes | Teacher class name, e.g. `msummer17` |
| `KIDSAZ_STUDENT_ID` | Yes | Student numeric ID, e.g. `276393548` |
| `KIDSAZ_SCREEN_NAME` | Yes | Student screen name, e.g. `Zahra` |
| `KIDSAZ_PASSWORD` | Yes | Password icon names, comma-separated, e.g. `rabbit` |
| `TESSERACT_PATH` | No | Path to Tesseract OCR binary (default: `tesseract`) |
| `DEBUG` | No | Set to `1` to enable screenshot capture (generates hundreds of MB) |

### Authentication

Set the environment variables before running:

```bash
# PowerShell
$env:KIDSAZ_CLASS_NAME = "your_class_name"
$env:KIDSAZ_STUDENT_ID = "123456789"
$env:KIDSAZ_SCREEN_NAME = "StudentName"
$env:KIDSAZ_PASSWORD = "rabbit"

# Or create a .env file in the project root:
# KIDSAZ_CLASS_NAME=your_class_name
# KIDSAZ_STUDENT_ID=123456789
# KIDSAZ_SCREEN_NAME=StudentName
# KIDSAZ_PASSWORD=rabbit
```

**How to find your account info:**
1. **Class Name**: Log in to kidsa-z.com as a teacher → the class name appears in the URL or class list
2. **Student ID**: Open the student's page → the numeric ID is in the API response or URL
3. **Screen Name**: The student's display name shown on the login page
4. **Password**: The icon(s) the student uses to log in (see Password Icon Reference below)

On first run, the script opens a browser for manual login (Cloudflare Turnstile challenge). After login, cookies are saved to `data/cookies/` and reused on subsequent runs.

### Parallel Scraping (Multiple Accounts)

To scrape all levels (aa–Z2) in parallel, open **5 separate terminal windows** and run each process with a different account. Each process uses its own browser instance and cookie directory.

```powershell
# Terminal 1: Joe (aa → D)
$env:KIDSAZ_CLASS_NAME="msummer17"; $env:KIDSAZ_STUDENT_ID="276393595"; $env:KIDSAZ_SCREEN_NAME="Joe"; $env:KIDSAZ_PASSWORD="rabbit"; $env:KIDSAZ_COOKIE_DIR="data/cookies/msummer17_Joe"
node scripts/quiz-scraper-v8.js 0 999 level-up 99

# Terminal 2: Lisa (E → H)
$env:KIDSAZ_CLASS_NAME="msummer15"; $env:KIDSAZ_STUDENT_ID="276408235"; $env:KIDSAZ_SCREEN_NAME="Lisa"; $env:KIDSAZ_PASSWORD="car,rocket"; $env:KIDSAZ_COOKIE_DIR="data/cookies/msummer15_Lisa"
node scripts/quiz-scraper-v8.js 0 999 level-up 99

# Terminal 3: Amiee (I → L)
$env:KIDSAZ_CLASS_NAME="msummer13"; $env:KIDSAZ_STUDENT_ID="276393775"; $env:KIDSAZ_SCREEN_NAME="Amiee"; $env:KIDSAZ_PASSWORD="watermelon"; $env:KIDSAZ_COOKIE_DIR="data/cookies/msummer13_Amiee"
node scripts/quiz-scraper-v8.js 0 999 level-up 99

# Terminal 4: Annie (M → Q)
$env:KIDSAZ_CLASS_NAME="msummer15"; $env:KIDSAZ_STUDENT_ID="276408241"; $env:KIDSAZ_SCREEN_NAME="Annie"; $env:KIDSAZ_PASSWORD="strawberry,banana"; $env:KIDSAZ_COOKIE_DIR="data/cookies/msummer15_Annie"
node scripts/quiz-scraper-v8.js 0 999 level-up 99

# Terminal 5: Jim (R → Z2)
$env:KIDSAZ_CLASS_NAME="msummer17"; $env:KIDSAZ_STUDENT_ID="276410409"; $env:KIDSAZ_SCREEN_NAME="Jim"; $env:KIDSAZ_PASSWORD="rabbit"; $env:KIDSAZ_COOKIE_DIR="data/cookies/msummer17_Jim"
node scripts/quiz-scraper-v8.js 0 999 level-up 99
```

**Important notes:**
- Each process must run in its **own terminal** (separate browser instance, not tabs)
- If you encounter rate limiting (403 errors), reduce the number of parallel processes
- `KIDSAZ_COOKIE_DIR` isolates cookies per account to avoid session conflicts
- See [docs/quiz-scrape-plan.md](docs/quiz-scrape-plan.md) for the full coverage plan

### Other Scripts

```bash
# OCR all downloaded books to Markdown text
node scripts/ocr-books.js                    # All books
node scripts/ocr-books.js --level R          # Only Level R
node scripts/ocr-books.js --limit 10         # Only first 10 books

# Format OCR output (fix line breaks, OCR errors, noise)
node scripts/format-book-texts.js            # All files
node scripts/format-book-texts.js --dry-run  # Preview changes

# Build SQLite database from existing data
node scripts/build-database.js

# Summarize quiz results
node scripts/summarize-results.js
```

### Level Loop Workflow

```
Level Loop #N
├── Phase 1: LISTEN — Complete all non-green Listen activities
│   └── Fast mode: click play, set playbackRate=16, skip to end, flip pages
├── Phase 2: READ — Complete all non-green Read activities
│   └── Fast mode: 1 second per page, auto-flip
├── Phase 3: QUIZ — Answer quizzes until all books are green
│   ├── For each book:
│   │   ├── 1st attempt: Read the book (OCR text extraction), then random answers
│   │   ├── 2nd+ attempt: Elimination-based selection
│   │   └── Repeat until 10/10 or max attempts (8)
│   └── When all quiz-green → proceed to Phase 4
└── Phase 4: Level-up Detection
    └── Check if new books appear → repeat from Phase 1
```

### Quiz Answering Logic

The core elimination algorithm converges to 10/10 by tracking known correct answers and wrong options across attempts:

| Attempt | Mechanism | Knowledge Gained |
|---------|-----------|-----------------|
| 1 | Random selection | Submit → get score + correctMap |
| 2 | Exclude 1 wrong option per question | correctMap identifies wrong answers |
| 3 | Exclude 2-3 wrong options per question | Elimination narrows to 1-2 candidates |
| 4 | Only 1 option remains per question | 100% correct (elimination certainty) |

**Design principles** (v8.3):
- **Deterministic**: Only trusts `correctMap` (CSS class-based correct/incorrect markers) and `newCorrect === 0` (confirmed all wrong)
- **No guessing**: When unsure which unknown answers are correct, excludes nothing — avoids polluting the exclusion list
- **Self-healing**: When a correct answer is discovered, its option is immediately removed from `_wrongOptions`

**Key data structures**:
- `knownCorrectAnswers`: `{ questionIndex: { letter, text, optionIndex } }`
- `_wrongOptions`: `{ questionIndex: [excludedOptionIndex, ...] }`
- `correctMap`: Per-question `isCorrect`/`isIncorrect` status from the page's CSS classes

### Output Files

| Path | Description |
|------|-------------|
| `data/quiz-results/{Book_Title}.json` | Per-book quiz attempt history (score, answers, correctMap) |
| `data/quiz-results-summary.json` | Compact summary of all results |
| `data/book-texts/{Book_Title}.txt` | OCR-extracted book text (first read only) |
| `data/book-texts/{Book_Title}.json` | Page-by-page book text with metadata |
| `data/reports/{Book_Title}.md` | Markdown report per book (quiz Q&A + book text) |
| `data/timing.log` | Timestamped operation log |
| `data/auto-run.log` | Auto-run session log |
| `data/deployment-ids.json` | Cached deployment IDs for faster navigation |
| `data/cookies/` | Browser session cookies |

### Summarize Results

```bash
node scripts/summarize-results.js
```

Generates a compact `data/quiz-results-summary.json` with per-book scores and attempt counts.

---

## CLI Reference (Book Downloader)

| Parameter | Description |
|-----------|-------------|
| `--headed` | Show browser window (recommended for debugging) |
| `--resume` | Skip already-downloaded books |
| `--extract-only` | Extract book list without downloading |
| `--student NAME` | Process only the specified student |
| `--max-books N` | Limit downloads per student |
| `--skip-audio` | Skip audio downloads |
| `--skip-images` | Skip image downloads |

## Password Icon Reference

| ID | Icon | ID | Icon | ID | Icon |
|----|------|----|------|----|------|
| 1 | rabbit | 7 | dog | 13 | strawberry |
| 2 | duck | 8 | truck | 14 | apple |
| 3 | fish | 9 | rocket | 15 | carrot |
| 4 | lizard | 10 | train | 16 | banana |
| 5 | turtle | 11 | plane | 17 | watermelon |
| 6 | cat | 12 | boat | 18 | spoon |

## Cloudflare Worker (Advanced)

```bash
cd worker
npm install
npm run dev
```

Open http://localhost:8787

Features:
- User authentication with card-key system
- Reading progress tracking
- Admin panel
- Multi-user support
- CDN proxy for resources

Setup:
```bash
npm run db:init    # Initialize database schema
npm run db:seed    # Seed initial data
```

## Project Structure

```
leveled-reader/
├── reader/                             # Simple HTTP reader server
│   ├── server.js                       # Express server (port 3000)
│   └── public/                         # Frontend pages
│
├── worker/                             # Cloudflare Worker (advanced)
│   ├── src/
│   │   ├── index.ts                    # Entry point
│   │   ├── routes/                     # API routes
│   │   │   ├── auth.ts                 # Authentication
│   │   │   ├── books.ts                # Book resources & CDN proxy
│   │   │   ├── progress.ts             # Reading progress
│   │   │   └── admin.ts                # Admin panel
│   │   ├── db/                         # Database
│   │   │   ├── schema.sql
│   │   │   └── seed.sql
│   │   └── utils/                      # JWT, password, cardkey
│   ├── wrangler.toml
│   └── package.json
│
├── src/
│   ├── scraper/
│   │   ├── download-all-books-v2.ts    # Main book downloader
│   │   ├── download-all-audio.ts       # Audio-only downloader
│   │   ├── auth.ts                     # Login module
│   │   ├── browser.ts                  # Browser setup
│   │   ├── book-api.ts                 # Book API client
│   │   ├── downloader.ts               # Download module
│   │   ├── batch-downloader.ts         # Batch download scheduler
│   │   ├── batch-audio-downloader.ts   # Batch audio downloader
│   │   ├── audio-downloader.ts         # Single book audio downloader
│   │   ├── storage.ts                  # Storage utilities
│   │   ├── parser.ts                   # HTML parser
│   │   ├── types.ts                    # Type definitions
│   │   └── index.ts                    # Scraper entry
│   │
│   ├── probe/
│   │   ├── combinations.ts             # Password combination generator
│   │   ├── prober.ts                   # Probing engine
│   │   └── types.ts                    # Type definitions
│   │
│   ├── probe-multi-class.ts            # Multi-class password probe
│   ├── retry-failed-3digit.ts          # 3-icon password retry
│   ├── fetch-all-class-students.ts     # Fetch student lists
│   ├── fetch-all-students.ts           # Fetch all students
│   ├── fetch-missing-data.ts           # Supplement missing data
│   ├── check-progress.ts               # Check probe progress
│   ├── generate-report.ts              # Generate CSV report
│   ├── clean-failed.ts                 # Clean failed records
│   └── types.ts                        # Shared types
│
├── scripts/
│   ├── quiz-scraper-v8.js              # ★ Quiz auto-answering (main)
│   ├── summarize-results.js            # Quiz results summary generator
│   ├── download-missing-by-level.js    # Level-based missing book downloader
│   ├── supplement-from-reader.js       # Supplement from reader data
│   ├── generate-book-list.js           # Generate book statistics
│   ├── stats-downloads.js              # Download statistics
│   ├── check-and-download-missing.js   # Check and download missing files
│   ├── download-low-audio.js           # Download books with low audio count
│   ├── batch-supplement.js             # Batch supplement resources
│   ├── fix-missing-books.js            # Fix missing slug/theme
│   ├── fix-missing-books-api.js        # Fix via API inference
│   ├── check-missing-files.js          # Check for missing files
│   ├── download-missing-files.js       # Download from URL list
│   ├── guess-slug-download.js          # Guess slug and download
│   ├── process-missing-books.js        # Process missing books via Playwright
│   ├── generate-books-sql.js           # Generate SQL for book import
│   └── sanitize-data.js                # Sanitize sensitive data
│
├── auto-run.ps1                        # ★ Automated quiz scraper runner
│
├── data/
│   ├── quiz-results/                   # ★ Per-book quiz attempt history
│   │   ├── {Book_Title}.json
│   │   └── _summary.json
│   ├── quiz-results-summary.json       # ★ Compact quiz summary
│   ├── book-texts/                     # ★ OCR-extracted book text
│   │   ├── {Book_Title}.txt
│   │   └── {Book_Title}.json
│   ├── reports/                        # ★ Per-book markdown reports
│   │   └── {Book_Title}.md
│   ├── deployment-ids.json             # ★ Cached deployment IDs
│   ├── timing.log                      # ★ Timestamped operation log
│   ├── auto-run.log                    # ★ Auto-run session log
│   ├── cookies/                        # Session cookies
│   ├── booklists/                      # Book list cache
│   └── probe/                          # Probe data
│       └── probe-results.public.json   # Anonymized sample
│
├── docs/
│   ├── program-flow.md                 # ★ Quiz scraper program flow diagram
│   ├── login-flow.md                   # kids-a-z login flow documentation
│   ├── resource-patterns.md            # Resource URL patterns
│   └── 获取quiz.md                     # Quiz acquisition notes
│
├── downloads/                          # Downloaded resources (gitignored)
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

## Download Output Format

```
downloads/
├── {Level}/                        # aa, A, B, ... Z2
│   └── {resourceId}-{title}/
│       ├── cover-{resourceId}.png  # Book cover
│       ├── meta.json               # Book metadata
│       ├── images/                 # Page images
│       │   ├── page-00.jpg         # Zero-padded page numbers
│       │   ├── page-01.jpg
│       │   └── ...
│       └── audio/                  # Narration audio
│           ├── raz_{slug}_{theme}_title_text.mp3
│           ├── raz_{slug}_{theme}_p1_text.mp3
│           └── ...
```

## Notes

- All credentials have been replaced with placeholders (`<YOUR_CLASS_NAME>`, `<YOUR_SCREEN_NAME>`, etc.) — set them via environment variables before running
- Password combinations are order-independent (1-2-3 equals 3-2-1)
- The API has rate limiting; the script handles this automatically with `safeGoto` (exponential backoff on 403/block pages)
- CDN downloads do not require authentication (direct HTTP GET)
- Browser is launched with audio muted (`--mute-audio`)
- Book lists are cached in `data/booklists/` after first extraction
- Audio page numbers may be non-contiguous; the script uses consecutive 404s to detect end-of-book
- Quiz scraper uses headless=false with off-screen window positioning (`--window-position=-2400,-2400`) to avoid Cloudflare detection
- Quiz answers are determined by elimination: each attempt excludes wrong options, converging to the correct answer in at most 4 attempts per question
- Sensitive data (cookies, quiz results, book texts, reports) is excluded from git via `.gitignore`
- `data/` subdirectories use `.gitkeep` files to preserve directory structure

## License

MIT