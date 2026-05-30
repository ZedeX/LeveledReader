import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';

interface Env {
  RAZ_CDN_BASE: string;
}

const proxy = new Hono<{ Bindings: Env }>();

// GET /api/proxy/cdn/* - Proxy CDN requests with Referer header
proxy.get('/cdn/*', authMiddleware, async (c) => {
  const cdnPath = c.req.path.replace('/api/proxy/cdn/', '');
  const cdnUrl = `${c.env.RAZ_CDN_BASE}/${cdnPath}`;

  try {
    const response = await fetch(cdnUrl, {
      headers: {
        'Referer': 'https://www.kidsa.com/',
        'Origin': 'https://www.kidsa.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return c.json({ error: 'CDN request failed', status: response.status }, response.status);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const body = await response.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=2592000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return c.json({ error: 'CDN proxy error' }, 502);
  }
});

export default proxy;
