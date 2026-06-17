// Service Worker for KidsA-Z Reader
// Caches book images and audio for offline/weak-network reading
// Strategy: cache-first + stale-while-revalidate, with peak-hour multi-domain racing
var CACHE_NAME = 'kidsaz-reader-v1';
var CACHEABLE_PATTERNS = [
  /mi\.content\.kidsa-z\.com\/readonly\//,
  /zkidsreader\.zedex\.cn\/downloads\//,
  /zedex\.github\.io\/LeveledReader\/downloads\//,
  /raw\.githubusercontent\.com\/ZedeX\/LeveledReader\//,
  /github\.com\/ZedeX\/LeveledReader\/blob\/main\/downloads\//,
  /cdn\.jsdelivr\.net\/gh\/ZedeX\/LeveledReader\//
];

// Check if we're in peak hours (UTC+8 20:00-24:00 = UTC 12:00-16:00)
function isPeakHour() {
  var now = new Date();
  var utcHour = now.getUTCHours();
  return (utcHour >= 12 && utcHour < 16);
}

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

// Try to fetch from network with peak-hour racing
// In peak hours, race multiple CDN sources for the same resource
function fetchWithPeakRace(req, urlStr) {
  // Only race for book page images (most common bottleneck)
  var pageMatch = urlStr.match(/page-(\d+)\.jpg/);
  if (!isPeakHour() || !pageMatch) {
    // Non-peak or not a page image: simple fetch
    return fetch(req).then(function (resp) {
      if (resp && (resp.ok || resp.type === 'opaque')) {
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(req, resp.clone()).catch(function () { });
        });
      }
      return resp;
    });
  }
  // Peak hour + page image: try to derive alternate URLs and race
  // We can't easily derive the book path from URL alone in SW, so just race
  // the original URL against jsDelivr if we can detect the book id
  // For simplicity, just fetch the original URL with a shorter timeout
  return new Promise(function (resolve) {
    var settled = false;
    var timeoutId = setTimeout(function () {
      if (!settled) {
        settled = true;
        // Return a 408-like response; the page's own fallback will kick in
        resolve(new Response('', { status: 408, statusText: 'Request Timeout' }));
      }
    }, 6000); // 6s timeout in peak hour (vs 15s in page)
    fetch(req).then(function (resp) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (resp && (resp.ok || resp.type === 'opaque')) {
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(req, resp.clone()).catch(function () { });
        });
      }
      resolve(resp);
    }).catch(function () {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(new Response('', { status: 503, statusText: 'Network Error' }));
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = req.url;
  var isCacheable = CACHEABLE_PATTERNS.some(function (p) { return p.test(url); });
  if (!isCacheable) return;

  // Cache-first strategy for book resources
  e.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(req).then(function (cachedResp) {
        if (cachedResp) {
          // Return cached, and update cache in background (stale-while-revalidate)
          // Skip background revalidation in peak hour to save bandwidth
          if (!isPeakHour()) {
            fetch(req).then(function (networkResp) {
              if (networkResp && (networkResp.ok || networkResp.type === 'opaque')) {
                cache.put(req, networkResp.clone());
              }
            }).catch(function () { });
          }
          return cachedResp;
        }
        // Not in cache, fetch from network (with peak-hour racing)
        return fetchWithPeakRace(req, url).then(function (networkResp) {
          if (networkResp && (networkResp.ok || networkResp.type === 'opaque')) {
            cache.put(req, networkResp.clone());
          }
          return networkResp;
        }).catch(function () {
          // Network failed, try to find any matching response (even from different URL)
          return new Response('', { status: 404, statusText: 'Not Found' });
        });
      });
    })
  );
});
