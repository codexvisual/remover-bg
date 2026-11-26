/* Post-removal editor: history, transform, crop, adjustments, comparison */
(function () {
  'use strict';
  var canvas = null, ctx = null, ready = false;
  var history = [], future = [], filterBase = null, compareBackup = null;
  var $ = function (id) { return document.getElementById(id); };

  function snapshot() {
    if (!canvas || !canvas.width) return null;
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
  }

  function pushHistory() {
    var s = snapshot();
    if (!s) return;
    history.push(s);
    if (history.length > 40) history.shift();
    future = [];
    updateButtons();
  }

  function updateButtons() {
    if ($('edUndo')) $('edUndo').disabled = history.length < 2;
    if ($('edRedo')) $('edRedo').disabled = future.length === 0;
  }

  function updateInfo() {
    var el = $('edInfo');
    if (el && canvas) el.textContent = canvas.width + ' × ' + canvas.height + ' px';
  }

  function rotate(deg) {
    pushHistory();
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
  }

  function flip(axis) {
    pushHistory();
    var s = snapshot();
    var src = canvasFrom(s);
    canvas.width = s.w; canvas.height = s.h;
    ctx.save();
    ctx.translate(s.w / 2, s.h / 2);
    ctx.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1);
    ctx.drawImage(src, -s.w / 2, -s.h / 2);
    ctx.restore();
  }

  function crop() {
    pushHistory();
    var s = snapshot();
    var x = Math.max(0, Math.min(Number($('cropX').value) || 0, s.w - 1));
    var y = Math.max(0, Math.min(Number($('cropY').value) || 0, s.h - 1));
    var w = Math.max(1, Math.min(Number($('cropW').value) || s.w, s.w - x));
    var h = Math.max(1, Math.min(Number($('cropH').value) || s.h, s.h - y));
    var src = canvasFrom(s);
    canvas.width = w; canvas.height = h;
    ctx.drawImage(src, x, y, w, h, 0, 0, w, h);
    updateInfo();
  }

  function resize() {
    pushHistory();
    var s = snapshot();
    var w = Math.max(1, Number($('resizeW').value) || s.w);
    var h = Math.max(1, Number($('resizeH').value) || s.h);
    var src = canvasFrom(s);
    canvas.width = w; canvas.height = h;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    updateInfo();
  }

  function sliderValue(id, fallback) {
    var e = $(id); return e ? Number(e.value) : fallback;
  }

  function applyFilters() {
    var base = filterBase || snapshot();
    if (!base) return;
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
    filterBase = null;
    applyFilters();
  }

  function undo() {
    if (history.length < 2) return;
    future.push(history.pop());
    restore(history[history.length - 1]);
    updateButtons();
  }

  function redo() {
    if (!future.length) return;
    var s = future.pop();
    history.push(s);
    restore(s);
    updateButtons();
  }

  function startCompare() {
    if (!ready) return;
    compareBackup = snapshot();
    var img = $('originalPreview');
    if (!img || !img.complete) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    var w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    if ($('edCompare')) $('edCompare').classList.add('active');
  }

  function endCompare() {
    if (!compareBackup) return;
    restore(compareBackup);
    compareBackup = null;
    if ($('edCompare')) $('edCompare').classList.remove('active');
  }

  /* ---------- drag-to-crop ---------- */
  var drag = null;

  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

  function cropScale() {
    var box = $('cropOverlay');
    return { x: box.clientWidth / canvas.width, y: box.clientHeight / canvas.height };
  }

  function syncCropBox() {
    var box = $('cropBox'), overlay = $('cropOverlay');
    if (!box || !overlay || !canvas.width) return;
    var s = cropScale();
    var x = (Number($('cropX').value) || 0) * s.x;
    var y = (Number($('cropY').value) || 0) * s.y;
    var w = Math.max(20, (Number($('cropW').value) || canvas.width) * s.x);
    var h = Math.max(20, (Number($('cropH').value) || canvas.height) * s.y);
    box.style.left = clamp(x, 0, overlay.clientWidth - 20) + 'px';
    box.style.top = clamp(y, 0, overlay.clientHeight - 20) + 'px';
    box.style.width = clamp(w, 20, overlay.clientWidth) + 'px';
    box.style.height = clamp(h, 20, overlay.clientHeight) + 'px';
  }

  function updateCropInputs() {
    var box = $('cropBox'), overlay = $('cropOverlay');
    if (!box || !overlay) return;
    var s = cropScale();
    $('cropX').value = Math.round(parseFloat(box.style.left) / s.x);
    $('cropY').value = Math.round(parseFloat(box.style.top) / s.y);
    $('cropW').value = Math.round(parseFloat(box.style.width) / s.x);
    $('cropH').value = Math.round(parseFloat(box.style.height) / s.y);
  }

  function cropPointerDown(e) {
    e.preventDefault(); e.stopPropagation();
    var box = $('cropBox'), overlay = $('cropOverlay');
    var handle = e.target.dataset.handle || 'move';
    var r = box.getBoundingClientRect(), o = overlay.getBoundingClientRect();
    drag = {
      handle: handle,
      sx: e.clientX, sy: e.clientY,
      left: r.left - o.left, top: r.top - o.top,
      w: r.width, h: r.height,
      maxW: overlay.clientWidth, maxH: overlay.clientHeight
    };
    box.setPointerCapture(e.pointerId);
  }

  function cropPointerMove(e) {
    if (!drag) return;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    var left = drag.left, top = drag.top, right = drag.left + drag.w, bottom = drag.top + drag.h;
    if (drag.handle === 'move') {
      left = clamp(left + dx, 0, drag.maxW - drag.w);
      right = left + drag.w;
      top = clamp(top + dy, 0, drag.maxH - drag.h);
      bottom = top + drag.h;
    } else {
      var h = drag.handle;
      if (h.indexOf('w') >= 0) left = clamp(left + dx, 0, right - 24);
      if (h.indexOf('e') >= 0) right = clamp(right + dx, left + 24, drag.maxW);
      if (h.indexOf('n') >= 0) top = clamp(top + dy, 0, bottom - 24);
      if (h.indexOf('s') >= 0) bottom = clamp(bottom + dy, top + 24, drag.maxH);
    }
    var box = $('cropBox');
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.width = (right - left) + 'px';
    box.style.height = (bottom - top) + 'px';
    updateCropInputs();
  }

  function cropPointerUp() { drag = null; }

  function setCropActive(active) {
    var overlay = $('cropOverlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden', !active);
    if (active) syncCropBox();
  }

  function init() {
    canvas = $('resultCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    var view = $('resultView');
    if (!view) return;
    var observer = new MutationObserver(function () {
      if (view.classList.contains('hidden')) setCropActive(false);
      if (!view.classList.contains('hidden') && !ready && canvas.width > 1) {
        ready = true;
        observer.disconnect();
        setup();
      }
    });
    observer.observe(view, { attributes: true, attributeFilter: ['class'] });
  }

  function setup() {
    pushHistory();
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
        if (action === 'crop') {
          var row = $('cropRow');
          row.classList.toggle('hidden');
          $('cropX').value = Math.round(canvas.width * 0.15);
          $('cropY').value = Math.round(canvas.height * 0.15);
          $('cropW').value = Math.round(canvas.width * 0.7);
          $('cropH').value = Math.round(canvas.height * 0.7);
          $('cropRatio').value = 'free';
          setCropActive(!row.classList.contains('hidden'));
        }
        if (action === 'resize') {
          setCropActive(false);
          var rrow = $('resizeRow');
          rrow.classList.toggle('hidden');
          $('resizeW').value = canvas.width; $('resizeH').value = canvas.height;
          $('resizePreset').value = 'custom';
        }
      });
    });

    $('cropApply').addEventListener('click', function () { crop(); setCropActive(false); });

    var cropBox = $('cropBox'), cropOverlay = $('cropOverlay');
    cropBox.addEventListener('pointerdown', cropPointerDown);
    cropOverlay.addEventListener('pointermove', cropPointerMove);
    cropOverlay.addEventListener('pointerup', cropPointerUp);
    cropOverlay.addEventListener('pointercancel', cropPointerUp);
    ['cropX', 'cropY', 'cropW', 'cropH'].forEach(function (id) {
      $(id).addEventListener('change', function () { if (!cropOverlay.classList.contains('hidden')) syncCropBox(); });
    });
    window.addEventListener('resize', function () {
      if (!cropOverlay.classList.contains('hidden')) syncCropBox();
    });

    $('cropRatio').addEventListener('change', function () {
      var r = Number($('cropRatio').value);
      if (!r || !canvas) return;
      var w = Number($('cropW').value) || canvas.width;
      $('cropH').value = Math.max(1, Math.round(w / r));
    });

    $('resizeApply').addEventListener('click', resize);
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
      el.addEventListener('pointerdown', function () { filterBase = snapshot(); });
      el.addEventListener('input', function () {
        if (!filterBase) { pushHistory(); filterBase = snapshot(); }
        applyFilters();
      });
      el.addEventListener('change', function () { filterBase = null; });
    });
    $('edResetFilters').addEventListener('click', resetFilters);

    var compare = $('edCompare');
    compare.addEventListener('pointerdown', startCompare);
    compare.addEventListener('pointerup', endCompare);
    compare.addEventListener('pointerleave', endCompare);
    compare.addEventListener('pointercancel', endCompare);

    document.querySelectorAll('.editor-template').forEach(function (tpl) {
      tpl.addEventListener('click', function () {
        document.querySelectorAll('.editor-template').forEach(function (t) { t.classList.remove('active'); });
        tpl.classList.add('active');
        window.__editorGradient = tpl.dataset.template;
        window.__editorGradientStops = tpl.dataset.template.match(/#[0-9a-fA-F]{6}/g) || ['#8ab4ff', '#c4a4ff'];
        paintFrame();
      });
    });

    // clear template when normal swatches are used
    document.querySelectorAll('.swatch').forEach(function (sw) {
      sw.addEventListener('click', function () {
        window.__editorGradient = null;
        document.querySelectorAll('.editor-template').forEach(function (t) { t.classList.remove('active'); });
      });
    });

    document.addEventListener('keydown', function (e) {
      if (!ready || $('resultView').classList.contains('hidden')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    });
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
