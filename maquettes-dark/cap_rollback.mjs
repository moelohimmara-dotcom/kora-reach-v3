import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto('https://213.156.135.139.sslip.io/?v=' + Date.now() + '#cockpit', { waitUntil: 'networkidle' });
await p.fill('#authUser', 'admin'); await p.fill('#authPass', '***REMOVED***'); await p.click('#authSubmit');
await p.waitForTimeout(4500);
const r = await p.evaluate(() => ({
  heroEyebrow: document.querySelector('.hero-eyebrow')?.textContent?.trim() || null,
  healthScore: document.querySelector('.health-score')?.textContent?.trim() || null,
  syncBtn: !!document.querySelector('.sync-btn'),
  graphTitle: document.querySelector('.ev-chart .section-title')?.textContent?.trim(),
  statCount: document.querySelectorAll('.stat-card').length,
  band: !!document.querySelector('.decision-band'),
  iconW: Math.round(document.querySelector('.stat-icon').getBoundingClientRect().width)
}));
await p.screenshot({ path: '/opt/data/kora-reach/maquettes-dark/rollback_mobile.png' });
console.log(JSON.stringify(r, null, 1));
await b.close();
