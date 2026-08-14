const fs = require('fs');
const path = require('path');
const customElementsPath = path.join(__dirname, 'node_modules/@material/web/custom-elements.json');
const data = JSON.parse(fs.readFileSync(customElementsPath, 'utf8'));
const componentNames = data.modules.flatMap(m => m.exports || [])
  .filter(e => e.kind === 'js')
  .map(e => e.name)
  .sort();
console.log('Total components:', componentNames.length);
console.log('First 30 components:');
componentNames.slice(0, 30).forEach((name, i) => {
  console.log(`${i+1}: ${name}`);
});
// Look for toolbar-like names
const toolbarLike = componentNames.filter(name => {
  const lower = name.toLowerCase();
  return lower.includes('toolbar') || lower.includes('app bar') || lower.includes('top app') || lower.includes('top-app') || lower.includes('menu bar');
});
console.log('\nToolbar-like components:');
if (toolbarLike.length === 0) {
  console.log('None found');
} else {
  toolbarLike.forEach(name => {
    console.log('  ', name);
  });
}
// Also check for any component that might be related to top app bar
const appBarLike = componentNames.filter(name => {
  const lower = name.toLowerCase();
  return lower.includes('app') && lower.includes('bar');
});
console.log('\nAppBar-like components:');
if (appBarLike.length === 0) {
  console.log('None found');
} else {
  appBarLike.forEach(name => {
    console.log('  ', name);
  });
}