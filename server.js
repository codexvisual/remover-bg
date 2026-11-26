/*
 * Optional local / production server for the Remover bg website.
 *
 *   node server.js
 *   Open http://localhost:3000
 *
 * Set REMOVEBG_API_KEY to enable server-side removal at /api/remove.
 * Without a key, the site still works using the in-browser AI / quick mode.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.REMOVEBG_API_KEY || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function handleApi(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
  if (!API_KEY) {
    return sendJson(res, 503, { error: 'Set REMOVEBG_API_KEY in your environment to enable server-side removal.' });
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024 * 1024) {
      return sendJson(res, 413, { error: 'Image too large (max 15 MB).' });
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  // Extract the first file part from the multipart body.
  const headerEnd = body.indexOf('\r\n\r\n');
  if (headerEnd < 0) return sendJson(res, 400, { error: 'Invalid multipart body.' });
  const head = body.subarray(0, headerEnd).toString('latin1');
  const nameMatch = head.match(/name="image"/);
  const typeMatch = head.match(/Content-Type:\s*([^\r\n;]+)/i);
  if (!nameMatch || !typeMatch) return sendJson(res, 400, { error: 'Expected an "image" file field.' });

  const boundaryMatch = head.match(/boundary=(?:"([^"]+)"|([^\r\n;]+))/i);
  const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : '';
  let start = headerEnd + 4;
  let end = body.length;
  if (boundary) {
    const marker = Buffer.from('\r\n--' + boundary, 'latin1');
    const found = body.indexOf(marker, start);
    if (found > start) end = found;
  }
  const image = body.subarray(start, end);
  const mime = typeMatch[1].trim();

  const form = new FormData();
  form.append('image_file', new Blob([image], { type: mime }), 'image.' + mime.split('/')[1]);
  form.append('size', 'auto');

  try {
    const upstream = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY },
      body: form
    });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (!upstream.ok) {
      return sendJson(res, upstream.status, { error: 'Background removal failed (HTTP ' + upstream.status + ').' });
    }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    res.end(buffer);
  } catch (err) {
    sendJson(res, 502, { error: 'Could not reach the service: ' + err.message });
  }
}

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return sendJson(res, 400, { error: 'Bad request.' });
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(ROOT, path.normalize(pathname).replace(/^(\.\.[\\/])+/, ''));
  if (!filePath.startsWith(ROOT)) return sendJson(res, 403, { error: 'Forbidden.' });

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404 — Not found</h1><p><a href="/">Back to home</a></p>');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url.startsWith('/api/remove')) return handleApi(req, res);
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log('Remover bg site running at http://localhost:' + PORT);
  console.log(API_KEY ? 'Server-side API enabled.' : 'No API key set — browser mode enabled.');
});
