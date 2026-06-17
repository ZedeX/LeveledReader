      // ========== Early Verification Script (loads before DATA) ==========
    var AK_KEY = 'raz_access_key';
    var UN_KEY = 'raz_user_name';
    // ========== Device Code & Key Validation (Time-Window) ==========
    var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var TIME_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
    var QR_CODE_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQAQMAAAC6caSPAAAABlBMVEX///8AAABVwtN+AAAACXBIWXMAAA7EAAAOxAGVKw4bAAACG0lEQVR4nO3cO27DMAwGYAYdMvYIOYqPZh8tR/ERMnYIzJoPUZTboRmMMsDPpYakzxMtUI+U6PWYucciDdNGV15pfmo3f9GNl480aAMBOZ88W4Jq10OIPO/xGNpbGoOAVCWf0q9J7s2a/EZa8u+vklErCMg7EJ2u0zQ+sb0DBOQfCe3PdxkTz39IfhCQIsTDk/9+YY9xTvYAASlKuEerk30az8nfAwSkJDmET+k9rvKq4ygQkHNJy2TJWA2dk9eoOviY1SAgpQnHKs/mZPKa2TclJCzzNxCQisTCauNeXWjoKk8/CvsQaAgQkPOIb51pRTH7OUUqeimWdRybFSAgBQlRqyLYk3w8ffP5WYI5nkFAyhHdRrM2216LLTVp5xQ2ZgMBqUhm7RoLkuPU3fmqCgTkZEL5PMKXb7lda+aok626AAEpSCQmbsnvCU9RJ6dNCe4FCQhINTLHOTINd3gon7hZ2EpwAwEpSjzJOS605xUf2S6cxjWSHwTkfMJ+pUEGttO3cSMiX0UDAalK9mH9OGNrXTHMw2rmDQSkIhki18ncnn2VN3kDCMj5pHVJLGlTIm9ELLkYJhCQkiTfTte/F03+gcjDFFtqICA1Sf7tW9znWeJU7ta+jcZBQN6E6Iov3+2xr8Paf/zwEwTkfNLC+KG6+D2TQUBKEI9O8jUzX/H114KA1CTcY8n/8MHbdB/DP5DfF4kgIBXI6/ENowsLuI0aPi0AAAAASUVORK5CYII=';

    // ========== Device Parameters (Stable, Unique) ==========
    // DJB2 hash helper
    function djb2Hash(str) {
      var hash = 0;
      for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash);
    }

    // Canvas fingerprint: render text+shapes, hash pixel data
    // Note: Firefox RFP (Resist Fingerprinting) randomizes canvas pixels.
    // We detect this by rendering twice and comparing; if unstable, return ''.
    function getCanvasFingerprint() {
      try {
        function renderOnce() {
          var canvas = document.createElement('canvas');
          canvas.width = 240;
          canvas.height = 60;
          var ctx = canvas.getContext('2d');
          if (!ctx) return null;
          var grad = ctx.createLinearGradient(0, 0, 240, 60);
          grad.addColorStop(0, '#f60');
          grad.addColorStop(1, '#06f');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 240, 60);
          ctx.textBaseline = 'top';
          ctx.font = '16px "Arial"';
          ctx.fillStyle = '#fff';
          ctx.fillText('RazReader fp test 📖', 4, 4);
          ctx.font = '12px "Courier New"';
          ctx.fillStyle = '#0f0';
          ctx.fillText('CanvasFP v2.0', 4, 30);
          ctx.beginPath();
          ctx.arc(200, 30, 15, 0, Math.PI * 2);
          ctx.strokeStyle = '#ff0';
          ctx.lineWidth = 2;
          ctx.stroke();
          var imageData = ctx.getImageData(0, 0, 240, 60).data;
          return djb2Hash(String.fromCharCode.apply(null, imageData.subarray(0, 2400))).toString(16);
        }
        var hash1 = renderOnce();
        var hash2 = renderOnce();
        if (!hash1 || !hash2) return '';
        // If two renders produce different hashes, canvas is randomized (e.g. Firefox RFP)
        if (hash1 !== hash2) return '';
        return hash1;
      } catch (e) {
        return '';
      }
    }

    // Audio fingerprint: oscillator+analyser, hash frequency data
    function getAudioFingerprint() {
      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return '';
        var ctx = new AudioCtx();
        var osc = ctx.createOscillator();
        var analyser = ctx.createAnalyser();
        var gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 1000;
        gain.gain.value = 0;
        osc.connect(analyser);
        analyser.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        var data = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(data);
        osc.stop();
        ctx.close();
        // Hash first 100 values
        var str = '';
        for (var i = 0; i < 100; i++) str += data[i].toFixed(6);
        return djb2Hash(str).toString(16);
      } catch (e) {
        return '';
      }
    }

    // WebGL fingerprint: GPU renderer + key parameters
    function getWebGLFingerprint() {
      try {
        var canvas = document.createElement('canvas');
        var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return '';
        var parts = [];
        // GPU renderer
        var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          parts.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
          parts.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '');
        }
        // Key WebGL parameters that vary by driver/hardware
        parts.push(gl.getParameter(gl.MAX_TEXTURE_SIZE));
        parts.push(gl.getParameter(gl.MAX_VIEWPORT_DIMS).join('x'));
        parts.push(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
        parts.push(gl.getParameter(gl.MAX_VERTEX_ATTRIBS));
        parts.push(gl.getParameter(gl.MAX_VARYING_VECTORS));
        parts.push(gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS));
        parts.push(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS));
        parts.push(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE).join('x'));
        parts.push(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE).join('x'));
        // Extensions list
        var exts = gl.getSupportedExtensions() || [];
        parts.push(exts.sort().join(','));
        return djb2Hash(parts.join('|')).toString(16);
      } catch (e) {
        return '';
      }
    }

    function getDeviceParams() {
      // Core hardware params (widely supported, stable)
      var cpuCores = navigator.hardwareConcurrency || 0;
      var touchPoints = navigator.maxTouchPoints || 0;
      var lang = navigator.language || '';
      var langs = (navigator.languages && navigator.languages.join(',')) || lang;
      
      // Precise timezone
      var tz = '';
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      } catch (e) {
        tz = String(new Date().getTimezoneOffset());
      }
      
      // Platform info (fallback)
      var platform = navigator.platform || '';
      
      // Advanced fingerprints (each with graceful fallback)
      var canvasFp = getCanvasFingerprint();
      var audioFp = getAudioFingerprint();
      var webglFp = getWebGLFingerprint();
      
      return {
        ua: navigator.userAgent || '',
        cpuCores: cpuCores,
        touchPoints: touchPoints,
        langs: langs,
        tz: tz,
        platform: platform,
        canvasFp: canvasFp,
        audioFp: audioFp,
        webglFp: webglFp
      };
    }
    
    function buildFingerprintString(params) {
      return params.ua + '|' + params.cpuCores + '|' + params.touchPoints + '|' + params.langs + '|' + params.tz + '|' + params.platform + '|' + params.canvasFp + '|' + params.audioFp + '|' + params.webglFp;
    }

    function getTimeSlot() {
      return Math.floor(Date.now() / TIME_WINDOW_MS);
    }

    function generateDeviceCode() {
      var timeSlot = getTimeSlot();
      var params = getDeviceParams();
      var raw = buildFingerprintString(params) + '|' + timeSlot;
      var hash = 0;
      for (var i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash) + raw.charCodeAt(i);
        hash |= 0;
      }
      var code = Math.abs(hash).toString(36).toUpperCase().slice(0, 8);
      while (code.length < 8) code = '0' + code;
      return code;
    }

    function generateDeviceCodeForSlot(slot) {
      var params = getDeviceParams();
      var raw = buildFingerprintString(params) + '|' + slot;
      var hash = 0;
      for (var i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash) + raw.charCodeAt(i);
        hash |= 0;
      }
      var code = Math.abs(hash).toString(36).toUpperCase().slice(0, 8);
      while (code.length < 8) code = '0' + code;
      return code;
    }

    function validateKey(key, deviceCode) {
      if (!key || key.length !== 8) return false;
      // Validate key format
      for (var i = 0; i < 8; i++) {
        if (CHARS.indexOf(key[i]) === -1) return false;
      }
      // Compute checksums
      var sumA = 0;
      var xorVal = 0;
      for (var i = 0; i < 6; i++) {
        var idx = CHARS.indexOf(key[i]);
        sumA += idx * (i + 3);
        xorVal ^= (idx * 7 + i * 13) & 0xFF;
      }
      var checkA = sumA % 36;
      var expectedA = CHARS[checkA];
      // Device-tied checksum
      var dcSum = 0;
      for (var j = 0; j < deviceCode.length; j++) {
        dcSum += deviceCode.charCodeAt(j) * (j + 1);
      }
      var checkB = (xorVal ^ (dcSum & 0xFF)) % 36;
      if (checkB < 0) checkB += 36;
      var expectedB = CHARS[checkB];
      return key[6] === expectedA && key[7] === expectedB;
    }

    function validateKeyWithTimeWindow(key) {
      // Try current time slot
      var dc0 = generateDeviceCodeForSlot(getTimeSlot());
      if (validateKey(key, dc0)) return dc0;
      // Try previous time slot (for edge cases near boundary)
      var dc1 = generateDeviceCodeForSlot(getTimeSlot() - 1);
      if (validateKey(key, dc1)) return dc1;
      return null;
    }

    // ========== Key Overlay ==========
    function showKeyOverlay() {
      var dc = generateDeviceCode();
      document.getElementById('deviceCodeDisplay').textContent = dc;
      document.getElementById('keyOverlay').classList.add('open');
      document.getElementById('keyInput').value = '';
      document.getElementById('keyError').textContent = '';
      var qrImg = document.getElementById('qrCodeImg');
      if (qrImg && !qrImg.src) qrImg.src = QR_CODE_B64;
      // Scroll to top (preview page) by default
      var overlay = document.getElementById('keyOverlay');
      if (overlay) overlay.scrollTop = 0;
    }
    // Auto-focus keyInput when user scrolls to verification page
    (function () {
      var keyOverlayEl = document.getElementById('keyOverlay');
      var keyInputFocused = false;
      if (keyOverlayEl) {
        keyOverlayEl.addEventListener('scroll', function () {
          var page2 = document.getElementById('keyPage2');
          if (!page2 || keyInputFocused) return;
          if (keyOverlayEl.scrollTop >= page2.offsetTop - 100) {
            keyInputFocused = true;
            setTimeout(function () {
              document.getElementById('keyInput').focus();
              // Reset after a while so it can focus again if needed
              setTimeout(function () { keyInputFocused = false; }, 2000);
            }, 300);
          }
        });
      }
    })();
    function hideKeyOverlay() {
      document.getElementById('keyOverlay').classList.remove('open');
      // Hide preview page for verified users
      var p1 = document.getElementById('keyPage1');
      var sh = document.getElementById('scrollHint');
      if (p1) p1.style.display = 'none';
      if (sh) sh.style.display = 'none';
    }
    function submitKey() {
      var key = document.getElementById('keyInput').value.trim().toUpperCase();
      if (key.length !== 8) {
        document.getElementById('keyError').textContent = '密钥必须为8位';
        document.getElementById('keyInput').classList.add('error');
        setTimeout(function () { document.getElementById('keyInput').classList.remove('error'); }, 500);
        return;
      }
      var dc = validateKeyWithTimeWindow(key);
      if (dc) {
        localStorage.setItem(AK_KEY, JSON.stringify({ key: key, deviceCode: dc, verified: true, fingerprint: getDeviceFingerprint() }));
        hideKeyOverlay();
        showNameOverlay();
      } else {
        document.getElementById('keyError').textContent = '密钥无效或已过期，请检查后重试';
        document.getElementById('keyInput').classList.add('error');
        setTimeout(function () { document.getElementById('keyInput').classList.remove('error'); }, 500);
      }
    }

    // ========== Name Overlay ==========
    function showNameOverlay() {
      document.getElementById('nameOverlay').classList.add('open');
      document.getElementById('nameInput').value = '';
      setTimeout(function () { document.getElementById('nameInput').focus(); }, 300);
    }
    function hideNameOverlay() {
      document.getElementById('nameOverlay').classList.remove('open');
    }
    function submitName() {
      var name = document.getElementById('nameInput').value.trim();
      if (!name) {
        name = '小读者';
      }
      localStorage.setItem(UN_KEY, name);
      hideNameOverlay();
      updateTitle();
      var mc = document.getElementById('mainContainer'); if (mc) mc.style.display = '';
      _renderMainUI();
      var pos = parseHash();
      if (pos) openBook(pos.bookId, pos.page);
    }
    function updateTitle() {
      var name = localStorage.getItem(UN_KEY) || '';
      var titleEl = document.getElementById('mainTitle');
      if (name) {
        var titleText = name + '的Raz阅读器';
        titleEl.textContent = titleText;
        document.title = titleText;
      } else {
        titleEl.textContent = 'Raz阅读器';
        document.title = 'Raz阅读器';
      }
    }

    // ========== Access Check ==========
    function getDeviceFingerprint() {
      var params = getDeviceParams();
      return buildFingerprintString(params);
    }


    // ========== Early Access Check ==========
    // Run verification immediately - don't wait for DATA
    (function () {
      // Detect file:// protocol - Firefox isolates localStorage per file URL
      if (location.protocol === 'file:') {
        var isFirefox = navigator.userAgent.indexOf('Firefox') !== -1;
        if (isFirefox) {
          var warn = document.createElement('div');
          warn.id = '__raz_file_warn__';
          warn.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ff9800;color:#fff;padding:12px 20px;z-index:99999;font-size:14px;text-align:center;font-family:sans-serif;cursor:pointer;';
          warn.innerHTML = '⚠️ Firefox 在 file:// 协议下每个文件的 localStorage 相互隔离，认证和阅读记录无法跨文件共享。建议使用 <b>start_server.bat</b> 启动本地服务器后通过 http://localhost:8000 访问，或改用 Chrome 浏览器。';
          warn.onclick = function() { warn.style.display = 'none'; };
          document.body.appendChild(warn);
        }
      }
      // Show key overlay immediately if needed
      var saved = localStorage.getItem(AK_KEY);
      if (!saved) {
        showKeyOverlay();
        return;
      }
      try {
        var data = JSON.parse(saved);
        if (data.verified && data.fingerprint === getDeviceFingerprint()) {
          // Already authenticated - check name
          var name = localStorage.getItem(UN_KEY);
          if (!name) {
            showNameOverlay();
            return;
          }
          // Fully authenticated - show main content
          updateTitle();
          var mc = document.getElementById('mainContainer');
          if (mc) mc.style.display = '';
          // Hide preview page for verified users
          var p1 = document.getElementById('keyPage1');
          var sh = document.getElementById('scrollHint');
          if (p1) p1.style.display = 'none';
          if (sh) sh.style.display = 'none';
        } else {
          // Need to re-verify with time window
          var dc = validateKeyWithTimeWindow(data.key);
          if (!dc) {
            showKeyOverlay();
            return;
          }
          data.verified = true;
          data.fingerprint = getDeviceFingerprint();
          localStorage.setItem(AK_KEY, JSON.stringify(data));
          var name = localStorage.getItem(UN_KEY);
          if (!name) {
            showNameOverlay();
            return;
          }
          updateTitle();
          var mc = document.getElementById('mainContainer');
          if (mc) mc.style.display = '';
          // Hide preview page for verified users
          var p1b = document.getElementById('keyPage1');
          var sh2 = document.getElementById('scrollHint');
          if (p1b) p1b.style.display = 'none';
          if (sh2) sh2.style.display = 'none';
        }
      } catch (e) {
        showKeyOverlay();
      }
    })();
  