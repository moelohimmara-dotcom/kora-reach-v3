const fs = require('fs');
const path = require('path');
const lucideDir = '/opt/data/kora-reach/kora-vite/node_modules/lucide-static/icons/';

// Mapping KORA i-* -> nom Lucide (MIT). IDs conservés pour ne pas casser le markup.
const map = {
  'i-dashboard': 'layout-dashboard',
  'i-facts': 'file-text',
  'i-check': 'check',
  'i-shield': 'shield',
  'i-sources': 'database',
  'i-source': 'rss',
  'i-audit': 'history',
  'i-status': 'activity',
  'i-close': 'x',
  'i-send': 'send',
  'i-edit': 'pencil',
  'i-reject': 'x-circle',
  'i-retract': 'undo',
  'i-refresh': 'refresh-cw',
  'i-spark': 'sparkles',
  'i-image': 'image',
  'i-level1': 'bar-chart',
  'i-level2': 'bar-chart-2',
  'i-date': 'calendar',
  'i-fusion': 'git-merge',
  'i-menu': 'menu',
  'i-chevron': 'chevron-down',
  'i-chevron-right': 'chevron-right',
  'i-sun': 'sun',
  'i-moon': 'moon',
  'i-palette': 'palette',
  'i-settings': 'settings',
  'i-user': 'user',
  'i-users': 'users',
  'i-user-plus': 'user-plus',
  'i-info': 'info',
  'i-undo': 'undo',
  'i-trash': 'trash',
  'i-lock': 'lock',
  'i-logo': 'command',
  'i-eye': 'eye',
  'i-eye-off': 'eye-off',
  'i-more': 'more-vertical',
  'i-brush': 'brush',
  'i-sources2': null, // placeholder
};

// Liste réelle des IDs présents dans l'ancien sprite (extraite manuellement)
const ids = ['i-dashboard','i-facts','i-check','i-shield','i-sources','i-source','i-audit','i-status','i-close','i-send','i-edit','i-reject','i-retract','i-refresh','i-spark','i-image','i-level1','i-level2','i-date','i-fusion','i-menu','i-chevron','i-chevron-right','i-sun','i-moon','i-palette','i-settings','i-user','i-users','i-user-plus','i-info','i-undo','i-trash','i-lock','i-logo','i-eye','i-eye-off','i-more','i-brush'];

let symbols = '';
let missing = [];
for (const id of ids) {
  const lucideName = map[id];
  if (!lucideName) { missing.push(id); continue; }
  const f = path.join(lucideDir, lucideName + '.svg');
  if (!fs.existsSync(f)) { missing.push(id + '(' + lucideName + ')'); continue; }
  let svg = fs.readFileSync(f, 'utf8');
  let inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  symbols += `  <symbol id="${id}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g></symbol>\n`;
}

const out = `// Sprite SVG KORA — Lucide Icons (MIT, https://lucide.dev)\n// Outline 24px, stroke 2px, currentColor. Mêmes id #i-* que l'ancien sprite -> app.js inchangé.\nconst SPRITE = \`<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n${symbols}</svg>\`;\n`;
fs.writeFileSync('/opt/data/kora-reach/kora-vite/src/icons.js', out);
console.log('Generated icons.js with', ids.length - missing.length, 'symbols.');
if (missing.length) console.log('MISSING:', missing.join(', '));
