/* Post-removal editor: history, transform, crop, trim, adjustments, backdrop effects */
(function () {
  'use strict';
  var canvas = null, ctx = null, ready = false;
  var history = [], historyIndex = -1, initialSnapshot = null;
  var filterBase = null, filterOrigin = null;
  var compareBackup = null, comparePinned = false, compareDownAt = 0;
  var $ = function (id) { return document.getElementById(id); };

  function snapshot() {
    if (!canvas || !canvas.width || !ctx) return null;
    return { w: canvas.width, h: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height) };
  }

  function canvasFrom(s) {
    var c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    c.getContext('2d').putImageData(s.data, 0, 0);
    return c;
  }

  function restore(s) {
    if (!s) return;
    canvas.width = s.w; canvas.height = s.h;
    ctx.putImageData(s.data, 0, 0);
    updateInfo();
    syncEffects();
    updateThumb();
  }

  /* Record the canvas *after* a change so undo and redo can replay exact states. */
  function commit() {
    var s = snapshot();
    if (!s) return;
    history = history.slice(0, historyIndex + 1);
    history.push(s);
    if (history.length > 40) history.shift();
    historyIndex = history.length - 1;
    updateButtons();
    updateThumb();
  }

  function updateButtons() {
    if ($('edUndo')) $('edUndo').disabled = historyIndex <= 0;
    if ($('edRedo')) $('edRedo').disabled = historyIndex >= history.length - 1;
  }

  function updateInfo() {
    var el = $('edInfo');
    if (el && canvas) el.textContent = canvas.width + ' × ' + canvas.height + ' px';
  }

  /* Small live thumbnail of the edited result in the bottom strip. */
  function updateThumb() {
    var tc = $('thumbCanvas');
    if (!tc || !canvas || !canvas.width) return;
    var scale = Math.min(92 / canvas.width, 92 / canvas.height, 1);
    var w = Math.max(1, Math.round(canvas.width * scale));
    var h = Math.max(1, Math.round(canvas.height * scale));
    if (tc.width !== w) tc.width = w;
    if (tc.height !== h) tc.height = h;
    var t = tc.getContext('2d');
    t.clearRect(0, 0, w, h);
    t.drawImage(canvas, 0, 0, w, h);
  }

  function syncSliderOut() {
    [['edBright', 'edBrightOut', '%'], ['edContrast', 'edContrastOut', '%'],
     ['edSaturate', 'edSaturateOut', '%'], ['edBlur', 'edBlurOut', 'px']].forEach(function (p) {
      var el = $(p[0]), out = $(p[1]);
      if (el && out) out.textContent = el.value + p[2];
    });
    var q = $('downloadQuality'), qo = $('qualityOut');
    if (q && qo) qo.textContent = q.value + '%';
  }

  function markPreset(name) {
    document.querySelectorAll('.ed-preset[data-preset]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.preset === name);
    });
    if ($('edAuto')) $('edAuto').classList.toggle('active', name === 'auto');
  }

  function markLook(name) {
    document.querySelectorAll('.ed-look').forEach(function (b) {
      b.classList.toggle('active', b.dataset.look === name);
    });
  }

  /* Filters that are baked into pixels must be committed before a geometry change. */
  function commitFilters() { filterBase = null; filterOrigin = null; }

  function rotate(deg) {
    if (!canvas) return;
    commitFilters();
    var s = snapshot();
    var src = canvasFrom(s);
    var out = document.createElement('canvas');
    out.width = s.h; out.height = s.w;
    var o = out.getContext('2d');
    o.translate(s.h / 2, s.w / 2);
    o.rotate(deg * Math.PI / 180);
    o.drawImage(src, -s.w / 2, -s.h / 2);
    canvas.width = out.width; canvas.height = out.height;
    ctx.drawImage(out, 0, 0);
    updateInfo();
    syncEffects();
    commit();
  }

  function flip(axis) {
    if (!canvas) return;
    commitFilters();
    var s = snapshot();
    var src = canvasFrom(s);
    canvas.width = s.w; canvas.height = s.h;
    ctx.save();
    ctx.translate(s.w / 2, s.h / 2);
    ctx.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1);
    ctx.drawImage(src, -s.w / 2, -s.h / 2);
    ctx.restore();
    syncEffects();
    commit();
  }

  function crop() {
    var s = snapshot();
    if (!s) return;
    commitFilters();
    var x = Math.max(0, Math.min(Number($('cropX').value) || 0, s.w - 1));
    var y = Math.max(0, Math.min(Number($('cropY').value) || 0, s.h - 1));
    var w = Math.max(1, Math.min(Number($('cropW').value) || s.w, s.w - x));
    var h = Math.max(1, Math.min(Number($('cropH').value) || s.h, s.h - y));
    var src = canvasFrom(s);
    canvas.width = w; canvas.height = h;
    ctx.drawImage(src, x, y, w, h, 0, 0, w, h);
    updateInfo();
    syncEffects();
    commit();
  }

  function resize() {
    var s = snapshot();
    if (!s) return;
    commitFilters();
    var w = Math.max(1, Math.min(8000, Number($('resizeW').value) || s.w));
    var h = Math.max(1, Math.min(8000, Number($('resizeH').value) || s.h));
    var src = canvasFrom(s);
    canvas.width = w; canvas.height = h;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    updateInfo();
    syncEffects();
    commit();
  }

  /* Automatically remove empty transparent margins. */
  function trim() {
    var s = snapshot();
    if (!s) return;
    var d = s.data.data, w = s.w, h = s.h;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    for (var y = 0; y < h; y++) {
      var row = y * w * 4;
      for (var x = 0; x < w; x++) {
        if (d[row + x * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return;
    var pad = Math.round(Math.min(w, h) * 0.01);
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    if (minX === 0 && minY === 0 && maxX === w - 1 && maxY === h - 1) {
      if (window.showToast) window.showToast('Nothing to trim — the image already fits its edges.');
      return;
    }
    commitFilters();
    var cw = maxX - minX + 1, ch = maxY - minY + 1;
    var src = canvasFrom(s);
    canvas.width = cw; canvas.height = ch;
    ctx.drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch);
    updateInfo();
    syncEffects();
    commit();
    if (window.showToast) window.showToast('Trimmed transparent edges.');
  }

  function sliderValue(id, fallback) {
    var e = $(id); return e ? Number(e.value) : fallback;
  }

  function applyFilters() {
    var base = filterBase || filterOrigin || snapshot();
    if (!base) return;
    filterBase = base;
    filterOrigin = filterOrigin || base;
    var src = canvasFrom(base);
    var f = 'brightness(' + sliderValue('edBright', 100) / 100 + ') ' +
            'contrast(' + sliderValue('edContrast', 100) / 100 + ') ' +
            'saturate(' + sliderValue('edSaturate', 100) / 100 + ') ' +
            'blur(' + sliderValue('edBlur', 0) + 'px)';
    canvas.width = base.w; canvas.height = base.h;
    ctx.filter = f;
    ctx.drawImage(src, 0, 0);
    ctx.filter = 'none';
    syncSliderOut();
  }

  function resetFilters() {
    ['edBright', 'edContrast', 'edSaturate'].forEach(function (id) { if ($(id)) $(id).value = 100; });
    if ($('edBlur')) $('edBlur').value = 0;
    if (filterOrigin) {
      restore(filterOrigin);
      commit();
    }
    filterBase = null;
    filterOrigin = null;
    markPreset('original');
    syncSliderOut();
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    restore(history[historyIndex]);
    filterBase = null; filterOrigin = null;
    markPreset(null);
    updateButtons();
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++;
    restore(history[historyIndex]);
    filterBase = null; filterOrigin = null;
    markPreset(null);
    updateButtons();
  }

  /* ---------- compare ---------- */
  function startCompare() {
    if (!ready || !canvas || compareBackup) return;
    var img = $('originalPreview');
    if (!img || !img.complete || !img.naturalWidth) return;
    compareBackup = snapshot();
    if (!compareBackup) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    var w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    if ($('edCompare')) $('edCompare').classList.add('active');
    if ($('thumbOriginal')) $('thumbOriginal').classList.add('active');
  }

  function endCompare() {
    if (!compareBackup) return;
    restore(compareBackup);
    compareBackup = null;
    comparePinned = false;
    if ($('edCompare')) $('edCompare').classList.remove('active');
    if ($('thumbOriginal')) $('thumbOriginal').classList.remove('active');
  }

  function toggleCompare() {
    if (compareBackup) { endCompare(); return; }
    startCompare();
    if (compareBackup) comparePinned = true;
  }

  /* ---------- backdrop effects ---------- */
  function currentEffects() {
    return { blur: sliderValue('edBgBlur', 0), shadow: sliderValue('edShadow', 0) };
  }

  function syncEffects() {
    var e = currentEffects();
    window.__editorEffects = e;
    if ($('bgBlurOut')) $('bgBlurOut').textContent = e.blur > 0 ? e.blur + 'px' : '0';
    if ($('shadowOut')) $('shadowOut').textContent = e.shadow > 0 ? String(e.shadow) : '0';
    var bg = $('frameBg'), cv = $('resultCanvas'), prev = $('originalPreview');
    if (bg) {
      if (e.blur > 0 && prev && prev.src && /^(blob:|data:|https?:)/.test(prev.src)) {
        if (bg.getAttribute('data-src') !== prev.src) {
          bg.style.backgroundImage = 'url("' + prev.src + '")';
          bg.setAttribute('data-src', prev.src);
        }
        bg.style.filter = 'blur(' + e.blur + 'px)';
        bg.classList.add('on');
      } else {
        bg.classList.remove('on');
        bg.style.filter = '';
      }
    }
    if (cv) {
      if (e.shadow > 0) {
        var y = 2 + e.shadow * 0.12;
        var b = 6 + e.shadow * 0.22;
        cv.style.filter = 'drop-shadow(0 ' + y.toFixed(1) + 'px ' + b.toFixed(1) + 'px rgba(15,23,42,' +
          Math.min(0.55, 0.18 + e.shadow / 300).toFixed(2) + '))';
      } else {
        cv.style.filter = '';
      }
    }
  }

  function clearTemplates() {
    window.__editorGradient = null;
    window.__editorGradientStops = null;
    document.querySelectorAll('.editor-template').forEach(function (t) { t.classList.remove('active'); });
    var frame = $('resultFrame');
    if (frame) {
      frame.style.backgroundImage = '';
      frame.style.backgroundSize = '';
      frame.style.backgroundPosition = '';
    }
  }

  function resetBackdrop() {
    if ($('edBgBlur')) $('edBgBlur').value = 0;
    if ($('edShadow')) $('edShadow').value = 0;
    clearTemplates();
    var sw = document.querySelector('.swatch[data-bg="transparent"], .up-swatch[data-bg="transparent"]');
    if (sw) sw.click();
    syncEffects();
    markLook('clean');
  }

  /* ---------- one-click looks ---------- */
  var LOOKS = {
    clean: { blur: 0, shadow: 0 },
    depth: { blur: 18, shadow: 34 },
    studio: { blur: 0, shadow: 24, bg: 'white' },
    night: { blur: 12, shadow: 46, template: 't4' }
  };

  function applyLook(name) {
    var look = LOOKS[name];
    if (!look) return;
    resetBackdrop();
    if (look.template) {
      var tpl = document.querySelector('.editor-template.' + look.template);
      if (tpl) tpl.click();
    } else if (look.bg) {
      var sw = document.querySelector('.swatch[data-bg="' + look.bg + '"], .up-swatch[data-bg="' + look.bg + '"]');
      if (sw) sw.click();
    }
    if ($('edBgBlur')) $('edBgBlur').value = look.blur;
    if ($('edShadow')) $('edShadow').value = look.shadow;
    syncEffects();
    markLook(name);
  }

  /* ---------- colour presets + smart auto enhance ---------- */
  var PRESETS = {
    original: { b: 100, c: 100, s: 100, blur: 0 },
    vivid: { b: 104, c: 112, s: 134, blur: 0 },
    warm: { b: 106, c: 103, s: 118, blur: 0 },
    cool: { b: 99, c: 107, s: 110, blur: 0 },
    bw: { b: 103, c: 110, s: 0, blur: 0 },
    soft: { b: 105, c: 97, s: 106, blur: 1 }
  };

  function filterBaseForChange() {
    if (!filterOrigin) filterOrigin = snapshot();
    filterBase = filterOrigin;
  }

  function applyPreset(name) {
    var p = PRESETS[name];
    if (!p) return;
    filterBaseForChange();
    if (!filterBase) return;
    $('edBright').value = p.b;
    $('edContrast').value = p.c;
    $('edSaturate').value = p.s;
    $('edBlur').value = p.blur;
    applyFilters();
    filterBase = null;
    commit();
    markPreset(name);
  }

  function percentile(hist, total, p) {
    var target = total * p, run = 0;
    for (var i = 0; i < 256; i++) { run += hist[i]; if (run >= target) return i; }
    return 255;
  }

  function autoEnhance() {
    var base = filterOrigin || snapshot();
    if (!base) return;
    var scale = Math.min(1, 180 / Math.max(base.w, base.h));
    var sample = document.createElement('canvas');
    sample.width = Math.max(1, Math.round(base.w * scale));
    sample.height = Math.max(1, Math.round(base.h * scale));
    var sc = sample.getContext('2d');
    sc.drawImage(canvasFrom(base), 0, 0, sample.width, sample.height);
    var data = sc.getImageData(0, 0, sample.width, sample.height).data;
    var hist = new Uint32Array(256), total = 0, sum = 0, chroma = 0;
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 24) continue;
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      hist[l]++; total++; sum += l;
      chroma += Math.max(r, g, b) - Math.min(r, g, b);
    }
    if (!total) return;
    var mean = sum / total;
    var lo = percentile(hist, total, 0.02);
    var hi = percentile(hist, total, 0.98);
    if (hi - lo < 16) { lo = Math.max(0, Math.round(mean - 40)); hi = Math.min(255, Math.round(mean + 40)); }
    var contrast = Math.max(1, Math.min(1.32, 255 / Math.max(48, hi - lo)));
    var newMean = (mean - 128) * contrast + 128;
    var bright = Math.max(0.9, Math.min(1.14, 128 / Math.max(20, newMean)));
    var sat = (chroma / total) < 16 ? 1 : 1.08;
    filterBaseForChange();
    $('edBright').value = Math.round(bright * 100);
    $('edContrast').value = Math.round(contrast * 100);
    $('edSaturate').value = Math.round(sat * 100);
    $('edBlur').value = 0;
    applyFilters();
    filterBase = null;
    commit();
    markPreset('auto');
    if (window.showToast) window.showToast('Auto enhance applied — undo with Ctrl+Z.');
  }

  /* ---------- grain surgery: median denoise ---------- */
  function denoise() {
    var s = snapshot();
    if (!s) return;
    commitFilters();
    var w = s.w, h = s.h;
    var src = s.data.data;
    var out = new Uint8ClampedArray(src.length);
    for (var i = 0; i < src.length; i += 4) out[i + 3] = src[i + 3];
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;
        if (src[idx + 3] === 0) { out[idx] = src[idx]; out[idx + 1] = src[idx + 1]; out[idx + 2] = src[idx + 2]; continue; }
        var r = [], g = [], b = [];
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            var nx = Math.min(w - 1, Math.max(0, x + dx));
            var ny = Math.min(h - 1, Math.max(0, y + dy));
            var nidx = (ny * w + nx) * 4;
            r.push(src[nidx]); g.push(src[nidx + 1]); b.push(src[nidx + 2]);
          }
        }
        r.sort(function (a, bb) { return a - bb; });
        g.sort(function (a, bb) { return a - bb; });
        b.sort(function (a, bb) { return a - bb; });
        out[idx] = r[4]; out[idx + 1] = g[4]; out[idx + 2] = b[4];
      }
    }
    var c = canvasFrom(s);
    var id = c.getContext('2d').createImageData(w, h);
    id.data.set(out);
    c.getContext('2d').putImageData(id, 0, 0);
    canvas.width = w; canvas.height = h;
    ctx.drawImage(c, 0, 0);
    syncEffects();
    commit();
    if (window.showToast) window.showToast('Grain surgery applied — undo with Ctrl+Z.');
  }

  /* ---------- design tools: text, elements, templates ---------- */
  function closeDesign() {
    ['text', 'shape', 'template'].forEach(function (n) {
      var f = $(n + 'Form');
      if (f) f.classList.add('hidden');
      var item = document.querySelector('[data-design-item="' + n + '"]');
      if (item) item.classList.remove('open');
      var btn = document.querySelector('[data-design="' + n + '"]');
      if (btn) btn.textContent = 'Open';
    });
  }

  function toggleDesign(name) {
    var form = $(name + 'Form');
    if (!form) return;
    var open = form.classList.contains('hidden');
    closeDesign();
    if (!open) return;
    form.classList.remove('hidden');
    var item = document.querySelector('[data-design-item="' + name + '"]');
    if (item) item.classList.add('open');
    var btn = document.querySelector('[data-design="' + name + '"]');
    if (btn) btn.textContent = 'Close';
  }

  function addText() {
    var input = $('textInput');
    var text = input ? input.value.trim() : '';
    if (!text) {
      if (window.showToast) window.showToast('Type some text first.');
      if (input) input.focus();
      return;
    }
    var s = snapshot();
    if (!s) return;
    commitFilters();
    var sizes = { s: 0.055, m: 0.085, l: 0.13 };
    var size = Math.round(Math.min(s.w, s.h) * (sizes[($('textSize') || {}).value] || 0.085));
    ctx.save();
    ctx.font = (($('textWeight') || {}).value || '700') + ' ' + size + 'px Poppins, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ($('textColor') || {}).value || '#0f172a';
    ctx.shadowColor = 'rgba(15,23,42,.28)';
    ctx.shadowBlur = Math.max(4, size * 0.22);
    ctx.shadowOffsetY = Math.max(1, size * 0.07);
    ctx.fillText(text, s.w / 2, s.h * 0.87, s.w * 0.9);
    ctx.restore();
    syncEffects();
    commit();
    if (input) input.value = '';
    if (window.showToast) window.showToast('Text added — undo with Ctrl+Z.');
  }

  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function starPath(c, cx, cy, outer, inner) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var angle = -Math.PI / 2 + i * Math.PI / 5;
      var radius = i % 2 ? inner : outer;
      var px = cx + Math.cos(angle) * radius;
      var py = cy + Math.sin(angle) * radius;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  }

  function addShape(kind) {
    var s = snapshot();
    if (!s) return;
    commitFilters();
    var src = canvasFrom(s);
    var out = document.createElement('canvas');
    out.width = s.w; out.height = s.h;
    var o = out.getContext('2d');
    var color = ($('shapeColor') || {}).value || '#2563FF';
    var cx = s.w / 2, cy = s.h * 0.55, r = Math.min(s.w, s.h) * 0.4;
    o.fillStyle = color;
    o.strokeStyle = color;
    if (kind === 'circle') {
      o.beginPath(); o.arc(cx, cy, r, 0, Math.PI * 2); o.fill();
    } else if (kind === 'square') {
      var side = r * 1.7;
      roundRectPath(o, cx - side / 2, cy - side / 2, side, side, side * 0.18);
      o.fill();
    } else if (kind === 'ring') {
      o.lineWidth = r * 0.22;
      o.beginPath(); o.arc(cx, cy, r, 0, Math.PI * 2); o.stroke();
    } else if (kind === 'star') {
      starPath(o, cx, cy, r, r * 0.45);
      o.fill();
    }
    o.drawImage(src, 0, 0);
    canvas.width = s.w; canvas.height = s.h;
    ctx.drawImage(out, 0, 0);
    syncEffects();
    commit();
    if (window.showToast) window.showToast('Element added behind your subject.');
  }

  /* ---------- copy edited cut-out ---------- */
  function copyImage() {
    if (!canvas) return;
    var fail = function () {
      if (window.showToast) window.showToast('Copy is not available here — use Download instead.');
    };
    if (!navigator.clipboard || !window.ClipboardItem) { fail(); return; }
    canvas.toBlob(function (blob) {
      if (!blob) { fail(); return; }
      try {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function () {
          if (window.showToast) window.showToast('Transparent PNG copied to the clipboard.');
        }).catch(fail);
      } catch (e) { fail(); }
    }, 'image/png');
  }

  /* ---------- tabs ---------- */
  var TABS = {
    cutout: { title: 'Cutout', copy: 'Clean up the cut-out, then choose a new background.' },
    background: { title: 'Background', copy: 'Colours and templates. The cut-out stays separate.' },
    effects: { title: 'Effects', copy: 'Depth and shadow to make the subject pop.' },
    adjust: { title: 'Adjust', copy: 'One-click looks and fine colour control.' },
    design: { title: 'Design', copy: 'Add text, elements or a ready-made template.' }
  };

  function activateTab(name) {
    document.querySelectorAll('.studio-tab').forEach(function (t) {
      var on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.ed-pane').forEach(function (p) {
      p.classList.toggle('hidden', p.dataset.pane !== name);
    });
    var meta = TABS[name] || TABS.cutout;
    if ($('panelTitle')) $('panelTitle').textContent = meta.title;
    if ($('panelCopy')) $('panelCopy').textContent = meta.copy;
  }


  /* ---------- drag-to-crop ---------- */
  var drag = null;

  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

  function cropScale() {
    var box = $('cropOverlay');
    if (!box || !canvas || !canvas.width) return { x: 1, y: 1 };
    return { x: box.clientWidth / canvas.width || 1, y: box.clientHeight / canvas.height || 1 };
  }

  function syncCropBox() {
    var box = $('cropBox'), overlay = $('cropOverlay');
    if (!box || !overlay || !canvas || !canvas.width) return;
    if (!overlay.clientWidth) return;
    var s = cropScale();
    var x = (Number($('cropX').value) || 0) * s.x;
    var y = (Number($('cropY').value) || 0) * s.y;
    var w = Math.max(20, (Number($('cropW').value) || canvas.width) * s.x);
    var h = Math.max(20, (Number($('cropH').value) || canvas.height) * s.y);
    box.style.left = clamp(x, 0, Math.max(0, overlay.clientWidth - 20)) + 'px';
    box.style.top = clamp(y, 0, Math.max(0, overlay.clientHeight - 20)) + 'px';
    box.style.width = clamp(w, 20, overlay.clientWidth) + 'px';
    box.style.height = clamp(h, 20, overlay.clientHeight) + 'px';
  }

  function updateCropInputs() {
    var box = $('cropBox'), overlay = $('cropOverlay');
    if (!box || !overlay) return;
    var s = cropScale();
    $('cropX').value = Math.round(parseFloat(box.style.left) / s.x) || 0;
    $('cropY').value = Math.round(parseFloat(box.style.top) / s.y) || 0;
    $('cropW').value = Math.round(parseFloat(box.style.width) / s.x) || 1;
    $('cropH').value = Math.round(parseFloat(box.style.height) / s.y) || 1;
  }

  function cropPointerDown(e) {
    e.preventDefault(); e.stopPropagation();
    var box = $('cropBox'), overlay = $('cropOverlay');
    var handle = (e.target.dataset && e.target.dataset.handle) || 'move';
    var r = box.getBoundingClientRect(), o = overlay.getBoundingClientRect();
    drag = {
      handle: handle,
      sx: e.clientX, sy: e.clientY,
      left: r.left - o.left, top: r.top - o.top,
      w: r.width, h: r.height,
      maxW: overlay.clientWidth, maxH: overlay.clientHeight
    };
    try { box.setPointerCapture(e.pointerId); } catch (err) {}
    box.classList.add('dragging');
  }

  function cropPointerMove(e) {
    if (!drag) return;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    var left = drag.left, top = drag.top, right = drag.left + drag.w, bottom = drag.top + drag.h;
    if (drag.handle === 'move') {
      left = clamp(left + dx, 0, Math.max(0, drag.maxW - drag.w));
      right = left + drag.w;
      top = clamp(top + dy, 0, Math.max(0, drag.maxH - drag.h));
      bottom = top + drag.h;
    } else {
      var h = drag.handle;
      if (h.indexOf('w') >= 0) left = clamp(left + dx, 0, right - 24);
      if (h.indexOf('e') >= 0) right = clamp(right + dx, left + 24, drag.maxW);
      if (h.indexOf('n') >= 0) top = clamp(top + dy, 0, bottom - 24);
      if (h.indexOf('s') >= 0) bottom = clamp(bottom + dy, top + 24, drag.maxH);

      var ratio = Number($('cropRatio') && $('cropRatio').value) || 0;
      if (ratio) {
        var wpx = right - left, hpx = wpx / ratio;
        if (top + hpx > drag.maxH) {
          hpx = drag.maxH - top;
          wpx = hpx * ratio;
          right = left + wpx;
          if (right > drag.maxW) { right = drag.maxW; left = Math.max(0, right - wpx); }
        }
        bottom = top + hpx;
      }
    }
    var box = $('cropBox');
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.width = Math.max(1, right - left) + 'px';
    box.style.height = Math.max(1, bottom - top) + 'px';
    updateCropInputs();
  }

  function cropPointerUp() {
    drag = null;
    var box = $('cropBox');
    if (box) box.classList.remove('dragging');
  }

  function setCropActive(active) {
    var overlay = $('cropOverlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden', !active);
    if (active) {
      syncCropBox();
      setToolActive('crop', true);
    } else {
      setToolActive('crop', false);
    }
  }

  function setToolActive(name, on) {
    var btn = document.querySelector('[data-edit="' + name + '"]');
    if (btn) btn.classList.toggle('active', !!on);
  }

  function hideRows() {
    ['cropRow', 'resizeRow'].forEach(function (id) { if ($(id)) $(id).classList.add('hidden'); });
    setCropActive(false);
    setToolActive('crop', false);
    setToolActive('resize', false);
  }

  function toggleCrop() {
    var row = $('cropRow');
    if (!row) return;
    var open = row.classList.contains('hidden');
    hideRows();
    if (open) {
      row.classList.remove('hidden');
      $('cropX').value = Math.round(canvas.width * 0.15);
      $('cropY').value = Math.round(canvas.height * 0.15);
      $('cropW').value = Math.round(canvas.width * 0.7);
      $('cropH').value = Math.round(canvas.height * 0.7);
      $('cropRatio').value = 'free';
      setCropActive(true);
    }
  }

  function toggleResize() {
    var row = $('resizeRow');
    if (!row) return;
    var open = row.classList.contains('hidden');
    hideRows();
    if (open) {
      row.classList.remove('hidden');
      $('resizeW').value = canvas.width;
      $('resizeH').value = canvas.height;
      $('resizePreset').value = 'custom';
      setToolActive('resize', true);
    }
  }

  function resetAll() {
    if (!initialSnapshot) return;
    restore(initialSnapshot);
    ['edBright', 'edContrast', 'edSaturate'].forEach(function (id) { if ($(id)) $(id).value = 100; });
    if ($('edBlur')) $('edBlur').value = 0;
    filterBase = null; filterOrigin = null;
    hideRows();
    resetBackdrop();
    markPreset('original');
    syncSliderOut();
    commit();
  }

  /* ---------- setup ---------- */
  function init() {
    canvas = $('resultCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    var view = $('resultView');
    if (!view) return;

    var observer = new MutationObserver(function () {
      if (view.classList.contains('hidden')) {
        setCropActive(false);
        return;
      }
      mount();
    });
    observer.observe(view, { attributes: true, attributeFilter: ['class'] });

    /* Fallback poll: some flows reveal the result before this script loads. */
    var tries = 0;
    var timer = setInterval(function () {
      if (mount() || ++tries > 900) {
        clearInterval(timer);
        if (ready) observer.disconnect();
      }
    }, 200);
  }

  function mount() {
    if (ready) return true;
    var view = $('resultView');
    if (!view || view.classList.contains('hidden')) return false;
    if (!canvas || !canvas.width || canvas.width < 2) return false;
    ready = true;
    setup();
    return true;
  }

  /* Called by the uploader whenever a brand-new cut-out is shown. */
  function refresh() {
    if (!ready) return mount();
    history = []; historyIndex = -1;
    compareBackup = null; comparePinned = false;
    filterBase = null; filterOrigin = null;
    initialSnapshot = snapshot();
    if (initialSnapshot) { history = [initialSnapshot]; historyIndex = 0; }
    updateButtons(); updateInfo();
    ['edBright', 'edContrast', 'edSaturate'].forEach(function (id) { if ($(id)) $(id).value = 100; });
    if ($('edBlur')) $('edBlur').value = 0;
    if ($('edBgBlur')) $('edBgBlur').value = 0;
    if ($('edShadow')) $('edShadow').value = 0;
    if ($('thumbOriginal')) $('thumbOriginal').classList.remove('active');
    clearTemplates();
    hideRows();
    closeDesign();
    markPreset('original');
    markLook('clean');
    activateTab('cutout');
    syncSliderOut();
    syncEffects();
    updateThumb();
  }

  function setup() {
    initialSnapshot = snapshot();
    history = initialSnapshot ? [initialSnapshot] : [];
    historyIndex = history.length - 1;
    updateInfo();
    updateButtons();

    $('edUndo').addEventListener('click', undo);
    $('edRedo').addEventListener('click', redo);

    document.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.dataset.edit;
        if (action === 'rotL') rotate(-90);
        if (action === 'rotR') rotate(90);
        if (action === 'flipH') flip('h');
        if (action === 'flipV') flip('v');
        if (action === 'crop') toggleCrop();
        if (action === 'resize') toggleResize();
        if (action === 'trim') trim();
      });
    });

    $('cropApply').addEventListener('click', function () { crop(); setCropActive(false); });

    var cropBox = $('cropBox'), cropOverlay = $('cropOverlay');
    if (cropBox && cropOverlay) {
      cropBox.addEventListener('pointerdown', cropPointerDown);
      cropOverlay.addEventListener('pointermove', cropPointerMove);
      cropOverlay.addEventListener('pointerup', cropPointerUp);
      cropOverlay.addEventListener('pointercancel', cropPointerUp);
      ['cropX', 'cropY', 'cropW', 'cropH'].forEach(function (id) {
        $(id).addEventListener('change', function () {
          if (!cropOverlay.classList.contains('hidden')) syncCropBox();
        });
      });
    }
    window.addEventListener('resize', function () {
      if (cropOverlay && !cropOverlay.classList.contains('hidden')) syncCropBox();
      syncEffects();
    });

    $('cropRatio').addEventListener('change', function () {
      var r = Number($('cropRatio').value);
      if (!r || !canvas) return;
      var w = Number($('cropW').value) || canvas.width;
      var h = Math.max(1, Math.round(w / r));
      if (h > canvas.height) { h = canvas.height; w = Math.round(h * r); }
      $('cropW').value = Math.min(canvas.width, w);
      $('cropH').value = h;
      if (cropOverlay && !cropOverlay.classList.contains('hidden')) syncCropBox();
    });

    $('resizeApply').addEventListener('click', function () { resize(); setToolActive('resize', false); });
    $('resizePreset').addEventListener('change', function () {
      var parts = $('resizePreset').value.split('x');
      if (parts.length !== 2 || !Number(parts[0])) return;
      $('resizeW').value = parts[0]; $('resizeH').value = parts[1];
    });
    $('resizeW').addEventListener('input', function () {
      if ($('resizeLock').checked && canvas) $('resizeH').value = Math.round(Number($('resizeW').value) * canvas.height / canvas.width);
    });
    $('resizeH').addEventListener('input', function () {
      if ($('resizeLock').checked && canvas) $('resizeW').value = Math.round(Number($('resizeH').value) * canvas.width / canvas.height);
    });

    var sliders = ['edBright', 'edContrast', 'edSaturate', 'edBlur'];
    sliders.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var touched = false;
      el.addEventListener('pointerdown', filterBaseForChange);
      el.addEventListener('input', function () {
        filterBaseForChange();
        touched = true;
        applyFilters();
        markPreset(null);
        syncSliderOut();
      });
      el.addEventListener('change', function () {
        filterBase = null;
        if (touched) { commit(); touched = false; }
      });
      el.addEventListener('dblclick', function () { resetFilters(); });
    });
    $('edResetFilters').addEventListener('click', resetFilters);
    if ($('edResetAll')) $('edResetAll').addEventListener('click', resetAll);

    ['edBgBlur', 'edShadow'].forEach(function (id) {
      var el = $(id);
      if (el) {
        el.addEventListener('input', function () {
          syncEffects();
          markLook(null);
        });
      }
    });
    if ($('edBackdropReset')) $('edBackdropReset').addEventListener('click', resetBackdrop);

    /* Toolbar tabs + side-panel tools */
    document.querySelectorAll('.studio-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { activateTab(tab.dataset.tab); });
    });
    document.querySelectorAll('.ed-preset[data-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () { applyPreset(btn.dataset.preset); });
    });
    document.querySelectorAll('.ed-look').forEach(function (btn) {
      btn.addEventListener('click', function () { applyLook(btn.dataset.look); });
    });
    document.querySelectorAll('[data-design]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleDesign(btn.dataset.design); });
    });
    document.querySelectorAll('[data-shape]').forEach(function (btn) {
      btn.addEventListener('click', function () { addShape(btn.dataset.shape); });
    });
    if ($('textApply')) $('textApply').addEventListener('click', addText);
    if ($('textInput')) $('textInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addText(); }
    });
    if ($('edAuto')) $('edAuto').addEventListener('click', autoEnhance);
    if ($('edDenoise')) $('edDenoise').addEventListener('click', denoise);
    if ($('edCopy')) $('edCopy').addEventListener('click', copyImage);
    if ($('thumbOriginal')) $('thumbOriginal').addEventListener('click', toggleCompare);
    if ($('thumbEdit')) $('thumbEdit').addEventListener('click', endCompare);
    if ($('downloadQuality')) $('downloadQuality').addEventListener('input', syncSliderOut);

    /* Compare: hold with the mouse, tap to toggle on touch. */
    var compare = $('edCompare');
    if (compare) {
      compare.addEventListener('pointerdown', function (e) {
        compareDownAt = Date.now();
        if (compareBackup) { endCompare(); return; }
        startCompare();
      });
      compare.addEventListener('pointerup', function (e) {
        if (!compareBackup) return;
        var quick = Date.now() - compareDownAt < 600;
        if (e.pointerType !== 'mouse' && quick) { comparePinned = true; return; }
        if (!comparePinned) endCompare();
      });
      compare.addEventListener('pointerleave', function () {
        if (!comparePinned) endCompare();
      });
      compare.addEventListener('pointercancel', function () { endCompare(); });
    }

    /* Draggable divider between the original and the removed image. */
    var divider = $('compareDivider'), view = $('compareView');
    if (divider && view) {
      var setSplit = function (pct) {
        view.style.setProperty('--split', Math.max(28, Math.min(72, pct)) + '%');
      };
      var moveSplit = function (clientX) {
        var r = view.getBoundingClientRect();
        if (r.width) setSplit((clientX - r.left) / r.width * 100);
      };
      divider.addEventListener('pointerdown', function (e) {
        if (window.innerWidth <= 640) return;
        divider.setPointerCapture(e.pointerId);
        divider.classList.add('dragging');
        moveSplit(e.clientX);
      });
      divider.addEventListener('pointermove', function (e) {
        if (divider.classList.contains('dragging')) moveSplit(e.clientX);
      });
      divider.addEventListener('pointerup', function () { divider.classList.remove('dragging'); });
      divider.addEventListener('pointercancel', function () { divider.classList.remove('dragging'); });
      divider.addEventListener('keydown', function (e) {
        var current = parseFloat((view.style.getPropertyValue('--split') || '50%')) || 50;
        if (e.key === 'ArrowLeft') { e.preventDefault(); setSplit(current - 3); }
        if (e.key === 'ArrowRight') { e.preventDefault(); setSplit(current + 3); }
      });
    }

    document.querySelectorAll('.editor-template').forEach(function (tpl) {
      tpl.addEventListener('click', function () {
        document.querySelectorAll('.editor-template').forEach(function (t) { t.classList.remove('active'); });
        tpl.classList.add('active');
        window.__editorGradient = tpl.dataset.template;
        window.__editorGradientStops = tpl.dataset.template.match(/#[0-9a-fA-F]{6}/g) || ['#8ab4ff', '#c4a4ff'];
        if ($('edBgBlur')) $('edBgBlur').value = 0;
        paintFrame();
        syncEffects();
        markLook(null);
      });
    });

    // A solid background replaces any gradient template or blurred original.
    document.querySelectorAll('.swatch, .up-swatch').forEach(function (sw) {
      sw.addEventListener('click', function () {
        clearTemplates();
        if ($('edBgBlur')) $('edBgBlur').value = 0;
        syncEffects();
        markLook(null);
        var frame = $('resultFrame');
        if (frame) frame.style.backgroundImage = '';
      });
    });

    document.addEventListener('keydown', onKey);
    syncSliderOut();
    syncEffects();
    updateThumb();
  }

  function onKey(e) {
    if (!ready) return;
    var view = $('resultView');
    if (!view || view.classList.contains('hidden')) return;
    var t = e.target;
    var typing = t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    var mod = e.ctrlKey || e.metaKey;
    var key = (e.key || '').toLowerCase();

    if (mod && (key === 'z' || key === 'y')) {
      if (typing) return;
      e.preventDefault();
      if (key === 'y' || e.shiftKey) redo(); else undo();
      return;
    }
    if (mod || e.altKey || typing) return;
    if (key === 'r') { e.preventDefault(); rotate(e.shiftKey ? -90 : 90); }
    else if (key === 'f') { e.preventDefault(); flip(e.shiftKey ? 'v' : 'h'); }
    else if (key === 'c') { e.preventDefault(); toggleCrop(); }
    else if (key === 'e') { e.preventDefault(); toggleResize(); }
    else if (key === 't') { e.preventDefault(); trim(); }
  }

  function paintFrame() {
    var frame = $('resultFrame');
    if (!frame) return;
    if (window.__editorGradient) {
      frame.style.backgroundImage = window.__editorGradient;
      frame.style.backgroundSize = 'cover';
      frame.style.backgroundPosition = 'center';
      frame.style.backgroundColor = '';
    } else {
      frame.style.backgroundImage = '';
      frame.style.backgroundSize = '';
      frame.style.backgroundPosition = '';
    }
  }

  window.EditorAPI = {
    mount: mount,
    refresh: refresh,
    isReady: function () { return ready; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
