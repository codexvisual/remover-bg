/* Shared background-removal engine — used by the home page and the tools page.
   Modes: server API -> browser AI -> offline quick mode. */
(function () {
  'use strict';
  var CFG = window.REMOVEBG_CONFIG || {};

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Could not load that image.')); };
      if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
      img.src = src;
    });
  }

  function fileToImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read the file.')); };
      img.src = url;
    });
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function scaledSize(img, limit) {
    var w = img.naturalWidth || img.width || 1;
    var h = img.naturalHeight || img.height || 1;
    var scale = Math.min(1, limit / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
  }

  function toCanvas(bitmap) {
    var size = scaledSize({ naturalWidth: bitmap.width, naturalHeight: bitmap.height }, 1600);
    var c = makeCanvas(size.w, size.h);
    c.getContext('2d').drawImage(bitmap, 0, 0, size.w, size.h);
    if (bitmap.close) bitmap.close();
    return c;
  }

  function blobToCanvas(blob) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(blob).then(toCanvas);
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { loadImage(reader.result).then(function (img) {
        var size = scaledSize(img, 1600);
        var c = makeCanvas(size.w, size.h);
        c.getContext('2d').drawImage(img, 0, 0, size.w, size.h);
        resolve(c);
      }, reject); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function serverRemove(file, onProgress) {
    onProgress(18, 'Uploading to server…');
    var form = new FormData();
    form.append('image', file, file.name || 'image.png');
    return fetch(CFG.apiEndpoint, { method: 'POST', body: form })
      .then(function (res) {
        if (!res.ok) throw new Error('Server returned ' + res.status);
        return res.blob();
      })
      .then(function (blob) { onProgress(90, 'Finishing up…'); return blob; });
  }

  /* ---------- tiny IndexedDB cache: repeat uploads are instant ---------- */
  var DB_NAME = 'remover-bg-cache', STORE = 'cutouts', dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('no IndexedDB')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }
  function cacheKey(file) {
    return [file.name || 'image', file.size, file.lastModified || 0].join('|');
  }
  function cacheGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
          r.onsuccess = function () { resolve(r.result || null); };
          r.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    }).catch(function () { return null; });
  }
  function cachePut(key, blob) {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(blob, key);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
        } catch (e) { resolve(); }
      });
    }).then(function () {
      // Keep the cache small — only the most recent dozen images.
      return openDb().then(function (db) {
        try {
          var store = db.transaction(STORE, 'readonly').objectStore(STORE);
          var count = store.count();
          count.onsuccess = function () {
            if (count.result <= 12) return;
            var clear = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
            try { clear.transaction.oncomplete = function () {}; } catch (e) {}
          };
        } catch (e) {}
      });
    }).catch(function () {});
  }

  /* Load the AI module once and keep the import promise for warm-up and
     first upload. The model itself is cached by the service worker. */
  var aiPromise = null;
  function aiModule() {
    if (!aiPromise) {
      aiPromise = import(/* @vite-ignore */ CFG.clientModel || 'https://esm.sh/@imgly/background-removal')
        .catch(function (e) { aiPromise = null; throw e; });
    }
    return aiPromise;
  }
  function warmAi() {
    if (CFG.warmupAI === false || !aiModule) return;
    var conn = navigator.connection || {};
    if (conn.saveData || /2g|3g/.test(conn.effectiveType || '')) return;
    aiModule().then(function (mod) {
      var fn = mod.removeBackground || mod.remove || (mod.default && (mod.default.removeBackground || mod.default.remove));
      if (!fn) return;
      var tiny = makeCanvas(16, 16), c = tiny.getContext('2d');
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, 16, 16);
      tiny.toBlob(function (blob) {
        if (!blob) return;
        fn(blob, {
          model: 'isnet_quint8', device: 'gpu', proxyToWorker: true,
          output: { format: 'image/png', quality: 0.6 }
        }).catch(function () {});
      }, 'image/png');
    }).catch(function () {});
  }

  /* Feed the model a downscaled copy — much faster inference with almost
     no visible loss for web use. An already-decoded image can be reused so
     the file is not decoded twice. */
  function optimizeForAI(file, maxEdge, sourceImage) {
    var decode = sourceImage ? Promise.resolve(sourceImage)
      : (typeof createImageBitmap === 'function'
        ? createImageBitmap(file).catch(function () { return fileToImage(file); })
        : fileToImage(file));
    return decode.then(function (img) {
      var w = img.naturalWidth || img.width || 1, h = img.naturalHeight || img.height || 1;
      var size = scaledSize({ naturalWidth: w, naturalHeight: h }, maxEdge || 1024);
      if (size.w === w && size.h === h) {
        if (!sourceImage && img.close) img.close();
        return file;
      }
      var c = makeCanvas(size.w, size.h);
      c.getContext('2d').drawImage(img, 0, 0, size.w, size.h);
      if (!sourceImage && img.close) img.close();
      return new Promise(function (resolve) {
        c.toBlob(function (blob) { resolve(blob || file); }, 'image/png');
      });
    }).catch(function () { return file; });
  }

  async function clientRemove(file, onProgress, opts) {
    opts = opts || {};
    onProgress(10, 'Loading AI model…');
    var mod = await aiModule();
    var removeFn = mod.removeBackground || mod.remove || (mod.default && (mod.default.removeBackground || mod.default.remove));
    if (!removeFn) throw new Error('AI module could not be loaded.');
    onProgress(18, 'Optimising image…');
    var input = await optimizeForAI(file, Number(CFG.aiMaxEdge) || 1024, opts.sourceImage);
    onProgress(24, 'Analysing image…');
    var output = await removeFn(input, {
      model: 'isnet_quint8',
      device: 'gpu',
      proxyToWorker: true,
      output: { format: 'image/png', quality: 1 },
      progress: function (key, current, total) {
        var pct = 24;
        if (typeof current === 'number' && typeof total === 'number' && total > 0) {
          pct = 24 + Math.round((current / total) * 64);
        } else if (key === 'inferring') pct = 70;
        onProgress(Math.min(92, pct), 'Removing background…');
      }
    });
    var blob = output instanceof Blob ? output : new Blob([output], { type: 'image/png' });
    onProgress(95, 'Preparing result…');
    if (blob && blob.size) cachePut(cacheKey(file), blob);
    return blob;
  }

  /* Offline quick mode: remove a background connected to the image border
     whose colour is close to the sampled border colour. */
  function quickRemove(img, onProgress) {
    onProgress(24, 'Quick mode: detecting background…');
    var size = scaledSize(img, 1400);
    var canvas = makeCanvas(size.w, size.h);
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size.w, size.h);
    var data = ctx.getImageData(0, 0, size.w, size.h);
    var px = data.data, w = size.w, h = size.h;

    /* Estimate the local background colour at every pixel by blending the
       colours sampled from the four image edges. This handles smooth
       gradients, which a single global colour cannot. */
    var samples = 3;
    var left = new Float32Array(h * 3), right = new Float32Array(h * 3);
    var top = new Float32Array(w * 3), bottom = new Float32Array(w * 3);
    var c, k, idx;
    for (var y0 = 0; y0 < h; y0++) {
      for (c = 0; c < 3; c++) {
        var ls = 0, rs = 0;
        for (k = 0; k < samples; k++) {
          ls += px[(y0 * w + Math.min(k, w - 1)) * 4 + c];
          rs += px[(y0 * w + (w - 1 - Math.min(k, w - 1))) * 4 + c];
        }
        left[y0 * 3 + c] = ls / samples;
        right[y0 * 3 + c] = rs / samples;
      }
    }
    for (var x0 = 0; x0 < w; x0++) {
      for (c = 0; c < 3; c++) {
        var ts = 0, bs = 0;
        for (k = 0; k < samples; k++) {
          ts += px[(Math.min(k, h - 1) * w + x0) * 4 + c];
          bs += px[((h - 1 - Math.min(k, h - 1)) * w + x0) * 4 + c];
        }
        top[x0 * 3 + c] = ts / samples;
        bottom[x0 * 3 + c] = bs / samples;
      }
    }
    var tol = Number(CFG.fallbackTolerance) || 58;
    function distance(i, p) {
      var x = p % w, y = (p / w) | 0;
      var tx = w > 1 ? x / (w - 1) : 0, sy = h > 1 ? y / (h - 1) : 0;
      var d2 = 0;
      for (var ch = 0; ch < 3; ch++) {
        var hEst = left[y * 3 + ch] * (1 - tx) + right[y * 3 + ch] * tx;
        var vEst = top[x * 3 + ch] * (1 - sy) + bottom[x * 3 + ch] * sy;
        var diff = px[i + ch] - (hEst + vEst) / 2;
        d2 += diff * diff;
      }
      return Math.sqrt(d2);
    }

    var visited = new Uint8Array(w * h);
    var stack = [];
    for (var bx = 0; bx < w; bx++) { stack.push(bx, (h - 1) * w + bx); }
    for (var by = 0; by < h; by++) { stack.push(by * w, by * w + w - 1); }
    var done = 0, reportAt = Math.max(1, Math.floor((w * h) / 10));
    while (stack.length) {
      var p = stack.pop();
      if (visited[p]) continue;
      visited[p] = 1;
      var i = p * 4, d = distance(i, p);
      if (d > tol) continue;
      px[i + 3] = d < tol * 0.62 ? 0 : Math.round(255 * (d - tol * 0.62) / (tol * 0.38));
      var cx = p % w, cy = (p / w) | 0;
      if (cx > 0) stack.push(p - 1);
      if (cx < w - 1) stack.push(p + 1);
      if (cy > 0) stack.push(p - w);
      if (cy < h - 1) stack.push(p + w);
      done++;
      if (done % reportAt === 0) onProgress(24 + Math.min(60, Math.round(done / (w * h) * 60)), 'Quick mode: cleaning edges…');
    }
    ctx.putImageData(data, 0, 0);
    onProgress(92, 'Done');
    return Promise.resolve(canvas);
  }

  async function remove(file, onProgress, opts) {
    onProgress = onProgress || function () {};
    opts = opts || {};
    var provider = CFG.provider || 'auto';

    // Same picture again? Skip the model entirely.
    if (provider !== 'server' && provider !== 'fallback') {
      var hit = await cacheGet(cacheKey(file));
      if (hit && hit instanceof Blob && hit.size) {
        onProgress(100, 'Ready — from cache');
        return blobToCanvas(hit);
      }
    }
    if (provider === 'server' || (provider === 'auto' && CFG.apiEndpoint)) {
      try { return await blobToCanvas(await serverRemove(file, onProgress)); }
      catch (e) { console.warn('Server removal failed:', e); }
    }
    if (provider !== 'fallback') {
      try { return await blobToCanvas(await clientRemove(file, onProgress, opts)); }
      catch (e) { console.warn('AI unavailable, using quick mode:', e); }
    }
    var img = opts.sourceImage || await fileToImage(file);
    return quickRemove(img, onProgress);
  }

  window.BackgroundEngine = {
    remove: remove,
    fileToImage: fileToImage,
    makeCanvas: makeCanvas,
    warmup: warmAi
  };

  // Prime the AI module and model while the visitor is still looking at the
  // upload form, so the first real removal does not pay the download cost.
  var prime = function () { setTimeout(warmAi, 1500); };
  if (document.readyState === 'complete') prime();
  else window.addEventListener('load', prime);
})();
