import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';

interface Env {
  DB: D1Database;
  RAZ_CDN_BASE: string;
  R2_PUBLIC_URL: string;
}

const books = new Hono<{ Bindings: Env }>();

// GET /api/books
books.get('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const level = c.req.query('level');

  let query = `
    SELECT b.resource_id, b.title, b.level, b.slug, b.theme, b.content_id,
           b.cover_bucket, b.image_count, b.audio_count,
           rp.current_page, rp.status as reading_status, rp.book_duration
    FROM books b
    LEFT JOIN reading_progress rp ON rp.user_id = ? AND rp.book_path = b.level || '/' || (b.resource_id || '-' || REPLACE(LOWER(b.title), ' ', '_'))
    WHERE 1=1
  `;
  const params: any[] = [userId];

  if (level) {
    query += ' AND b.level = ?';
    params.push(level);
  }

  query += ' ORDER BY CASE b.level WHEN "aa" THEN 0 ELSE 1 END, b.level, b.title';

  const result = await c.env.DB.prepare(query).bind(...params).all();

  const bookList = result.results.map((b: any) => {
    const bookPath = `${b.level}/${b.resource_id}-${slugify(b.title)}`;
    const coverUrl = b.cover_bucket
      ? `${c.env.RAZ_CDN_BASE}/resource-cards/books/${b.cover_bucket}/${b.resource_id}.png`
      : `${c.env.RAZ_CDN_BASE}/readonly/${b.content_id}/projectable/large/1/book/page-0.jpg`;

    return {
      resourceId: b.resource_id,
      title: b.title,
      level: b.level,
      imageCount: b.image_count,
      audioCount: b.audio_count,
      cover: coverUrl,
      path: bookPath,
      reading_status: b.reading_status || 'unread',
      current_page: b.current_page || 0,
      book_duration: b.book_duration || 0,
    };
  });

  return c.json(bookList);
});

// GET /api/book/:level/:bookDir
books.get('/:level/:bookDir{.+}', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const level = c.req.param('level');
  const bookDir = c.req.param('bookDir');

  // Parse resource_id from bookDir (format: "167-Pets")
  const resourceId = parseInt(bookDir.split('-')[0], 10);
  if (isNaN(resourceId)) {
    return c.json({ error: 'Invalid book path' }, 400);
  }

  const book = await c.env.DB.prepare(
    'SELECT * FROM books WHERE resource_id = ? AND level = ?'
  ).bind(resourceId, level).first();

  if (!book) {
    return c.json({ error: 'Book not found' }, 404);
  }

  const bookPath = `${level}/${bookDir}`;
  const cdnBase = c.env.RAZ_CDN_BASE;
  const contentId = book.content_id as number;
  const slug = book.slug as string;
  const theme = book.theme as string;

  // Build image URLs
  const images: string[] = [];
  for (let i = 0; i < (book.image_count as number); i++) {
    images.push(`${cdnBase}/readonly/${contentId}/projectable/large/1/book/page-${i}.jpg`);
  }

  // Build audio map
  const audioMap: Record<number, string> = {};
  if (slug && theme) {
    audioMap[0] = `${cdnBase}/audio/${contentId}/raz_${slug}_${theme}_title_text.mp3`;
    for (let p = 1; p <= (book.audio_count as number); p++) {
      audioMap[p] = `${cdnBase}/audio/${contentId}/raz_${slug}_${theme}_p${p}_text.mp3`;
    }
  }

  // Build cover URL
  const coverUrl = book.cover_bucket
    ? `${cdnBase}/resource-cards/books/${book.cover_bucket}/${resourceId}.png`
    : images[0] || '';

  // Get reading progress
  const progress = await c.env.DB.prepare(
    'SELECT current_page, status, book_duration FROM reading_progress WHERE user_id = ? AND book_path = ?'
  ).bind(userId, bookPath).first();

  return c.json({
    meta: {
      title: book.title,
      level: book.level,
      contentId,
      slug,
      theme,
      resourceId,
    },
    images,
    audioMap,
    cover: coverUrl,
    imageCount: book.image_count,
    audioCount: book.audio_count,
    reading_status: (progress?.status as string) || 'unread',
    current_page: (progress?.current_page as number) || 0,
    book_duration: (progress?.book_duration as number) || 0,
    // CDN fallback info
    cdnBase,
    r2PublicUrl: c.env.R2_PUBLIC_URL,
  });
});

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export default books;
