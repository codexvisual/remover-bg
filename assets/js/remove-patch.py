p=r'C:\Users\Rahat\Desktop\Remover bg\assets\js\remove.js'
s=open(p,encoding='utf-8').read()

# 1. helpers after showError? Insert before function loadImage? We'll insert before "function loadImage"
helper='''  /* Show the uploaded picture immediately, while the AI removes the background. */
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

  function showQuickPreview(img) {
    var pair = $('processingPair'), c = $('processingCutout');
    if (!pair || !c || !window.BackgroundEngine || !window.BackgroundEngine.quick) return;
    Promise.resolve(window.BackgroundEngine.quick(img)).then(function (q) {
      if (!q || !q.width) return;
      var scale = Math.min(1, 300 / Math.max(q.width, q.height));
      c.width = Math.max(1, Math.round(q.width * scale));
      c.height = Math.max(1, Math.round(q.height * scale));
      c.getContext('2d').drawImage(q, 0, 0, c.width, c.height);
      pair.classList.remove('hidden');
    }).catch(function () {});
  }

'''
assert 'function loadImage(src)' in s
s=s.replace('  function loadImage(src) {\n', helper+'  function loadImage(src) {\n', 1)

# 2. removeBackground signature
s=s.replace('  async function removeBackground(file, onProgress) {\n    if (window.BackgroundEngine && window.BackgroundEngine.remove) {\n      return window.BackgroundEngine.remove(file, onProgress);\n    }',
            '  async function removeBackground(file, onProgress, opts) {\n    if (window.BackgroundEngine && window.BackgroundEngine.remove) {\n      return window.BackgroundEngine.remove(file, onProgress, opts);\n    }', 1)

# 3. handleFile: showUploadedPreview + sourceImage + quick preview
old_handle='''    state.busy = true;
    showError('');
    try {
      setProgress(6, 'Reading ' + (file.name || 'image') + '…');
      var img = await fileToImage(file);
      var cutout = await removeBackground(file, setProgress, { sourceImage: img });'''
new_handle='''    state.busy = true;
    showError('');
    showUploadedPreview(file);
    try {
      setProgress(6, 'Reading ' + (file.name || 'image') + '…');
      var img = await fileToImage(file);
      showQuickPreview(img);
      var cutout = await removeBackground(file, setProgress, { sourceImage: img });'''
assert old_handle in s
s=s.replace(old_handle,new_handle,1)

# 4. catch hide
s=s.replace("      showError('Something went wrong: ' + (e.message || 'unknown error') + '. Please try another image.');\n      hideProgress();",
            "      showError('Something went wrong: ' + (e.message || 'unknown error') + '. Please try another image.');\n      hideProgress();\n      hideUploadedPreview();",1)

# 5. showResult hideUploadedPreview after setTimeout
s=s.replace("      showResult(file, img, cutout);\n      setTimeout(hideProgress, 350);",
            "      showResult(file, img, cutout);\n      setTimeout(function () { hideProgress(); hideUploadedPreview(); }, 350);",1)

# 6. resetToUpload hideUploadedPreview
s=s.replace("  function resetToUpload() {\n    state.file = null;\n    el.resultView.classList.add('hidden');",
            "  function resetToUpload() {\n    state.file = null;\n    hideUploadedPreview();\n    el.resultView.classList.add('hidden');",1)

open(p,'w',encoding='utf-8').write(s)
print('ok')
