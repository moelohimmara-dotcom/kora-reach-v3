import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const errs = [];
page.on('pageerror', e => errs.push('ERR: ' + (e.stack||e.message)));
page.on('console', m => { if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
page.setDefaultNavigationTimeout(0);
await page.goto('http://localhost:8099/#cockpit', { waitUntil: 'commit' }).catch(()=>{});
await page.waitForSelector('#authSubmit', { timeout: 20000 }).catch(e=>console.log('no btn'));
console.log('btn?', await page.evaluate(()=>!!document.getElementById('authSubmit')));
await page.fill('#authUser','admin').catch(e=>{});
await page.fill('#authPass',process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(e=>{});
await page.click('#authSubmit').catch(e=>console.log('click err',e.message));
for(let i=0;i<7;i++){
  await page.waitForTimeout(2500);
  const s = await page.evaluate(()=>({
    txt: document.getElementById('authSubmit')?.textContent,
    dis: document.getElementById('authSubmit')?.disabled,
    ov: document.getElementById('authOverlay')?.hidden,
    app: document.getElementById('app')?.style.display,
    err: document.getElementById('authErr')?.textContent
  })).catch(e=>({err:'eval '+e.message}));
  console.log(`t${i}:`, JSON.stringify(s));
}
console.log('ERRORS:', errs.slice(0,6).join(' || ') || 'none');
await browser.close();
