import { chromium } from 'playwright';

const BASE = 'http://localhost:4173/';
const USER = 'admin';
const PASS = process.env.KORA_TEST_PASS || 'CHANGE_ME';

const log = (...a) => console.log('[LOG]', ...a);

async function main() {
  const browser = await chromium.launch({ headless: true });
  log('Browser launched');
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  log('Context/page created');

  page.on('console', m => { if (m.type() === 'error') log('CONSOLE ERROR:', m.text()); });
  page.on('pageerror', e => log('PAGE ERROR:', e.message));
  page.on('requestfailed', req => log('REQ FAIL:', req.url(), req.failure().errorText));

  log('GOTO', BASE);
  await page.goto(BASE, { waitUntil: 'commit', timeout: 15000 });
  log('GOTO done');

  await page.waitForTimeout(500);
  log('Wait done');

  const overlayInfo = await page.evaluate(() => {
    const o = document.getElementById('authOverlay');
    const u = document.getElementById('authUser');
    const p = document.getElementById('authPass');
    const f = document.getElementById('authForm');
    return {
      overlay: o ? { hidden: o.hidden, innerHTML: o.innerHTML.slice(0,200) } : null,
      userField: !!u,
      passField: !!p,
      form: !!f,
      bodyText: document.body.innerText.slice(0, 200)
    };
  });
  log('Overlay info:', JSON.stringify(overlayInfo, null, 2));

  if (!overlayInfo.userField) {
    log('FORM NOT PRESENT - maybe already logged in? checking localStorage...');
    const ls = await page.evaluate(() => ({ ...localStorage }));
    log('localStorage:', JSON.stringify(ls));
  } else {
    log('Filling credentials...');
    await page.fill('#authUser', USER);
    await page.fill('#authPass', PASS);
    log('Filled, clicking submit...');
    await page.click('#authSubmit');
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => ({
      url: location.href,
      overlayHidden: document.getElementById('authOverlay')?.hidden,
      appVisible: getComputedStyle(document.getElementById('app') || {}).display !== 'none'
    }));
    log('After submit:', JSON.stringify(after, null, 2));
  }

  await browser.close();
  log('DONE');
}

main().catch(e => { log('FATAL:', e); process.exit(1); });