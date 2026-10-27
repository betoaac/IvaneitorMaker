const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
for (const folder of ['.', 'scripts']) for (const file of fs.readdirSync(folder)) {
    if (file.endsWith('.js')) cp.execFileSync(process.execPath, ['--check', path.join(folder, file)], { stdio: 'inherit' });
}
const html = fs.readFileSync('index.html', 'utf8');
for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    if (match[1].startsWith('https:') || match[1].startsWith('vendor/')) continue;
    if (!fs.existsSync(match[1])) throw new Error('Script ausente: ' + match[1]);
}
console.log('Sintaxis y entradas HTML correctas.');
const vm = require('node:vm');
const assets = {};
vm.runInNewContext(fs.readFileSync('assets.js', 'utf8'), assets);
for (const file of [...Object.values(assets.CARD_ASSETS), ...Object.values(assets.CARD_EXPORT_ASSETS || {})]) {
    let folder = '.';
    for (const component of file.split('/')) {
        if (!fs.readdirSync(folder).includes(component)) throw new Error('Recurso ausente o mayúsculas incorrectas: ' + file);
        folder = path.join(folder, component);
    }
}
console.log(`${Object.keys(assets.CARD_ASSETS).length} recursos con rutas y mayúsculas verificadas.`);
