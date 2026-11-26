/* Small utility tools: resize, convert format, passport photo layout */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve(img); URL.revokeObjectURL(url); };
      img.onerror = function () { reject(new Error('Cannot read that image.')); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }

  function preview(holder, url) {
    if (!holder) return;
    var old = holder.querySelector('img');
    if (old) old.remove();
    var img = new Image();
    img.src = url;
    img.style.maxWidth = '100%';
    img.style.maxHeight = '320px';
    img.style.borderRadius = '8px';
    holder.appendChild(img);
  }

  function save(canvas, type, name, quality) {
    canvas.toBlob(function (blob) {
      if (!blob) { if (window.showToast) window.showToast('Could not export the image.'); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
      if (window.showToast) window.showToast('Saved ' + name);
    }, type, quality || 0.92);
  }

  /* ---------- resizer ---------- */
  var rInput = $('resizerInput'), rW = $('resizerWidth'), rH = $('resizerHeight'), rLock = $('resizerLock');
  var rCanvas = document.createElement('canvas'), rImg = null;
  if (rInput) {
    rInput.addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      loadImage(file).then(function (img) {
        rImg = img;
        rW.value = img.naturalWidth; rH.value = img.naturalHeight;
        preview($('resizerPreview'), img.src);
        if (window.showToast) window.showToast('Image loaded — choose your new size.');
      });
    });
    if (rLock && rW && rH) {
      rW.addEventListener('input', function () { if (rImg && rLock.checked) rH.value = Math.round(Number(rW.value) * rImg.naturalHeight / rImg.naturalWidth); });
      rH.addEventListener('input', function () { if (rImg && rLock.checked) rW.value = Math.round(Number(rH.value) * rImg.naturalWidth / rImg.naturalHeight); });
    }
    var apply = $('resizerApply');
    if (apply) apply.addEventListener('click', function () {
      if (!rImg) { if (window.showToast) window.showToast('Upload an image first.'); return; }
      var w = Math.max(1, Number(rW.value) || rImg.naturalWidth);
      var h = Math.max(1, Number(rH.value) || rImg.naturalHeight);
      rCanvas.width = w; rCanvas.height = h;
      var ctx = rCanvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(rImg, 0, 0, w, h);
      preview($('resizerPreview'), rCanvas.toDataURL('image/png'));
      if (window.showToast) window.showToast('Resized to ' + w + ' × ' + h + ' px.');
    });
    var rDownload = $('resizerDownload');
    if (rDownload) rDownload.addEventListener('click', function () {
      if (!rImg || !rCanvas.width) { if (window.showToast) window.showToast('Click Apply first.'); return; }
      var type = $('resizerType') && $('resizerType').value === 'jpg' ? 'image/jpeg' : 'image/png';
      save(rCanvas, type, 'resized-image.' + (type === 'image/jpeg' ? 'jpg' : 'png'));
    });
  }

  /* ---------- format converter ---------- */
  var cInput = $('converterInput'), cCanvas = document.createElement('canvas'), cImg = null;
  if (cInput) {
    cInput.addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      loadImage(file).then(function (img) { cImg = img; preview($('converterPreview'), img.src); });
    });
    var cConvert = $('converterApply');
    if (cConvert) cConvert.addEventListener('click', function () {
      if (!cImg) { if (window.showToast) window.showToast('Upload an image first.'); return; }
      cCanvas.width = cImg.naturalWidth; cCanvas.height = cImg.naturalHeight;
      var ctx = cCanvas.getContext('2d');
      var fmt = ($('converterFormat') || {}).value || 'png';
      if (fmt !== 'png') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cCanvas.width, cCanvas.height); }
      ctx.drawImage(cImg, 0, 0);
      preview($('converterPreview'), cCanvas.toDataURL('image/' + fmt, 0.92));
      if (window.showToast) window.showToast('Converted to ' + fmt.toUpperCase() + '.');
    });
    var cDownload = $('converterDownload');
    if (cDownload) cDownload.addEventListener('click', function () {
      if (!cImg || !cCanvas.width) { if (window.showToast) window.showToast('Click Convert first.'); return; }
      var fmt = ($('converterFormat') || {}).value || 'png';
      save(cCanvas, 'image/' + fmt, 'converted-image.' + fmt, 0.92);
    });
  }

  /* ---------- passport / ID photo layout ---------- */
  var pInput = $('passportInput'), pCanvas = document.createElement('canvas'), pImg = null;
  var sizes = { '35x45': [35, 45], '40x50': [40, 50], '50x50': [50, 50], '25x35': [25, 35] };
  function buildPassport() {
    if (!pImg) { if (window.showToast) window.showToast('Upload a photo first.'); return; }
    var dim = sizes[($('passportSize') || {}).value || '35x45'];
    var pxPerMm = 12; // 600 x 540 at 35x45mm — enough for printing at 300 dpi-ish
    var w = dim[0] * pxPerMm, h = dim[1] * pxPerMm;
    pCanvas.width = w; pCanvas.height = h;
    var ctx = pCanvas.getContext('2d');
    ctx.fillStyle = ($('passportBg') || {}).value || '#ffffff';
    ctx.fillRect(0, 0, w, h);
    var scale = Math.max(w / pImg.naturalWidth, h / pImg.naturalHeight);
    var dw = pImg.naturalWidth * scale, dh = pImg.naturalHeight * scale;
    ctx.drawImage(pImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
    preview($('passportPreview'), pCanvas.toDataURL('image/jpeg', 0.92));
    if (window.showToast) window.showToast('Photo laid out at ' + dim[0] + ' × ' + dim[1] + ' mm.');
  }
  if (pInput) {
    pInput.addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      loadImage(file).then(function (img) { pImg = img; buildPassport(); });
    });
    var pApply = $('passportApply');
    if (pApply) pApply.addEventListener('click', buildPassport);
    var pDownload = $('passportDownload');
    if (pDownload) pDownload.addEventListener('click', function () {
      if (!pImg || !pCanvas.width) { if (window.showToast) window.showToast('Upload a photo first.'); return; }
      save(pCanvas, 'image/jpeg', 'passport-photo.jpg', 0.95);
    });
  }
})();
