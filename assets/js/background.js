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

  /* Feed the model a downscaled copy — much faster inference with almost
     no visible loss for web use. Full-resolution input is still used for
     the offline quick mode and for server-side processing. */
  function optimizeForAI(file, maxEdge) {
    return fileToImage(file).then(function (img) {
      var size = scaledSize(img, maxEdge || 1280);
      if (size.w === img.naturalWidth && size.h === img.naturalHeight) return file;
      var c = makeCanvas(size.w, size.h);
      c.getContext('2d').drawImage(img, 0, 0, size.w, size.h);
      return new Promise(function (resolve) {
        c.toBlob(function (blob) { resolve(blob || file); }, 'image/png');
      });
    }).catch(function () { return file; });
  }

  async function clientRemove(file, onProgress) {
    onProgress(10, 'Loading AI model…');
    var mod = await import(/* @vite-ignore */ CFG.clientModel || 'https://esm.sh/@imgly/background-removal');
    var removeFn = mod.removeBackground || mod.remove || (mod.default && (mod.default.removeBackground || mod.default.remove));
    if (!removeFn) throw new Error('AI module could not be loaded.');
    onProgress(20, 'Optimising image…');
    var input = await optimizeForAI(file, 1280);
    onProgress(26, 'Analysing image…');
    var output = await removeFn(input, {
      model: 'isnet_quint8',
      device: 'gpu',
      proxyToWorker: true,
      output: { format: 'image/png', quality: 1 },
      progress: function (key, current, total) {
        var pct = 26;
        if (typeof current === 'number' && typeof total === 'number' && total > 0) {
          pct = 26 + Math.round((current / total) * 62);
        } else if (key === 'inferring') pct = 70;
        onProgress(Math.min(92, pct), 'Removing background…');
      }
    });
    var blob = output instanceof Blob ? output : new Blob([output], { type: 'image/png' });
    onProgress(95, 'Preparing result…');
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

  async function remove(file, onProgress) {
    onProgress = onProgress || function () {};
    var provider = CFG.provider || 'auto';
    if (provider === 'server' || (provider === 'auto' && CFG.apiEndpoint)) {
      try { return await blobToCanvas(await serverRemove(file, onProgress)); }
      catch (e) { console.warn('Server removal failed:', e); }
    }
    if (provider !== 'fallback') {
      try { return await blobToCanvas(await clientRemove(file, onProgress)); }
      catch (e) { console.warn('AI unavailable, using quick mode:', e); }
    }
    var img = await fileToImage(file);
    return quickRemove(img, onProgress);
  }

  window.BackgroundEngine = { remove: remove, fileToImage: fileToImage, makeCanvas: makeCanvas };
})();
