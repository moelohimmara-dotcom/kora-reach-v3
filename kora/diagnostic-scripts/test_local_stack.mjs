import { chromium } from 'playwright';

const URL = 'http://localhost:8099/#cockpit';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

const stacks = [];
await page.addInitScript(() => {
  window.__stacks = [];
  window.addEventListener('error', (e) => {
    if (e.error && e.error.stack) window.__stacks.push(e.error.stack);
    else window.__stacks.push(e.message + ' @ ' + (e.filename||'') + ':' + e.lineno);
  });
  window.onerror = (msg, src, line, col, err) => {
    if (err && err.stack) window.__stacks.push(err.stack);
    else window.__stacks.push(msg + ' @ ' + src + ':' + line);
  };
});

try { await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (e) { console.log('goto:', e.message); }
await page.waitForTimeout(4000);

const s = await page.evaluate(() => window.__stacks || []);
console.log('=== STACK TRACES CAPTURED: ' + s.length + ' ===');
console.log(s.slice(0, 2).join('\n------\n') || '(none)');
await browser.close();
