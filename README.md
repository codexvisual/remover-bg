# Remover bg — by Filofa Technology

A complete remove.bg-style website with a working AI background remover, Magic
Brush editor, image tools, API docs and legal pages. No build step required.

**Product:** Remover bg · **Company:** Filofa Technology · **Tagline:** Technology that just works.

> Educational demo inspired by remove.bg. Not affiliated with remove.bg or Canva.

## Run locally

```powershell
node server.js          # http://localhost:3000
```

Or open `index.html` directly. An internet connection is needed the first time
the in-browser AI model is downloaded. If unavailable, the built-in quick mode
removes plain/solid-coloured backgrounds offline.

## Enable server-side removal (optional)

1. Copy `api/config.example.php` → `api/config.php`, add your remove.bg API key.
2. In `assets/js/config.js`, set `apiEndpoint: 'api/remove.php'`.

For the Node server, set the `REMOVEBG_API_KEY` environment variable and use
`apiEndpoint: 'api/remove'`.

## GitHub Pages

Static files work directly on GitHub Pages — keep `apiEndpoint: ''` in
`assets/js/config.js` so background removal runs in the browser. The optional
PHP/Node server proxies are for your own hosting and are not used by Pages.
Add a `.nojekyll` file at the repo root (already included).

## Branding

The Filofa Technology brand kit (logo, colours, typography, social assets and
guidelines) lives in `C:\Users\Rahat\Desktop\Filofa Branding`.
This site uses the Filofa gradient and mark throughout.

## Home page

`index.html` mirrors the remove.bg homepage layout: hero with cut-out subject
and upload card, Stunning quality showcase, All-in-one remover & generator,
One tool / endless uses grid, efficiency section, testimonials, "Just picture
it" gallery, second upload area, blog, newsletter, rating and dark footer.
Upload, drag-drop, paste, URL, sample images, AI removal, Magic Brush editing
and download are all functional.

## Post-removal editor

Your uploaded picture appears immediately while the AI works; when it is
ready the result opens in a remove.bg-style studio: a floating
pill toolbar (Cutout / Background / Effects / Adjust / Design + rotate, flip,
undo, redo and a blue Download button), one large **Before & after** preview
with **Original** on the left and **Background removed** on the right, a
draggable divider between the two panels, a contextual tool panel and a bottom
thumbnail strip. On phones the two panels stack vertically. The editor also
drives the export, so downloads match exactly what is on screen:

- Side-by-side original / result — drag the middle grip to give either side
  more room; hold **Compare** to see the original inside the result panel
- Undo / redo with a 40-step history (`Ctrl+Z`, `Ctrl+Shift+Z` / `Ctrl+Y`)
- Rotate 90° either way, flip horizontally / vertically
- Drag-to-crop overlay with corner handles, live X/Y/W/H fields and 1:1, 4:3,
  16:9, 3:4 aspect locks; the crop box updates the numbers while you drag
- Trim edges — removes transparent margins automatically (`T`)
- Resize presets (Instagram, LinkedIn, HD, square, passport) plus custom
  width / height with ratio lock
- Brightness, contrast, saturation and blur with double-click / one-click reset
- Backdrop blur (uses the original photo) and a soft drop shadow, shown live
  and baked into the downloaded file
- Gradient background templates (eight) or solid / transparent backgrounds
- Quick looks (Clean / Depth / Studio / Night), colour presets (Vivid, Warm,
  Cool, B&W, Soft) and histogram-based Auto enhance
- Add text and elements (circle, square, ring, star) behind the subject
- Copy the transparent PNG straight to the clipboard
- Compare against the original (hold with a mouse, tap to toggle on touch)
- Reset backdrop and Reset all, plus live pixel dimensions
- Export PNG, JPG or WebP with a quality slider

Keyboard shortcuts: `R` rotate, `Shift+R` rotate left, `F` flip, `Shift+F`
flip vertical, `C` crop, `E` resize, `T` trim.

The same editor (including PNG / JPG / WebP export) is available on
`upload.html`, so both upload flows share crop, resize, effects and history.

## Performance

- Service worker (`sw.js`) keeps two caches: app files (network-first, so a
  new deploy is never stale) and AI assets (cache-first). Model files cached by
  older versions are migrated instead of re-downloaded.
- AI input is downscaled to 1024 px before inference, cutting processing time
  on large photos. The image is decoded once and its decoded bitmap is reused.
- The AI module is imported once, and the model is warmed in the background
  while the upload form is still on screen (skipped on save-data / slow links).
- Repeating the same picture skips the model entirely: a cut-out cache in
  IndexedDB returns it instantly (last 12 images).
- WebGPU is used when the browser supports it; WASM is the fallback.
- The editor writes to the visible canvas, so the brush, edits and export all
  share one buffer.
- Preconnect hints for `esm.sh` and `staticimgly.com` start the model fetch sooner.
- Type and colour tokens (Poppins 600, `#454545`, `#0F70E6`) match remove.bg.

## Tools (tools.html)

All ten tools run locally in the browser and were verified end-to-end:

1. Background Remover (AI, with offline quick-mode fallback)
2. Bulk Background Remover (multiple images at once)
3. Image Resizer
4. Format Converter (PNG / JPG / WebP)
5. Image Compressor (with before/after size comparison)
6. Image Cropper (numeric crop + aspect presets)
7. Rotate & Flip
8. Photo Effects (grayscale, sepia, brightness, contrast, saturation)
9. Watermark Maker
10. Passport Photo Maker (standard ID sizes, optional AI background removal)

Drag & drop, clipboard paste, live preview and download are supported for every tool.

## Pages

`index.html`, `upload.html` (remove.bg/upload-style page), `features.html`, `use-cases.html`, `tools.html`, `pricing.html`,
`api.html`, `faq.html`, `blog.html`, `about.html`, `contact.html`,
`privacy.html`, `terms.html`, `cookies.html`.
