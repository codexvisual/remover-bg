p=r'C:\Users\Rahat\Desktop\Remover bg\assets\js\remove.js'
s=open(p,encoding='utf-8').read()
old='''  function download() {
    if (!state.resultCanvas) return;
    var out = exportCanvas();
    var name = (el.resultName ? el.resultName.textContent : 'image-removed').replace(/\\.png$/, '') + '.' + out.ext;
    var qualityEl = $('downloadQuality');
    var quality = qualityEl ? Number(qualityEl.value) / 100 : 0.92;
    out.canvas.toBlob(function (blob) {
      if (!blob) { showError('Download failed. Please try again.'); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      if (window.showToast) window.showToast('Saved as ' + name);
    }, out.type, quality);
  }'''
new='''  function toBlobAsync(canvas, type, quality) {
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
    var name = (el.resultName ? el.resultName.textContent : 'image-removed').replace(/\\.png$/, '') + '.' + out.ext;
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
  }'''
assert s.count(old)==1, s.count(old)
s=s.replace(old,new)
open(p,'w',encoding='utf-8').write(s)
print('ok')
