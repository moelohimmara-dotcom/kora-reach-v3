import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'https://213-156-135-139.sslip.io/kora-v2';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
let fullStack = '';
page.on('pageerror', e => { if (!fullStack) fullStack = (e.message||'') + '\n' + (e.stack||''); });
page.on('console', m => { if (m.type()==='error' && !fullStack) fullStack = 'CONSOLE: ' + m.text(); });

await page.goto(BASE + '/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e=>console.log('goto err', e.message));
await page.waitForTimeout(2500);
await page.fill('#authUser', 'admin').catch(()=>{});
await page.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(()=>{});
await page.click('#authSubmit').catch(e=>console.log('click login', e.message));
await page.waitForTimeout(3000);
try { await page.click('text=Articles', { timeout: 5000 }); } catch(e){ console.log('click err', e.message); }
await page.waitForTimeout(3000);
console.log('=== FULL STACK ===');
console.log(fullStack.slice(0, 2500));
fs.writeFileSync(process.env.HOME + '/recursion_stack.txt', fullStack);
await browser.close().catch(()=>{});
process.exit(0);
