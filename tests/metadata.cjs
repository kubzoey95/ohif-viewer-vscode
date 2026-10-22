const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { transformSync } = require('esbuild');
const { dicom } = require('./dicom-fixture.cjs');

// Load the production metadata reader without starting VS Code.
const sourceFile = path.resolve(__dirname, '../src/dicom-metadata.js');
const source = require('node:fs').readFileSync(sourceFile, 'utf8');
const compiled = transformSync(source, { format: 'cjs', target: 'node18' }).code;
const metadataModule = new Module(sourceFile, module);
metadataModule.filename = sourceFile;
metadataModule.paths = module.paths;
metadataModule._compile(compiled, sourceFile);
const { readDicomMetadata } = metadataModule.exports;

test('indexes a large image without reading its pixel payload; reuses and invalidates the header cache', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ohif-metadata-'));
    const file = path.join(directory, 'large.dcm');
    const open = fs.open;
    let bytesRead = 0;
    fs.open = async (...args) => {
        const handle = await open(...args);
        if (args[0] === file) {
            const read = handle.read.bind(handle);
            handle.read = async (...readArgs) => {
                const result = await read(...readArgs);
                bytesRead += result.bytesRead;
                return result;
            };
        }
        return handle;
    };
    try {
        const pixels = new Uint16Array(1024 * 1024).buffer;
        await fs.writeFile(file, dicom('1.2.3.4', '1.2.3.4.1', 0, { Rows: 1024, Columns: 1024, PixelData: pixels }));
        const metadata = await readDicomMetadata(file);
        assert.equal(metadata.SeriesInstanceUID, '1.2.3.4');
        assert.equal(metadata.PixelData, undefined);
        assert.ok(bytesRead <= 16 * 1024, `Read ${bytesRead} bytes to index a 2 MiB image`);
        bytesRead = 0;
        assert.equal(await readDicomMetadata(file), metadata);
        assert.equal(bytesRead, 0, 'Reopening an unchanged image should reuse its metadata');
        await fs.writeFile(file, dicom('1.2.3.5', '1.2.3.5.1', 0, { Rows: 1024, Columns: 1024, PixelData: pixels }));
        const changed = new Date(Date.now() + 1000);
        await fs.utimes(file, changed, changed);
        assert.equal((await readDicomMetadata(file)).SeriesInstanceUID, '1.2.3.5');
        assert.ok(bytesRead > 0, 'Changed files must be reindexed');
        bytesRead = 0;
        await assert.rejects(readDicomMetadata(file, () => true), { name: 'AbortError' });
        assert.equal(bytesRead, 0, 'Cancellation must stop disk reads');
    } finally {
        fs.open = open;
        await fs.rm(directory, { recursive: true, force: true });
    }
});
