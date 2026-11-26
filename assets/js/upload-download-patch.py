p=r'C:\Users\Rahat\Desktop\Remover bg\assets\js\upload.js'
s=open(p,encoding='utf-8').read()
old='''    var type = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    var quality = Number(($('downloadQuality') || {}).value || 92) / 100;
    out.toBlob(function (blob) {
      if (!blob) { error('Download failed. Please try again.'); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'remover-bg-result.' + format;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }, type, quality);
  }'''
new='''    var type = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    var quality = Number(($('downloadQuality') || {}).value || 92) / 100;
    var targetEl = $('targetSizeKB');
    var targetKB = targetEl ? Number(targetEl.value) : 0;

    function toBlobAsync(canvas, t, q) {
      return new Promise(function (resolve) { canvas.toBlob(function (b) { resolve(b); }, t, q); });
    }
    async function makeBlobWithinTarget(canvas, t, targetBytes, startQuality) {
      var best = null;
      for (var q = startQuality; q >= 0.05; q -= 0.05) {
        var b = await toBlobAsync(canvas, t, q);
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
      var sc = document.createElement('canvas');
      sc.width = w; sc.height = h;
      sc.getContext('2d').drawImage(canvas, 0, 0, w, h);
      for (var q2 = Math.min(0.9, startQuality); q2 >= 0.1; q2 -= 0.1) {
        var b2 = await toBlobAsync(sc, t, q2);
        if (!b2) continue;
        if (!best || b2.size < best.size) best = b2;
        if (b2.size <= targetBytes) return b2;
      }
      return best;
    }

    var blob;
    if (targetKB > 0) {
      blob = await makeBlobWithinTarget(out, type, targetKB * 1024, quality);
    } else {
      blob = await toBlobAsync(out, type, quality);
    }
    if (!blob) { error('Download failed. Please try again.'); return; }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'remover-bg-result.' + format;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    if (window.showToast) window.showToast('Saved as remover-bg-result.' + format + ' (' + Math.round(blob.size / 1024) + ' KB)');
  }'''
# make download async
s=s.replace('  function download() {\n    var src = $(\'resultCanvas\');', '  async function download() {\n    var src = $(\'resultCanvas\');', 1)
assert s.count(old)==1, s.count(old)
s=s.replace(old,new)
open(p,'w',encoding='utf-8').write(s)
print('ok')
