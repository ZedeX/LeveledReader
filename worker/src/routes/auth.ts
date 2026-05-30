import { Hono } from 'hono';
import { signJWT } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';
import { authMiddleware } from '../middleware/auth';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const auth = new Hono<{ Bindings: Env }>();

// POST /api/auth/login
auth.post('/login', async (c) => {
  const { username, password } = await c.req.json();

  if (!username || !password) {
    return c.json({ error: '请输入用户名和密码' }, 400);
  }

  const user = await c.env.DB.prepare(
    'SELECT id, username, password_hash, is_admin, is_active, expires_at FROM users WHERE username = ?'
  ).bind(username).first();

  if (!user) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash as string);
  if (!valid) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }

  if (!(user.is_active as number)) {
    return c.json({ error: '账号已停用' }, 403);
  }

  const now = new Date();
  const expiresAt = new Date(user.expires_at as string);
  if (expiresAt < now) {
    return c.json({ error: '账号已过期，请续期' }, 403);
  }

  const token = await signJWT(
    { user_id: user.id as number, username: user.username as string, is_admin: user.is_admin as number },
    c.env.JWT_SECRET
  );

  return c.json({
    token,
    user: {
      username: user.username,
      is_admin: user.is_admin,
      expires_at: user.expires_at,
    },
  });
});

// POST /api/auth/renew
auth.post('/renew', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const { code } = await c.req.json();

  if (!code) {
    return c.json({ error: '请输入卡密' }, 400);
  }

  const card = await c.env.DB.prepare(
    'SELECT id, code, duration_days, expires_at, used_by FROM card_keys WHERE code = ?'
  ).bind(code).first();

  if (!card) {
    return c.json({ error: '卡密无效' }, 400);
  }

  if (card.used_by !== null) {
    return c.json({ error: '卡密已被使用' }, 400);
  }

  const now = new Date();
  const cardExpires = new Date(card.expires_at as string);
  if (cardExpires < now) {
    return c.json({ error: '卡密已过期' }, 400);
  }

  // Use the card
  await c.env.DB.prepare(
    'UPDATE card_keys SET used_by = ?, used_at = datetime(\'now\') WHERE id = ?'
  ).bind(userId, card.id).run();

  // Extend user expiry
  const user = await c.env.DB.prepare(
    'SELECT expires_at FROM users WHERE id = ?'
  ).bind(userId).first();

  const currentExpiry = new Date(user!.expires_at as string);
  const baseDate = currentExpiry > now ? currentExpiry : now;
  const newExpiry = new Date(baseDate);
  newExpiry.setDate(newExpiry.getDate() + (card.duration_days as number));
  // Set to end of day
  newExpiry.setHours(23, 59, 59, 0);

  await c.env.DB.prepare(
    'UPDATE users SET expires_at = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).bind(newExpiry.toISOString(), userId).run();

  return c.json({
    message: '续期成功',
    new_expires_at: newExpiry.toISOString(),
  });
});

// GET /api/auth/status
auth.get('/status', authMiddleware, async (c) => {
  const userId = c.get('userId');

  const user = await c.env.DB.prepare(
    'SELECT username, is_admin, is_active, expires_at FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }

  const expiresAt = new Date(user.expires_at as string);
  const now = new Date();
  const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000));

  // Get reading stats
  const stats = await c.env.DB.prepare(`
    SELECT
      COALESCE(SUM(book_duration), 0) as total_duration,
      COUNT(CASE WHEN status != 'unread' THEN 1 END) as books_read,
      COUNT(CASE WHEN status = 'finished' THEN 1 END) as books_finished
    FROM reading_progress WHERE user_id = ?
  `).bind(userId).first();

  return c.json({
    username: user.username,
    is_admin: user.is_admin,
    is_active: user.is_active,
    expires_at: user.expires_at,
    days_remaining: daysRemaining,
    total_reading_time: stats?.total_duration ?? 0,
    books_read: stats?.books_read ?? 0,
    books_finished: stats?.books_finished ?? 0,
  });
});

export default auth;
