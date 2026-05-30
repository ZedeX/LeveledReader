import { Hono } from 'hono';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { hashPassword } from '../utils/password';
import { generateCardCode } from '../utils/cardkey';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const admin = new Hono<{ Bindings: Env }>();

// All admin routes require auth + admin
admin.use('*', authMiddleware, adminMiddleware);

// GET /api/admin/users
admin.get('/users', async (c) => {
  const users = await c.env.DB.prepare(`
    SELECT u.id, u.username, u.is_admin, u.is_active, u.expires_at, u.created_at,
           COALESCE(SUM(rp.book_duration), 0) as total_reading_time,
           COUNT(CASE WHEN rp.status != 'unread' THEN 1 END) as books_read,
           COUNT(CASE WHEN rp.status = 'finished' THEN 1 END) as books_finished
    FROM users u
    LEFT JOIN reading_progress rp ON rp.user_id = u.id
    GROUP BY u.id
    ORDER BY u.id
  `).all();

  return c.json(users.results);
});

// POST /api/admin/users
admin.post('/users', async (c) => {
  const { username, password, expires_at } = await c.req.json();

  if (!username || !password) {
    return c.json({ error: '请输入用户名和密码' }, 400);
  }

  // Check if username exists
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) {
    return c.json({ error: '用户名已存在' }, 400);
  }

  const passwordHash = await hashPassword(password);

  // Default expiry: 1 day from now, end of day
  let expiry = expires_at;
  if (!expiry) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 0);
    expiry = tomorrow.toISOString();
  }

  await c.env.DB.prepare(
    'INSERT INTO users (username, password_hash, is_admin, is_active, expires_at) VALUES (?, ?, 0, 1, ?)'
  ).bind(username, passwordHash, expiry).run();

  return c.json({ message: '用户创建成功' });
});

// PUT /api/admin/users/:id
admin.put('/users/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const updates: string[] = [];
  const params: any[] = [];

  if (body.password) {
    const hash = await hashPassword(body.password);
    updates.push('password_hash = ?');
    params.push(hash);
  }

  if (body.is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(body.is_active ? 1 : 0);
  }

  if (body.expires_at) {
    updates.push('expires_at = ?');
    params.push(body.expires_at);
  }

  if (updates.length === 0) {
    return c.json({ error: '没有需要更新的字段' }, 400);
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  await c.env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  return c.json({ message: '更新成功' });
});

// DELETE /api/admin/users/:id
admin.delete('/users/:id', async (c) => {
  const id = c.req.param('id');

  // Don't allow deleting admin user (id=1)
  if (id === '1') {
    return c.json({ error: '不能删除管理员账号' }, 400);
  }

  await c.env.DB.prepare('DELETE FROM reading_progress WHERE user_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM reading_sessions WHERE user_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();

  return c.json({ message: '删除成功' });
});

// GET /api/admin/users/:id/progress
admin.get('/users/:id/progress', async (c) => {
  const id = c.req.param('id');

  const progress = await c.env.DB.prepare(
    'SELECT * FROM reading_progress WHERE user_id = ? ORDER BY updated_at DESC'
  ).bind(id).all();

  const sessions = await c.env.DB.prepare(
    'SELECT * FROM reading_sessions WHERE user_id = ? ORDER BY session_date DESC LIMIT 30'
  ).bind(id).all();

  return c.json({ progress: progress.results, sessions: sessions.results });
});

// GET /api/admin/users/:id/cards
admin.get('/users/:id/cards', async (c) => {
  const id = c.req.param('id');

  const cards = await c.env.DB.prepare(
    'SELECT id, code, duration_days, used_at FROM card_keys WHERE used_by = ? ORDER BY used_at DESC'
  ).bind(id).all();

  return c.json(cards.results);
});

// GET /api/admin/cards
admin.get('/cards', async (c) => {
  const cards = await c.env.DB.prepare(`
    SELECT ck.*, u.username as used_by_username
    FROM card_keys ck
    LEFT JOIN users u ON u.id = ck.used_by
    ORDER BY ck.created_at DESC
  `).all();

  return c.json(cards.results.map((c: any) => ({
    ...c,
    is_valid: !c.used_by && new Date(c.expires_at) > new Date(),
  })));
});

// GET /api/admin/cards/usage
admin.get('/cards/usage', async (c) => {
  const usage = await c.env.DB.prepare(`
    SELECT ck.id, ck.code, ck.duration_days, ck.used_by, u.username as used_by_username, ck.used_at
    FROM card_keys ck
    LEFT JOIN users u ON u.id = ck.used_by
    WHERE ck.used_by IS NOT NULL
    ORDER BY ck.used_at DESC
  `).all();

  return c.json(usage.results);
});

// POST /api/admin/cards
admin.post('/cards', async (c) => {
  const { duration_days, card_expires_days, count } = await c.req.json();

  if (!duration_days || !card_expires_days) {
    return c.json({ error: '请指定续期天数和卡密有效期' }, 400);
  }

  const numCards = Math.min(count || 1, 100);

  // Calculate card expiry
  const cardExpiresAt = new Date();
  cardExpiresAt.setDate(cardExpiresAt.getDate() + card_expires_days);
  cardExpiresAt.setHours(23, 59, 59, 0);

  const cards = [];
  for (let i = 0; i < numCards; i++) {
    const code = generateCardCode();
    await c.env.DB.prepare(
      'INSERT INTO card_keys (code, duration_days, expires_at) VALUES (?, ?, ?)'
    ).bind(code, duration_days, cardExpiresAt.toISOString()).run();

    cards.push({
      code,
      duration_days,
      expires_at: cardExpiresAt.toISOString(),
    });
  }

  return c.json({ cards });
});

// DELETE /api/admin/cards/:id
admin.delete('/cards/:id', async (c) => {
  const id = c.req.param('id');

  const card = await c.env.DB.prepare('SELECT used_by FROM card_keys WHERE id = ?').bind(id).first();
  if (!card) {
    return c.json({ error: '卡密不存在' }, 404);
  }

  if (card.used_by !== null) {
    return c.json({ error: '已使用的卡密不能删除' }, 400);
  }

  await c.env.DB.prepare('DELETE FROM card_keys WHERE id = ?').bind(id).run();

  return c.json({ message: '删除成功' });
});

export default admin;
