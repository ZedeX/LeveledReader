CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reading_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  book_path TEXT NOT NULL,
  current_page INTEGER DEFAULT 0,
  total_pages INTEGER DEFAULT 0,
  book_duration INTEGER DEFAULT 0,
  status TEXT DEFAULT 'unread',
  last_read_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, book_path)
);

CREATE TABLE IF NOT EXISTS reading_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_date TEXT NOT NULL,
  total_duration INTEGER DEFAULT 0,
  books_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, session_date)
);

CREATE TABLE IF NOT EXISTS card_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  duration_days INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  used_by INTEGER,
  used_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  level TEXT NOT NULL,
  slug TEXT,
  theme TEXT,
  content_id INTEGER,
  cover_bucket TEXT,
  image_count INTEGER DEFAULT 0,
  audio_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reading_progress_user ON reading_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_sessions_user_date ON reading_sessions(user_id, session_date);
CREATE INDEX IF NOT EXISTS idx_card_keys_code ON card_keys(code);
CREATE INDEX IF NOT EXISTS idx_card_keys_used_by ON card_keys(used_by);
CREATE INDEX IF NOT EXISTS idx_books_level ON books(level);
