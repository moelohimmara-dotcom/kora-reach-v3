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

  log('GOTO', BASE);
  await page.goto(BASE, { waitUntil: 'commit', timeout: 15000 });
  log('GOTO done');

  await page.waitForTimeout(500);
  log('Wait done');

  // Check if overlay exists using locator
  const overlay = page.locator('#authOverlay');
  const overlayCount = await overlay.count();
  log('overlay count:', overlayCount);

  if (overlayCount > 0) {
    const hidden = await overlay.getAttribute('hidden');
    log('overlay hidden attr:', hidden);
    const isHidden = await overlay.isHidden();
    log('overlay isHidden:', isHidden);
  }

  // Check form fields using locators
  const userField = page.locator('#authUser');
  const userCount = await userField.count();
  log('user field count:', userCount);

  const passField = page.locator('#authPass');
  const passCount = await passField.count();
  log('pass field count:', passCount);

  // Get page title
  const title = await page.title();
  log('page title:', title);

  // Get visible text
  const bodyText = await page.locator('body').innerText();
  log('body text preview:', bodyText.slice(0, 200));

  await browser.close();
  log('DONE');
}

main().catch(e => { log('FATAL:', e); process.exit(1); });