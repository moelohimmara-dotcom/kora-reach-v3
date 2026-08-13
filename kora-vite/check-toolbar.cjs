const fs = require('fs');
const path = require('path');
const customElementsPath = path.join(__dirname, 'node_modules/@material/web/custom-elements.json');
const data = JSON.parse(fs.readFileSync(customElementsPath, 'utf8'));
let found = false;
data.modules.forEach(module => {
  if (module.exports) {
    module.exports.forEach(exportItem => {
      if (exportItem.kind === 'js' && exportItem.name.toLowerCase().includes('toolbar')) {
        console.log('Found:', exportItem.name, 'in', exportItem.declaration.module);
        found = true;
      }
    });
  }
});
if (!found) {
  console.log('No toolbar component found in custom-elements.json');
}
// Also check for md-toolbar
data.modules.forEach(module => {
  if (module.exports) {
    module.exports.forEach(exportItem => {
      if (exportItem.kind === 'js' && exportItem.name.toLowerCase().includes('md-toolbar')) {
        console.log('Found md-toolbar:', exportItem.name, 'in', exportItem.declaration.module);
        found = true;
      }
    });
  }
});
if (!found) {
  console.log('No md-toolbar component found');
}