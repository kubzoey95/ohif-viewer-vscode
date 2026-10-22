const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { pathToFileURL, fileURLToPath } = require('node:url');
const dcmjs = require('dcmjs');

function uri(url) {
    return { toString: () => url.href, fsPath: fileURLToPath(url) };
}
const Uri = {
    file: file => uri(pathToFileURL(file)),
    joinPath: (base, ...parts) => Uri.file(path.join(base.fsPath, ...parts)),
};
let provider;
const vscode = {
    Uri,
    workspace: { fs: {
        createDirectory: value => fs.mkdir(value.fsPath, { recursive: true }),
        readFile: value => fs.readFile(value.fsPath),
        writeFile: (value, bytes) => fs.writeFile(value.fsPath, bytes),
        delete: value => fs.rm(value.fsPath, { recursive: true, force: true }),
    } },
    window: { registerCustomEditorProvider: (_, value) => { provider = value; return { dispose() {} }; } },
};
const original = Module._load;
Module._load = function(name, ...args) {
    return name === 'vscode' ? vscode : original.call(this, name, ...args);
};
const extensionRoot = path.resolve(process.env.OHIF_EXTENSION_ROOT || path.join(__dirname, '..'));
const extension = require(path.join(extensionRoot, 'out/extension.js'));
Module._load = original;

function dicom(series, instance) {
    const data = new dcmjs.data.DicomDict(dcmjs.data.DicomMetaDictionary.denaturalizeDataset({
        TransferSyntaxUID: '1.2.840.10008.1.2.1',
        MediaStorageSOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
        MediaStorageSOPInstanceUID: instance,
    }));
    data.dict = dcmjs.data.DicomMetaDictionary.denaturalizeDataset({
        StudyInstanceUID: '1.2.3', SeriesInstanceUID: series, SOPInstanceUID: instance,
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.2', Modality: 'CT', PatientID: 'test',
        Rows: 2, Columns: 2, PixelData: new Uint16Array([0, 100, 200, 300]).buffer,
        PixelSpacing: [1, 1], ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
        ImagePositionPatient: [0, 0, 0], WindowCenter: 150, WindowWidth: 300, BitsAllocated: 16, BitsStored: 16, HighBit: 15,
        PixelRepresentation: 0, SamplesPerPixel: 1, PhotometricInterpretation: 'MONOCHROME2',
    });
    return Buffer.from(data.write());
}

test('opens a selected series directly in a webview using resource URLs', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ohif-webview-'));
    try {
        await fs.writeFile(path.join(root, 'slice #1.dcm'), dicom('1.2.3.4', '1.2.3.4.1'));
        await fs.writeFile(path.join(root, 'other.dcm'), dicom('1.2.3.5', '1.2.3.5.1'));
        const subscriptions = [];
        extension.activate({ extensionUri: Uri.file(extensionRoot),
            globalStorageUri: Uri.file(path.join(root, 'storage')), subscriptions });
        assert.equal(subscriptions.length, 1);
        const document = provider.openCustomDocument(Uri.file(path.join(root, 'slice #1.dcm')));
        const webview = { cspSource: 'https://*.vscode-cdn.net', asWebviewUri: value => ({ toString: () => 'https://file%2B.vscode-resource.vscode-cdn.net' + pathToFileURL(value.fsPath).pathname }), html: '' };
        await provider.resolveCustomEditor(document, { webview }, { isCancellationRequested: false });
        if (process.env.OHIF_BROWSER_TEST) { await require('./browser.cjs')(webview.html, webview.options.localResourceRoots.map(root => root.fsPath)); }
        assert.match(webview.html, /id="root"/);
        assert.doesNotMatch(webview.html, /<iframe|localhost|init-service-worker\.js/);
        assert.match(webview.html, /history.replaceState/);
        assert.match(webview.html, /Content-Security-Policy/);
        assert.doesNotMatch(webview.html, /(?:src|href)="\//);
        const json = JSON.parse(await fs.readFile(path.join(document.metaDir.fsPath, 'dicom.json')));
        assert.equal(json.studies[0].series.length, 1);
        assert.equal(json.studies[0].series[0].SeriesInstanceUID, '1.2.3.4');
        assert.equal(json.studies[0].NumInstances, 1);
        assert.match(json.studies[0].series[0].instances[0].url, /slice%20%231.dcm$/);
        document.dispose();
    } finally { await fs.rm(root, { recursive: true, force: true }); }
});

if (process.env.OHIF_DICOM_FILE) {
    test('renders a supplied DICOM series', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ohif-webview-'));
        try {
            extension.activate({ extensionUri: Uri.file(extensionRoot),
                globalStorageUri: Uri.file(root), subscriptions: [] });
            const document = provider.openCustomDocument(Uri.file(process.env.OHIF_DICOM_FILE));
            const webview = { cspSource: 'https://*.vscode-cdn.net',
                asWebviewUri: value => ({ toString: () => 'https://file%2B.vscode-resource.vscode-cdn.net' + pathToFileURL(value.fsPath).pathname }), html: '' };
            await provider.resolveCustomEditor(document, { webview }, { isCancellationRequested: false });
            await require('./browser.cjs')(webview.html, webview.options.localResourceRoots.map(root => root.fsPath));
            document.dispose();
        } finally { await fs.rm(root, { recursive: true, force: true }); }
    });
}
