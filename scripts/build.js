const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'site');
if (path.dirname(target) !== root || path.basename(target) !== 'site') throw new Error('Destino de build fuera del proyecto.');
fs.rmSync(target, { recursive: true, force: true });
// Publish an explicit allowlist. Never include local saves, installers, backups or node_modules.
const files = ['index.html', 'style.css', 'web.css', 'core.js', 'images.js', 'assets.js', 'renderer.js', 'storage.js', 'drive.js', 'auth.js', 'main.js', 'autocomplete.js', 'pokemon-names.json', 'editor.js', 'library.js', 'batch.js', 'config.js', 'privacy.html'];
fs.mkdirSync(target, { recursive: true });
for (const name of files) fs.copyFileSync(path.join(root, name), path.join(target, name));
function copyDirectory(source, destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const item of fs.readdirSync(source, { withFileTypes: true })) {
        if (item.name.endsWith('_old')) continue;
        const from = path.join(source, item.name), to = path.join(destination, item.name);
        if (item.isDirectory()) copyDirectory(from, to); else fs.copyFileSync(from, to);
    }
}
for (const name of ['web-assets', 'fuentes']) copyDirectory(path.join(root, name), path.join(target, name));
fs.mkdirSync(path.join(target, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/fflate/umd/index.js'), path.join(target, 'vendor/fflate.js'));
fs.copyFileSync(path.join(root, 'node_modules/fflate/LICENSE'), path.join(target, 'vendor/fflate.LICENSE'));
fs.writeFileSync(path.join(target, '.nojekyll'), '');
if (process.env.GOOGLE_CLIENT_ID) fs.writeFileSync(path.join(target, 'config.js'), `globalThis.CARDMAKER_CONFIG = ${JSON.stringify({ googleClientId: process.env.GOOGLE_CLIENT_ID })};\n`);
let size = 0;
function measure(directory) { for (const file of fs.readdirSync(directory, { withFileTypes: true })) { const full = path.join(directory, file.name); if (file.isDirectory()) measure(full); else { const bytes = fs.statSync(full).size; if (bytes > 25 * 1024 * 1024) throw new Error('Archivo web demasiado grande: ' + full); size += bytes; } } }
measure(target);
if (size > 900 * 1024 * 1024) throw new Error('El sitio supera el presupuesto de tamaño.');
console.log(`Sitio preparado: ${(size / 1048576).toFixed(1)} MB en ${target}`);
