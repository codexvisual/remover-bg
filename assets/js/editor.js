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

  function init() {
    canvas = $('resultCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    var view = $('resultView');
    if (!view) return;
    var observer = new MutationObserver(function () {
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
          $('cropX').value = 0; $('cropY').value = 0;
          $('cropW').value = canvas.width; $('cropH').value = canvas.height;
        }
      });
    });

    $('cropApply').addEventListener('click', crop);

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
