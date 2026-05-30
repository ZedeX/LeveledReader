import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';
import auth from './routes/auth';
import books from './routes/books';
import progress from './routes/progress';
import admin from './routes/admin';
import proxy from './routes/proxy';
import { hashPassword } from './utils/password';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  RAZ_CDN_BASE: string;
  R2_PUBLIC_URL: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use('/api/*', cors());

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// Initialize admin account on first request if not exists
app.use('/api/*', async (c, next) => {
  // Check if admin exists, if not create it
  const admin = await c.env.DB.prepare("SELECT id FROM users WHERE username = 'zx'").first();
  if (!admin) {
    const hash = await hashPassword('`12');
    await c.env.DB.prepare(
      "INSERT INTO users (username, password_hash, is_admin, is_active, expires_at) VALUES ('zx', ?, 1, 1, '2099-12-31T23:59:59')"
    ).bind(hash).run();
  }
  await next();
});

// API routes - must be before static serving
app.route('/api/auth', auth);
app.route('/api/books', books);
app.route('/api/book', books);
app.route('/api/progress', progress);
app.route('/api/admin', admin);
app.route('/api/proxy', proxy);

// Global error handler for API routes
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Internal server error', detail: err.message }, 500);
  }
  return c.text('Internal Server Error', 500);
});

// Serve static files (SPA)
app.get('*', serveStatic({ root: './' }));

// SPA fallback
app.get('*', serveStatic({ path: './index.html' }));

export default app;
