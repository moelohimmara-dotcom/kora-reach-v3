import http from 'http';
import fs from 'fs';
import path from 'path';
import https from 'https';

const DIST = '/opt/data/kora-reach/kora-vite/dist';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

const REAL = '213-156-135-139.sslip.io';
const REAL_BASE = '/kora-v2';

function proxyApi(req, res, bodyBuf) {
  const apiPath = req.url.split('?')[0].replace(/^\/api/, '/kora-v2/api').replace(/^\/kora-v2\/kora-v2/, '/kora-v2');
  const options = {
    hostname: REAL,
    port: 443,
    path: apiPath + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''),
    method: req.method,
    headers: Object.assign({}, req.headers, {
      Host: REAL,
      Origin: 'https://' + REAL + REAL_BASE,
    }),
  };
  const p = https.request(options, (up) => {
    const chunks = [];
    up.on('data', c => chunks.push(c));
    up.on('end', () => {
      res.setHeader('Content-Type', up.headers['content-type'] || 'application/json');
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8099');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.end(Buffer.concat(chunks));
    });
  });
  p.on('error', e => { res.statusCode = 502; res.end(JSON.stringify({ error: 'proxy', detail: e.message })); });
  if (bodyBuf && bodyBuf.length) p.write(bodyBuf);
  p.end();
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8099');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (url.startsWith('/kora-v2/api/') || url.startsWith('/api/')) {
      return proxyApi(req, res, body);
    }

    let p = url === '/' ? '/index.html' : url.replace('/kora-v2', '');
    const fp = path.join(DIST, p);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
      return res.end(fs.readFileSync(fp));
    }
    const idx = path.join(DIST, 'index.html');
    res.setHeader('Content-Type', 'text/html');
    res.end(fs.readFileSync(idx));
  });
});

server.listen(8099, '127.0.0.1', () => console.log('PROXY+static on 8099 (backend -> VPS)'));
