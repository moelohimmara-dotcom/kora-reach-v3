import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto('https://213.156.135.139.sslip.io/?v=' + Date.now() + '#cockpit', { waitUntil: 'networkidle' });
await p.fill('#authUser', 'admin'); await p.fill('#authPass', '***REMOVED***'); await p.click('#authSubmit');
await p.waitForTimeout(4000);
// mesures réelles pour la critique
const m = await p.evaluate(() => {
  const c = document.querySelector('.stat-card'); const ic = c.querySelector('.stat-icon');
  const ir = ic.getBoundingClientRect(), cr = c.getBoundingClientRect();
  return {
    iconW: Math.round(ir.width),
    iconCenteredOffset: Math.round(Math.abs((ir.left+ir.right)/2 - (cr.left+cr.right)/2)),
    iconToValueGap: (()=>{const v=c.querySelector('.stat-value'); return Math.round(v.getBoundingClientRect().top - ir.bottom);})()
  };
});
await p.screenshot({ path: '/opt/data/kora-reach/maquettes-dark/selfcrit_mobile.png' });
console.log(JSON.stringify(m));
await b.close();
