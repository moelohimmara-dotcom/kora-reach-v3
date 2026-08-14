import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const logs = [];
page.on('pageerror', e => logs.push('PAGEERROR: ' + (e.stack||e.message).split('\n').slice(0,4).join(' | ')));
page.on('console', m => { if(['error','warning'].includes(m.type())) logs.push(m.type().toUpperCase()+': '+m.text().slice(0,200)); });
page.on('requestfailed', r => logs.push('REQFAIL: '+r.url()+' '+(r.failure()?.errorText||'')));
// Go but do NOT wait for load (commit only), then capture early logs
await page.goto('http://localhost:8099/#cockpit', { waitUntil: 'commit' }).catch(()=>{});
await page.waitForTimeout(6000); // capture 6s of console activity
process.stdout.write('=== EARLY LOGS ===\n' + (logs.join('\n') || '(none)') + '\n');
await browser.close().catch(()=>{});
process.exit(0);
