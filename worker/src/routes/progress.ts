import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';

interface Env {
  DB: D1Database;
}

const progress = new Hono<{ Bindings: Env }>();

// POST /api/progress/report
progress.post('/report', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const { reports, session_duration_delta } = await c.req.json();

  if (!reports || !Array.isArray(reports)) {
    return c.json({ error: 'Invalid report data' }, 400);
  }

  const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Update each book's progress
  for (const r of reports) {
    if (!r.book_path) continue;

    await c.env.DB.prepare(`
      INSERT INTO reading_progress (user_id, book_path, current_page, total_pages, book_duration, status, last_read_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id, book_path) DO UPDATE SET
        current_page = excluded.current_page,
        total_pages = excluded.total_pages,
        book_duration = book_duration + excluded.book_duration,
        status = excluded.status,
        last_read_at = datetime('now'),
        updated_at = datetime('now')
    `).bind(userId, r.book_path, r.current_page || 0, r.total_pages || 0, r.duration_delta || 0, r.status || 'reading').run();
  }

  // Update session
  if (session_duration_delta && session_duration_delta > 0) {
    await c.env.DB.prepare(`
      INSERT INTO reading_sessions (user_id, session_date, total_duration, books_read, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, session_date) DO UPDATE SET
        total_duration = total_duration + excluded.total_duration,
        books_read = books_read + CASE WHEN ? > 0 THEN 0 ELSE 0 END,
        updated_at = datetime('now')
    `).bind(userId, now, session_duration_delta, reports.length).run();
  }

  return c.json({ ok: true });
});

// GET /api/progress/stats
progress.get('/stats', authMiddleware, async (c) => {
  const userId = c.get('userId');

  const stats = await c.env.DB.prepare(`
    SELECT
      COALESCE(SUM(book_duration), 0) as total_duration,
      COUNT(CASE WHEN status != 'unread' THEN 1 END) as books_read,
      COUNT(CASE WHEN status = 'finished' THEN 1 END) as books_finished
    FROM reading_progress WHERE user_id = ?
  `).bind(userId).first();

  const dailyStats = await c.env.DB.prepare(`
    SELECT session_date as date, total_duration as duration, books_read
    FROM reading_sessions
    WHERE user_id = ?
    ORDER BY session_date DESC
    LIMIT 7
  `).bind(userId).all();

  return c.json({
    total_duration: stats?.total_duration ?? 0,
    total_books_read: stats?.books_read ?? 0,
    total_books_finished: stats?.books_finished ?? 0,
    daily_stats: dailyStats.results,
  });
});

export default progress;
