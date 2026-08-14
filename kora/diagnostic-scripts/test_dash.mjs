import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const p = await (await b.newContext()).newPage();
await p.setViewportSize({ width: 390, height: 844 });
await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(2500);
await p.fill('#authUser', 'admin').catch(()=>{});
await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(()=>{});
await p.click('#authSubmit').catch(()=>{});
await p.waitForTimeout(3500);
const info = await p.evaluate(() => {
  const cards = [...document.querySelectorAll('.stat-card')].map(c => ({
    label: c.querySelector('.stat-label')?.textContent?.trim(),
    value: c.querySelector('.stat-value')?.textContent?.trim(),
    icon: c.querySelector('.stat-icon')?.textContent?.trim(),
    cls: c.className,
  }));
  return cards;
});
console.log('CARDS', JSON.stringify(info, null, 1));
await p.screenshot({ path: 'kora_dash.png', fullPage: false });
await b.close().catch(()=>{});
process.exit(0);
