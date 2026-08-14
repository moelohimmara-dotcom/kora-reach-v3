import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const p = await (await b.newContext()).newPage();
await p.setViewportSize({ width: 1280, height: 900 });
await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(2500);
await p.fill('#authUser', 'admin').catch(()=>{});
await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(()=>{});
await p.click('#authSubmit').catch(()=>{});
await p.waitForTimeout(3500);
const routes = ['cockpit','facts','audit','drafts','sources','settings','trash'];
const report = {};
for (const route of routes) {
  await p.evaluate((r) => { const e=[...document.querySelectorAll('[data-route]')].find(x=>x.dataset.route===r && x.offsetParent!==null); if(e) e.click(); }, route).catch(()=>{});
  await p.waitForTimeout(1000);
  const info = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, [role=button], .btn, [data-action], [id^="set"], [id^="audit"], [id^="wp"], [id^="trash"], [id^="ed"], [id^="fab"]').forEach(el => {
      if (el.closest('.navitem')||el.closest('.bottomnav')||el.closest('.rail')||el.closest('.overflow-menu')||el.closest('.left-drawer')) return;
      const hasOnclick = !!(el.onclick);
      const da = el.dataset.action || '';
      const dd = el.dataset.decide || el.dataset.del || el.dataset.edit || el.dataset.regen || '';
      const id = el.id || '';
      // un bouton est "branché" si onclick direct OU data-action (déléguateur global) OU data-decide/del/edit (branché dans renderSheet)
      const wired = hasOnclick || !!da || !!dd || /^(set|audit|wp|trash|ed|fab|btnRefresh|topbarCycle|enterSelect|cockpitSeed)/.test(id);
      out.push({ label:(el.textContent||'').trim().slice(0,40), id, da, dd, wired, disabled: el.disabled });
    });
    return out.filter(x => x.label && x.label.length >= 3);
  });
  const dead = info.filter(x => !x.wired);
  report[route] = { total: info.length, wired: info.filter(x=>x.wired).length, dead };
}
console.log(JSON.stringify(report, null, 1));
await b.close().catch(()=>{});
process.exit(0);
