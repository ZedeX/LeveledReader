# Resource URL Patterns

## CDN Image URLs

```
https://{cdn-host}/readonly/{contentId}/projectable/large/1/book/page-{0..N}.jpg
```

- `contentId`: Numeric ID for the book resource
- Page numbering starts from 0
- Download until consecutive 404s (3 for images)

## CDN Audio URLs

```
https://{cdn-host}/audio/{contentId}/raz_{slug}_{theme}_{pageKey}_text.mp3
```

- `contentId`: Same numeric ID as images
- `slug`: URL-friendly book identifier (lowercase, no spaces)
- `theme`: Level-based theme code (e.g., `lp17`, `lq40`)
- `pageKey`: `title` for title audio, `p1`, `p2`, ... for page audio
- Download until consecutive 404s (5 for audio)

## Cover Image URLs

```
https://{cdn-host}/resource-cards/books/{bucket}/{resourceId}.png
```

- `bucket`: Size bucket (e.g., `190`)
- `resourceId`: Book resource ID

## File Naming Convention

- Images: `page-00.jpg`, `page-01.jpg`, ... (zero-padded to 2 digits)
- Audio: `raz_{slug}_{theme}_title_text.mp3`, `raz_{slug}_{theme}_p1_text.mp3`, ...

## Pattern Extraction

When intercepting network requests during Playwright automation:

1. Extract `contentId` from image URLs: match `/readonly/(\d+)/`
2. Extract `slug` and `theme` from audio URLs: match `/audio/(\d+)/raz_(.+?)_(.+?)_(?:title|p\d+)_text\.mp3/`
3. Use extracted pattern to download complete series (p0-pN for images, title+p1-pN for audio)
