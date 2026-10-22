// Webpack's runtime must load lazy chunks and workers from the webview resource URL.
const fs = require('node:fs');
const path = require('node:path');
const directory = path.resolve(__dirname, '../out/viewer-dist');
let patched = 0;
for (const name of fs.readdirSync(directory)) {
    if (!name.endsWith('.js')) { continue; }
    const file = path.join(directory, name);
    const source = fs.readFileSync(file, 'utf8');
    const result = source.replace(/\.p=globalThis\.PUBLIC_URL/g, '.p=globalThis.__OHIF_ASSET_URL__').replace(/\b([\w$]+)\.p\s*=\s*['"](?:\/|\.\/)['"]/g,
        '$1.p=globalThis.__OHIF_ASSET_URL__');
    if (source !== result) {
        fs.writeFileSync(file, result);
        patched++;
    }
}
if (!patched && !fs.readdirSync(directory).some(name =>
    /^app.*\.js$/.test(name) && fs.readFileSync(path.join(directory, name), 'utf8').includes('.p=globalThis.__OHIF_ASSET_URL__'))) {
    throw new Error('OHIF asset runtime was not found; check the viewer build output.');
}
console.log(`Prepared OHIF webview assets (${patched} runtimes updated).`);

const names = fs.readdirSync(directory);
const scripts = {};
for (const name of names.filter(name => name.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(directory, name), 'utf8');
    const dependencies = new Set();
    // Webpack/Rspack worker runtimes map chunk numbers to content hashes.
    for (const match of source.matchAll(/["']?(\d+)["']?\s*:\s*["']([a-f0-9]{16,})["']/g)) {
        const dependency = `${match[1]}.bundle.${match[2]}.js`;
        if (names.includes(dependency)) { dependencies.add(dependency); }
    }
    for (const match of source.matchAll(/["']([^"']+\.bundle\.[a-f0-9]+\.js)["']/g)) {
        if (names.includes(match[1])) { dependencies.add(match[1]); }
    }
    scripts[name] = [...dependencies];
}
fs.writeFileSync(path.join(directory, 'webview-assets.json'), JSON.stringify({
    scripts, wasm: names.filter(name => name.endsWith('.wasm')),
}));
