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
const before = await p.evaluate(() => ({ busy: window.Store?.state?.ui?.busy, mode: document.getElementById('agentMode')?.textContent, label: document.querySelector('#topbarCycle .topbar-cta-label')?.textContent, disabled: document.getElementById('topbarCycle')?.disabled }));
// Clique Lancer un cycle
await p.evaluate(() => { const e = document.getElementById('topbarCycle'); if (e && !e.disabled) e.click(); });
await p.waitForTimeout(1500);
const after = await p.evaluate(() => ({ busy: window.Store?.state?.ui?.busy, mode: document.getElementById('agentMode')?.textContent, label: document.querySelector('#topbarCycle .topbar-cta-label')?.textContent, disabled: document.getElementById('topbarCycle')?.disabled }));
console.log('BEFORE', JSON.stringify(before));
console.log('AFTER ', JSON.stringify(after));
await b.close().catch(()=>{});
process.exit(0);
