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

## Tools (tools.html)

All nine tools run locally in the browser and were verified end-to-end:

1. Background Remover (AI, with offline quick-mode fallback)
2. Image Resizer
3. Format Converter (PNG / JPG / WebP)
4. Image Compressor (with before/after size comparison)
5. Image Cropper (numeric crop + aspect presets)
6. Rotate & Flip
7. Photo Effects (grayscale, sepia, brightness, contrast, saturation)
8. Watermark Maker
9. Passport Photo Maker (standard ID sizes, optional AI background removal)

Drag & drop, clipboard paste, live preview and download are supported for every tool.

## Pages

`index.html`, `features.html`, `use-cases.html`, `tools.html`, `pricing.html`,
`api.html`, `faq.html`, `blog.html`, `about.html`, `contact.html`,
`privacy.html`, `terms.html`, `cookies.html`.
