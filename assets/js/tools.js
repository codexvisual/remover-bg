/* Full image toolkit — every tool runs locally in the browser */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var grid = $('toolGrid'), fieldsBox = $('toolFields'), drop = $('toolDrop');
  var fileInput = $('toolFile'), previewBox = $('previewBox');
  var processBtn = $('processBtn'), downloadBtn = $('downloadBtn'), resetBtn = $('resetBtn');
  var statusEl = $('toolStatus'), infoEl = $('fileInfo');

  if (!grid || !fieldsBox) return;

  var CFG = window.REMOVEBG_CONFIG || {};
  var state = { key: 'remover', file: null, image: null, result: null, format: 'png', quality: 0.92, busy: false };

  function v(id) { var e = $(id); return e ? e.value : ''; }
  function checked(id) { var e = $(id); return !!(e && e.checked); }
  function bytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }
  function toast(msg) { if (window.showToast) window.showToast(msg); }
  function setOutput(format, quality) { state.format = format; if (typeof quality === 'number') state.quality = quality; }

  function progress(pct, text) {
    var box = $('toolProgress'); if (!box) return;
    box.classList.remove('hidden');
    var bar = $('progressBar'); if (bar) bar.style.width = Math.max(3, Math.min(100, pct)) + '%';
    if (text) $('progressText').textContent = text;
  }
  function hideProgress() { var b = $('toolProgress'); if (b) b.classList.add('hidden'); }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve(img); URL.revokeObjectURL(url); };
      img.onerror = function () { reject(new Error('Ye image read nahi ho sakti.')); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }

  function showImage(src) {
    previewBox.innerHTML = '';
    var img = document.createElement('img');
    img.src = src; img.alt = 'Preview';
    previewBox.appendChild(img);
  }

  /* ---------------- tool definitions ---------------- */
  var TOOLS = {
    remover: {
      title: 'Background Remover', icon: 'i-spark', badge: 'AI',
      desc: 'AI se subject ko alag karo — transparent, white, black ya custom background ke saath.',
      fields: '<div class="field"><label>Background</label><select id="f_bg"><option value="transparent">Transparent (PNG)</option><option value="white">White</option><option value="black">Black</option><option value="custom">Custom colour</option></select></div>' +
        '<div class="field"><label>Custom colour</label><input type="color" id="f_bgcolor" value="#2563FF"></div>' +
        '<div class="field"><label>Output</label><select id="f_fmt"><option value="png">PNG</option><option value="jpeg">JPG</option></select></div>' +
        '<p class="form-note" style="width:100%;margin:0">Pehle upload par AI model download hota hai. Internet na ho to offline quick mode use hoga.</p>',
      run: async function (ctx, img, file, report) {
        var cut = await window.BackgroundEngine.remove(file, report);
        ctx.canvas.width = cut.width; ctx.canvas.height = cut.height;
        var bg = v('f_bg');
        if (bg !== 'transparent') {
          ctx.fillStyle = bg === 'white' ? '#ffffff' : bg === 'black' ? '#111827' : v('f_bgcolor');
          ctx.fillRect(0, 0, cut.width, cut.height);
        } else if (v('f_fmt') === 'jpeg') {
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cut.width, cut.height);
        }
        ctx.drawImage(cut, 0, 0);
        setOutput(v('f_fmt'), 0.94);
      }
    },

    resize: {
      title: 'Image Resizer', icon: 'i-crop', badge: 'SIZE',
      desc: 'Exact pixel size me resize karo — aspect ratio lock ke saath ya bina.',
      fields: '<div class="field"><label>Width (px)</label><input type="number" id="f_width" min="1" value="800"></div>' +
        '<div class="field"><label>Height (px)</label><input type="number" id="f_height" min="1" value="600"></div>' +
        '<div class="field check"><label><input type="checkbox" id="f_lock" checked> Lock ratio</label></div>' +
        '<div class="field"><label>Output</label><select id="f_fmt"><option value="png">PNG</option><option value="jpeg">JPG</option><option value="webp">WebP</option></select></div>' +
        '<div class="field"><label>Quality</label><input type="range" id="f_quality" min="30" max="100" value="92"></div>',
      onLoad: function (img) { $('f_width').value = img.naturalWidth; $('f_height').value = img.naturalHeight; },
      afterRender: function () {
        $('f_width').addEventListener('input', function () {
          if (checked('f_lock') && state.image) $('f_height').value = Math.round(Number(v('f_width')) * state.image.naturalHeight / state.image.naturalWidth);
        });
        $('f_height').addEventListener('input', function () {
          if (checked('f_lock') && state.image) $('f_width').value = Math.round(Number(v('f_height')) * state.image.naturalWidth / state.image.naturalHeight);
        });
      },
      run: function (ctx, img) {
        var w = Math.max(1, Number(v('f_width')) || img.naturalWidth);
        var h = Math.max(1, Number(v('f_height')) || img.naturalHeight);
        ctx.canvas.width = w; ctx.canvas.height = h;
        ctx.imageSmoothingQuality = 'high';
        var fmt = v('f_fmt');
        if (fmt !== 'png') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, 0, 0, w, h);
        setOutput(fmt, Number(v('f_quality')) / 100);
      }
    },

    convert: {
      title: 'Format Converter', icon: 'i-layers', badge: 'FORMAT',
      desc: 'PNG, JPG aur WebP ke beech convert karo — quality control ke saath.',
      fields: '<div class="field"><label>Convert to</label><select id="f_fmt"><option value="png">PNG</option><option value="jpeg">JPG</option><option value="webp">WebP</option></select></div>' +
        '<div class="field"><label>Quality (JPG / WebP)</label><input type="range" id="f_quality" min="30" max="100" value="92"></div>',
      run: function (ctx, img) {
        ctx.canvas.width = img.naturalWidth; ctx.canvas.height = img.naturalHeight;
        var fmt = v('f_fmt');
        if (fmt !== 'png') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
        ctx.drawImage(img, 0, 0);
        setOutput(fmt, Number(v('f_quality')) / 100);
      }
    },

    compress: {
      title: 'Image Compressor', icon: 'i-bolt', badge: 'SIZE',
      desc: 'Quality aur dimensions kam karke file size chhota karo — comparison ke saath.',
      fields: '<div class="field"><label>Quality</label><input type="range" id="f_quality" min="20" max="95" value="70"></div>' +
        '<div class="field"><label>Max width (0 = original)</label><input type="number" id="f_maxw" min="0" value="0"></div>' +
        '<div class="field"><label>Format</label><select id="f_fmt"><option value="jpeg">JPG</option><option value="webp">WebP</option><option value="png">PNG</option></select></div>',
      run: function (ctx, img) {
        var maxW = Number(v('f_maxw')) || img.naturalWidth;
        var scale = Math.min(1, maxW / img.naturalWidth);
        var w = Math.max(1, Math.round(img.naturalWidth * scale));
        var h = Math.max(1, Math.round(img.naturalHeight * scale));
        ctx.canvas.width = w; ctx.canvas.height = h;
        var fmt = v('f_fmt');
        if (fmt !== 'png') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        setOutput(fmt, Number(v('f_quality')) / 100);
      },
      afterRun: function () {
        var fmt = 'image/' + state.format;
        state.result.toBlob(function (blob) {
          var pct = state.file.size ? Math.max(0, Math.round((1 - blob.size / state.file.size) * 100)) : 0;
          statusEl.textContent = 'Original: ' + bytes(state.file.size) + ' → Compressed: ' + bytes(blob.size) + ' (' + pct + '% smaller)';
        }, fmt, state.quality);
        return false;
      }
    },

    crop: {
      title: 'Image Cropper', icon: 'i-crop', badge: 'CROP',
      desc: 'X, Y, width aur height set karke exact crop karo — ready aspect presets ke saath.',
      fields: '<div class="field"><label>Aspect preset</label><select id="f_aspect"><option value="free">Free</option><option value="1">1 : 1</option><option value="1.333">4 : 3</option><option value="1.777">16 : 9</option><option value="0.75">3 : 4</option></select></div>' +
        '<div class="field"><label>X</label><input type="number" id="f_x" min="0" value="0"></div>' +
        '<div class="field"><label>Y</label><input type="number" id="f_y" min="0" value="0"></div>' +
        '<div class="field"><label>Width</label><input type="number" id="f_w" min="1" value="100"></div>' +
        '<div class="field"><label>Height</label><input type="number" id="f_h" min="1" value="100"></div>' +
        '<button class="btn btn-sm btn-outline" type="button" data-action="full">Use full image</button>',
      onLoad: function (img) {
        $('f_x').value = 0; $('f_y').value = 0;
        $('f_w').value = img.naturalWidth; $('f_h').value = img.naturalHeight;
      },
      afterRender: function () {
        $('f_aspect').addEventListener('change', function () {
          if (!state.image || v('f_aspect') === 'free') return;
          var ratio = Number(v('f_aspect'));
          var w = Number(v('f_w')) || state.image.naturalWidth;
          $('f_h').value = Math.round(w / ratio);
        });
        fieldsBox.querySelector('[data-action="full"]').addEventListener('click', function () {
          if (!state.image) return;
          $('f_x').value = 0; $('f_y').value = 0;
          $('f_w').value = state.image.naturalWidth; $('f_h').value = state.image.naturalHeight;
        });
      },
      run: function (ctx, img) {
        var x = Math.max(0, Math.min(Number(v('f_x')) || 0, img.naturalWidth - 1));
        var y = Math.max(0, Math.min(Number(v('f_y')) || 0, img.naturalHeight - 1));
        var w = Math.max(1, Math.min(Number(v('f_w')) || img.naturalWidth, img.naturalWidth - x));
        var h = Math.max(1, Math.min(Number(v('f_h')) || img.naturalHeight, img.naturalHeight - y));
        ctx.canvas.width = w; ctx.canvas.height = h;
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        setOutput('png', 1);
      }
    },

    rotate: {
      title: 'Rotate & Flip', icon: 'i-refresh', badge: 'EDIT',
      desc: '90°, 180°, 270° rotate aur horizontal / vertical flip.',
      fields: '<div class="field"><label>Rotate</label><select id="f_deg"><option value="0">0°</option><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select></div>' +
        '<div class="field check"><label><input type="checkbox" id="f_fliph"> Flip horizontal</label></div>' +
        '<div class="field check"><label><input type="checkbox" id="f_flipv"> Flip vertical</label></div>',
      run: function (ctx, img) {
        var deg = Number(v('f_deg')) || 0;
        var swap = deg === 90 || deg === 270;
        var w = swap ? img.naturalHeight : img.naturalWidth;
        var h = swap ? img.naturalWidth : img.naturalHeight;
        ctx.canvas.width = w; ctx.canvas.height = h;
        ctx.translate(w / 2, h / 2);
        ctx.rotate(deg * Math.PI / 180);
        ctx.scale(checked('f_fliph') ? -1 : 1, checked('f_flipv') ? -1 : 1);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        setOutput('png', 1);
      }
    },

    effects: {
      title: 'Photo Effects', icon: 'i-palette', badge: 'LOOK',
      desc: 'Grayscale, sepia, brightness, contrast aur saturation — live settings ke saath.',
      fields: '<div class="field check"><label><input type="checkbox" id="f_gray"> Grayscale</label></div>' +
        '<div class="field check"><label><input type="checkbox" id="f_sepia"> Sepia</label></div>' +
        '<div class="field"><label>Brightness</label><input type="range" id="f_bright" min="50" max="150" value="100"></div>' +
        '<div class="field"><label>Contrast</label><input type="range" id="f_contrast" min="50" max="150" value="100"></div>' +
        '<div class="field"><label>Saturation</label><input type="range" id="f_sat" min="0" max="200" value="100"></div>',
      run: function (ctx, img) {
        ctx.canvas.width = img.naturalWidth; ctx.canvas.height = img.naturalHeight;
        var f = [];
        if (checked('f_gray')) f.push('grayscale(1)');
        if (checked('f_sepia')) f.push('sepia(1)');
        f.push('brightness(' + (Number(v('f_bright')) / 100) + ')');
        f.push('contrast(' + (Number(v('f_contrast')) / 100) + ')');
        f.push('saturate(' + (Number(v('f_sat')) / 100) + ')');
        ctx.filter = f.join(' ');
        ctx.drawImage(img, 0, 0);
        ctx.filter = 'none';
        setOutput('jpeg', 0.94);
      }
    },

    watermark: {
      title: 'Watermark Maker', icon: 'i-brush', badge: 'BRAND',
      desc: 'Apna text ya brand naam photo par lagao — size, colour, opacity aur position ke saath.',
      fields: '<div class="field"><label>Watermark text</label><input type="text" id="f_text" value="© Filofa Technology"></div>' +
        '<div class="field"><label>Size</label><input type="range" id="f_size" min="12" max="120" value="48"></div>' +
        '<div class="field"><label>Colour</label><input type="color" id="f_color" value="#ffffff"></div>' +
        '<div class="field"><label>Opacity</label><input type="range" id="f_alpha" min="10" max="100" value="70"></div>' +
        '<div class="field"><label>Position</label><select id="f_pos"><option value="br">Bottom right</option><option value="bl">Bottom left</option><option value="tr">Top right</option><option value="tl">Top left</option><option value="c">Centre</option></select></div>',
      run: function (ctx, img) {
        ctx.canvas.width = img.naturalWidth; ctx.canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        var text = v('f_text') || 'Watermark';
        var size = Number(v('f_size'));
        var pad = Math.round(size * 0.4);
        ctx.font = '700 ' + size + 'px Inter, Arial, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = Number(v('f_alpha')) / 100;
        ctx.fillStyle = v('f_color');
        ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size / 5;
        var m = ctx.measureText(text);
        var w = ctx.canvas.width, h = ctx.canvas.height, pos = v('f_pos');
        var x = pos.indexOf('l') >= 0 ? pad : pos === 'c' ? (w - m.width) / 2 : w - m.width - pad;
        var y = pos.indexOf('t') >= 0 ? pad + size / 2 : pos === 'c' ? h / 2 : h - pad - size / 2;
        ctx.fillText(text, x, y);
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        setOutput('png', 1);
      }
    },

    passport: {
      title: 'Passport Photo Maker', icon: 'i-camera', badge: 'ID',
      desc: 'Standard ID photo sizes — background colour aur vertical position ke saath.',
      fields: '<div class="field"><label>Photo size</label><select id="f_size"><option value="35x45">35 × 45 mm (standard)</option><option value="40x50">40 × 50 mm</option><option value="50x50">50 × 50 mm</option><option value="25x35">25 × 35 mm</option></select></div>' +
        '<div class="field"><label>Background</label><select id="f_bg"><option value="#ffffff">White</option><option value="#d9e2f0">Light grey</option><option value="#e9f1ff">Light blue</option></select></div>' +
        '<div class="field"><label>Vertical position</label><input type="range" id="f_offset" min="-40" max="40" value="0"></div>' +
        '<div class="field check"><label><input type="checkbox" id="f_remove"> Remove background first (AI)</label></div>',
      run: async function (ctx, img, file, report) {
        var dim = (v('f_size') || '35x45').split('x').map(Number);
        var w = dim[0] * 12, h = dim[1] * 12;
        ctx.canvas.width = w; ctx.canvas.height = h;
        ctx.fillStyle = v('f_bg'); ctx.fillRect(0, 0, w, h);
        var source = img;
        if (checked('f_remove')) {
          report(5, 'Removing background…');
          source = await window.BackgroundEngine.remove(file, report);
        }
        var scale = Math.max(w / source.naturalWidth || w / source.width, h / source.naturalHeight || h / source.height);
        var sw = (source.naturalWidth || source.width) * scale;
        var sh = (source.naturalHeight || source.height) * scale;
        var offset = Number(v('f_offset')) / 100 * h;
        ctx.drawImage(source, (w - sw) / 2, (h - sh) / 2 + offset, sw, sh);
        setOutput('jpeg', 0.95);
      }
    }
  };

  /* ---------------- UI wiring ---------------- */
  function renderGrid() {
    grid.innerHTML = '';
    Object.keys(TOOLS).forEach(function (key) {
      var tool = TOOLS[key];
      var card = document.createElement('div');
      card.className = 'card tool-card' + (key === state.key ? ' active' : '');
      card.dataset.key = key;
      card.innerHTML = '<div class="card-icon"><svg><use href="#' + tool.icon + '"/></svg></div><h3>' + tool.title + '</h3><p>' + tool.desc + '</p>';
      card.addEventListener('click', function () { selectTool(key); });
      grid.appendChild(card);
    });
  }

  function selectTool(key, scroll) {
    state.key = key;
    var tool = TOOLS[key];
    Array.prototype.forEach.call(grid.children, function (c) { c.classList.toggle('active', c.dataset.key === key); });
    $('toolBadge').textContent = tool.badge;
    $('toolTitle').textContent = tool.title;
    $('toolDesc').textContent = tool.desc;
    fieldsBox.innerHTML = tool.fields || '';
    previewBox.innerHTML = '<span class="placeholder">Preview yahin dikhega</span>';
    statusEl.textContent = '';
    infoEl.textContent = '';
    state.result = null;
    processBtn.disabled = !state.image;
    downloadBtn.disabled = true;
    if (tool.afterRender) tool.afterRender();
    if (state.image && tool.onLoad) tool.onLoad(state.image);
    if (scroll !== false) document.getElementById('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Please choose an image file.'); return; }
    if (file.size > (Number(CFG.maxFileSizeMB) || 15) * 1024 * 1024) { toast('Image 15 MB se badi hai.'); return; }
    try {
      state.file = file;
      state.image = await loadImage(file);
      state.result = null;
      showImage(URL.createObjectURL(file));
      infoEl.textContent = bytes(file.size) + ' · ' + state.image.naturalWidth + ' × ' + state.image.naturalHeight + ' px';
      statusEl.textContent = 'Image load ho gayi. Ab "Process image" dabayein.';
      processBtn.disabled = false;
      downloadBtn.disabled = true;
      var fn = TOOLS[state.key].onLoad;
      if (fn) fn(state.image);
    } catch (e) { toast(e.message || 'Could not load image.'); }
  }

  async function processImage() {
    if (!state.image || state.busy) return;
    state.busy = true;
    processBtn.disabled = true; downloadBtn.disabled = true;
    statusEl.textContent = '';
    progress(6, 'Preparing…');
    try {
      var canvas = window.BackgroundEngine.makeCanvas(1, 1);
      var ctx = canvas.getContext('2d');
      var tool = TOOLS[state.key];
      await tool.run(ctx, state.image, state.file, progress);
      state.result = canvas;
      showImage(canvas.toDataURL('image/' + state.format, state.quality));
      downloadBtn.disabled = false;
      progress(100, 'Done!');
      var custom = tool.afterRun && tool.afterRun();
      if (custom !== false) statusEl.textContent = 'Prepared: ' + canvas.width + ' × ' + canvas.height + ' px · ' + state.format.toUpperCase() + ' · ' + bytes(Math.round(canvas.width * canvas.height * 4 / 3));
      toast('Image ready — download kar sakte ho.');
    } catch (e) {
      console.error(e);
      statusEl.textContent = 'Error: ' + (e.message || 'Processing failed. Try another image.');
      toast('Processing failed. Details niche status me hain.');
    } finally {
      hideProgress();
      state.busy = false;
      processBtn.disabled = false;
    }
  }

  function download() {
    if (!state.result) return;
    var ext = state.format === 'jpeg' ? 'jpg' : state.format;
    state.result.toBlob(function (blob) {
      if (!blob) { toast('Download failed.'); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = state.key + '-image.' + ext;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('Saved ' + a.download);
    }, 'image/' + state.format, state.quality);
  }

  function reset() {
    state.file = null; state.image = null; state.result = null;
    fileInput.value = '';
    previewBox.innerHTML = '<span class="placeholder">Preview yahin dikhega</span>';
    infoEl.textContent = ''; statusEl.textContent = '';
    processBtn.disabled = true; downloadBtn.disabled = true;
  }

  renderGrid();
  selectTool(state.key, false);
  processBtn.disabled = true;

  drop.addEventListener('click', function () { fileInput.click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('drag'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('drag'); }); });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', function (e) { handleFile(e.target.files[0]); });
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
  processBtn.addEventListener('click', processImage);
  downloadBtn.addEventListener('click', download);
  resetBtn.addEventListener('click', reset);
})();
