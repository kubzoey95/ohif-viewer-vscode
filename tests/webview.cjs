const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { dicom } = require('./dicom-fixture.cjs');

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

function createPanel() {
    let receive;
    const messages = [];
    const webview = {
        cspSource: 'https://*.vscode-cdn.net', html: '',
        asWebviewUri: value => ({ toString: () => 'https://file%2B.vscode-resource.vscode-cdn.net' + pathToFileURL(value.fsPath).pathname }),
        onDidReceiveMessage: listener => { receive = listener; return { dispose() {} }; },
        postMessage: async message => { messages.push(message); return true; },
    };
    return { webview, onDidDispose() { return { dispose() {} }; },
        ready() { receive({ type: 'viewer-ready' }); }, messages };
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
        const panel = createPanel();
        const webview = panel.webview;
        let html;
        Object.defineProperty(webview, 'html', {
            get: () => html,
            set: value => { html = value; panel.ready(); },
        });
        await provider.resolveCustomEditor(document, panel, { isCancellationRequested: false });
        panel.ready();
        assert.equal(panel.messages.at(-1).type, 'metadata-ready');
        assert.ok(panel.messages.some(message => message.type === 'metadata-progress'));
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
            const panel = createPanel();
            const webview = panel.webview;
            await provider.resolveCustomEditor(document, panel, { isCancellationRequested: false });
            panel.ready();
            assert.equal(panel.messages.at(-1).type, 'metadata-ready');
            await require('./browser.cjs')(webview.html, webview.options.localResourceRoots.map(root => root.fsPath), {
                expectedFrameCount: Number(process.env.OHIF_EXPECTED_FRAMES) || undefined,
            });
            document.dispose();
        } finally { await fs.rm(root, { recursive: true, force: true }); }
    });
}


test('renders the first image while the remaining slices load in the background',
    { skip: !process.env.OHIF_BROWSER_TEST }, async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ohif-webview-'));
        try {
            for (let index = 0; index < 32; index++) {
                await fs.writeFile(path.join(root, `${index}.dcm`), dicom('1.2.3.4', `1.2.3.4.${index + 1}`, index));
            }
            extension.activate({ extensionUri: Uri.file(extensionRoot), globalStorageUri: Uri.file(path.join(root, 'storage')), subscriptions: [] });
            const document = provider.openCustomDocument(Uri.file(path.join(root, '0.dcm')));
            const panel = createPanel();
            await provider.resolveCustomEditor(document, panel, { isCancellationRequested: false });
            await require('./browser.cjs')(panel.webview.html, panel.webview.options.localResourceRoots.map(root => root.fsPath),
                { expectBackgroundLoading: true, metadataDelay: 500 });
            document.dispose();
        } finally { await fs.rm(root, { recursive: true, force: true }); }
    });
