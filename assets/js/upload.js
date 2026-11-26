/* /upload page — remove.bg-style flow, backed by the shared AI engine */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var idle = $('idleView'), processing = $('processingView'), result = $('resultView');
  if (!idle || !processing || !result) return;

  var CFG = window.REMOVEBG_CONFIG || {};
  var fileInput = $('fileInput');
  var state = { file: null, originalCanvas: null, cutout: null, bg: 'transparent', bgColor: '#ffffff', busy: false };
  var previewUrl = null;

  function show(view) {
    [idle, processing, result].forEach(function (v) { v.classList.add('hidden'); });
    view.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function error(message) {
    var box = $('errorMessage');
    box.textContent = message || '';
    box.style.minHeight = message ? '20px' : '0';
  }

  function setProgress(pct, text) {
    $('processingBar').style.width = Math.max(4, Math.min(100, pct)) + '%';
    if (text) $('processingText').textContent = text;
  }

  /* The uploaded picture is visible straight away, before the cut-out is ready. */
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

  /* Instant local cut-out shown while the model is still running. */
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
    } catch (e) {}
  }

  function toPngFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 600;
        canvas.height = img.naturalHeight || 600;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          resolve(new File([blob], 'sample.png', { type: 'image/png' }));
        }, 'image/png');
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Sample image could not be loaded.')); };
      img.src = url;
    });
  }

  async function useUrl() {
    var input = $('urlInput');
    var raw = (input.value || '').trim();
    if (!raw) { error('Paste an image URL first.'); return; }
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    try {
      setViewProcessing();
      setProgress(8, 'Downloading image…');
      var res = await fetch(raw, { mode: 'cors' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var blob = await res.blob();
      if (!/^image\//.test(blob.type)) throw new Error('That link is not an image.');
      await handleFile(new File([blob], 'url-image.' + (blob.type.split('/')[1] || 'png'), { type: blob.type }));
    } catch (e) {
      show(idle);
      error('Could not use that URL: ' + e.message + '. Download the image and upload it instead.');
    }
  }

  function setViewProcessing() {
    error('');
    show(processing);
    setProgress(6, 'Preparing your image…');
  }

  async function handleFile(file) {
    if (!file || state.busy) return;
    if (!/^image\//.test(file.type)) { error('Please choose an image file (JPG, PNG, WebP or BMP).'); return; }
    if (file.size > (Number(CFG.maxFileSizeMB) || 15) * 1024 * 1024) { error('Image is larger than ' + CFG.maxFileSizeMB + ' MB.'); return; }
    state.busy = true;
    setViewProcessing();
    showUploadedPreview(file);
    try {
      if (/svg/.test(file.type)) file = await toPngFile(file);

      var img = await new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var image = new Image();
        image.onload = function () { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That image could not be opened.')); };
        image.src = url;
      });

      showQuickPreview(img);
      var cutout = await window.BackgroundEngine.remove(file, setProgress, { sourceImage: img });
      state.file = file;
      state.cutout = cutout;
      state.originalCanvas = document.createElement('canvas');
      state.originalCanvas.width = cutout.width;
      state.originalCanvas.height = cutout.height;
      state.originalCanvas.getContext('2d').drawImage(img, 0, 0, cutout.width, cutout.height);

      var canvas = $('resultCanvas');
      canvas.width = cutout.width; canvas.height = cutout.height;
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(cutout, 0, 0);

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      $('originalPreview').src = previewUrl;
      $('resultFrame').style.backgroundColor = '';
      $('resultFrame').style.backgroundImage = '';
      window.__editorGradient = null;
      window.__editorGradientStops = null;
      window.__editorEffects = { blur: 0, shadow: 0 };
      var frameBg = $('frameBg');
      if (frameBg) { frameBg.classList.remove('on'); frameBg.removeAttribute('data-src'); frameBg.style.backgroundImage = ''; frameBg.style.filter = ''; }
      if (canvas) canvas.style.filter = '';
      state.bg = 'transparent';
      Array.prototype.forEach.call(document.querySelectorAll('.up-swatch'), function (s) {
        s.classList.toggle('active', s.dataset.bg === 'transparent');
      });
      setProgress(100, 'Ready!');
      show(result);
      hideUploadedPreview();
      if (window.EditorAPI && window.EditorAPI.refresh) window.EditorAPI.refresh();
    } catch (e) {
      console.error(e);
      hideUploadedPreview();
      show(idle);
      error('Background removal failed: ' + (e.message || 'please try another image.'));
    } finally {
      state.busy = false;
    }
  }

  function reset() {
    state.file = null; state.cutout = null; state.originalCanvas = null;
    hideUploadedPreview();
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    if (fileInput) fileInput.value = '';
    error('');
    show(idle);
  }

  function paintBackground() {
    var frame = $('resultFrame');
    frame.style.backgroundImage = '';
    frame.style.backgroundColor = '';
    if (state.bg === 'white') frame.style.backgroundColor = '#ffffff';
    if (state.bg === 'black') frame.style.backgroundColor = '#111827';
    if (state.bg === 'custom') frame.style.backgroundColor = state.bgColor;
  }

  function effectSettings() {
    var fx = window.__editorEffects || {};
    var cv = $('resultCanvas');
    var previewWidth = cv && cv.clientWidth ? cv.clientWidth : 0;
    return {
      blur: Math.max(0, Math.min(60, Number(fx.blur) || 0)),
      shadow: Math.max(0, Math.min(100, Number(fx.shadow) || 0)),
      scale: cv && cv.width && previewWidth ? cv.width / previewWidth : 1
    };
  }

  function drawBlurredBackdrop(ctx, w, h, blurCss, scale) {
    var src = state.originalCanvas;
    if (!src) return;
    var cover = Math.max(w / src.width, h / src.height);
    ctx.drawImage(src, (w - src.width * cover) / 2, (h - src.height * cover) / 2, src.width * cover, src.height * cover);
    var zoom = 1 + Math.max(0.12, (blurCss * scale * 2.4) / Math.min(w, h));
    var dw = src.width * cover * zoom, dh = src.height * cover * zoom;
    ctx.save();
    ctx.filter = 'blur(' + (blurCss * scale) + 'px)';
    ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  function download() {
    var src = $('resultCanvas');
    if (!src || !state.originalCanvas) return;
    var format = ($('downloadFormat') && $('downloadFormat').value) || 'png';
    var fx = effectSettings();
    var out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    var ctx = out.getContext('2d');
    var gradient = window.__editorGradient;
    var transparent = format !== 'jpg' && state.bg === 'transparent' && !gradient;

    if (fx.blur > 0) {
      drawBlurredBackdrop(ctx, out.width, out.height, fx.blur, fx.scale);
    } else if (!transparent) {
      if (gradient) {
        var stops = window.__editorGradientStops || ['#8ab4ff', '#c4a4ff'];
        var grad = ctx.createLinearGradient(0, 0, out.width, out.height);
        grad.addColorStop(0, stops[0]); grad.addColorStop(1, stops[1] || stops[0]);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = state.bg === 'white' ? '#ffffff' : state.bg === 'black' ? '#111827' : state.bgColor;
      }
      ctx.fillRect(0, 0, out.width, out.height);
    }

    if (fx.shadow > 0) {
      var tmp = document.createElement('canvas');
      tmp.width = out.width; tmp.height = out.height;
      var t = tmp.getContext('2d');
      t.drawImage(src, 0, 0);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = '#0f172a';
      t.fillRect(0, 0, out.width, out.height);
      ctx.save();
      ctx.filter = 'blur(' + ((6 + fx.shadow * 0.22) * fx.scale) + 'px)';
      ctx.globalAlpha = Math.min(0.55, 0.18 + fx.shadow / 300);
      ctx.drawImage(tmp, 0, (2 + fx.shadow * 0.12) * fx.scale);
      ctx.restore();
    }
    ctx.drawImage(src, 0, 0);

    var type = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    var quality = Number(($('downloadQuality') || {}).value || 92) / 100;
    out.toBlob(function (blob) {
      if (!blob) { error('Download failed. Please try again.'); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'remover-bg-result.' + format;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }, type, quality);
  }

  /* ---- events ---- */
  $('uploadBtn').addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function (e) { handleFile(e.target.files[0]); });

  $('urlToggle').addEventListener('click', function () { $('urlRow').classList.toggle('hidden'); $('urlInput').focus(); });
  $('urlToggle').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('urlRow').classList.toggle('hidden'); $('urlInput').focus(); } });
  $('urlGo').addEventListener('click', useUrl);
  $('urlInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') useUrl(); });

  document.querySelectorAll('.up-thumb').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      try {
        setViewProcessing();
        setProgress(10, 'Loading sample…');
        var res = await fetch(btn.dataset.sample);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var blob = await res.blob();
        await handleFile(new File([blob], 'sample.svg', { type: 'image/svg+xml' }));
      } catch (e) { show(idle); error('Sample could not be loaded: ' + e.message); }
    });
  });

  ['dragenter', 'dragover'].forEach(function (type) {
    $('mainArea').addEventListener(type, function (e) { e.preventDefault(); $('mainArea').classList.add('drag'); });
  });
  ['dragleave', 'drop'].forEach(function (type) {
    $('mainArea').addEventListener(type, function (e) { e.preventDefault(); $('mainArea').classList.remove('drag'); });
  });
  $('mainArea').addEventListener('drop', function (e) {
    if (e.dataTransfer.files && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  document.addEventListener('paste', function (e) {
    if (state.busy) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image/') === 0) {
        var f = items[i].getAsFile();
        if (f) { e.preventDefault(); handleFile(f); break; }
      }
    }
  });

  document.querySelectorAll('.up-swatch').forEach(function (sw) {
    sw.addEventListener('click', function () {
      document.querySelectorAll('.up-swatch').forEach(function (s) { s.classList.remove('active'); });
      sw.classList.add('active');
      state.bg = sw.dataset.bg;
      if (state.bg === 'custom') state.bgColor = $('customColor').value;
      paintBackground();
    });
  });
  $('customColor').addEventListener('input', function () {
    state.bg = 'custom'; state.bgColor = $('customColor').value;
    document.querySelectorAll('.up-swatch').forEach(function (s) { s.classList.remove('active'); });
    paintBackground();
  });

  $('downloadBtn').addEventListener('click', download);
  $('newImageBtn').addEventListener('click', reset);

  var cookie = $('cookieBanner');
  if (localStorage.getItem('rb-cookie-closed') === '1') cookie.classList.add('hidden');
  $('cookieClose').addEventListener('click', function () {
    cookie.classList.add('hidden');
    localStorage.setItem('rb-cookie-closed', '1');
  });
})();
