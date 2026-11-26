/* Background removal tool — upload, AI cut-out, editing and download */
(function () {
  'use strict';

  var CFG = window.REMOVEBG_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };

  var el = {
    uploadView: $('uploadView'),
    resultView: $('resultView'),
    dropzone: $('dropzone'),
    fileInput: $('fileInput'),
    urlInput: $('urlInput'),
    urlGo: $('urlGo'),
    filePanel: $('filePanel'),
    urlPanel: $('urlPanel'),
    tabFile: $('tabFile'),
    tabUrl: $('tabUrl'),
    originalPreview: $('originalPreview'),
    resultCanvas: $('resultCanvas'),
    resultFrame: $('resultFrame'),
    progress: $('progress'),
    progressBar: $('progressBar'),
    progressText: $('progressText'),
    resultName: $('resultName'),
    downloadBtn: $('downloadBtn'),
    downloadFormat: $('downloadFormat'),
    newImageBtn: $('newImageBtn'),
    customColor: $('customColor'),
    brushBar: $('brushBar'),
    brushSize: $('brushSize'),
    brushValue: $('brushValue'),
    brushRestore: $('brushRestore'),
    brushErase: $('brushErase'),
    resetBrush: $('resetBrush'),
    errorMessage: $('errorMessage'),
    retryBtn: $('retryBtn')
  };

  if (!el.uploadView || !el.resultView) return;

  var state = {
    file: null,
    originalCanvas: null,
    resultCanvas: null,
    ctx: null,
    bg: 'transparent',
    bgColor: '#ffffff',
    gradient: null,
    brushMode: 'restore',
    brushSize: 24,
    drawing: false,
    lastPoint: null,
    busy: false
  };

  /* ================= helpers ================= */

  function setProgress(value, text) {
    var pct = Math.max(4, Math.min(100, value));
    var overlay = $('processingOverlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      var bar = $('processingBar');
      if (bar) bar.style.width = pct + '%';
      if (text) {
        var t = $('processingText');
        if (t) t.textContent = text;
      }
    }
    if (!el.progress) return;
    el.progress.classList.remove('hidden');
    el.progressBar.style.width = pct + '%';
    if (text) el.progressText.textContent = text;
  }

  function hideProgress() {
    var overlay = $('processingOverlay');
    if (overlay) overlay.classList.add('hidden');
    if (el.progress) el.progress.classList.add('hidden');
  }

  /* Show the uploaded picture immediately, while the AI removes the background. */
  function showUploadedPreview(file) {
    var p = $('processingPreview');
    if (!p) return;
    if (p.dataset.url) URL.revokeObjectURL(p.dataset.url);
    var url = URL.createObjectURL(file);
    p.dataset.url = url;
    p.src = url;
    p.classList.remove('hidden');
  }

  function hideUploadedPreview() {
    var p = $('processingPreview');
    if (!p) return;
    p.classList.add('hidden');
    if (p.dataset.url) { URL.revokeObjectURL(p.dataset.url); delete p.dataset.url; }
    p.removeAttribute('src');
    var pair = $('processingPair');
    if (pair) pair.classList.add('hidden');
  }

  /* A local cut-out shown instantly beside the upload while the AI works. */
  function showQuickPreview(img) {
    var pair = $('processingPair'), c = $('processingCutout');
    if (!pair || !c || !window.BackgroundEngine || !window.BackgroundEngine.quick) return;
    try {
      Promise.resolve(window.BackgroundEngine.quick(img)).then(function (q) {
        if (!q || !q.width) return;
        var scale = Math.min(1, 300 / Math.max(q.width, q.height));
        c.width = Math.max(1, Math.round(q.width * scale));
        c.height = Math.max(1, Math.round(q.height * scale));
        c.getContext('2d').drawImage(q, 0, 0, c.width, c.height);
        pair.classList.remove('hidden');
      });
    } catch (e) { /* preview only — the AI result will follow */ }
  }

  function showError(message) {
    if (!el.errorMessage) return;
    el.errorMessage.textContent = message;
    el.errorMessage.classList.remove('hidden');
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Could not load that image. Check the URL or try uploading a file.')); };
      if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
      img.src = src;
    });
  }

  function fileToImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { loadImage(reader.result).then(resolve, reject); };
      reader.onerror = function () { reject(new Error('Could not read the file.')); };
      reader.readAsDataURL(file);
    });
  }

  function maxCanvasSize(img, limit) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var scale = Math.min(1, limit / Math.max(w, h));
    return { w: Math.round(w * scale), h: Math.round(h * scale), scale: scale };
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* ================= removal providers ================= */

  function serverRemove(file, onProgress) {
    onProgress(18, 'Uploading to server…');
    var form = new FormData();
    form.append('image', file, file.name || 'image.png');
    return fetch(CFG.apiEndpoint, { method: 'POST', body: form })
      .then(function (res) {
        if (!res.ok) throw new Error('Server returned ' + res.status);
        return res.blob();
      })
      .then(function (blob) { onProgress(92, 'Finishing up…'); return blob; });
  }

  async function clientRemove(file, onProgress) {
    onProgress(10, 'Loading AI model…');
    var mod = await import(/* @vite-ignore */ CFG.clientModel || 'https://esm.sh/@imgly/background-removal');
    var removeFn = mod.removeBackground || mod.remove || (mod.default && (mod.default.removeBackground || mod.default.remove));
    if (!removeFn) throw new Error('AI module could not be loaded.');
    onProgress(28, 'Analysing image…');
    var result = await removeFn(file, {
      model: 'isnet_quint8',
      output: { format: 'image/png', quality: 1 },
      progress: function (key, current, total) {
        var pct = 28;
        if (typeof current === 'number' && typeof total === 'number' && total > 0) {
          pct = 28 + Math.round((current / total) * 60);
        } else if (key === 'inferring') pct = 70;
        onProgress(Math.min(92, pct), 'Removing background…');
      }
    });
    var blob = result instanceof Blob ? result : new Blob([result], { type: 'image/png' });
    onProgress(95, 'Preparing result…');
    return blob;
  }

  /* Built-in quick mode: removes a uniform / similar-coloured background
     connected to the image border. Works offline for portraits, ID photos
     and product shots on plain backgrounds. */
  function fallbackRemove(img, onProgress) {
    onProgress(24, 'Quick mode: detecting background…');
    var size = maxCanvasSize(img, 1400);
    var canvas = makeCanvas(size.w, size.h);
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size.w, size.h);
    var data = ctx.getImageData(0, 0, size.w, size.h);
    var px = data.data;
    var w = size.w, h = size.h;

    // Estimate background colour from the image border.
    var sample = [0, 0, 0], count = 0, step = Math.max(1, Math.floor(Math.min(w, h) / 90));
    function add(x, y) {
      var i = (y * w + x) * 4;
      sample[0] += px[i]; sample[1] += px[i + 1]; sample[2] += px[i + 2]; count++;
    }
    for (var x = 0; x < w; x += step) { add(x, 0); add(x, h - 1); }
    for (var y = 0; y < h; y += step) { add(0, y); add(w - 1, y); }
    var bg = [sample[0] / count, sample[1] / count, sample[2] / count];
    var tol = Number(CFG.fallbackTolerance) || 58;

    function dist(i) {
      var dr = px[i] - bg[0], dg = px[i + 1] - bg[1], db = px[i + 2] - bg[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    // Flood fill from all border pixels, keeping only connected background.
    var visited = new Uint8Array(w * h);
    var stack = [];
    for (var bx = 0; bx < w; bx++) { stack.push(bx); stack.push((h - 1) * w + bx); }
    for (var by = 0; by < h; by++) { stack.push(by * w); stack.push(by * w + w - 1); }
    var processed = 0, total = w * h, reportAt = Math.floor(total / 10);
    while (stack.length) {
      var p = stack.pop();
      if (visited[p]) continue;
      visited[p] = 1;
      var idx = p * 4;
      var d = dist(idx);
      if (d > tol) continue;
      px[idx + 3] = d < tol * 0.62 ? 0 : Math.round(255 * (d - tol * 0.62) / (tol * 0.38));
      var cx = p % w, cy = (p / w) | 0;
      if (cx > 0) stack.push(p - 1);
      if (cx < w - 1) stack.push(p + 1);
      if (cy > 0) stack.push(p - w);
      if (cy < h - 1) stack.push(p + w);
      processed++;
      if (processed % reportAt === 0) onProgress(24 + Math.min(60, Math.round(processed / total * 60)), 'Quick mode: cleaning edges…');
    }
    ctx.putImageData(data, 0, 0);
    onProgress(92, 'Done');
    return Promise.resolve(canvas);
  }

  function bitmapToCanvas(blob, onProgress) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(blob).then(function (bitmap) {
        var size = maxCanvasSize({ naturalWidth: bitmap.width, naturalHeight: bitmap.height }, 1600);
        var canvas = makeCanvas(size.w, size.h);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, size.w, size.h);
        if (bitmap.close) bitmap.close();
        return canvas;
      });
    }
    return blobToUrl(blob).then(loadImage).then(function (img) {
      var size = maxCanvasSize(img, 1600);
      var canvas = makeCanvas(size.w, size.h);
      canvas.getContext('2d').drawImage(img, 0, 0, size.w, size.h);
      return canvas;
    });
  }

  function blobToUrl(blob) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.readAsDataURL(blob);
    });
  }

  async function removeBackground(file, onProgress, opts) {
    if (window.BackgroundEngine && window.BackgroundEngine.remove) {
      return window.BackgroundEngine.remove(file, onProgress, opts);
    }
    var provider = CFG.provider || 'auto';
    if (provider === 'server' || (provider === 'auto' && CFG.apiEndpoint)) {
      try {
        var blob = await serverRemove(file, onProgress);
        return await bitmapToCanvas(blob, onProgress);
      } catch (e) {
        console.warn('Server removal failed, falling back:', e);
      }
    }
    if (provider !== 'fallback') {
      try {
        var blob2 = await clientRemove(file, onProgress);
        return await bitmapToCanvas(blob2, onProgress);
      } catch (e) {
        console.warn('AI removal unavailable, using built-in quick mode:', e);
      }
    }
    var img = await fileToImage(file);
    return fallbackRemove(img, onProgress);
  }

  /* ================= result rendering ================= */

  function paintBackground() {
    if (!el.resultFrame || !el.resultCanvas) return;
    var frame = el.resultFrame;
    frame.style.backgroundImage = '';
    frame.style.backgroundColor = '';
    if (state.bg === 'transparent') {
      frame.style.backgroundColor = '';
    } else if (state.gradient) {
      frame.style.backgroundImage = state.gradient;
    } else {
      frame.style.backgroundColor = state.bgColor;
    }
  }

  function showResult(file, originalImg, cutoutCanvas) {
    state.file = file;
    state.originalCanvas = makeCanvas(cutoutCanvas.width, cutoutCanvas.height);
    state.originalCanvas.getContext('2d').drawImage(originalImg, 0, 0, cutoutCanvas.width, cutoutCanvas.height);

    if (el.originalPreview) el.originalPreview.src = URL.createObjectURL(file);
    if (el.resultCanvas) {
      el.resultCanvas.width = cutoutCanvas.width;
      el.resultCanvas.height = cutoutCanvas.height;
      el.resultCanvas.getContext('2d').clearRect(0, 0, cutoutCanvas.width, cutoutCanvas.height);
      el.resultCanvas.getContext('2d').drawImage(cutoutCanvas, 0, 0);
    }
    /* Edit the visible canvas directly so the editor, brush and download all share state. */
    state.resultCanvas = el.resultCanvas || cutoutCanvas;
    state.ctx = state.resultCanvas.getContext('2d');
    if (el.resultName) el.resultName.textContent = (file.name || 'image').replace(/\.[^.]+$/, '') + '-removed.png';
    state.bg = 'transparent'; state.gradient = null;
    window.__editorGradient = null;
    window.__editorGradientStops = null;
    window.__editorEffects = { blur: 0, shadow: 0 };
    var frameBg = $('frameBg');
    if (frameBg) { frameBg.classList.remove('on'); frameBg.removeAttribute('data-src'); frameBg.style.backgroundImage = ''; frameBg.style.filter = ''; }
    if (el.resultCanvas) el.resultCanvas.style.filter = '';
    paintBackground();
    el.uploadView.classList.add('hidden');
    el.resultView.classList.remove('hidden');
    var hero = $('heroSection');
    if (hero) hero.classList.add('hidden');
    var resultSection = $('resultSection');
    if (resultSection) resultSection.classList.remove('hidden');
    document.body.classList.add('result-open');
    if (el.errorMessage) el.errorMessage.classList.add('hidden');
    el.resultView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.EditorAPI && window.EditorAPI.refresh) window.EditorAPI.refresh();
  }

  function resetToUpload() {
    state.file = null;
    hideUploadedPreview();
    el.resultView.classList.add('hidden');
    el.uploadView.classList.remove('hidden');
    var hero = $('heroSection');
    if (hero) hero.classList.remove('hidden');
    var resultSection = $('resultSection');
    if (resultSection) resultSection.classList.add('hidden');
    document.body.classList.remove('result-open');
    if (el.fileInput) el.fileInput.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { showError('Please choose an image file (PNG, JPG, WebP or BMP).'); return; }
    var maxBytes = (Number(CFG.maxFileSizeMB) || 15) * 1024 * 1024;
    if (file.size > maxBytes) { showError('That image is larger than ' + CFG.maxFileSizeMB + ' MB. Please choose a smaller file.'); return; }
    state.busy = true;
    showError('');
    showUploadedPreview(file);
    try {
      setProgress(6, 'Reading ' + (file.name || 'image') + '…');
      var img = await fileToImage(file);
      showQuickPreview(img);
      var cutout = await removeBackground(file, setProgress, { sourceImage: img });
      setProgress(100, 'Ready!');
      showResult(file, img, cutout);
      setTimeout(function () { hideProgress(); hideUploadedPreview(); }, 350);
      if (window.showToast) window.showToast('Background removed — download or fine-tune it below.');
    } catch (e) {
      console.error(e);
      showError('Something went wrong: ' + (e.message || 'unknown error') + '. Please try another image.');
      hideProgress();
      hideUploadedPreview();
    } finally {
      state.busy = false;
    }
  }

  async function handleUrl() {
    var url = (el.urlInput && el.urlInput.value || '').trim();
    if (!url) { showError('Paste an image URL first.'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      setProgress(8, 'Downloading image…');
      var res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('Image could not be downloaded (HTTP ' + res.status + ')');
      var blob = await res.blob();
      if (!/^image\//.test(blob.type)) throw new Error('That URL does not point to an image.');
      var file = new File([blob], 'url-image.' + (blob.type.split('/')[1] || 'png'), { type: blob.type });
      await handleFile(file);
    } catch (e) {
      showError('Could not use that URL: ' + e.message + '. Try downloading the image and uploading it instead.');
      hideProgress();
    }
  }

  /* ================= brush editing ================= */

  function canvasPoint(e) {
    var rect = el.resultCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (el.resultCanvas.width / rect.width),
      y: (e.clientY - rect.top) * (el.resultCanvas.height / rect.height)
    };
  }

  function applyBrush(point) {
    var ctx = state.ctx;
    if (!ctx) return;
    var r = state.brushSize * (el.resultCanvas.width / el.resultCanvas.getBoundingClientRect().width || 1) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(2, r), 0, Math.PI * 2);
    if (state.brushMode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      ctx.fill();
    } else {
      ctx.clip();
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(state.originalCanvas, 0, 0, el.resultCanvas.width, el.resultCanvas.height);
    }
    ctx.restore();
  }

  function strokeTo(point) {
    if (state.lastPoint) {
      var a = state.lastPoint, b = point;
      var d = Math.hypot(b.x - a.x, b.y - a.y);
      var steps = Math.max(1, Math.ceil(d / (state.brushSize / 2)));
      for (var i = 1; i <= steps; i++) {
        applyBrush({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps });
      }
    } else {
      applyBrush(point);
    }
    state.lastPoint = point;
  }

  /* ================= download ================= */

  /* Backdrop effects are defined in CSS pixels at the preview size;
     convert them to output pixels so the download matches what is on screen. */
  function effectSettings() {
    var fx = window.__editorEffects || {};
    var cv = el.resultCanvas;
    var previewWidth = cv && cv.clientWidth ? cv.clientWidth : 0;
    var scale = cv && cv.width && previewWidth ? cv.width / previewWidth : 1;
    return {
      blur: Math.max(0, Math.min(60, Number(fx.blur) || 0)),
      shadow: Math.max(0, Math.min(100, Number(fx.shadow) || 0)),
      scale: scale
    };
  }

  function drawBlurredBackdrop(ctx, w, h, blurCss, scale) {
    var src = state.originalCanvas;
    if (!src) return false;
    var cover = Math.max(w / src.width, h / src.height);
    /* Opaque base so heavy blur cannot fade out at the edges. */
    ctx.drawImage(src, (w - src.width * cover) / 2, (h - src.height * cover) / 2, src.width * cover, src.height * cover);
    var zoom = 1 + Math.max(0.12, (blurCss * scale * 2.4) / Math.min(w, h));
    var dw = src.width * cover * zoom, dh = src.height * cover * zoom;
    ctx.save();
    ctx.filter = 'blur(' + (blurCss * scale) + 'px)';
    ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
    return true;
  }

  function drawCutout(ctx, w, h, shadow, scale) {
    if (shadow > 0 && state.resultCanvas) {
      var tmp = makeCanvas(w, h);
      var t = tmp.getContext('2d');
      t.drawImage(state.resultCanvas, 0, 0, w, h);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = '#0f172a';
      t.fillRect(0, 0, w, h);
      ctx.save();
      ctx.filter = 'blur(' + ((6 + shadow * 0.22) * scale) + 'px)';
      ctx.globalAlpha = Math.min(0.55, 0.18 + shadow / 300);
      ctx.drawImage(tmp, 0, (2 + shadow * 0.12) * scale);
      ctx.restore();
    }
    ctx.drawImage(state.resultCanvas, 0, 0, w, h);
  }

  function exportCanvas() {
    var format = (el.downloadFormat && el.downloadFormat.value) || 'png';
    var fx = effectSettings();
    var out = makeCanvas(state.resultCanvas.width, state.resultCanvas.height);
    var ctx = out.getContext('2d');
    var transparent = format !== 'jpg' && state.bg === 'transparent' && !window.__editorGradient;

    if (fx.blur > 0) {
      drawBlurredBackdrop(ctx, out.width, out.height, fx.blur, fx.scale);
    } else if (!transparent) {
      if (window.__editorGradient) {
        var stops = window.__editorGradientStops || ['#8ab4ff', '#c4a4ff'];
        var grad = ctx.createLinearGradient(0, 0, out.width, out.height);
        grad.addColorStop(0, stops[0]); grad.addColorStop(1, stops[1] || stops[0]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, out.width, out.height);
      } else if (state.bg === 'white' || state.bg === 'black' || state.bg === 'custom') {
        ctx.fillStyle = state.bgColor;
        ctx.fillRect(0, 0, out.width, out.height);
      } else if (state.gradient) {
        var g = ctx.createLinearGradient(0, 0, out.width, out.height);
        g.addColorStop(0, '#8ab4ff'); g.addColorStop(1, '#c4a4ff');
        ctx.fillStyle = g; ctx.fillRect(0, 0, out.width, out.height);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, out.width, out.height);
      }
    }
    drawCutout(ctx, out.width, out.height, fx.shadow, fx.scale);
    var type = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    return { canvas: out, type: type, ext: format };
  }

  function toBlobAsync(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, type, quality);
    });
  }

  async function makeBlobWithinTarget(canvas, type, targetBytes, startQuality) {
    var best = null;
    for (var q = startQuality; q >= 0.05; q -= 0.05) {
      var b = await toBlobAsync(canvas, type, q);
      if (!b) continue;
      if (!best || b.size < best.size) best = b;
      if (b.size <= targetBytes) return b;
    }
    if (!best) return null;
    var scale = Math.sqrt(targetBytes / best.size) * 0.96;
    if (scale < 0.1) scale = 0.1;
    if (scale > 1) scale = 1;
    var w = Math.max(1, Math.round(canvas.width * scale));
    var h = Math.max(1, Math.round(canvas.height * scale));
    var sc = makeCanvas(w, h);
    sc.getContext('2d').drawImage(canvas, 0, 0, w, h);
    for (var q2 = Math.min(0.9, startQuality); q2 >= 0.1; q2 -= 0.1) {
      var b2 = await toBlobAsync(sc, type, q2);
      if (!b2) continue;
      if (!best || b2.size < best.size) best = b2;
      if (b2.size <= targetBytes) return b2;
    }
    return best;
  }

  async function download() {
    if (!state.resultCanvas) return;
    var out = exportCanvas();
    var name = (el.resultName ? el.resultName.textContent : 'image-removed').replace(/\.png$/, '') + '.' + out.ext;
    var qualityEl = $('downloadQuality');
    var quality = qualityEl ? Number(qualityEl.value) / 100 : 0.92;
    var targetEl = $('targetSizeKB');
    var targetKB = targetEl ? Number(targetEl.value) : 0;
    var blob;
    if (targetKB > 0) {
      blob = await makeBlobWithinTarget(out.canvas, out.type, targetKB * 1024, quality);
    } else {
      blob = await toBlobAsync(out.canvas, out.type, quality);
    }
    if (!blob) { showError('Download failed. Please try again.'); return; }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    if (window.showToast) window.showToast('Saved as ' + name + ' (' + Math.round(blob.size / 1024) + ' KB)');
  }

  /* ================= wire up UI ================= */

  if (el.dropzone) {
    el.dropzone.addEventListener('click', function (e) {
      if (e.target.closest('button,input,a')) return;
      if (el.fileInput) el.fileInput.click();
    });
    el.dropzone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (el.fileInput) el.fileInput.click();
      }
    });
    ['dragenter', 'dragover'].forEach(function (type) {
      el.dropzone.addEventListener(type, function (e) { e.preventDefault(); el.dropzone.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      el.dropzone.addEventListener(type, function (e) { e.preventDefault(); el.dropzone.classList.remove('drag'); });
    });
    el.dropzone.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) handleFile(files[0]);
    });
  }

  if (el.fileInput) el.fileInput.addEventListener('change', function (e) { handleFile(e.target.files[0]); });
  if (el.urlGo) el.urlGo.addEventListener('click', handleUrl);
  if (el.urlInput) el.urlInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleUrl(); });

  function selectTab(which) {
    if (!el.filePanel || !el.urlPanel) return;
    var isUrl = which === 'url';
    el.filePanel.classList.toggle('hidden', isUrl);
    el.urlPanel.classList.toggle('hidden', !isUrl);
    if (el.tabFile) el.tabFile.classList.toggle('active', !isUrl);
    if (el.tabUrl) el.tabUrl.classList.toggle('active', isUrl);
  }
  if (el.tabFile) el.tabFile.addEventListener('click', function () { selectTab('file'); });
  if (el.tabUrl) el.tabUrl.addEventListener('click', function () { selectTab('url'); });

  document.addEventListener('paste', function (e) {
    if (state.busy || !el.dropzone) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image/') === 0) {
        var file = items[i].getAsFile();
        if (file) { e.preventDefault(); handleFile(file); break; }
      }
    }
  });

  document.querySelectorAll('.swatch').forEach(function (swatch) {
    swatch.addEventListener('click', function () {
      document.querySelectorAll('.swatch').forEach(function (s) { s.classList.remove('active'); });
      swatch.classList.add('active');
      state.bg = swatch.dataset.bg || 'transparent';
      state.gradient = null;
      if (state.bg === 'custom' && el.customColor) {
        state.bgColor = el.customColor.value;
        if (el.resultFrame) el.resultFrame.style.backgroundColor = state.bgColor;
      }
      if (state.bg === 'white') state.bgColor = '#ffffff';
      if (state.bg === 'black') state.bgColor = '#111827';
      paintBackground();
    });
  });

  if (el.customColor) el.customColor.addEventListener('input', function () {
    state.bg = 'custom'; state.bgColor = el.customColor.value;
    document.querySelectorAll('.swatch').forEach(function (s) { s.classList.toggle('active', s.dataset.bg === 'custom'); });
    paintBackground();
  });

  if (el.downloadBtn) el.downloadBtn.addEventListener('click', download);
  if (el.newImageBtn) el.newImageBtn.addEventListener('click', resetToUpload);
  if (el.retryBtn) el.retryBtn.addEventListener('click', resetToUpload);

  if (el.brushSize) el.brushSize.addEventListener('input', function () {
    state.brushSize = Number(el.brushSize.value);
    if (el.brushValue) el.brushValue.textContent = state.brushSize + ' px';
  });

  function setBrushMode(mode) {
    state.brushMode = mode;
    if (el.brushRestore) el.brushRestore.classList.toggle('active', mode === 'restore');
    if (el.brushErase) el.brushErase.classList.toggle('active', mode === 'erase');
    if (el.resultCanvas) el.resultCanvas.style.cursor = mode === 'erase' ? 'crosshair' : 'cell';
  }
  if (el.brushRestore) el.brushRestore.addEventListener('click', function () { setBrushMode('restore'); });
  if (el.brushErase) el.brushErase.addEventListener('click', function () { setBrushMode('erase'); });
  setBrushMode('restore');

  if (el.resetBrush && el.resultCanvas && state.originalCanvas) {
    el.resetBrush.addEventListener('click', function () {
      if (!state.ctx) return;
      state.ctx.clearRect(0, 0, state.resultCanvas.width, state.resultCanvas.height);
      state.ctx.drawImage(state.originalCanvas, 0, 0, state.resultCanvas.width, state.resultCanvas.height);
    });
  }
  // Rebind reset after a result exists (originalCanvas is null at load time).
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#resetBrush') || !state.resultCanvas) return;
    state.ctx.clearRect(0, 0, state.resultCanvas.width, state.resultCanvas.height);
    state.ctx.drawImage(state.originalCanvas, 0, 0, state.resultCanvas.width, state.resultCanvas.height);
    if (window.showToast) window.showToast('Edits reset to the original cut-out.');
  });

  if (el.resultCanvas) {
    el.resultCanvas.addEventListener('pointerdown', function (e) {
      if (!state.ctx) return;
      state.drawing = true;
      el.resultCanvas.setPointerCapture(e.pointerId);
      state.lastPoint = null;
      strokeTo(canvasPoint(e));
    });
    el.resultCanvas.addEventListener('pointermove', function (e) {
      if (!state.drawing) return;
      strokeTo(canvasPoint(e));
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
      el.resultCanvas.addEventListener(type, function () { state.drawing = false; state.lastPoint = null; });
    });
  }

  /* Drop anywhere on the page, not just inside the card */
  document.addEventListener('dragover', function (e) {
    if (state.busy) return;
    e.preventDefault();
  });
  document.addEventListener('drop', function (e) {
    if (state.busy) return;
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    if (e.target.closest && e.target.closest('#dropzone')) return;
    e.preventDefault();
    handleFile(files[0]);
  });

  /* Paste an image straight from the clipboard */
  document.addEventListener('paste', function (e) {
    if (state.busy) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        var f = items[i].getAsFile();
        if (f) { e.preventDefault(); handleFile(f); return; }
      }
    }
  });

  /* Expose a tiny API for other pages / demos */
  window.RemoveBG = {
    process: handleFile,
    reset: resetToUpload,
    getCanvas: function () { return state.resultCanvas; }
  };
})();
