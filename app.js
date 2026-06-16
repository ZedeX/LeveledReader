      ;
    // ===== Fallback URL mechanism =====
var FALLBACK_MODE = 0;
(function() {
  var params = new URLSearchParams(location.search);
  var fb = params.get('fallback');
  if (fb !== null) {
    var n = parseInt(fb, 10);
    if (n >= 0 && n <= 4 && !isNaN(n)) FALLBACK_MODE = n;
  }
})();

var FALLBACK_BASES = [
  null, // mode 0: KidsA-Z CDN (use original URLs from DATA)
  'http://zkidsreader.zedex.cn/downloads',
  'https://zedex.github.io/LeveledReader/downloads',
  'https://raw.githubusercontent.com/ZedeX/LeveledReader/refs/heads/main/downloads',
  'https://github.com/ZedeX/LeveledReader/blob/main/downloads'
];

var JPG_COVER_IDS = [713]; // Book IDs whose cover is .jpg not .png

function sanitizeBookTitle(title) {
  return title.replace(/[\/\\*<>|]/g, '').replace(/[?:]/g, '_').replace(/"/g, "'").replace(/\.+$/, '').trim();
}

function getGhBookPath(book) {
  var title = sanitizeBookTitle(book.title);
  return encodeURIComponent(book.level) + '/' + encodeURIComponent(book.id + '-' + title);
}

// Build cover URL based on fallback mode
function buildCoverUrl(book) {
  if (FALLBACK_MODE === 0) return book.coverUrl; // original CDN URL
  var base = FALLBACK_BASES[FALLBACK_MODE];
  var bookPath = getGhBookPath(book);
  var ext = JPG_COVER_IDS.indexOf(book.id) >= 0 ? '.jpg' : '.png';
  var resource = 'cover-' + book.id + ext;
  if (FALLBACK_MODE === 4) {
    return base + '/' + decodeURIComponent(bookPath) + '/' + resource + '?raw=true';
  }
  return base + '/' + bookPath + '/' + resource;
}

// Build page image URL based on fallback mode
function buildPageImageUrl(book, pageIdx) {
  if (FALLBACK_MODE === 0) {
    return 'https://mi.content.kidsa-z.com/readonly/' + book.id + '/projectable/large/1/book/page-' + pageIdx + '.jpg';
  }
  var base = FALLBACK_BASES[FALLBACK_MODE];
  var bookPath = getGhBookPath(book);
  var pn = pageIdx < 10 ? '0' + pageIdx : String(pageIdx);
  var resource = 'images/page-' + pn + '.jpg';
  if (FALLBACK_MODE === 4) {
    return base + '/' + decodeURIComponent(bookPath) + '/' + resource + '?raw=true';
  }
  return base + '/' + bookPath + '/' + resource;
}

// Build audio URL based on fallback mode
function buildAudioUrl(book, originalAudioUrl) {
  if (!originalAudioUrl) return '';
  if (FALLBACK_MODE === 0) return originalAudioUrl;
  var base = FALLBACK_BASES[FALLBACK_MODE];
  var bookPath = getGhBookPath(book);
  var filename = originalAudioUrl.split('/').pop();
  var resource = 'audio/' + filename;
  if (FALLBACK_MODE === 4) {
    return base + '/' + decodeURIComponent(bookPath) + '/' + resource + '?raw=true';
  }
  return base + '/' + bookPath + '/' + resource;
}

// Get all fallback URLs for a given primary URL (for error fallback)
var _fallbackTracker = new WeakMap();

function getFallbackChain(book, primaryUrl, urlType, extraData) {
  // urlType: 'cover', 'page', 'audio'
  // extraData: pageIdx for 'page', originalAudioUrl for 'audio'
  var urls = [primaryUrl];
  for (var mode = 1; mode <= 4; mode++) {
    var url;
    if (urlType === 'cover') {
      var base = FALLBACK_BASES[mode];
      var bookPath = getGhBookPath(book);
      var ext = JPG_COVER_IDS.indexOf(book.id) >= 0 ? '.jpg' : '.png';
      var resource = 'cover-' + book.id + ext;
      if (mode === 4) {
        url = base + '/' + decodeURIComponent(bookPath) + '/' + resource + '?raw=true';
      } else {
        url = base + '/' + bookPath + '/' + resource;
      }
    } else if (urlType === 'page') {
      var base = FALLBACK_BASES[mode];
      var bookPath = getGhBookPath(book);
      var pn = extraData < 10 ? '0' + extraData : String(extraData);
      var resource = 'images/page-' + pn + '.jpg';
      if (mode === 4) {
        url = base + '/' + decodeURIComponent(bookPath) + '/' + resource + '?raw=true';
      } else {
        url = base + '/' + bookPath + '/' + resource;
      }
    } else if (urlType === 'audio') {
      var base = FALLBACK_BASES[mode];
      var bookPath = getGhBookPath(book);
      var filename = extraData.split('/').pop();
      var resource = 'audio/' + filename;
      if (mode === 4) {
        url = base + '/' + decodeURIComponent(bookPath) + '/' + resource + '?raw=true';
      } else {
        url = base + '/' + bookPath + '/' + resource;
      }
    }
    // Skip if same as primary (avoid duplicate)
    if (url !== primaryUrl) urls.push(url);
  }
  return urls;
}

function tryNextFallback(el, book, primaryUrl, urlType, extraData) {
  var data = _fallbackTracker.get(el);
  if (!data) {
    data = { primaryUrl: primaryUrl, attempt: 0 };
    _fallbackTracker.set(el, data);
  }
  data.attempt++;
  var chain = getFallbackChain(book, primaryUrl, urlType, extraData);
  if (data.attempt < chain.length) {
    return chain[data.attempt];
  }
  return null;
}

// Global image error handler for fallback
document.addEventListener('error', function(e) {
  var el = e.target;
  if (el.tagName !== 'IMG') return;
  var src = el.src;
  if (!src || src === location.href || src.indexOf('about:') === 0) return;
  if (!currentBook) return;
  // Determine URL type from the failed URL pattern
  var urlType, extraData;
  if (src.indexOf('/cover-') !== -1) {
    urlType = 'cover';
    extraData = null;
  } else if (src.indexOf('/page-') !== -1) {
    urlType = 'page';
    extraData = parseInt((src.match(/page-(\d+)/) || [])[1]);
  } else {
    return; // Not a book resource URL
  }
  var nextUrl = tryNextFallback(el, currentBook, src, urlType, extraData);
  if (nextUrl) el.src = nextUrl;
}, true);

    var allBooks = [];
    var filteredBooks = [];
    var currentLevel = '';
    var sortOrder = 'asc';
    var currentBook = null;
    var currentPage = 0;
    var isNavigating = false;
    var lastNavTime = 0;
    var NAV_THROTTLE = 80;
    var totalPages = 0;
    var autoPlay = false;
    var autoPageTimer = null;
    var audioEl = null;
    var audioLoadId = 0;
    var preloadedPages = new Set();
    var preloadedImages = {};
    var preloadedAudios = {};
    var preloadTimer = null;
    var celebrated = false;
    var searchDebounce = null;
    var CACHE_NAME = 'kidsaz-reader-v1';
    var cacheReady = false;

    // ========== Preview Mode ==========
    var DEMO_BOOKS = [
      { id: 167, level: 'aa', title: 'Pets', maxPage: null },
      { id: 6, level: 'A', title: 'I Can', maxPage: null },
      { id: 16, level: 'B', title: 'Go Animals Go', maxPage: null },
      { id: 44, level: 'C', title: 'How Many Wheels?', maxPage: null },
      { id: 48, level: 'D', title: 'The Sky Is Falling', maxPage: null },
      { id: 66, level: 'E', title: 'Time For Bed', maxPage: 10 },
      { id: 1620, level: 'F', title: 'Night Animals', maxPage: 10 },
      { id: 82, level: 'G', title: 'A Seed Grows', maxPage: 10 },
      { id: 1365, level: 'H', title: 'Our Five Senses', maxPage: 5 },
      { id: 275, level: 'K', title: 'Flying Kites', maxPage: 5 },
      { id: 1342, level: 'N', title: 'Elephants', maxPage: 5 },
      { id: 1064, level: 'Q', title: "Vincent's Bedroom", maxPage: 5 },
      { id: 1267, level: 'T', title: 'Albert Einstein', maxPage: 5 },
      { id: 1941, level: 'X', title: 'Malala the Brave', maxPage: 5 },
      { id: 2318, level: 'Z2', title: 'Empire State Building', maxPage: 5 }
    ];

    // ========== Sound Effects (Web Audio API) ==========
    var _audioCtx = null;
    function getAudioCtx() {
      if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      return _audioCtx;
    }

    function playCelebSound() {
      try {
        var ctx = getAudioCtx();
        var now = ctx.currentTime;
        // Duolingo-style cheerful ding-dong
        var notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach(function (freq, i) {
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.15, now + i * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.1);
          osc.stop(now + i * 0.1 + 0.4);
        });
      } catch (e) {}
    }

    function playAchSound() {
      try {
        var ctx = getAudioCtx();
        var now = ctx.currentTime;
        // Epic-style achievement: deep resonant hit + shimmer
        // Low hit
        var osc1 = ctx.createOscillator();
        var gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.value = 110;
        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.8);
        // Mid shimmer
        var osc2 = ctx.createOscillator();
        var gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.value = 440;
        gain2.gain.setValueAtTime(0.12, now + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.05);
        osc2.stop(now + 0.6);
        // High sparkle
        var osc3 = ctx.createOscillator();
        var gain3 = ctx.createGain();
        osc3.type = 'sine';
        osc3.frequency.value = 880;
        gain3.gain.setValueAtTime(0.08, now + 0.1);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.start(now + 0.1);
        osc3.stop(now + 0.5);
        // Rising chime
        var osc4 = ctx.createOscillator();
        var gain4 = ctx.createGain();
        osc4.type = 'sine';
        osc4.frequency.setValueAtTime(660, now + 0.15);
        osc4.frequency.linearRampToValueAtTime(1320, now + 0.4);
        gain4.gain.setValueAtTime(0.1, now + 0.15);
        gain4.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc4.connect(gain4);
        gain4.connect(ctx.destination);
        osc4.start(now + 0.15);
        osc4.stop(now + 0.6);
      } catch (e) {}
    }

    var previewMode = false;
    var previewMaxPage = -1;
    var carouselIndex = 0;
    var carouselItems = [];

    function renderPreviewCards() {
      var track = document.getElementById('carouselTrack');
      var dots = document.getElementById('carouselDots');
      if (!track || !allBooks.length) return;
      var html = '';
      var dotsHtml = '';
      DEMO_BOOKS.forEach(function (demo, i) {
        var book = allBooks.find(function (b) { return b.id === demo.id; });
        if (!book) return;
        var badge = demo.maxPage ? '试读' + demo.maxPage + '页' : '整本试读';
        var coverUrl = buildCoverUrl(book) || '';
        html += '<div class="carousel-item" data-idx="' + i + '" data-bookid="' + book.id + '" onclick="openPreviewBook(' + book.id + ')">' +
          '<img src="' + coverUrl + '" loading="lazy" alt="" onerror="this.style.display=\'none\'">' +
          '<div class="preview-badge">' + badge + '</div>' +
          '<div class="preview-info">' +
          '<div class="preview-title">' + escapeHtml(book.title) + '</div>' +
          '<div class="preview-level">Level ' + book.level + '</div>' +
          '</div></div>';
        dotsHtml += '<div class="carousel-dot' + (i === 0 ? ' active' : '') + '" onclick="carouselGoTo(' + i + ')"></div>';
      });
      track.innerHTML = html;
      dots.innerHTML = dotsHtml;
      carouselItems = track.querySelectorAll('.carousel-item');
      carouselIndex = 0;
      updateCarouselPositions();
      // Intercept wheel events on carousel to scroll horizontally
      var wrap = document.getElementById('carouselWrap');
      if (wrap) {
        wrap.addEventListener('wheel', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var delta = e.deltaY || e.deltaX;
          if (delta > 20) carouselGoTo(carouselIndex + 1);
          else if (delta < -20) carouselGoTo(carouselIndex - 1);
        }, { passive: false });
        // Touch swipe support
        var touchStartX = 0;
        wrap.addEventListener('touchstart', function (e) {
          touchStartX = e.touches[0].clientX;
        }, { passive: true });
        wrap.addEventListener('touchend', function (e) {
          var dx = e.changedTouches[0].clientX - touchStartX;
          if (dx < -30) carouselGoTo(carouselIndex + 1);
          else if (dx > 30) carouselGoTo(carouselIndex - 1);
        }, { passive: true });
      }
    }

    function carouselGoTo(idx) {
      if (idx < 0) idx = 0;
      if (idx >= DEMO_BOOKS.length) idx = DEMO_BOOKS.length - 1;
      carouselIndex = idx;
      updateCarouselPositions();
      // Update dots
      var dots = document.querySelectorAll('.carousel-dot');
      for (var d = 0; d < dots.length; d++) {
        dots[d].classList.toggle('active', d === idx);
      }
    }

    function updateCarouselPositions() {
      var total = DEMO_BOOKS.length;
      for (var i = 0; i < carouselItems.length; i++) {
        var item = carouselItems[i];
        var offset = i - carouselIndex;
        var absOffset = Math.abs(offset);
        // Center item: full size, no rotation
        // Side items: smaller, rotated, faded
        var tx = offset * 210;
        var tz = -absOffset * 100;
        var ry = offset * -15;
        var scale = absOffset === 0 ? 1 : Math.max(0.6, 1 - absOffset * 0.15);
        var opacity = absOffset === 0 ? 1 : Math.max(0, 1 - absOffset * 0.35);
        var zIdx = total - absOffset;
        item.style.transform = 'translateX(' + tx + 'px) translateZ(' + tz + 'px) rotateY(' + ry + 'deg) scale(' + scale + ')';
        item.style.opacity = opacity;
        item.style.zIndex = zIdx;
        item.style.left = '-120px'; // half of 240px width
        item.style.top = '-160px'; // half of 320px height
        item.style.pointerEvents = absOffset <= 2 ? 'auto' : 'none';
      }
    }

    function openPreviewBook(bookId) {
      var demo = DEMO_BOOKS.find(function (d) { return d.id === bookId; });
      if (!demo) return;
      previewMode = true;
      previewMaxPage = demo.maxPage || -1;
      // Hide key overlay so reader (z-index 1000) is visible
      document.getElementById('keyOverlay').classList.remove('open');
      openBook(bookId, 0);
    }

    function closeReaderAndShowKey() {
      closeReader();
      previewMode = false;
      previewMaxPage = -1;
      // Show key overlay again
      showKeyOverlay();
    }

    function showLimitOverlay() {
      document.getElementById('limitOverlay').classList.add('open');
      stopAudio();
      clearTimeout(autoPageTimer);
      // Fill device code and QR in limit card
      var dc = generateDeviceCode();
      document.getElementById('limitDeviceCode').textContent = dc;
      var qrImg = document.getElementById('limitQrImg');
      if (qrImg && !qrImg.src) qrImg.src = QR_CODE_B64;
      document.getElementById('limitKeyInput').value = '';
      document.getElementById('limitKeyError').textContent = '';
      setTimeout(function () { document.getElementById('limitKeyInput').focus(); }, 300);
    }

    function hideLimitOverlay() {
      document.getElementById('limitOverlay').classList.remove('open');
      // Go back to preview shelf (keyPage1)
      previewMode = false;
      previewMaxPage = -1;
      // Close reader directly (without calling hideLimitOverlay again)
      document.getElementById('reader').classList.remove('active');
      document.body.style.overflow = '';
      stopAudio();
      clearTimeout(autoPageTimer);
      clearTimeout(preloadTimer);
      document.getElementById('readerScroll').innerHTML = '';
      if (bookPreloader) { bookPreloader.stop(); bookPreloader = null; }
      if (bgPreloader) bgPreloader.resume();
      currentBook = null;
      location.hash = '';
      // Reset next button text
      var nextBtns = document.querySelectorAll('.ctrl-btn');
      for (var bi = 0; bi < nextBtns.length; bi++) {
        if (nextBtns[bi].textContent.indexOf('解锁') >= 0) {
          nextBtns[bi].textContent = '下一页 ▶';
          nextBtns[bi].style.background = '';
        }
      }
      // Show key overlay and scroll to preview page
      showKeyOverlay();
      scrollToPreviewPage();
    }

    function scrollToPreviewPage() {
      var overlay = document.getElementById('keyOverlay');
      var page1 = document.getElementById('keyPage1');
      if (overlay && page1) {
        setTimeout(function () {
          overlay.scrollTop = page1.offsetTop;
        }, 100);
      }
    }

    function submitLimitKey() {
      var key = document.getElementById('limitKeyInput').value.trim().toUpperCase();
      if (key.length !== 8) {
        document.getElementById('limitKeyError').textContent = '密钥必须为8位';
        return;
      }
      var dc = validateKeyWithTimeWindow(key);
      if (!dc) {
        document.getElementById('limitKeyError').textContent = '密钥无效或已过期';
        return;
      }
      // Key valid - save and proceed
      var data = { key: key, deviceCode: dc, verified: true, fingerprint: getDeviceFingerprint() };
      localStorage.setItem(AK_KEY, JSON.stringify(data));
      // Close limit overlay and reader directly (don't use hideLimitOverlay which goes back to trial page)
      document.getElementById('limitOverlay').classList.remove('open');
      previewMode = false;
      previewMaxPage = -1;
      // Close reader
      document.getElementById('reader').classList.remove('active');
      document.body.style.overflow = '';
      stopAudio();
      clearTimeout(autoPageTimer);
      clearTimeout(preloadTimer);
      document.getElementById('readerScroll').innerHTML = '';
      if (bookPreloader) { bookPreloader.stop(); bookPreloader = null; }
      if (bgPreloader) bgPreloader.resume();
      currentBook = null;
      location.hash = '';
      // Reset next button text
      var nextBtns = document.querySelectorAll('.ctrl-btn');
      for (var bi = 0; bi < nextBtns.length; bi++) {
        if (nextBtns[bi].textContent.indexOf('解锁') >= 0) {
          nextBtns[bi].textContent = '下一页 ▶';
          nextBtns[bi].style.background = '';
        }
      }
      // Hide key overlay (user is now verified)
      document.getElementById('keyOverlay').classList.remove('active');
      // Check if name is set
      var name = localStorage.getItem(UN_KEY);
      if (!name) {
        showNameOverlay();
        return;
      }
      updateTitle();
      var mc = document.getElementById('mainContainer');
      if (mc) mc.style.display = '';
      // Hide preview page
      var p1 = document.getElementById('keyPage1');
      var sh = document.getElementById('scrollHint');
      if (p1) p1.style.display = 'none';
      if (sh) sh.style.display = 'none';
      // Re-render books and stats
      var completed = getCompletedCount();
      document.getElementById('stats').textContent = allBooks.length + ' 本书 · ' + DATA.levels.length + ' 个级别 · 已读' + completed + '本';
      renderBooks();
      renderLevelTabs();
    }

    // ========== Background Preloader ==========
    var bgPreloader = null; // global instance

    function BackgroundPreloader(books) {
      var self = this;
      self.books = books;
      self.MAX_CONCURRENT = 3;
      self.activeCount = 0;
      self.paused = false;
      self.stopped = false;
      // Phase: 'covers' -> 'pages'
      self.phase = 'covers';
      self.coverIdx = 0;
      self.pageIdx = 0;
      self.bookIdxForPage = 0;
      self.pageSubPhase = 0; // 0=image, 1=audio
      self.coversDone = false;
      self.allDone = false;
      // Priority queue: URLs that user needs now
      self.priorityQueue = [];
      self.priorityActive = 0;
      // Track what's been fetched (avoid re-fetching)
      self.fetchedUrls = new Set();
      self.cachedUrlsLoaded = false;
    }

    BackgroundPreloader.prototype.loadCachedUrls = async function () {
      var self = this;
      if (!window.caches || self.cachedUrlsLoaded) return;
      try {
        var cache = await caches.open(CACHE_NAME);
        var keys = await cache.keys();
        keys.forEach(function (r) { self.fetchedUrls.add(r.url); });
        self.cachedUrlsLoaded = true;
      } catch (e) { }
    };

    BackgroundPreloader.prototype.start = async function () {
      var self = this;
      await self.loadCachedUrls();
      self.stopped = false;
      self.paused = false;
      self._next();
    };

    BackgroundPreloader.prototype.stop = function () {
      this.stopped = true;
    };

    BackgroundPreloader.prototype.pause = function () {
      this.paused = true;
    };

    BackgroundPreloader.prototype.resume = function () {
      var self = this;
      if (self.paused && !self.stopped) {
        self.paused = false;
        self._next();
      }
    };

    // Add priority URLs (user needs these now)
    BackgroundPreloader.prototype.addPriority = function (urls) {
      var self = this;
      for (var i = 0; i < urls.length; i++) {
        if (urls[i] && !self.fetchedUrls.has(urls[i])) {
          self.priorityQueue.push(urls[i]);
        }
      }
      self._next();
    };

    BackgroundPreloader.prototype._next = function () {
      var self = this;
      if (self.stopped || self.paused) return;
      // Process priority queue first
      while (self.priorityQueue.length > 0 && self.priorityActive < self.MAX_CONCURRENT) {
        var url = self.priorityQueue.shift();
        if (self.fetchedUrls.has(url)) continue;
        self.priorityActive++;
        self._fetchUrl(url, true);
      }
      // Process background queue
      while (self.activeCount + self.priorityActive < self.MAX_CONCURRENT) {
        var url = self._getNextBgUrl();
        if (!url) break;
        if (self.fetchedUrls.has(url)) continue;
        self.activeCount++;
        self._fetchUrl(url, false);
      }
    };

    BackgroundPreloader.prototype._getNextBgUrl = function () {
      var self = this;
      // Phase 1: covers
      if (self.phase === 'covers') {
        while (self.coverIdx < self.books.length) {
          var book = self.books[self.coverIdx];
          self.coverIdx++;
          var cUrl = buildCoverUrl(book);
          if (cUrl && !self.fetchedUrls.has(cUrl)) {
            return cUrl;
          }
        }
        // All covers done, move to pages phase
        self.phase = 'pages';
        self.coversDone = true;
        self.pageIdx = 0;
        self.bookIdxForPage = 0;
        self.pageSubPhase = 0; // 0=image, 1=audio
      }
      // Phase 2: pages (page 0 image+audio for all books, then page 1, etc.)
      if (self.phase === 'pages') {
        var maxPages = 0;
        for (var i = 0; i < self.books.length; i++) {
          var pc = self.books[i].pageCount || 0;
          if (pc > maxPages) maxPages = pc;
        }
        while (self.pageIdx < maxPages) {
          while (self.bookIdxForPage < self.books.length) {
            var bk = self.books[self.bookIdxForPage];
            if (self.pageIdx >= bk.pageCount) {
              self.bookIdxForPage++;
              self.pageSubPhase = 0;
              continue;
            }
            // Sub-phase 0: image
            if (self.pageSubPhase === 0) {
              self.pageSubPhase = 1;
              var imgUrl = buildPageImageUrl(bk, self.pageIdx);
              if (!self.fetchedUrls.has(imgUrl)) {
                return imgUrl;
              }
              // Image already fetched, fall through to audio
            }
            // Sub-phase 1: audio
            if (self.pageSubPhase === 1) {
              self.pageSubPhase = 0;
              self.bookIdxForPage++;
              var imgUrls = buildImageUrls(bk);
              var aUrl = buildAudioUrl(bk, getAudioUrl(bk.audioUrls, imgUrls, self.pageIdx));
              if (aUrl && !self.fetchedUrls.has(aUrl)) {
                return aUrl;
              }
              // Audio already fetched or no audio, move to next book
              continue;
            }
          }
          // All books done for this pageIdx, move to next page
          self.pageIdx++;
          self.bookIdxForPage = 0;
          self.pageSubPhase = 0;
        }
        // All pages done
        self.allDone = true;
        return null;
      }
      return null;
    };

    BackgroundPreloader.prototype._fetchUrl = function (url, isPriority) {
      var self = this;
      self.fetchedUrls.add(url);
      // Try Cache API first
      if (cacheReady && window.caches) {
        caches.open(CACHE_NAME).then(function (cache) {
          return cache.match(url).then(function (resp) {
            if (resp) {
              self._onFetchDone(url, isPriority);
              return;
            }
            return cache.add(new Request(url, { mode: 'no-cors' })).then(function () {
              self._onFetchDone(url, isPriority);
            }).catch(function () {
              self._onFetchDone(url, isPriority);
            });
          });
        }).catch(function () {
          self._onFetchDone(url, isPriority);
        });
      } else {
        // Fallback: use Image/Audio fetch
        if (url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)) {
          var img = new Image();
          img.onload = img.onerror = function () { self._onFetchDone(url, isPriority); };
          img.src = url;
        } else if (url.match(/\.(mp3|m4a|ogg|wav)(\?|$)/i)) {
          var a = new Audio();
          a.preload = 'auto';
          a.oncanplaythrough = a.onerror = function () { self._onFetchDone(url, isPriority); };
          a.src = url;
        } else {
          // Generic fetch
          if (typeof fetch === 'function') {
            fetch(url, { mode: 'no-cors' }).catch(function () { }).then(function () { self._onFetchDone(url, isPriority); });
          } else {
            self._onFetchDone(url, isPriority);
          }
        }
      }
    };

    BackgroundPreloader.prototype._onFetchDone = function (url, isPriority) {
      var self = this;
      if (isPriority) {
        self.priorityActive--;
      } else {
        self.activeCount--;
      }
      self._next();
    };

    // ========== Book Preloader (for active reading) ==========
    var bookPreloader = null;

    function BookPreloader(book) {
      var self = this;
      self.book = book;
      self.imageUrls = book.imageUrls || [];
      self.audioUrls = book.audioUrls || null;
      self.MAX_CONCURRENT = 4;
      self.activeCount = 0;
      self.stopped = false;
      self.queue = []; // {type:'image'|'audio', url:string, pageIdx:number}
      self.loadedPages = new Set();
      // Build queue: all pages in order
      for (var i = 0; i < self.imageUrls.length; i++) {
        self.queue.push({ type: 'image', url: self.imageUrls[i], pageIdx: i });
        var aUrl = getAudioUrl(self.audioUrls, self.imageUrls, i);
        if (aUrl) self.queue.push({ type: 'audio', url: aUrl, pageIdx: i });
      }
    }

    BookPreloader.prototype.start = function () {
      var self = this;
      self.stopped = false;
      self._next();
    };

    BookPreloader.prototype.stop = function () {
      this.stopped = true;
    };

    BookPreloader.prototype._next = function () {
      var self = this;
      if (self.stopped) return;
      while (self.activeCount < self.MAX_CONCURRENT && self.queue.length > 0) {
        var item = self.queue.shift();
        if (self.loadedPages.has(item.pageIdx + '_' + item.type)) continue;
        self.loadedPages.add(item.pageIdx + '_' + item.type);
        self.activeCount++;
        self._fetch(item);
      }
    };

    BookPreloader.prototype._fetch = function (item) {
      var self = this;
      // Pause background preloader while book preloader is active
      if (bgPreloader) bgPreloader.pause();
      if (cacheReady && window.caches) {
        caches.open(CACHE_NAME).then(function (cache) {
          return cache.match(item.url).then(function (resp) {
            if (resp) {
              self._done(item);
              return;
            }
            return cache.add(new Request(item.url, { mode: 'no-cors' })).then(function () {
              self._done(item);
            }).catch(function () {
              self._done(item);
            });
          });
        }).catch(function () {
          self._done(item);
        });
      } else {
        if (item.type === 'image') {
          var img = new Image();
          img.onload = img.onerror = function () { self._done(item); };
          img.src = item.url;
        } else {
          var a = new Audio();
          a.preload = 'auto';
          a.oncanplaythrough = a.onerror = function () { self._done(item); };
          a.src = item.url;
        }
      }
    };

    BookPreloader.prototype._done = function (item) {
      var self = this;
      self.activeCount--;
      if (self.queue.length === 0 && self.activeCount === 0) {
        // Book preloader finished, resume background preloader
        if (bgPreloader) bgPreloader.resume();
      }
      self._next();
    };

    // ========== Reading Status Management ==========
    var RS_KEY = 'raz_reading_status';
    var ACH_KEY = 'raz_achievements';

    function getReadingStatus() {
      try { return JSON.parse(localStorage.getItem(RS_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveReadingStatus(data) {
      localStorage.setItem(RS_KEY, JSON.stringify(data));
    }
    function getBookStatus(bookId) {
      var all = getReadingStatus();
      return all[bookId] || null;
    }
    function updateBookStatus(bookId, status) {
      var all = getReadingStatus();
      all[bookId] = status;
      saveReadingStatus(all);
    }
    function getCompletedCount() {
      var all = getReadingStatus();
      var count = 0;
      for (var k in all) {
        if (all[k] && all[k].completed) count++;
      }
      return count;
    }
    function getLevelCompletedCount(level) {
      var all = getReadingStatus();
      var count = 0;
      var books = DATA.books.filter(function (b) { return b.level === level; });
      for (var i = 0; i < books.length; i++) {
        var s = all[books[i].id];
        if (s && s.completed) count++;
      }
      return count;
    }
    function isLevelCompleted(level) {
      var books = DATA.books.filter(function (b) { return b.level === level; });
      var all = getReadingStatus();
      for (var i = 0; i < books.length; i++) {
        var s = all[books[i].id];
        if (!s || !s.completed) return false;
      }
      return books.length > 0;
    }

    // ========== Achievement System ==========
    var COUNT_MILESTONES = [1, 2, 3, 5, 10, 20, 50, 100, 200, 300, 400, 500, 600, 700];
    var COUNT_ACH_NAMES = {
      1: '初出茅庐', 2: '小试牛刀', 3: '渐入佳境', 5: '崭露头角',
      10: '勤奋读者', 20: '阅读达人', 50: '书虫养成', 100: '博览群书',
      200: '学富五车', 300: '汗牛充栋', 400: '满腹经纶', 500: '阅读大师',
      600: '知识渊博', 700: '终身成就奖'
    };
    var COUNT_ACH_ICONS = {
      1: '🌱', 2: '🌿', 3: '🌳', 5: '⭐',
      10: '🌟', 20: '💫', 50: '🐛', 100: '📚',
      200: '🎓', 300: '🏛️', 400: '📖', 500: '👑',
      600: '🌈', 700: '🏆'
    };
    var COUNT_ACH_COLORS = {
      1: '#8BC34A', 2: '#4CAF50', 3: '#009688', 5: '#FF9800',
      10: '#FF5722', 20: '#E91E63', 50: '#9C27B0', 100: '#673AB7',
      200: '#3F51B5', 300: '#2196F3', 400: '#00BCD4', 500: '#FFD700',
      600: '#FF6F00', 700: '#D50000'
    };
    var COUNT_ACH_DESCS = {
      1: '读完1本书', 2: '读完2本书', 3: '读完3本书', 5: '读完5本书',
      10: '读完10本书', 20: '读完20本书', 50: '读完50本书', 100: '读完100本书',
      200: '读完200本书', 300: '读完300本书', 400: '读完400本书', 500: '读完500本书',
      600: '读完600本书', 700: '读完700本书'
    };

    var LEVEL_ACH_ICONS = {
      'aa':'👶','A':'🇦','B':'🇧','C':'🇨','D':'🇩','E':'🇪','F':'🇫',
      'G':'🇬','H':'🇭','I':'🇮','J':'🇯','K':'🇰','L':'🇱','M':'🇲',
      'N':'🇳','O':'🇴','P':'🇵','Q':'🇶','R':'🇷','S':'🇸','T':'🇹',
      'U':'🇺','V':'🇻','W':'🇼','X':'🇽','Y':'🇾','Z':'🇿','Z1':'🥇','Z2':'🥈'
    };
    var LEVEL_ACH_COLORS = {
      'aa':'#FF9800','A':'#FF5722','B':'#E91E63','C':'#9C27B0','D':'#673AB7',
      'E':'#3F51B5','F':'#2196F3','G':'#03A9F4','H':'#00BCD4','I':'#009688',
      'J':'#4CAF50','K':'#8BC34A','L':'#CDDC39','M':'#FFEB3B','N':'#FFC107',
      'O':'#FF9800','P':'#FF5722','Q':'#795548','R':'#607D8B','S':'#E91E63',
      'T':'#9C27B0','U':'#673AB7','V':'#3F51B5','W':'#2196F3','X':'#00BCD4',
      'Y':'#009688','Z':'#4CAF50','Z1':'#8BC34A','Z2':'#CDDC39'
    };

    function getAchievements() {
      try { return JSON.parse(localStorage.getItem(ACH_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveAchievements(ach) {
      localStorage.setItem(ACH_KEY, JSON.stringify(ach));
    }
    function checkAndAwardAchievements() {
      var ach = getAchievements();
      var completed = getCompletedCount();
      var totalBooks = DATA.books.length;
      var newAch = [];
      // Count milestones
      for (var i = 0; i < COUNT_MILESTONES.length; i++) {
        var m = COUNT_MILESTONES[i];
        var key = 'count_' + m;
        if (completed >= m && !ach[key]) {
          ach[key] = { date: new Date().toISOString(), name: COUNT_ACH_NAMES[m], icon: COUNT_ACH_ICONS[m], color: COUNT_ACH_COLORS[m] };
          newAch.push(COUNT_ACH_NAMES[m]);
        }
      }
      // Level achievements
      for (var j = 0; j < LEVEL_ORDER.length; j++) {
        var lv = LEVEL_ORDER[j];
        var lvKey = 'level_' + lv;
        if (isLevelCompleted(lv) && !ach[lvKey]) {
          ach[lvKey] = { date: new Date().toISOString(), name: 'Level ' + lv + ' 全通关', icon: LEVEL_ACH_ICONS[lv] || '🎯', color: LEVEL_ACH_COLORS[lv] || '#4a6fa5' };
          newAch.push('Level ' + lv + ' 全通关');
        }
      }
      // Lifetime achievement: all books completed
      if (completed >= totalBooks && !ach['lifetime_all']) {
        ach['lifetime_all'] = { date: new Date().toISOString(), name: '全部读完！终极成就', icon: '🏅', color: '#D50000' };
        newAch.push('全部读完！终极成就');
      }

      // ===== NEW: Exploration achievements =====
      var levelsRead = getLevelsReadCount();
      var explorationDefs = [
        { key: 'explore_5', threshold: 5, name: '探索新手', icon: '🧭', color: '#00BCD4' },
        { key: 'explore_10', threshold: 10, name: '级别旅行家', icon: '🗺️', color: '#009688' },
        { key: 'explore_20', threshold: 20, name: '环球读者', icon: '🌏', color: '#4CAF50' },
        { key: 'explore_all', threshold: LEVEL_ORDER.length, name: '全级别探索者', icon: '🚀', color: '#FF6F00' }
      ];
      for (var ei = 0; ei < explorationDefs.length; ei++) {
        var ed = explorationDefs[ei];
        if (levelsRead >= ed.threshold && !ach[ed.key]) {
          ach[ed.key] = { date: new Date().toISOString(), name: ed.name, icon: ed.icon, color: ed.color };
          newAch.push(ed.name);
        }
      }

      // ===== NEW: Level group achievements =====
      var levelGroups = [
        { key: 'group_early', levels: ['aa','A','B','C'], name: '初级通关', icon: '🐣', color: '#8BC34A' },
        { key: 'group_mid', levels: ['D','E','F','G','H','I','J'], name: '中级通关', icon: '🐥', color: '#FF9800' },
        { key: 'group_upper', levels: ['K','L','M','N','O','P'], name: '高级通关', icon: '🦅', color: '#E91E63' },
        { key: 'group_adv', levels: ['Q','R','S','T','U','V','W','X','Y','Z','Z1','Z2'], name: '进阶通关', icon: '🦉', color: '#9C27B0' }
      ];
      for (var gi = 0; gi < levelGroups.length; gi++) {
        var grp = levelGroups[gi];
        var grpDone = true;
        for (var gj = 0; gj < grp.levels.length; gj++) {
          if (!isLevelCompleted(grp.levels[gj])) { grpDone = false; break; }
        }
        if (grpDone && !ach[grp.key]) {
          ach[grp.key] = { date: new Date().toISOString(), name: grp.name, icon: grp.icon, color: grp.color };
          newAch.push(grp.name);
        }
      }

      // ===== NEW: Completion percentage achievements =====
      var pct = totalBooks > 0 ? (completed / totalBooks * 100) : 0;
      var pctDefs = [
        { key: 'pct_25', threshold: 25, name: '四分之一', icon: '🥉', color: '#CD7F32' },
        { key: 'pct_50', threshold: 50, name: '半程达人', icon: '🥈', color: '#C0C0C0' },
        { key: 'pct_75', threshold: 75, name: '四分之三', icon: '🥇', color: '#FFD700' },
        { key: 'pct_90', threshold: 90, name: '九成大师', icon: '💎', color: '#B9F2FF' }
      ];
      for (var pi = 0; pi < pctDefs.length; pi++) {
        var pd = pctDefs[pi];
        if (pct >= pd.threshold && !ach[pd.key]) {
          ach[pd.key] = { date: new Date().toISOString(), name: pd.name, icon: pd.icon, color: pd.color };
          newAch.push(pd.name);
        }
      }

      // ===== NEW: Quiz volume achievements =====
      var quizResults = getQuizResults();
      var quizTaken = Object.keys(quizResults).filter(function (k) { return quizResults[k] && quizResults[k].submitted; }).length;
      var quizVolDefs = [
        { key: 'quiz_vol_10', threshold: 10, name: 'Quiz参与者', icon: '📝', color: '#795548' },
        { key: 'quiz_vol_25', threshold: 25, name: 'Quiz常客', icon: '✏️', color: '#607D8B' },
        { key: 'quiz_vol_50', threshold: 50, name: 'Quiz爱好者', icon: '📋', color: '#009688' },
        { key: 'quiz_vol_100', threshold: 100, name: 'Quiz狂人', icon: '📊', color: '#673AB7' },
        { key: 'quiz_vol_all', threshold: 760, name: 'Quiz全勤', icon: '🏅', color: '#D50000' }
      ];
      for (var vi = 0; vi < quizVolDefs.length; vi++) {
        var vd = quizVolDefs[vi];
        if (quizTaken >= vd.threshold && !ach[vd.key]) {
          ach[vd.key] = { date: new Date().toISOString(), name: vd.name, icon: vd.icon, color: vd.color };
          newAch.push(vd.name);
        }
      }

      // ===== NEW: Quiz streak achievements =====
      var perfectBooks = getQuizPerfectBooks();
      var streak = getQuizPerfectStreak();
      var streakDefs = [
        { key: 'quiz_streak_3', threshold: 3, name: '三连满分', icon: '🔥', color: '#FF5722' },
        { key: 'quiz_streak_5', threshold: 5, name: '五连满分', icon: '💥', color: '#E91E63' },
        { key: 'quiz_streak_10', threshold: 10, name: '十连满分', icon: '⚡', color: '#D50000' }
      ];
      for (var si = 0; si < streakDefs.length; si++) {
        var sd = streakDefs[si];
        if (streak >= sd.threshold && !ach[sd.key]) {
          ach[sd.key] = { date: new Date().toISOString(), name: sd.name, icon: sd.icon, color: sd.color };
          newAch.push(sd.name);
        }
      }

      // ===== NEW: Daily reading streak achievements =====
      var dailyStreak = getDailyReadStreak();
      var dailyDefs = [
        { key: 'daily_3', threshold: 3, name: '三日坚持', icon: '🌱', color: '#8BC34A' },
        { key: 'daily_7', threshold: 7, name: '一周不间断', icon: '🌿', color: '#4CAF50' },
        { key: 'daily_14', threshold: 14, name: '两周坚持', icon: '🌳', color: '#2E7D32' },
        { key: 'daily_30', threshold: 30, name: '月度阅读家', icon: '🏔️', color: '#1B5E20' },
        { key: 'daily_100', threshold: 100, name: '百日阅读传奇', icon: '🌟', color: '#FFD700' }
      ];
      for (var di = 0; di < dailyDefs.length; di++) {
        var dd = dailyDefs[di];
        if (dailyStreak >= dd.threshold && !ach[dd.key]) {
          ach[dd.key] = { date: new Date().toISOString(), name: dd.name, icon: dd.icon, color: dd.color };
          newAch.push(dd.name);
        }
      }

      // ===== NEW: Time-of-day achievements =====
      var hour = new Date().getHours();
      if (hour >= 6 && hour < 8 && !ach['early_bird']) {
        ach['early_bird'] = { date: new Date().toISOString(), name: '早起鸟儿', icon: '🌅', color: '#FF9800' };
        newAch.push('早起鸟儿');
      }
      if (hour >= 21 && !ach['night_owl']) {
        ach['night_owl'] = { date: new Date().toISOString(), name: '夜猫子', icon: '🦉', color: '#3F51B5' };
        newAch.push('夜猫子');
      }
      var day = new Date().getDay();
      if ((day === 0 || day === 6) && !ach['weekend_warrior']) {
        ach['weekend_warrior'] = { date: new Date().toISOString(), name: '周末战士', icon: '⚔️', color: '#9C27B0' };
        newAch.push('周末战士');
      }

      saveAchievements(ach);
      // Show toasts for new achievements with 2-second delay
      if (newAch.length > 0) {
        for (var k = 0; k < newAch.length; k++) {
          _achQueue.push(newAch[k]);
        }
        if (!_achTimer) {
          _achTimer = setTimeout(flushAchQueue, 2000);
        }
      }
    }

    // ========== Helper functions for new achievements ==========
    function getLevelsReadCount() {
      var all = getReadingStatus();
      var levelsSet = {};
      for (var k in all) {
        if (all[k] && all[k].completed) {
          var book = DATA.books.find(function (b) { return b.id == k; });
          if (book) levelsSet[book.level] = true;
        }
      }
      return Object.keys(levelsSet).length;
    }

    function getQuizPerfectStreak() {
      var perfectBooks = getQuizPerfectBooks();
      if (!perfectBooks || perfectBooks.length === 0) return 0;
      // Sort by the order in quiz_results dates
      var results = getQuizResults();
      var sorted = perfectBooks.slice().sort(function (a, b) {
        var da = results[a] && results[a].date ? results[a].date : '';
        var db = results[b] && results[b].date ? results[b].date : '';
        return da < db ? -1 : da > db ? 1 : 0;
      });
      // Count consecutive perfect from the end
      var streak = 0;
      for (var i = sorted.length - 1; i >= 0; i--) {
        var bid = sorted[i];
        if (results[bid] && results[bid].perfectScore) {
          streak++;
        } else {
          break;
        }
      }
      return streak;
    }

    var DAILY_KEY = 'raz_daily_reads';
    function recordDailyRead() {
      var today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      var data = {};
      try { data = JSON.parse(localStorage.getItem(DAILY_KEY)) || {}; } catch (e) {}
      data[today] = (data[today] || 0) + 1;
      // Keep only last 200 days
      var keys = Object.keys(data).sort();
      while (keys.length > 200) {
        delete data[keys.shift()];
      }
      localStorage.setItem(DAILY_KEY, JSON.stringify(data));
    }

    function getDailyReadStreak() {
      var data = {};
      try { data = JSON.parse(localStorage.getItem(DAILY_KEY)) || {}; } catch (e) {}
      var streak = 0;
      var d = new Date();
      while (true) {
        var key = d.toISOString().slice(0, 10);
        if (data[key] && data[key] > 0) {
          streak++;
          d.setDate(d.getDate() - 1);
        } else {
          break;
        }
      }
      return streak;
    }
    function showAchToast(name) {
      var toast = document.createElement('div');
      toast.className = 'ach-toast';
      toast.innerHTML = '🎉 解锁成就：' + name;
      document.body.appendChild(toast);
      playAchSound();
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3500);
    }

    // Delayed achievement display queue
    var _achQueue = [];
    var _achTimer = null;
    function flushAchQueue() {
      _achTimer = null;
      for (var i = 0; i < _achQueue.length; i++) {
        showAchToast(_achQueue[i]);
      }
      _achQueue = [];
    }

    // ========== Achievement Overlay Display ==========
    function showAchOverlay() {
      var ach = getAchievements();
      var completed = getCompletedCount();
      var totalBooks = DATA.books.length;
      // Summary
      var unlockedCount = Object.keys(ach).length;
      var totalAch = COUNT_MILESTONES.length + LEVEL_ORDER.length + 1;
      document.getElementById('achSummary').innerHTML =
        '<div class="stat"><div class="stat-val">' + completed + '</div><div class="stat-lbl">已读完</div></div>' +
        '<div class="stat"><div class="stat-val">' + totalBooks + '</div><div class="stat-lbl">总书籍</div></div>' +
        '<div class="stat"><div class="stat-val">' + unlockedCount + '/' + totalAch + '</div><div class="stat-lbl">成就</div></div>';
      // Sections
      var html = '';
      // Count achievements
      html += '<div class="ach-section"><div class="ach-section-title">📖 阅读数量成就</div><div class="ach-grid">';
      for (var i = 0; i < COUNT_MILESTONES.length; i++) {
        var m = COUNT_MILESTONES[i];
        var key = 'count_' + m;
        var unlocked = !!ach[key];
        var color = COUNT_ACH_COLORS[m];
        var icon = COUNT_ACH_ICONS[m];
        var name = COUNT_ACH_NAMES[m];
        html += '<div class="badge ' + (unlocked ? 'unlocked' : 'locked') + '" style="' + (unlocked ? 'background:' + color + '22;border:2px solid ' + color : '') + '">';
        html += '<div class="badge-icon" style="background:' + (unlocked ? color : '#ccc') + '">' + icon + '</div>';
        html += '<div class="badge-name">' + name + '</div>';
        html += '<div class="badge-desc">读完' + m + '本书</div>';
        if (unlocked && ach[key].date) {
          var d = new Date(ach[key].date);
          html += '<div class="badge-date">' + (d.getMonth() + 1) + '/' + d.getDate() + ' 获得</div>';
        }
        html += '</div>';
      }
      html += '</div></div>';
      // Level achievements
      html += '<div class="ach-section"><div class="ach-section-title">🎯 级别通关成就</div><div class="ach-grid">';
      for (var j = 0; j < LEVEL_ORDER.length; j++) {
        var lv = LEVEL_ORDER[j];
        var lvKey = 'level_' + lv;
        var lvUnlocked = !!ach[lvKey];
        var lvCount = getLevelCompletedCount(lv);
        var lvTotal = DATA.books.filter(function (b) { return b.level === lv; }).length;
        var lvColor = '#4a6fa5';
        html += '<div class="badge ' + (lvUnlocked ? 'unlocked' : 'locked') + '" style="' + (lvUnlocked ? 'background:' + lvColor + '22;border:2px solid ' + lvColor : '') + '">';
        html += '<div class="badge-icon" style="background:' + (lvUnlocked ? lvColor : '#ccc') + '">🎯</div>';
        html += '<div class="badge-name">Level ' + lv + '</div>';
        html += '<div class="badge-desc">' + lvCount + '/' + lvTotal + '本</div>';
        if (lvUnlocked && ach[lvKey].date) {
          var ld = new Date(ach[lvKey].date);
          html += '<div class="badge-date">' + (ld.getMonth() + 1) + '/' + ld.getDate() + ' 获得</div>';
        }
        html += '</div>';
      }
      html += '</div></div>';
      // Lifetime achievement
      var ltKey = 'lifetime_all';
      var ltUnlocked = !!ach[ltKey];
      html += '<div class="ach-section"><div class="ach-section-title">🏅 终极成就</div><div class="ach-grid">';
      html += '<div class="badge ' + (ltUnlocked ? 'unlocked' : 'locked') + '" style="' + (ltUnlocked ? 'background:#D5000022;border:2px solid #D50000' : '') + '">';
      html += '<div class="badge-icon" style="background:' + (ltUnlocked ? '#D50000' : '#ccc') + '">🏅</div>';
      html += '<div class="badge-name">全部读完！</div>';
      html += '<div class="badge-desc">读完所有' + totalBooks + '本书</div>';
      if (ltUnlocked && ach[ltKey].date) {
        var ltd = new Date(ach[ltKey].date);
        html += '<div class="badge-date">' + (ltd.getMonth() + 1) + '/' + ltd.getDate() + ' 获得</div>';
      }
      html += '</div></div></div>';
      document.getElementById('achSections').innerHTML = html;
      document.getElementById('achOverlay').classList.add('open');
    }
    function hideAchOverlay() {
      document.getElementById('achOverlay').classList.remove('open');
    }

    // ========== Init/Reset ==========
    function showInitConfirm() {
      document.getElementById('initOverlay').classList.add('open');
    }
    function hideInitConfirm() {
      document.getElementById('initOverlay').classList.remove('open');
    }
    function doReset() {
      localStorage.removeItem(RS_KEY);
      localStorage.removeItem(AK_KEY);
      localStorage.removeItem(UN_KEY);
      localStorage.removeItem(ACH_KEY);
      if (bgPreloader) { bgPreloader.stop(); bgPreloader = null; }
      if (bookPreloader) { bookPreloader.stop(); bookPreloader = null; }
      hideInitConfirm();
      location.reload();
    }

    // ========== Audio Pause/Play via Space & Click ==========
    function togglePlayPause() {
      if (!audioEl) return;
      if (audioEl.paused) {
        audioEl.play().catch(function () { });
        document.getElementById('playBtn').textContent = '⏸';
      } else {
        audioEl.pause();
        document.getElementById('playBtn').textContent = '▶️';
      }
    }

    function getLevelIndex(l) {
      var idx = LEVEL_ORDER.indexOf(l);
      return idx === -1 ? 999 : idx;
    }

    function sortBooks(books, order) {
      var sorted = books.slice();
      sorted.sort(function (a, b) {
        var idxA = getLevelIndex(a.level);
        var idxB = getLevelIndex(b.level);
        if (idxA !== idxB) return order === 'asc' ? idxA - idxB : idxB - idxA;
        return order === 'asc' ? a.id - b.id : b.id - a.id;
      });
      return sorted;
    }

    function setSortOrder(order) {
      sortOrder = order;
      document.getElementById('sortAsc').classList.toggle('active', order === 'asc');
      document.getElementById('sortDesc').classList.toggle('active', order === 'desc');
      allBooks = sortBooks(DATA.books, order);
      filteredBooks = currentLevel ? allBooks.filter(function (b) { return b.level === currentLevel }) : allBooks.slice();
      renderBooks();
      renderLevelTabs();
      // Update URL hash (preserve level if set)
      updateHash();
    }

    function updateHash() {
      var parts = [];
      if (currentLevel) parts.push('level-' + currentLevel);
      if (sortOrder === 'desc') parts.push('sort-desc');
      if (parts.length > 0) {
        history.replaceState(null, '', '#' + parts.join(','));
      } else {
        history.replaceState(null, '', window.location.pathname);
      }
    }

    function buildImageUrls(book) {
      if (book.imageUrls) return book.imageUrls;
      var urls = [];
      for (var j = 0; j < book.pageCount; j++) {
        urls.push(buildPageImageUrl(book, j));
      }
      return urls;
    }

    async function initCache() {
      if (!window.caches) return;
      try {
        var cache = await caches.open(CACHE_NAME);
        cacheReady = true;
      } catch (e) { }
    }

    function updateHash() {
      if (currentBook) {
        isNavigating = true;
        location.hash = '#book-' + currentBook.id + '-page-' + currentPage;
        setTimeout(function () { isNavigating = false; }, 100);
      } else location.hash = '';
    }

    function parseHash() {
      var hash = location.hash || '';
      var m = hash.match(/#book-(\d+)-page-(\d+)/);
      if (m) return { type: 'book', bookId: parseInt(m[1]), page: parseInt(m[2]) };
      // Parse new anchors
      var parts = hash.replace('#', '').split(',');
      var result = {};
      parts.forEach(function (p) {
        if (p === 'profile') result.profile = true;
        else if (p === 'theme') result.theme = true;
        else if (p.startsWith('level-')) result.level = p.replace('level-', '');
        else if (p === 'sort-desc') result.sortDesc = true;
      });
      if (result.profile || result.theme || result.level || result.sortDesc) {
        result.type = 'nav';
        return result;
      }
      return null;
    }

    function handleHashNav() {
      var parsed = parseHash();
      if (!parsed) return;
      if (parsed.type === 'nav') {
        if (parsed.sortDesc && sortOrder !== 'desc') setSortOrder('desc');
        if (parsed.level) filterLevel(parsed.level);
        if (parsed.profile) showProfileOverlay();
        if (parsed.theme) showThemeDialog();
      }
    }

    function init() {
      updateTitle();
      allBooks = sortBooks(DATA.books, 'asc');
      filteredBooks = allBooks.slice();
      // Start background preloader regardless of access status
      initCache().then(function () {
        if (!bgPreloader) {
          bgPreloader = new BackgroundPreloader(allBooks);
          bgPreloader.start();
        }
      });
      // Render preview cards even if not verified (for key-overlay page 1)
      renderPreviewCards();
      // Show main container if access was already granted by early verification
      var mc = document.getElementById('mainContainer');
      if (mc && mc.style.display === 'none') {
        // Access not yet granted, early script handles it
        return;
      }
      _renderMainUI();
      var pos = parseHash();
      if (pos && pos.type === 'book') openBook(pos.bookId, pos.page);
      else if (pos && pos.type === 'nav') handleHashNav();
    }

    function _renderMainUI() {
      var completed = getCompletedCount();
      document.getElementById('stats').textContent = allBooks.length + ' 本书 · ' + DATA.levels.length + ' 个级别 · 已读' + completed + '本';
      renderLevelTabs();
      renderBooks();
      // Render preview cards (for unverified users)
      renderPreviewCards();
    }

    function extractPageNum(url) {
      var m = (url || '').match(/page-(\d+)/);
      return m ? parseInt(m[1]) : null;
    }

    function getAudioUrl(audioUrls, imageUrls, pageIdx) {
      if (!audioUrls) return '';
      var imgUrl = imageUrls[pageIdx];
      var pageNum = extractPageNum(imgUrl);
      if (typeof audioUrls === 'object' && audioUrls.pages) {
        if (pageIdx === 0 && audioUrls.title) return audioUrls.title;
        if (pageNum !== null) return audioUrls.pages[String(pageNum)] || '';
        return '';
      }
      if (pageNum !== null) return audioUrls[String(pageNum)] || audioUrls['page' + pageNum] || '';
      return '';
    }

    function hasAudio(audioUrls, imageUrls, pageIdx) {
      return !!getAudioUrl(audioUrls, imageUrls, pageIdx);
    }

    function renderLevelTabs() {
      var c = document.getElementById('levelTabs');
      var h = '<div class="level-tab' + (currentLevel === '' ? ' active' : '') + '" onclick="filterLevel(\'\')" id="tab-all">全部</div>';
      var sortedLevels = DATA.levels.slice().sort(function (a, b) {
        var idxA = getLevelIndex(a.level);
        var idxB = getLevelIndex(b.level);
        return sortOrder === 'asc' ? idxA - idxB : idxB - idxA;
      });
      sortedLevels.forEach(function (l) {
        h += '<div class="level-tab' + (currentLevel === l.level ? ' active' : '') + '" onclick="filterLevel(\'' + l.level + '\')" id="tab-' + l.level + '">' + l.level + ' (' + l.count + ')</div>';
      });
      c.innerHTML = h;
    }

    function filterLevel(level) {
      currentLevel = level;
      filteredBooks = level ? allBooks.filter(function (b) { return b.level === level }) : allBooks.slice();
      renderBooks();
      renderLevelTabs();
      // Update URL hash
      updateHash();
      // Prioritize covers for the selected level
      if (bgPreloader && level) {
        var urls = [];
        filteredBooks.forEach(function (b) { var cu = buildCoverUrl(b); if (cu) urls.push(cu); });
        bgPreloader.addPriority(urls);
      }
    }

    function handleSearch(query) {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(function () {
        var q = query.trim().toLowerCase();
        var base = currentLevel ? allBooks.filter(function (b) { return b.level === currentLevel }) : allBooks.slice();
        if (q) base = base.filter(function (b) { return (b.title || '').toLowerCase().indexOf(q) !== -1 });
        filteredBooks = base;
        renderBooks();
      }, 300);
    }

    function escapeHtml(s) {
      var d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function renderBooks() {
      var c = document.getElementById('bookGrid');
      if (filteredBooks.length === 0) {
        c.innerHTML = '<div class="empty">没有找到书籍</div>';
        return;
      }
      var h = '';
      var rs = getReadingStatus();
      var perfectBooks = getQuizPerfectBooks();
      filteredBooks.forEach(function (book) {
        var title = book.title || 'Book ' + book.id;
        var status = rs[book.id];
        var coverClass = 'cover-wrap';
        var statusHtml = '';
        if (perfectBooks.indexOf(book.id) !== -1) {
          statusHtml += '<svg class="quiz-star" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z" fill="#FFD700"/></svg>';
        }
        if (status && status.completed) {
          coverClass += ' completed';
          statusHtml += '<div class="completed-check"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>';
        } else if (status && status.maxPage > 0) {
          var pct = Math.round(status.maxPage / status.total * 100);
          if (pct > 100) pct = 100;
          statusHtml += '<div class="reading-progress"><div class="reading-progress-fill" style="width:' + pct + '%"></div></div>';
          if (pct < 100) statusHtml += '<div class="reading-progress-text">' + pct + '%</div>';
        }
        h += '<div class="book-card" onclick="openBook(' + book.id + ')">' +
          '<div class="' + coverClass + '">' +
          '<img src="' + buildCoverUrl(book) + '" loading="lazy" alt="" onerror="this.style.display=\'none\'">' +
          statusHtml +
          '</div>' +
          '<div class="info"><div class="title">' + escapeHtml(title) + '</div>' +
          '<div class="level">Level ' + book.level + '</div></div></div>';
      });
      c.innerHTML = h;
    }

    function openBook(bookId, startPage) {
      startPage = startPage || 0;
      var book = allBooks.find(function (b) { return b.id === bookId });
      if (!book) { alert('书籍未找到'); return }
      currentBook = {
        id: book.id,
        title: book.title,
        level: book.level,
        coverUrl: buildCoverUrl(book),
        imageUrls: buildImageUrls(book),
        audioUrls: book.audioUrls || null
      };
      // Restore reading progress (completed books restart from beginning)
      // In preview mode, always start from page 0
      if (!previewMode) {
        var status = getBookStatus(book.id);
        if (status && status.maxPage > 0 && !startPage && !status.completed) {
          startPage = status.maxPage;
        }
      } else {
        startPage = 0;
      }
      currentPage = Math.max(0, Math.min(startPage, currentBook.imageUrls.length - 1));
      totalPages = currentBook.imageUrls.length;
      autoPlay = true;
      celebrated = false;
      preloadedPages.clear();
      preloadedImages = {};
      preloadedAudios = {};
      document.getElementById('readerTitle').textContent = currentBook.title;
      document.getElementById('reader').classList.add('active');
      document.body.style.overflow = 'hidden';
      document.getElementById('autoPlayBtn').textContent = '⏸ 自动';
      document.getElementById('autoPlayBtn').classList.add('active');
      // Defer renderPageSlides to ensure container has correct height
      requestAnimationFrame(function () {
        renderPageSlides();
        showPage(currentPage);
      });
      // Start book preloader for this book
      if (bookPreloader) bookPreloader.stop();
      bookPreloader = new BookPreloader(currentBook);
      bookPreloader.start();
      updateHash();
    }

    function closeReader() {
      // Save reading progress (skip in preview mode)
      if (currentBook && !previewMode) {
        var status = getBookStatus(currentBook.id) || { maxPage: 0, total: totalPages, completed: false };
        status.maxPage = Math.max(status.maxPage || 0, currentPage);
        status.total = totalPages;
        if (currentPage >= totalPages - 1) {
          status.completed = true;
          status.maxPage = totalPages - 1;
        }
        updateBookStatus(currentBook.id, status);
        // Record daily read activity
        recordDailyRead();
        // Check achievements after saving
        checkAndAwardAchievements();
        // Update stats display
        var completed = getCompletedCount();
        document.getElementById('stats').textContent = allBooks.length + ' 本书 · ' + DATA.levels.length + ' 个级别 · 已读' + completed + '本';
        // Re-render books to show updated status
        renderBooks();
        renderLevelTabs();
      }
      document.getElementById('reader').classList.remove('active');
      document.body.style.overflow = '';
      stopAudio();
      clearTimeout(autoPageTimer);
      clearTimeout(preloadTimer);
      // Clear reader scroll container
      document.getElementById('readerScroll').innerHTML = '';
      // Reset preview mode
      var wasPreview = previewMode;
      previewMode = false;
      previewMaxPage = -1;
      // Only hide the limit overlay element (don't call hideLimitOverlay which shows keyOverlay)
      document.getElementById('limitOverlay').classList.remove('open');
      // If was preview mode, show key overlay and scroll to preview page
      if (wasPreview) { showKeyOverlay(); scrollToPreviewPage(); }
      // Reset next button text
      var nextBtns = document.querySelectorAll('.ctrl-btn');
      for (var bi = 0; bi < nextBtns.length; bi++) {
        if (nextBtns[bi].textContent.indexOf('解锁') >= 0) {
          nextBtns[bi].textContent = '下一页 ▶';
          nextBtns[bi].style.background = '';
        }
      }
      // Stop book preloader and resume background preloader
      if (bookPreloader) { bookPreloader.stop(); bookPreloader = null; }
      if (bgPreloader) bgPreloader.resume();
      currentBook = null;
      location.hash = '';
    }

    var scrollProgrammatic = false;

    function renderPageSlides() {
      var container = document.getElementById('readerScroll');
      container.innerHTML = '';
      var slideHeight = container.clientHeight || window.innerHeight;
      for (var i = 0; i < totalPages; i++) {
        var slide = document.createElement('div');
        slide.className = 'page-slide';
        slide.style.height = slideHeight + 'px';
        slide.setAttribute('data-page', i);
        var img = document.createElement('img');
        img.alt = 'Page ' + (i + 1);
        slide.appendChild(img);
        container.appendChild(slide);
      }
      // Load images for visible range
      loadPageImages(0);
    }

    function loadPageImages(centerPage) {
      var container = document.getElementById('readerScroll');
      var slides = container.children;
      // Load current page and ±2 neighbors
      for (var i = 0; i < slides.length; i++) {
        var slide = slides[i];
        var img = slide.querySelector('img');
        if (!img) continue;
        var dist = Math.abs(i - centerPage);
        if (dist <= 2) {
          var imgUrl = currentBook.imageUrls[i];
          if (!imgUrl) continue;
          if (img.src && !img.src.endsWith('about:blank') && img.dataset.loaded === '1') continue;
          if (preloadedImages[i] && preloadedImages[i].complete) {
            img.src = preloadedImages[i].src || imgUrl;
            img.style.opacity = '1';
            img.dataset.loaded = '1';
          } else if (!img.src || img.src.endsWith('about:blank') || img.src === '') {
            img.src = imgUrl;
            img.style.opacity = '0.3';
            img.dataset.loaded = '0';
            (function (imgEl, url, pageIdx) {
              var newImg = new Image();
              newImg.onload = function () {
                if (imgEl) {
                  imgEl.src = newImg.src;
                  imgEl.style.opacity = '1';
                  imgEl.dataset.loaded = '1';
                }
              };
              newImg.onerror = function () {
                if (imgEl) imgEl.style.opacity = '1';
              };
              newImg.src = url;
            })(img, imgUrl, i);
          }
        } else if (dist > 3) {
          // Unload distant pages to save memory
          if (img.src && !img.src.endsWith('about:blank')) {
            img.src = '';
            img.dataset.loaded = '0';
          }
        }
      }
    }

    function showPage(idx) {
      if (!currentBook) return;
      currentPage = Math.max(0, Math.min(totalPages - 1, idx));
      updateHash();
      // Update reading progress in real-time (skip in preview mode)
      if (!previewMode) {
        var status = getBookStatus(currentBook.id) || { maxPage: 0, total: totalPages, completed: false };
        if (currentPage > status.maxPage) {
          status.maxPage = currentPage;
          status.total = totalPages;
        }
        if (currentPage >= totalPages - 1) {
          status.completed = true;
          status.maxPage = totalPages - 1;
        }
        updateBookStatus(currentBook.id, status);
      }

      // Scroll to target page
      var container = document.getElementById('readerScroll');
      if (container.children[currentPage]) {
        scrollProgrammatic = true;
        container.scrollTop = container.children[currentPage].offsetTop;
        setTimeout(function () { scrollProgrammatic = false; }, 300);
      }
      loadPageImages(currentPage);

      document.getElementById('pageInfo').textContent = (currentPage + 1) + ' / ' + totalPages;
      document.getElementById('progressFill').style.width = ((currentPage + 1) / totalPages * 100) + '%';
      // Preview mode: update next button text
      var nextBtns = document.querySelectorAll('.ctrl-btn');
      for (var bi = 0; bi < nextBtns.length; bi++) {
        if (nextBtns[bi].textContent.indexOf('下一页') >= 0) {
          var isLastPreviewPage = previewMode && (
            (previewMaxPage > 0 && currentPage >= previewMaxPage - 1) ||
            currentPage >= totalPages - 1
          );
          if (isLastPreviewPage) {
            nextBtns[bi].textContent = '解锁继续阅读 ▶';
            nextBtns[bi].style.background = 'var(--accent)';
          } else {
            nextBtns[bi].textContent = '下一页 ▶';
            nextBtns[bi].style.background = '';
          }
        }
      }
      loadAudioForPage(currentPage);
      if (autoPlay && !hasAudio(currentBook.audioUrls, currentBook.imageUrls, currentPage)) {
        clearTimeout(autoPageTimer);
        autoPageTimer = setTimeout(nextPage, 3000);
      }
    }

    function nextPage() {
      var now = Date.now();
      if (now - lastNavTime < NAV_THROTTLE) return;
      lastNavTime = now;
      clearTimeout(autoPageTimer);
      // Preview mode: check page limit
      if (previewMode && previewMaxPage > 0 && currentPage >= previewMaxPage - 1) {
        showLimitOverlay();
        return;
      }
      // Preview mode: reached last page of full-preview book, show unlock
      if (previewMode && currentPage >= totalPages - 1) {
        showLimitOverlay();
        return;
      }
      if (currentPage < totalPages - 1) showPage(currentPage + 1);
      else if (!celebrated && !previewMode) {
        celebrated = true;
        // Save completed status
        var status = getBookStatus(currentBook.id) || { maxPage: 0, total: totalPages, completed: false };
        status.completed = true;
        status.maxPage = totalPages - 1;
        updateBookStatus(currentBook.id, status);
        checkAndAwardAchievements();
        showCelebration();
      }
    }

    function prevPage() {
      var now = Date.now();
      if (now - lastNavTime < NAV_THROTTLE) return;
      lastNavTime = now;
      clearTimeout(autoPageTimer);
      if (currentPage > 0) showPage(currentPage - 1);
    }

    function toggleAutoPlay() {
      autoPlay = !autoPlay;
      var btn = document.getElementById('autoPlayBtn');
      btn.textContent = autoPlay ? '⏸ 自动' : '▶ 自动';
      btn.classList.toggle('active', autoPlay);
      if (autoPlay) {
        if (!hasAudio(currentBook.audioUrls, currentBook.imageUrls, currentPage)) {
          clearTimeout(autoPageTimer);
          autoPageTimer = setTimeout(nextPage, 3000);
        }
      } else clearTimeout(autoPageTimer);
    }

    function loadAudioForPage(pageIdx) {
      stopAudio();
      clearTimeout(autoPageTimer);
      var myLoadId = audioLoadId;
      var url = buildAudioUrl(currentBook, getAudioUrl(currentBook.audioUrls, currentBook.imageUrls, pageIdx));
      if (!url) { document.getElementById('playBtn').textContent = '🔇'; return; }
      if (preloadedAudios[pageIdx]) {
        audioEl = preloadedAudios[pageIdx];
        preloadedAudios[pageIdx] = null;
        // Reset preloaded audio to clean state
        audioEl.currentTime = 0;
        audioEl.onended = null;
        audioEl.ontimeupdate = null;
        audioEl.onloadedmetadata = null;
      }
      else audioEl = new Audio(url);
      // Audio fallback on error
      audioEl.addEventListener('error', function onAudioErr() {
        audioEl.removeEventListener('error', onAudioErr);
        var origUrl = url;
        var nextUrl = tryNextFallback(audioEl, currentBook, origUrl, 'audio', origUrl);
        if (nextUrl) {
          audioEl.src = nextUrl;
          audioEl.load();
          if (autoPlay) {
            function tryAutoPlayFB() {
              if (audioLoadId !== myLoadId) return;
              if (!audioEl) return;
              if (audioEl.readyState >= 2) {
                audioEl.play().catch(function() { setTimeout(tryAutoPlayFB, 300); });
              } else {
                audioEl.addEventListener('canplay', function onCanPlay() {
                  audioEl.removeEventListener('canplay', onCanPlay);
                  if (audioLoadId !== myLoadId) return;
                  audioEl.play().catch(function() { setTimeout(tryAutoPlayFB, 300); });
                });
              }
            }
            tryAutoPlayFB();
          }
        }
      });

      audioEl.addEventListener('timeupdate', updateAudioUI);
      audioEl.addEventListener('loadedmetadata', function () {
        if (audioLoadId !== myLoadId) return;
        document.getElementById('durTime').textContent = formatTime(audioEl.duration);
      });
      audioEl.addEventListener('ended', function () {
        if (audioLoadId !== myLoadId) return;
        document.getElementById('playBtn').textContent = '▶️';
        if (autoPlay) { clearTimeout(autoPageTimer); autoPageTimer = setTimeout(nextPage, 1500); }
      });
      document.getElementById('playBtn').textContent = '▶️';
      if (autoPlay) {
        if (audioEl.readyState >= 2) {
          audioEl.play().catch(function () { });
        } else {
          audioEl.addEventListener('canplay', function onCanPlay() {
            audioEl.removeEventListener('canplay', onCanPlay);
            if (audioLoadId !== myLoadId) return;
            audioEl.play().catch(function () { });
          });
        }
      }
    }

    function toggleAudio() {
      if (!audioEl) return;
      if (audioEl.paused) { audioEl.play().catch(function () { }); document.getElementById('playBtn').textContent = '⏸'; }
      else { audioEl.pause(); document.getElementById('playBtn').textContent = '▶️'; }
    }

    function stopAudio() {
      if (audioEl) {
        audioEl.pause();
        audioEl.removeEventListener('timeupdate', updateAudioUI);
        audioEl.removeAttribute('src');
        audioEl.load();
        audioEl = null;
      }
      audioLoadId++;
    }

    function seekAudio(val) {
      if (!audioEl || !audioEl.duration) return;
      audioEl.currentTime = (val / 100) * audioEl.duration;
    }

    function toggleMute() {
      if (!audioEl) return;
      audioEl.muted = !audioEl.muted;
      document.getElementById('volBtn').textContent = audioEl.muted ? '🔇' : '🔊';
    }

    function updateAudioUI() {
      if (!audioEl || !audioEl.duration) return;
      document.getElementById('curTime').textContent = formatTime(audioEl.currentTime);
      document.getElementById('seekBar').value = (audioEl.currentTime / audioEl.duration) * 100;
    }

    function formatTime(s) {
      if (!s || !isFinite(s)) return '0:00';
      return Math.floor(s / 60) + ':' + Math.floor(s % 60).toString().padStart(2, '0');
    }

    function showCelebration() {
      var el = document.getElementById('celebration');
      document.getElementById('celebBook').textContent = currentBook ? '你读完了《' + currentBook.title + '》' : '';
      // Show quiz button if book has quiz
      var quizBtn = document.getElementById('celebQuizBtn');
      if (currentBook && QUIZ_DATA && QUIZ_DATA[currentBook.id]) {
        quizBtn.style.display = '';
      } else {
        quizBtn.style.display = 'none';
      }
      var colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF8C00'];
      for (var i = 0; i < 30; i++) {
        var c = document.createElement('div');
        c.className = 'confetti';
        c.style.left = Math.random() * 100 + '%';
        c.style.background = colors[i % colors.length];
        c.style.animationDelay = Math.random() * 2 + 's';
        c.style.animationDuration = (2 + Math.random() * 2) + 's';
        c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        c.style.width = (6 + Math.random() * 8) + 'px';
        c.style.height = c.style.borderRadius === '50%' ? c.style.width : (parseInt(c.style.width) * 0.6) + 'px';
        el.appendChild(c);
      }
      el.classList.add('active');
      // Play celebration sound
      playCelebSound();
    }

    function closeCelebration() {
      var el = document.getElementById('celebration');
      el.classList.remove('active');
      el.querySelectorAll('.confetti').forEach(function (c) { c.remove() });
      // Return to book list
      closeReader();
    }

    // ========== Quiz System ==========
    var quizState = {
      bookId: 0,
      bookTitle: '',
      questions: [],
      currentIndex: 0,
      answers: {},       // questionNumber -> 'A'/'B'/'C'/'D'
      isSubmitted: false,
      wrongQs: new Set(),
      redoAnswers: {}    // questionNumber -> new answer for wrong questions
    };

    function getQuizResults() {
      try { return JSON.parse(localStorage.getItem('quiz_results') || '{}'); }
      catch (e) { return {}; }
    }
    function saveQuizResults(results) {
      localStorage.setItem('quiz_results', JSON.stringify(results));
    }
    function getQuizPerfectBooks() {
      try { return JSON.parse(localStorage.getItem('quiz_perfect') || '[]'); }
      catch (e) { return []; }
    }
    function saveQuizPerfectBooks(books) {
      localStorage.setItem('quiz_perfect', JSON.stringify(books));
    }

    function openQuiz() {
      if (!currentBook) return;
      var bookId = currentBook.id;
      var questions = QUIZ_DATA && QUIZ_DATA[bookId];
      if (!questions || !questions.length) return;

      // Close celebration first
      var celEl = document.getElementById('celebration');
      celEl.classList.remove('active');
      celEl.querySelectorAll('.confetti').forEach(function (c) { c.remove() });

      // Init quiz state
      quizState.bookId = bookId;
      quizState.bookTitle = currentBook.title;
      quizState.questions = questions;
      quizState.currentIndex = 0;
      quizState.answers = {};
      quizState.isSubmitted = false;
      quizState.wrongQs = new Set();
      quizState.redoAnswers = {};

      // Check if already submitted before
      var results = getQuizResults();
      var prev = results[bookId];
      if (prev && prev.submitted) {
        quizState.isSubmitted = true;
        quizState.answers = prev.answers || {};
        // Calculate wrong questions
        questions.forEach(function (q) {
          if (quizState.answers[q.n] !== q.ans) quizState.wrongQs.add(q.n);
        });
      }

      // Show quiz overlay
      document.getElementById('quizTitle').textContent = 'Quiz: ' + currentBook.title;
      renderQuizNav();
      renderQuizQuestion();
      updateQuizFooter();
      document.getElementById('quizOverlay').classList.add('active');
      document.getElementById('quizSummary').style.display = 'none';
      document.getElementById('quizWarning').style.display = 'none';

      if (quizState.isSubmitted) {
        showQuizSummary();
      }
    }

    function closeQuiz() {
      document.getElementById('quizOverlay').classList.remove('active');
      // Go back to reader
    }

    function quizBackToShelf() {
      document.getElementById('quizOverlay').classList.remove('active');
      closeReader();
    }

    function renderQuizNav() {
      var nav = document.getElementById('quizNav');
      var html = '';
      quizState.questions.forEach(function (q, i) {
        var cls = 'quiz-dot';
        if (i === quizState.currentIndex) cls += ' current';
        else if (quizState.isSubmitted) {
          if (quizState.wrongQs.has(q.n)) {
            if (quizState.redoAnswers[q.n]) cls += ' redone';
            else cls += ' wrong';
          } else if (quizState.answers[q.n]) cls += ' correct';
        } else if (quizState.answers[q.n]) cls += ' answered';
        html += '<div class="' + cls + '" onclick="goToQuizQ(' + i + ')">' + q.n + '</div>';
      });
      nav.innerHTML = html;
    }

    function renderQuizQuestion() {
      var q = quizState.questions[quizState.currentIndex];
      if (!q) return;
      var body = document.getElementById('quizBody');

      var numHtml = '<div class="quiz-question-num">第 ' + q.n + ' 题';
      if (quizState.isSubmitted && quizState.wrongQs.has(q.n)) {
        numHtml += ' <span class="q-icon" style="color:#D32F2F">&#10007;</span>';
        if (!quizState.redoAnswers[q.n]) numHtml += ' <span style="color:#FF9800;font-size:12px">请重新选择</span>';
      } else if (quizState.isSubmitted && !quizState.wrongQs.has(q.n) && quizState.answers[q.n]) {
        numHtml += ' <span class="q-icon" style="color:#4CAF50">&#10003;</span>';
      }
      numHtml += '</div>';

      var qHtml = '<div class="quiz-question-text">' + escapeHtml(q.q) + '</div>';

      var optsHtml = '';
      var letters = ['A', 'B', 'C', 'D'];
      var optVals = [q.a, q.b, q.c, q.d];
      var currentAnswer = quizState.redoAnswers[q.n] || quizState.answers[q.n];

      for (var i = 0; i < 4; i++) {
        if (!optVals[i] && optVals[i] !== '') continue;
        var optCls = 'quiz-option';
        var iconHtml = '';
        if (quizState.isSubmitted) {
          if (letters[i] === q.ans) {
            optCls += ' correct-opt';
            iconHtml = '<span class="quiz-option-icon" style="color:#4CAF50">&#10003;</span>';
          }
          if (currentAnswer === letters[i] && letters[i] !== q.ans) {
            optCls += ' wrong-opt';
            iconHtml = '<span class="quiz-option-icon" style="color:#D32F2F">&#10007;</span>';
          }
        }
        if (currentAnswer === letters[i]) optCls += ' selected';

        var onclick = quizState.isSubmitted
          ? (quizState.wrongQs.has(q.n) ? ' onclick="selectRedoAnswer(' + q.n + ',\'' + letters[i] + '\')"' : '')
          : ' onclick="selectQuizAnswer(' + q.n + ',\'' + letters[i] + '\')"';

        optsHtml += '<div class="' + optCls + '"' + onclick + '>' +
          '<div class="quiz-option-letter">' + letters[i] + '</div>' +
          '<div class="quiz-option-text">' + escapeHtml(optVals[i] || '') + '</div>' +
          iconHtml +
          '</div>';
      }

      body.innerHTML = numHtml + qHtml + optsHtml;
    }

    function selectQuizAnswer(qNum, answer) {
      if (quizState.isSubmitted) return;
      quizState.answers[qNum] = answer;
      renderQuizNav();
      renderQuizQuestion();
      updateQuizFooter();
      // Auto-advance to next unanswered question
      var nextIdx = -1;
      for (var i = quizState.currentIndex + 1; i < quizState.questions.length; i++) {
        if (!quizState.answers[quizState.questions[i].n]) { nextIdx = i; break; }
      }
      if (nextIdx >= 0) {
        quizState.currentIndex = nextIdx;
        renderQuizNav();
        renderQuizQuestion();
        updateQuizFooter();
      }
    }

    function selectRedoAnswer(qNum, answer) {
      if (!quizState.isSubmitted || !quizState.wrongQs.has(qNum)) return;
      quizState.redoAnswers[qNum] = answer;
      renderQuizNav();
      renderQuizQuestion();
      updateQuizFooter();
    }

    function goToQuizQ(idx) {
      quizState.currentIndex = idx;
      renderQuizNav();
      renderQuizQuestion();
      updateQuizFooter();
    }

    function quizPrevQ() {
      if (quizState.currentIndex > 0) {
        quizState.currentIndex--;
        renderQuizNav();
        renderQuizQuestion();
        updateQuizFooter();
      }
    }

    function quizNextQ() {
      if (quizState.currentIndex < quizState.questions.length - 1) {
        quizState.currentIndex++;
        renderQuizNav();
        renderQuizQuestion();
        updateQuizFooter();
      }
    }

    function updateQuizFooter() {
      var prevBtn = document.getElementById('quizPrev');
      var nextBtn = document.getElementById('quizNext');
      var submitBtn = document.getElementById('quizSubmit');
      var redoBtn = document.getElementById('quizRedo');
      var backBtn = document.getElementById('quizBackShelf');

      prevBtn.disabled = quizState.currentIndex === 0;
      nextBtn.disabled = quizState.currentIndex === quizState.questions.length - 1;

      if (quizState.isSubmitted) {
        submitBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        prevBtn.style.display = 'none';
        // Show redo if there are wrong questions with redo answers
        var hasRedo = Object.keys(quizState.redoAnswers).length > 0;
        redoBtn.style.display = hasRedo ? '' : 'none';
        backBtn.style.display = '';
      } else {
        // Show submit if all answered
        var allAnswered = quizState.questions.every(function (q) { return quizState.answers[q.n]; });
        submitBtn.style.display = allAnswered ? '' : 'none';
        redoBtn.style.display = 'none';
        backBtn.style.display = 'none';
        prevBtn.style.display = '';
        nextBtn.style.display = '';
      }
    }

    function submitQuiz() {
      // Check all answered
      var unanswered = [];
      quizState.questions.forEach(function (q) {
        if (!quizState.answers[q.n]) unanswered.push(q.n);
      });
      if (unanswered.length > 0) {
        var warnEl = document.getElementById('quizWarning');
        warnEl.textContent = '还有 ' + unanswered.length + ' 题未作答：第 ' + unanswered.join(', ') + ' 题';
        warnEl.style.display = '';
        return;
      }

      document.getElementById('quizWarning').style.display = 'none';

      // Grade
      quizState.isSubmitted = true;
      quizState.wrongQs = new Set();
      var correct = 0;
      quizState.questions.forEach(function (q) {
        if (quizState.answers[q.n] === q.ans) correct++;
        else quizState.wrongQs.add(q.n);
      });

      var perfect = quizState.wrongQs.size === 0;

      // Save results
      var results = getQuizResults();
      results[quizState.bookId] = {
        answers: quizState.answers,
        submitted: true,
        perfectScore: perfect,
        correct: correct,
        total: quizState.questions.length
      };
      saveQuizResults(results);

      // Save perfect books
      if (perfect) {
        var perfectBooks = getQuizPerfectBooks();
        if (perfectBooks.indexOf(quizState.bookId) === -1) {
          perfectBooks.push(quizState.bookId);
          saveQuizPerfectBooks(perfectBooks);
        }
        // Check quiz achievements
        checkQuizAchievements(perfectBooks.length);
      }

      showQuizSummary();
      renderQuizNav();
      renderQuizQuestion();
      updateQuizFooter();
    }

    function submitRedo() {
      // Merge redo answers into main answers
      Object.keys(quizState.redoAnswers).forEach(function (qNum) {
        quizState.answers[qNum] = quizState.redoAnswers[qNum];
      });
      quizState.redoAnswers = {};

      // Re-grade
      quizState.wrongQs = new Set();
      var correct = 0;
      quizState.questions.forEach(function (q) {
        if (quizState.answers[q.n] === q.ans) correct++;
        else quizState.wrongQs.add(q.n);
      });

      var perfect = quizState.wrongQs.size === 0;

      // Save
      var results = getQuizResults();
      results[quizState.bookId] = {
        answers: quizState.answers,
        submitted: true,
        perfectScore: perfect,
        correct: correct,
        total: quizState.questions.length
      };
      saveQuizResults(results);

      if (perfect) {
        var perfectBooks = getQuizPerfectBooks();
        if (perfectBooks.indexOf(quizState.bookId) === -1) {
          perfectBooks.push(quizState.bookId);
          saveQuizPerfectBooks(perfectBooks);
        }
        checkQuizAchievements(perfectBooks.length);
      }

      showQuizSummary();
      renderQuizNav();
      renderQuizQuestion();
      updateQuizFooter();
    }

    function showQuizSummary() {
      var summaryEl = document.getElementById('quizSummary');
      var correct = quizState.questions.length - quizState.wrongQs.size;
      var total = quizState.questions.length;
      if (quizState.wrongQs.size === 0) {
        summaryEl.className = 'quiz-summary perfect';
        summaryEl.innerHTML = '&#11088; 全部正确！ ' + correct + '/' + total + ' 题答对';
      } else {
        summaryEl.className = 'quiz-summary has-wrong';
        summaryEl.innerHTML = '&#128200; 得分：' + correct + '/' + total + '，有 ' + quizState.wrongQs.size + ' 题答错，点击红色题号可重新选择';
      }
      summaryEl.style.display = '';
    }

    function checkQuizAchievements(perfectCount) {
      var milestones = [1, 5, 10, 25, 50, 100];
      var names = ['Quiz新手', '答题小能手', 'Quiz达人', '知识之星', '阅读大师', '终极学者'];
      var icons = ['💡', '🎯', '🏆', '🌟', '👑', '🔥'];
      var colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#FFD700', '#D50000'];
      var ach = getAchievements();
      var newAch = [];
      milestones.forEach(function (m, i) {
        var key = 'quiz_' + m;
        if (perfectCount >= m && !ach[key]) {
          ach[key] = { date: new Date().toISOString(), name: names[i], icon: icons[i], color: colors[i] };
          newAch.push(names[i]);
        }
      });
      saveAchievements(ach);
      if (newAch.length > 0) {
        for (var k = 0; k < newAch.length; k++) {
          _achQueue.push(newAch[k]);
        }
        if (!_achTimer) {
          _achTimer = setTimeout(flushAchQueue, 2000);
        }
      }
    }

    // ========== Profile Overlay ==========
    var QUIZ_ACH_MILESTONES = [1, 5, 10, 25, 50, 100];
    var QUIZ_ACH_NAMES = { 1: 'Quiz新手', 5: '答题小能手', 10: 'Quiz达人', 25: '知识之星', 50: '阅读大师', 100: '终极学者' };
    var QUIZ_ACH_ICONS = { 1: '💡', 5: '🎯', 10: '🏆', 25: '🌟', 50: '👑', 100: '🔥' };
    var QUIZ_ACH_COLORS = { 1: '#4CAF50', 5: '#2196F3', 10: '#FF9800', 25: '#9C27B0', 50: '#FFD700', 100: '#D50000' };

    function showProfileOverlay() {
      var ach = getAchievements();
      var completed = getCompletedCount();
      var totalBooks = DATA.books.length;
      var perfectBooks = getQuizPerfectBooks();
      var unlockedAch = Object.keys(ach).length;
      // Total: count(14) + level(29) + quiz(6) + lifetime(1) + exploration(4) + group(4) + pct(4) + quizVol(5) + quizStreak(3) + daily(5) + time(3) = 78
      var totalAch = 14 + 29 + 6 + 1 + 4 + 4 + 4 + 5 + 3 + 5 + 3;
      var name = localStorage.getItem(UN_KEY) || '读者';
      var pct = totalBooks > 0 ? Math.round(completed / totalBooks * 100) : 0;
      var dailyStreak = getDailyReadStreak();

      var html = '';
      // Greeting
      html += '<div class="profile-greeting">' + escapeHtml(name) + '的阅读之旅</div>';
      // Stats row
      html += '<div class="profile-stats-row">';
      html += '<div class="profile-stat-card"><div class="stat-icon">📖</div><div class="stat-value">' + completed + '/' + totalBooks + '</div><div class="stat-label">已读完</div></div>';
      html += '<div class="profile-stat-card"><div class="stat-icon">🏆</div><div class="stat-value">' + unlockedAch + '/' + totalAch + '</div><div class="stat-label">成就</div></div>';
      html += '<div class="profile-stat-card"><div class="stat-icon">⭐</div><div class="stat-value">' + perfectBooks.length + '</div><div class="stat-label">Quiz满分</div></div>';
      html += '</div>';
      // Extra stats row
      html += '<div class="profile-stats-row">';
      html += '<div class="profile-stat-card"><div class="stat-icon">🔥</div><div class="stat-value">' + dailyStreak + '</div><div class="stat-label">连续阅读天</div></div>';
      html += '<div class="profile-stat-card"><div class="stat-icon">🧭</div><div class="stat-value">' + getLevelsReadCount() + '/' + LEVEL_ORDER.length + '</div><div class="stat-label">探索级别</div></div>';
      html += '</div>';
      // Progress bar
      html += '<div class="profile-progress-section">';
      html += '<div class="profile-progress-label">总体进度 ' + pct + '%</div>';
      html += '<div class="profile-progress-bar"><div class="profile-progress-fill" style="width:' + pct + '%"></div></div>';
      html += '</div>';

      // Helper to render achievement grid
      function achGrid(title, defs) {
        var h = '<div class="profile-section-title">' + title + '</div><div class="profile-ach-grid">';
        for (var i = 0; i < defs.length; i++) {
          var d = defs[i];
          var u = !!ach[d.key];
          h += '<div class="profile-ach-card ' + (u ? 'unlocked' : 'locked') + '" style="' + (u ? 'background:' + d.color + '15;border-color:' + d.color + '40' : '') + '">';
          h += '<div class="ach-icon">' + d.icon + '</div>';
          h += '<div class="ach-name">' + d.name + '</div>';
          h += '<div class="ach-desc">' + (d.desc || '') + '</div>';
          if (u && ach[d.key].date) { var dd = new Date(ach[d.key].date); h += '<div class="ach-date">' + (dd.getMonth() + 1) + '/' + dd.getDate() + '</div>'; }
          h += '</div>';
        }
        h += '</div>';
        return h;
      }

      // Count achievements
      var countDefs = COUNT_MILESTONES.map(function(m) {
        return { key: 'count_' + m, name: COUNT_ACH_NAMES[m], icon: COUNT_ACH_ICONS[m], color: COUNT_ACH_COLORS[m], desc: COUNT_ACH_DESCS[m] };
      });
      html += achGrid('📖 阅读数量成就', countDefs);

      // Level achievements - each with unique icon and color
      var levelDefs = LEVEL_ORDER.map(function(lv) {
        return { key: 'level_' + lv, name: 'Lv.' + lv, icon: LEVEL_ACH_ICONS[lv] || '🎯', color: LEVEL_ACH_COLORS[lv] || '#4a6fa5', desc: '读完Level ' + lv + '全部书籍' };
      });
      html += achGrid('🔤 级别通关成就', levelDefs);

      // Quiz achievements
      var quizDefs = QUIZ_ACH_MILESTONES.map(function(qm) {
        return { key: 'quiz_' + qm, name: QUIZ_ACH_NAMES[qm], icon: QUIZ_ACH_ICONS[qm], color: QUIZ_ACH_COLORS[qm], desc: qm + '本Quiz全对' };
      });
      html += achGrid('💡 Quiz满分成就', quizDefs);

      // Exploration achievements
      html += achGrid('🧭 探索广度成就', [
        { key: 'explore_5', name: '探索新手', icon: '🧭', color: '#00BCD4', desc: '读过5个不同级别' },
        { key: 'explore_10', name: '级别旅行家', icon: '🗺️', color: '#009688', desc: '读过10个不同级别' },
        { key: 'explore_20', name: '环球读者', icon: '🌏', color: '#4CAF50', desc: '读过20个不同级别' },
        { key: 'explore_all', name: '全级别探索者', icon: '🚀', color: '#FF6F00', desc: '读过全部29个级别' }
      ]);

      // Level group achievements
      html += achGrid('🐣 级别组通关', [
        { key: 'group_early', name: '初级通关', icon: '🐣', color: '#8BC34A', desc: '读完aa-C全部书籍' },
        { key: 'group_mid', name: '中级通关', icon: '🐥', color: '#FF9800', desc: '读完D-J全部书籍' },
        { key: 'group_upper', name: '高级通关', icon: '🦅', color: '#E91E63', desc: '读完K-P全部书籍' },
        { key: 'group_adv', name: '进阶通关', icon: '🦉', color: '#9C27B0', desc: '读完Q-Z2全部书籍' }
      ]);

      // Completion percentage achievements
      html += achGrid('🥉 完成度成就', [
        { key: 'pct_25', name: '四分之一', icon: '🥉', color: '#CD7F32', desc: '读完25%的书籍' },
        { key: 'pct_50', name: '半程达人', icon: '🥈', color: '#C0C0C0', desc: '读完50%的书籍' },
        { key: 'pct_75', name: '四分之三', icon: '🥇', color: '#FFD700', desc: '读完75%的书籍' },
        { key: 'pct_90', name: '九成大师', icon: '💎', color: '#B9F2FF', desc: '读完90%的书籍' }
      ]);

      // Quiz volume achievements
      html += achGrid('📝 Quiz参与成就', [
        { key: 'quiz_vol_10', name: 'Quiz参与者', icon: '✍️', color: '#795548', desc: '完成10次Quiz' },
        { key: 'quiz_vol_25', name: 'Quiz常客', icon: '✏️', color: '#607D8B', desc: '完成25次Quiz' },
        { key: 'quiz_vol_50', name: 'Quiz爱好者', icon: '📋', color: '#009688', desc: '完成50次Quiz' },
        { key: 'quiz_vol_100', name: 'Quiz狂人', icon: '📊', color: '#673AB7', desc: '完成100次Quiz' },
        { key: 'quiz_vol_all', name: 'Quiz全勤', icon: '🎓', color: '#D50000', desc: '完成全部760次Quiz' }
      ]);

      // Quiz streak achievements
      html += achGrid('🔥 Quiz连胜成就', [
        { key: 'quiz_streak_3', name: '三连满分', icon: '🔥', color: '#FF5722', desc: '连续3次Quiz满分' },
        { key: 'quiz_streak_5', name: '五连满分', icon: '💥', color: '#E91E63', desc: '连续5次Quiz满分' },
        { key: 'quiz_streak_10', name: '十连满分', icon: '⚡', color: '#D50000', desc: '连续10次Quiz满分' }
      ]);

      // Daily streak achievements
      html += achGrid('📅 连续阅读成就', [
        { key: 'daily_3', name: '三日坚持', icon: '🌱', color: '#8BC34A', desc: '连续3天阅读' },
        { key: 'daily_7', name: '一周不间断', icon: '🌿', color: '#4CAF50', desc: '连续7天阅读' },
        { key: 'daily_14', name: '两周坚持', icon: '🌳', color: '#2E7D32', desc: '连续14天阅读' },
        { key: 'daily_30', name: '月度阅读家', icon: '🏔️', color: '#1B5E20', desc: '连续30天阅读' },
        { key: 'daily_100', name: '百日阅读传奇', icon: '🌟', color: '#FFD700', desc: '连续100天阅读' }
      ]);

      // Time-of-day achievements
      html += achGrid('⏰ 特殊时段成就', [
        { key: 'early_bird', name: '早起鸟儿', icon: '🌅', color: '#FF9800', desc: '早上6-8点读完一本书' },
        { key: 'night_owl', name: '夜猫子', icon: '🦉', color: '#3F51B5', desc: '晚上9点后读完一本书' },
        { key: 'weekend_warrior', name: '周末战士', icon: '⚔️', color: '#9C27B0', desc: '周末读完一本书' }
      ]);

      // Lifetime achievement
      html += achGrid('🏅 终极成就', [
        { key: 'lifetime_all', name: '全部读完！', icon: '🏅', color: '#D50000', desc: '读完全部796本书' }
      ]);

      // Reset section
      html += '<div style="margin-top:32px;padding-top:16px;border-top:1px solid var(--border)">';
      html += '<button onclick="showInitConfirm()" style="background:none;border:1px solid #D32F2F;color:#D32F2F;padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer;width:100%">重置阅读器</button>';
      html += '<div style="font-size:11px;color:var(--text2);margin-top:4px;text-align:center">清空所有阅读记录、成就和密钥</div>';
      html += '</div>';

      document.getElementById('profileBody').innerHTML = html;
      document.getElementById('profileOverlay').classList.add('active');
      history.replaceState(null, '', '#profile');
    }

    function hideProfileOverlay() {
      document.getElementById('profileOverlay').classList.remove('active');
      updateHash();
    }

    // ========== Theme System ==========
    var THEME_KEY = 'raz_theme';
    var THEMES = [
      { id: 'default', name: '默认蓝', desc: '经典蓝灰色调', color: '#4a6fa5' },
      { id: 'coral', name: '珊瑚红', desc: '暖色系，珊瑚色调', color: '#FF6B6B' },
      { id: 'ocean', name: '海洋蓝', desc: '冷色系，蓝色调', color: '#3B82F6' },
      { id: 'forest', name: '森林绿', desc: '自然系，绿色调', color: '#22C55E' }
    ];

    function getCurrentTheme() {
      return localStorage.getItem(THEME_KEY) || 'default';
    }

    function applyTheme(themeId) {
      if (themeId === 'default') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', themeId);
      }
      localStorage.setItem(THEME_KEY, themeId);
      // Update favicon color
      var theme = THEMES.find(function (t) { return t.id === themeId; });
      var primaryColor = theme ? theme.color : '#4a6fa5';
      var favicon = document.querySelector('link[rel="icon"]');
      if (favicon) {
        favicon.href = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect rx='20' width='100' height='100' fill='" + primaryColor + "'/><text x='50' y='72' font-size='60' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='bold'>R</text></svg>";
      }
    }

    function showThemeDialog() {
      var current = getCurrentTheme();
      var html = '';
      THEMES.forEach(function (t) {
        var isActive = t.id === current;
        html += '<div class="theme-option ' + (isActive ? 'active' : '') + '" onclick="selectTheme(\'' + t.id + '\')">';
        html += '<div class="theme-swatch" style="background:' + t.color + '"></div>';
        html += '<div class="theme-option-info"><div class="theme-option-name">' + t.name + '</div><div class="theme-option-desc">' + t.desc + '</div></div>';
        html += '<div class="theme-option-check">' + (isActive ? '&#10003;' : '') + '</div>';
        html += '</div>';
      });
      document.getElementById('themeOptions').innerHTML = html;
      document.getElementById('themeDialogOverlay').classList.add('active');
      history.replaceState(null, '', '#theme');
    }

    function hideThemeDialog() {
      document.getElementById('themeDialogOverlay').classList.remove('active');
      updateHash();
    }

    function selectTheme(themeId) {
      applyTheme(themeId);
      hideThemeDialog();
    }

    // Apply saved theme on load
    (function () {
      var saved = getCurrentTheme();
      if (saved && saved !== 'default') {
        applyTheme(saved);
      }
    })();

    window.addEventListener('hashchange', function () {
      if (isNavigating) return;
      var pos = parseHash();
      if (!pos) {
        // Hash cleared - close any overlays
        if (document.getElementById('profileOverlay').classList.contains('active')) hideProfileOverlay();
        if (document.getElementById('themeDialogOverlay').classList.contains('active')) hideThemeDialog();
        if (currentBook) closeReader();
        return;
      }
      if (pos.type === 'book') {
        if (currentBook && currentBook.id === pos.bookId) showPage(pos.page);
        else if (!currentBook) openBook(pos.bookId, pos.page);
      } else if (pos.type === 'nav') {
        handleHashNav();
      }
    });

    var touchStartX = 0, touchStartY = 0;
    document.getElementById('readerMain').addEventListener('touchstart', function (e) { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }, { passive: true });
    document.getElementById('readerMain').addEventListener('touchend', function (e) {
      // Horizontal swipe still triggers page navigation
      var dx = e.changedTouches[0].clientX - touchStartX;
      var dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) { if (dx < 0) nextPage(); else prevPage(); }
    }, { passive: true });

    // Scroll-based page detection for reader
    var scrollDebounce = null;
    document.getElementById('readerScroll').addEventListener('scroll', function () {
      if (scrollProgrammatic) return;
      clearTimeout(scrollDebounce);
      scrollDebounce = setTimeout(function () {
        if (!currentBook) return;
        var container = document.getElementById('readerScroll');
        var slides = container.children;
        var scrollTop = container.scrollTop;
        var slideHeight = container.clientHeight;
        if (slideHeight <= 0) return;
        var newPage = Math.round(scrollTop / slideHeight);
        newPage = Math.max(0, Math.min(totalPages - 1, newPage));
        if (newPage !== currentPage) {
          currentPage = newPage;
          updateHash();
          // Update progress
          if (!previewMode) {
            var status = getBookStatus(currentBook.id) || { maxPage: 0, total: totalPages, completed: false };
            if (currentPage > status.maxPage) { status.maxPage = currentPage; status.total = totalPages; }
            if (currentPage >= totalPages - 1) { status.completed = true; status.maxPage = totalPages - 1; }
            updateBookStatus(currentBook.id, status);
          }
          document.getElementById('pageInfo').textContent = (currentPage + 1) + ' / ' + totalPages;
          document.getElementById('progressFill').style.width = ((currentPage + 1) / totalPages * 100) + '%';
          // Preview mode: update next button text
          var nextBtns = document.querySelectorAll('.ctrl-btn');
          for (var bi = 0; bi < nextBtns.length; bi++) {
            if (nextBtns[bi].textContent.indexOf('下一页') >= 0) {
              var isLastPreviewPage = previewMode && (
                (previewMaxPage > 0 && currentPage >= previewMaxPage - 1) ||
                currentPage >= totalPages - 1
              );
              if (isLastPreviewPage) {
                nextBtns[bi].textContent = '解锁继续阅读 ▶';
                nextBtns[bi].style.background = 'var(--accent)';
              } else {
                nextBtns[bi].textContent = '下一页 ▶';
                nextBtns[bi].style.background = '';
              }
            }
          }
          loadAudioForPage(currentPage);
          loadPageImages(currentPage);
          if (autoPlay && !hasAudio(currentBook.audioUrls, currentBook.imageUrls, currentPage)) {
            clearTimeout(autoPageTimer);
            autoPageTimer = setTimeout(nextPage, 3000);
          }
        }
      }, 150);
    });

    // Handle window resize: recalculate slide heights
    window.addEventListener('resize', function () {
      if (!currentBook) return;
      var container = document.getElementById('readerScroll');
      var slideHeight = container.clientHeight || window.innerHeight;
      var slides = container.children;
      for (var i = 0; i < slides.length; i++) {
        slides[i].style.height = slideHeight + 'px';
      }
    });

    // Click reader main area to toggle play/pause (excluding left/right 90px nav zones)
    document.getElementById('readerMain').addEventListener('click', function (e) {
      if (!currentBook) return;
      var rect = this.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var w = rect.width;
      // Exclude left 90px and right 90px (nav arrow zones)
      if (x < 90 || x > w - 90) return;
      togglePlayPause();
    });

    // Keyboard: Space toggles play/pause, arrows navigate pages
    document.addEventListener('keydown', function (e) {
      if (!currentBook) return;
      if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault(); nextPage();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); prevPage();
      } else if (e.key === 'Escape') {
        closeReader();
      }
    });

    // Key input Enter handler
    document.getElementById('keyInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitKey();
    });
    // Name input Enter handler
    document.getElementById('nameInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitName();
    });

    init();

// Show fallback mode indicator
if (FALLBACK_MODE > 0) {
  var badge = document.createElement('div');
  badge.textContent = 'FB:' + FALLBACK_MODE;
  badge.style.cssText = 'position:fixed;top:4px;right:4px;background:rgba(0,0,0,0.7);color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;z-index:99999;pointer-events:none;';
  document.body.appendChild(badge);
}

  