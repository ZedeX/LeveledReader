import { Context, Next } from 'hono';
import { verifyJWT } from '../utils/jwt';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '未登录' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: '登录已过期，请重新登录' }, 401);
  }

  // Set user info in context
  c.set('userId', payload.user_id);
  c.set('username', payload.username);
  c.set('isAdmin', payload.is_admin);

  await next();
}

export async function adminMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const isAdmin = c.get('isAdmin');
  if (isAdmin !== 1) {
    return c.json({ error: '无管理员权限' }, 403);
  }
  await next();
}
