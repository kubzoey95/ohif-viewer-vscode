const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { transformSync, buildSync } = require('esbuild');
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

const generatorFile = path.resolve(__dirname, '../src/dicom-json-generator.js');
const generatorModule = new Module(generatorFile, module);
generatorModule.filename = generatorFile;
generatorModule.paths = module.paths;
generatorModule._compile(buildSync({ entryPoints: [generatorFile], bundle: true,
    platform: 'node', format: 'cjs', packages: 'external', write: false }).outputFiles[0].text, generatorFile);
const { doConversion } = generatorModule.exports;

test('local multiframe image IDs select distinct one-based frames', () => {
    const helperFile = path.resolve(__dirname,
        '../Viewers/extensions/default/src/DicomWebDataSource/utils/getImageId.js');
    const helperModule = new Module(helperFile, module);
    helperModule._compile(buildSync({ entryPoints: [helperFile], bundle: true,
        platform: 'node', format: 'cjs', write: false }).outputFiles[0].text, helperFile);
    const getImageId = helperModule.exports.default;
    for (const scheme of ['dicomweb', 'wadouri']) {
        const instance = { url: `${scheme}:https://example.test/enhanced.dcm` };
        assert.equal(getImageId({ instance }), instance.url);
        assert.equal(getImageId({ instance, frame: 0 }), instance.url + '?frame=1');
        assert.equal(getImageId({ instance, frame: 533 }), instance.url + '?frame=534');
        assert.equal(getImageId({ instance: { url: instance.url + '?token=value' }, frame: 1 }),
            instance.url + '?token=value&frame=2');
        assert.equal(getImageId({ instance: { url: instance.url + '?frame=1' }, frame: 1 }),
            instance.url + '?frame=2');
    }
});

test('keeps enhanced multiframe functional groups once per SOP instance', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ohif-multiframe-'));
    try {
        const frames = 534;
        const groups = Array.from({ length: frames }, (_, index) => ({
            PlanePositionSequence: [{ ImagePositionPatient: [0, 0, index] }],
        }));
        await fs.writeFile(path.join(directory, 'enhanced.dcm'), dicom('1.2.3.4', '1.2.3.4.1', 0, {
            SOPClassUID: '1.2.840.10008.5.1.4.1.1.2.1',
            NumberOfFrames: frames,
            SharedFunctionalGroupsSequence: [{ PixelMeasuresSequence: [{ PixelSpacing: [1, 1], SliceThickness: 1 }] }],
            PerFrameFunctionalGroupsSequence: groups,
            PixelData: new Uint16Array(frames * 4).buffer,
        }));
        const output = path.join(directory, 'metadata.json');
        const model = await doConversion(directory, 'https://example.test/', output);
        const instances = model.studies[0].series[0].instances;
        assert.equal(instances.length, 1);
        assert.equal(model.studies[0].NumInstances, 1);
        assert.equal(instances[0].metadata.NumberOfFrames, frames);
        assert.deepEqual(instances[0].metadata.PerFrameFunctionalGroupsSequence.map(group =>
            group.PlanePositionSequence[0].ImagePositionPatient), groups.map(group =>
            group.PlanePositionSequence[0].ImagePositionPatient));
        assert.deepEqual(instances[0].metadata.SharedFunctionalGroupsSequence[0].PixelMeasuresSequence[0].PixelSpacing, [1, 1]);
        assert.equal(instances[0].url, 'dicomweb:https://example.test/enhanced.dcm');
        assert.deepEqual(JSON.parse(await fs.readFile(output, 'utf8')), JSON.parse(JSON.stringify(model)));
        assert.ok((await fs.stat(output)).size < 500_000, 'Metadata must grow linearly with frame count');
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
});

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
