const fs = require('node:fs');
const path = require('node:path');
const destination = path.resolve(__dirname, '../out/viewer-dist');
fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(path.resolve(__dirname, '../Viewers/platform/app/dist'), destination, { recursive: true });
require('./prepare-viewer.cjs');
