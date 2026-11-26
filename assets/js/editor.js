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
  }

  function updateButtons() {
    if ($('edUndo')) $('edUndo').disabled = historyIndex <= 0;
    if ($('edRedo')) $('edRedo').disabled = historyIndex >= history.length - 1;
  }

  function updateInfo() {
    var el = $('edInfo');
    if (el && canvas) el.textContent = canvas.width + ' × ' + canvas.height + ' px';
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
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    restore(history[historyIndex]);
    filterBase = null; filterOrigin = null;
    updateButtons();
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++;
    restore(history[historyIndex]);
    filterBase = null; filterOrigin = null;
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
  }

  function endCompare() {
    if (!compareBackup) return;
    restore(compareBackup);
    compareBackup = null;
    comparePinned = false;
    if ($('edCompare')) $('edCompare').classList.remove('active');
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
    if (frame) frame.style.backgroundImage = '';
  }

  function resetBackdrop() {
    if ($('edBgBlur')) $('edBgBlur').value = 0;
    if ($('edShadow')) $('edShadow').value = 0;
    clearTemplates();
    var sw = document.querySelector('.swatch[data-bg="transparent"], .up-swatch[data-bg="transparent"]');
    if (sw) sw.click();
    syncEffects();
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
    clearTemplates();
    hideRows();
    syncEffects();
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
      el.addEventListener('pointerdown', function () { filterBase = snapshot(); });
      el.addEventListener('input', function () {
        if (!filterBase) filterBase = filterOrigin || snapshot();
        filterOrigin = filterOrigin || filterBase;
        touched = true;
        applyFilters();
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
      if (el) el.addEventListener('input', syncEffects);
    });
    if ($('edBackdropReset')) $('edBackdropReset').addEventListener('click', resetBackdrop);

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

    document.querySelectorAll('.editor-template').forEach(function (tpl) {
      tpl.addEventListener('click', function () {
        document.querySelectorAll('.editor-template').forEach(function (t) { t.classList.remove('active'); });
        tpl.classList.add('active');
        window.__editorGradient = tpl.dataset.template;
        window.__editorGradientStops = tpl.dataset.template.match(/#[0-9a-fA-F]{6}/g) || ['#8ab4ff', '#c4a4ff'];
        if ($('edBgBlur')) $('edBgBlur').value = 0;
        paintFrame();
        syncEffects();
      });
    });

    // A solid background replaces any gradient template or blurred original.
    document.querySelectorAll('.swatch, .up-swatch').forEach(function (sw) {
      sw.addEventListener('click', function () {
        clearTemplates();
        if ($('edBgBlur')) $('edBgBlur').value = 0;
        syncEffects();
        var frame = $('resultFrame');
        if (frame) frame.style.backgroundImage = '';
      });
    });

    document.addEventListener('keydown', onKey);
    syncEffects();
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
      frame.style.backgroundColor = '';
    } else {
      frame.style.backgroundImage = '';
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
