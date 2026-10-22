const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const viewer = path.join(root, 'out/viewer-dist');
assert.ok(fs.existsSync(path.join(viewer, 'index.html')),
    'Build OHIF first with npm run build-viewer. Release packaging uses the built viewer assets.');
fs.copyFileSync(path.join(root, 'ohifConfig.js'), path.join(viewer, 'app-config.js'));
require('./prepare-viewer.cjs');
const html = fs.readFileSync(path.join(viewer, 'index.html'), 'utf8');
for (const [, resource] of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
    if (/^(?:https?:|data:|\/\/)/.test(resource)) { continue; }
    const file = path.resolve(viewer, resource.replace(/^\//, ''));
    assert.ok(file.startsWith(viewer + path.sep) && fs.existsSync(file),
        `Missing viewer asset: ${resource}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(viewer, 'webview-assets.json'), 'utf8'));
assert.ok(manifest.wasm.length, 'Viewer has no decoder WASM assets.');
for (const name of [...Object.keys(manifest.scripts), ...Object.values(manifest.scripts).flat(), ...manifest.wasm]) {
    assert.ok(fs.existsSync(path.join(viewer, name)), `Missing worker asset: ${name}`);
}
for (const helper of ['webview-worker.js', 'webview-startup.js']) {
    assert.ok(fs.existsSync(path.join(root, 'out', helper)), `Compile the webview helper first: ${helper}`);
}
console.log('Validated built viewer entry points, worker dependencies and decoder assets.');
