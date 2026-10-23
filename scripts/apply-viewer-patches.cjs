const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'patches');
for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.patch')).sort()) {
    const patch = path.join(directory, name);
    const apply = (...args) => spawnSync('git', ['apply', ...args, patch], {
        cwd: path.join(root, 'Viewers'), encoding: 'utf8',
    });
    if (apply('--reverse', '--check').status === 0) { continue; }
    const check = apply('--check');
    if (check.status !== 0) {
        throw new Error(`Unable to apply ${name}: ${check.error?.message || check.stderr}`);
    }
    const result = apply();
    if (result.status !== 0) {
        throw new Error(`Unable to apply ${name}: ${result.error?.message || result.stderr}`);
    }
    console.log(`Applied OHIF compatibility patch: ${name}`);
}
