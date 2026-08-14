import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1/kora-v2';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
const logs = [];
page.on('pageerror', e => logs.push('PAGEERROR: ' + (e.message||'') + ' | ' + (e.stack||'').split('\n').slice(0,2).join(' ')));
page.on('console', m => { if(['error','warning'].includes(m.type())) logs.push(m.type().toUpperCase()+': '+m.text().slice(0,300)); });

console.log('=== goto', BASE + '/#cockpit');
await page.goto(BASE + '/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e=>console.log('goto err', e.message));
await page.waitForTimeout(4000);
console.log('--- after boot 4s ---');
const bootState = await page.evaluate(() => ({
  overlayHidden: document.getElementById('authOverlay')?.hidden,
  btn: document.getElementById('authSubmit')?.textContent,
  viewLen: document.getElementById('view')?.innerHTML.length || 0,
})).catch(e=>({err:e.message}));
console.log('boot:', JSON.stringify(bootState));

// Try login
try {
  await page.fill('#authUser', 'admin');
  await page.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME');
  console.log('=== click login ===');
  await page.click('#authSubmit');
  for (let i=0;i<6;i++){
    await page.waitForTimeout(2500);
    const s = await page.evaluate(()=>({
      btn: document.getElementById('authSubmit')?.textContent,
      btnDis: document.getElementById('authSubmit')?.disabled,
      ovHidden: document.getElementById('authOverlay')?.hidden,
      appDisp: document.getElementById('app')?.style.display,
      viewLen: document.getElementById('view')?.innerHTML.length || 0,
      err: document.getElementById('authErr')?.textContent
    })).catch(e=>({err:e.message}));
    console.log(`t${i}:`, JSON.stringify(s));
    if (s.viewLen > 50) break;
  }
} catch(e) { console.log('login step err:', e.message); }

console.log('=== LOGS ===');
console.log(logs.slice(0,15).join('\n') || '(none)');
await browser.close().catch(()=>{});
process.exit(0);
