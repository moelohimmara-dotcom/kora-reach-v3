import { JSDOM } from 'jsdom';
import fs from 'fs';
import https from 'https';

const DIST = '/opt/data/kora-reach/kora-vite/dist';
const jsFile = fs.readdirSync(DIST + '/assets').find(f => f.startsWith('index-') && f.endsWith('.js'));
const js = fs.readFileSync(DIST + '/assets/' + jsFile, 'utf8');

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="app"></div><div id="authOverlay" hidden></div></body></html>', {
  url: 'https://213-156-135-139.sslip.io/kora-v2/#cockpit',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;
// Polyfills
window.matchMedia = window.matchMedia || (q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }));
window.document.adoptedStyleSheets = window.document.adoptedStyleSheets || [];
window.document.fonts = window.document.fonts || { ready: Promise.resolve(), addEventListener(){}, load() { return Promise.resolve(); } };
window.fetch = (url, opts) => new Promise((resolve, reject) => {
  const u = new URL(url, 'https://213-156-135-139.sslip.io');
  const path = u.pathname + u.search;
  const options = {
    hostname: '213-156-135-139.sslip.io', port: 443, path,
    method: (opts && opts.method) || 'GET',
    headers: Object.assign({}, opts && opts.headers, { Host: '213-156-135-139.sslip.io', Origin: 'https://213-156-135-139.sslip.io/kora-v2' }),
  };
  const req = https.request(options, res => {
    const chunks = []; res.on('data', c => chunks.push(c));
    res.on('end', () => resolve({ ok: res.statusCode < 400, status: res.statusCode, headers: { get: h => res.headers[h.toLowerCase()] }, json: async () => JSON.parse(Buffer.concat(chunks).toString()), text: async () => Buffer.concat(chunks).toString() }));
  });
  req.on('error', reject);
  if (opts && opts.body) req.write(opts.body);
  req.end();
});
window.HTMLElement.prototype.scrollIntoView = function(){};
window.requestAnimationFrame = cb => setTimeout(cb, 0);

// Capture errors
let errCount = 0;
window.addEventListener('error', e => { errCount++; console.error('WINDOW ERROR:', e.error && e.error.stack || e.message); });
window.onerror = (m, s, l, c, e) => { errCount++; console.error('ONERROR:', e && e.stack || m); };

// Detect infinite setState/render loop via instrumentation is hard; instead set a hard timeout and watch console
const origLog = console.log;
let loops = 0;
const apiCalls = [];
const origFetch = window.fetch;

console.log('=== BOOT START ===');
try {
  // Execute the module code in the window context
  const scriptEl = window.document.createElement('script');
  scriptEl.textContent = js;
  window.document.body.appendChild(scriptEl);
  // Module scripts are deferred; jsdom may not execute type=module. Try eval in window scope.
} catch (e) {
  console.error('BOOT THREW:', e.stack);
}

// Wait and observe
setTimeout(() => {
  console.log('=== AFTER 6s ===');
  console.log('authOverlay hidden?', window.document.getElementById('authOverlay')?.hidden);
  console.log('app display:', window.document.getElementById('app')?.style.display);
  console.log('view len:', window.document.getElementById('view')?.innerHTML.length || 0);
  console.log('errors captured:', errCount);
  process.exit(0);
}, 6000);
