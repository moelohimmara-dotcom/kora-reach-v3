const fs = require('fs');

// 1) Récupère le sprite Lucide depuis icons.js
const iconsJs = fs.readFileSync('/opt/data/kora-reach/kora-vite/src/icons.js', 'utf8');
const m = iconsJs.match(/const SPRITE = `([\s\S]*?)`;/);
if (!m) { console.error('SPRITE non trouvé'); process.exit(1); }
const sprite = m[1];

// 2) Palette TERREUSE (orange/marron/beige/blanc/noir/gris/vert)
const T = {
  bgTop: '#22150C',   // marron très sombre
  bgMid: '#432C18',   // marron
  bgBot: '#B98A55',   // beige/marron clair
  accent: '#E9705D',  // coral (déjà KORA, terreux)
  accent2: '#C8772E', // orange terreux
  olive: '#7C8B3F',   // vert
  beige: '#E8DCC8',
  ink: '#1A120A',     // noir marron
  paper: '#F4EEE2',   // blanc cassé
  text: '#F4EEE2',
  text2: 'rgba(244,238,226,.64)',
  surface: 'rgba(26,18,10,.46)',
  border: 'rgba(255,255,255,.14)',
};

const css = `
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
:root {
  --accent: ${T.accent}; --accent2: ${T.accent2}; --olive: ${T.olive};
  --text: ${T.text}; --text-2: ${T.text2};
  --surface: ${T.surface}; --border: ${T.border};
}
html, body { height: 100%; }
body { font-family: Inter, system-ui, sans-serif; background: ${T.ink}; display: flex; justify-content: center; padding: 16px; }
.phone {
  width: 100%; max-width: 390px; min-height: 844px;
  background: linear-gradient(180deg, ${T.bgTop} 0%, ${T.bgMid} 46%, ${T.bgBot} 100%);
  border-radius: 28px; overflow: hidden; display: flex; flex-direction: column;
  position: relative; box-shadow: 0 30px 80px rgba(0,0,0,.6);
}
.screen { padding: 16px; display: flex; flex-direction: column; gap: 16px; flex: 1; padding-bottom: 84px; }
.header { display: flex; align-items: center; justify-content: space-between; }
.logo { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 20px; color: ${T.text}; letter-spacing: .5px; }
.logo .k { width: 30px; height: 30px; border-radius: 8px; background: ${T.accent}; color: ${T.ink}; display: flex; align-items: center; justify-content: center; font-weight: 900; }
.status { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: ${T.beige}; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #3DD68C; box-shadow: 0 0 8px #3DD68C; }
.icon-btn { width: 44px; height: 44px; min-width: 44px; border: none; border-radius: 12px; background: rgba(0,0,0,.32); color: ${T.text}; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.ic { width: 20px; height: 20px; }
.donut-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.donut { width: 180px; height: 180px; }
.donut-center { font-size: 32px; font-weight: 800; fill: ${T.text}; }
.donut-sub { font-size: 12px; fill: ${T.text2}; }
.kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.stat-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
  padding: 14px; display: flex; flex-direction: column; gap: 8px; min-height: 92px;
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
}
.stat-card.full { grid-column: 1 / -1; }
.stat-icon { width: 18px; height: 18px; color: ${T.accent2}; }
.stat-value { font-size: 30px; font-weight: 800; color: ${T.text}; line-height: 1; font-variant-numeric: tabular-nums; }
.stat-label { font-size: 13px; font-weight: 500; color: var(--text-2); }
.bottom-nav {
  position: absolute; left: 0; right: 0; bottom: 0; height: 60px;
  display: flex; align-items: stretch; background: rgba(20,12,6,.78); backdrop-filter: blur(16px);
  border-top: 1px solid var(--border); padding-bottom: env(safe-area-inset-bottom);
}
.nav-item {
  flex: 1; min-height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  color: var(--text-2); font-size: 9px; font-weight: 600; line-height: 1; white-space: nowrap; letter-spacing: -0.2px;
  position: relative; cursor: pointer; padding: 0;
}
.nav-item.active { color: ${T.accent}; }
.nav-item .ic { width: 22px; height: 22px; flex-shrink: 0; display: block; }
.nav-ico { position: relative; display: inline-flex; }
.nav-item > span { display: block; width: 100%; text-align: center; }
.nav-item.active::after { content: ""; position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); width: 22px; height: 3px; border-radius: 2px; background: ${T.accent}; }
.badge { position: absolute; top: -4px; right: -8px; min-width: 17px; height: 17px; padding: 0 5px; border-radius: 9px; background: ${T.accent}; color: ${T.ink}; font-size: 10px; font-weight: 800; line-height: 17px; display: flex; align-items: center; justify-content: center; white-space: nowrap; }
`;

const kpi = (icon, value, label, full=false) => `
  <div class="stat-card${full?' full':''}">
    <svg class="stat-icon"><use href="#${icon}"></use></svg>
    <div class="stat-value">${value}</div>
    <div class="stat-label">${label}</div>
  </div>`;

const body = `
<div class="phone">
  <div class="screen">
    <div class="header">
      <div class="logo"><span class="k">K</span> KORA</div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="status"><span class="dot"></span> prêt</div>
        <button class="icon-btn"><svg class="ic"><use href="#i-refresh"></use></svg></button>
      </div>
    </div>
    <div class="donut-wrap">
      <svg class="donut" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="78" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="22"/>
        <circle cx="100" cy="100" r="78" fill="none" stroke="${T.accent2}" stroke-width="22"
          stroke-dasharray="330 490" stroke-dashoffset="0" stroke-linecap="round" transform="rotate(-90 100 100)"/>
        <circle cx="100" cy="100" r="78" fill="none" stroke="${T.olive}" stroke-width="22"
          stroke-dasharray="160 490" stroke-dashoffset="-330" stroke-linecap="round" transform="rotate(-90 100 100)"/>
        <text x="100" y="94" text-anchor="middle" class="donut-center">76</text>
        <text x="100" y="114" text-anchor="middle" class="donut-sub">Articles</text>
      </svg>
    </div>
    <div class="kpi-grid">
      ${kpi('i-facts','76','Articles')}
      ${kpi('i-help','68','À décider')}
      ${kpi('i-check','0','Publiés')}
      ${kpi('i-edit','6','Brouillons')}
      ${kpi('i-reject','7','Rejetés')}
      ${kpi('i-trash','19','Corbeille')}
      ${kpi('i-close','14','Supprimés',true)}
    </div>
  </div>
  <nav class="bottom-nav">
    <div class="nav-item active"><span class="nav-ico"><svg class="ic"><use href="#i-gauge"></use></svg></span><span>Tableau de bord</span></div>
    <div class="nav-item"><span class="nav-ico"><svg class="ic"><use href="#i-facts"></use></svg><span class="badge">76</span></span><span>Articles</span></div>
    <div class="nav-item"><span class="nav-ico"><svg class="ic"><use href="#i-trash"></use></svg><span class="badge">19</span></span><span>Corbeille</span></div>
    <div class="nav-item"><span class="nav-ico"><svg class="ic"><use href="#i-plus"></use></svg></span><span>Plus</span></div>
  </nav>
</div>`;

const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>KORA Mobile — Palette terreuse (maquette)</title>
<style>${css}</style></head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${sprite}</svg>
${body}
</body></html>`;

const out = '/opt/data/kora-reach/kora-vite/maquette-mobile-terreux.html';
fs.writeFileSync(out, html);
console.log('Maquette terreuse generee:', out, '(', html.length, 'octets )');
