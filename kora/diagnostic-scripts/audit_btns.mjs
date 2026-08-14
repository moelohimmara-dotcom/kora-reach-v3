import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const p = await (await b.newContext()).newPage();
await p.setViewportSize({ width: 1280, height: 900 });
p.on('dialog', d => d.dismiss().catch(()=>{}));
const apis = [];
p.on('request', r => { if (r.url().includes('/api/')) apis.push(r.method() + ' ' + r.url().split('/api/')[1].split('?')[0]); });
await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(2500);
await p.fill('#authUser', 'admin').catch(()=>{});
await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(()=>{});
await p.click('#authSubmit').catch(()=>{});
await p.waitForTimeout(3500);

const routes = ['cockpit','facts','audit','drafts','sources','settings','trash'];
const skip = ['data-del','auditDelSel','auditFbDel','auditPurgeAll','auditResetToday','data-decide','setChangePw','setLogout','setSave','setLogoClear','setLogoFile','data-regen-cancel','auditExport','auditSelAll','auditSelNone','auditFbAll','auditFbNone','data-sug','data-regen','edSave','edCancel','data-edit','data-retract','data-close','regen-chip'];
const results = {};
for (const route of routes) {
  apis.length = 0;
  await p.evaluate((r) => { const e=[...document.querySelectorAll('[data-route]')].find(x=>x.dataset.route===r && x.offsetParent!==null); if(e) e.click(); }, route).catch(()=>{});
  await p.waitForTimeout(1000);
  const btns = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, [role=button], .btn, [data-action]').forEach(el => {
      if (el.closest('.navitem')||el.closest('.bottomnav')||el.closest('.rail')||el.closest('.overflow-menu')||el.closest('.left-drawer')) return;
      out.push({ label:(el.textContent||'').trim().slice(0,45), da:el.dataset.action||'', id:el.id||'', dd:el.dataset.decide||el.dataset.del||el.dataset.edit||'', disabled:el.disabled });
    });
    return out;
  });
  const dead = [];
  for (const btn of btns) {
    const sig = (btn.da+'|'+btn.id+'|'+btn.dd);
    if (btn.disabled || !btn.label || btn.label.length<3) continue;
    if (skip.some(s => sig.includes(s))) continue;
    const before = apis.length;
    await p.evaluate((b) => {
      const els=[...document.querySelectorAll('button,[role=button],.btn,[data-action]')].filter(el=>(el.textContent||'').trim().slice(0,45)===b.label && !el.closest('.navitem')&&!el.closest('.bottomnav')&&!el.closest('.rail'));
      if(els[0]&&!els[0].disabled) els[0].click();
    }, btn).catch(()=>{});
    await p.waitForTimeout(700);
    const after = apis.length;
    if (after===before) dead.push(btn.label);
    await p.evaluate((r) => { const e=[...document.querySelectorAll('[data-route]')].find(x=>x.dataset.route===r && x.offsetParent!==null); if(e) e.click(); }, route).catch(()=>{});
    await p.waitForTimeout(300);
  }
  results[route] = { nBtns: btns.filter(x=>!skip.some(s=>(x.da+'|'+x.id+'|'+x.dd).includes(s))).length, dead };
}
console.log(JSON.stringify(results, null, 1));
await b.close().catch(()=>{});
process.exit(0);
