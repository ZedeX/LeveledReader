# LeveledReader

A self-hosted leveled reading book manager with a built-in web reader. Automates resource downloading from leveled reading platforms and provides an immersive local reading experience with audio playback.

> **Disclaimer**: This tool is for personal educational use only. Please respect the terms of service of the reading platforms you use. Do not redistribute downloaded content.

## Features

- **Bookshelf UI** — Browse books organized by reading level (aa through Z2)
- **Immersive Reader** — Full-screen reading with automatic audio playback
- **Keyboard Navigation** — Arrow keys to turn pages, Space to play/pause audio
- **Batch Download** — Automated resource downloading via Playwright browser automation
- **CDN Direct Download** — Download images and audio directly from CDN without authentication
- **Pattern-based Completion** — Automatically discovers and downloads all pages (p0-pN) until 404
- **Multi-user Worker** — Cloudflare Worker backend with auth, progress tracking, and admin panel

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

## CLI Reference

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
│   └── sanitize-data.ts               # Sanitize sensitive data
│
├── data/
│   ├── probe/                          # Probe data (gitignored)
│   │   └── probe-results.public.json   # Anonymized sample
│   ├── booklists/                      # Book list cache (gitignored)
│   └── cookies/                        # Session cookies (gitignored)
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
├── docs/
│   ├── PRD-v3.md
│   ├── kids-a-z-login-flow.md
│   └── resource-patterns.md
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

- Password combinations are order-independent (1-2-3 equals 3-2-1)
- The API has rate limiting; the script handles this automatically
- CDN downloads do not require authentication (direct HTTP GET)
- Browser is launched with audio muted (`--mute-audio`)
- Book lists are cached in `data/booklists/` after first extraction
- Audio page numbers may be non-contiguous; the script uses consecutive 404s to detect end-of-book

## License

MIT
