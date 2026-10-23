import * as vscode from 'vscode';
import { doConversion } from './dicom-json-generator.js';
import { randomUUID } from 'crypto';
import { readDicomMetadata } from './dicom-metadata.js';

class DcmViewDocument implements vscode.CustomDocument {
    public readonly dir: vscode.Uri;
    public readonly metaDir: vscode.Uri;

    constructor(public readonly uri: vscode.Uri, storage: vscode.Uri, public readonly folder = false) {
        this.dir = folder ? uri : vscode.Uri.joinPath(uri, '..');
        this.metaDir = vscode.Uri.joinPath(storage, randomUUID());
    }

    dispose(): void {
        void vscode.workspace.fs.delete(this.metaDir, { recursive: true }).then(undefined, () => {});
    }
}

function scriptValue(value: string): string {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

function attribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export class DcmView implements vscode.CustomReadonlyEditorProvider<DcmViewDocument> {
    constructor(private readonly extensionUri: vscode.Uri, private readonly storage: vscode.Uri) {}

    async openFolder(uri: vscode.Uri): Promise<void> {
        const document = new DcmViewDocument(uri, this.storage, true);
        const panel = vscode.window.createWebviewPanel('dcmView', `OHIF: ${uri.path.split('/').pop()}`,
            vscode.ViewColumn.Active, { retainContextWhenHidden: true });
        panel.onDidDispose(() => document.dispose());
        const cancellation = new vscode.CancellationTokenSource();
        panel.onDidDispose(() => { cancellation.cancel(); cancellation.dispose(); });
        await this.resolveCustomEditor(document, panel, cancellation.token);
    }

    openCustomDocument(uri: vscode.Uri): DcmViewDocument {
        return new DcmViewDocument(uri, this.storage);
    }

    async resolveCustomEditor(document: DcmViewDocument, panel: vscode.WebviewPanel,
        token: vscode.CancellationToken): Promise<void> {
        const workerScript = vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-worker.js');
        const viewer = vscode.Uri.joinPath(this.extensionUri, 'out', 'viewer-dist');
        const webview = panel.webview;
        webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'out'), document.dir, document.metaDir],
        };
        let disposed = false;
        let viewerReady = false;
        let state: Record<string, unknown> = { type: 'metadata-progress', completed: 0, total: 0 };
        const sendState = () => {
            if (viewerReady && !disposed) { void webview.postMessage(state); }
        };
        const receive = webview.onDidReceiveMessage(message => {
            if (message?.type === 'viewer-ready') { viewerReady = true; sendState(); }
        });
        panel.onDidDispose(() => { disposed = true; receive.dispose(); });
        const isCancelled = () => disposed || token.isCancellationRequested;
        let htmlAssigned = false;
        try {
            await vscode.workspace.fs.createDirectory(document.metaDir);
            const jsonUri = vscode.Uri.joinPath(document.metaDir, 'dicom.json');
            let html = Buffer.from(await vscode.workspace.fs.readFile(
                vscode.Uri.joinPath(viewer, 'index.html'))).toString('utf8');
            const base = webview.asWebviewUri(viewer).toString() + '/';
            const jsonUrl = webview.asWebviewUri(jsonUri).toString();
            // Keep routing on the webview origin; assets use the separate VS Code resource origin.
            const startupScript = vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-startup.js');
            const bootstrap = `<script>window.__OHIF_METADATA_URL__=${scriptValue(jsonUrl)};window.PUBLIC_URL='/';window.__OHIF_ASSET_URL__=${scriptValue(base)};const route=new URL(location.href);route.pathname='/viewer/dicomjson';route.searchParams.set('url',${scriptValue(jsonUrl)});history.replaceState(null,'',route.href);</script><script src="${attribute(webview.asWebviewUri(startupScript).toString())}"></script><script src="${attribute(webview.asWebviewUri(workerScript).toString())}"></script>`;
            html = html.replace(/window\.PUBLIC_URL\s*=\s*(['"])[^'"]*\1\s*;/g, '');
            html = html.replace(/<script\b[^>]*src=["'][^"']*init-service-worker\.js["'][^>]*><\/script>/g, '');
            html = html.replace(/\b(src|href)="\/(?!\/)([^"]*)"/g,
                (_, name, resource) => `${name}="${attribute(base)}${resource}"`);
            const csp = `default-src 'none'; base-uri ${webview.cspSource}; script-src ${webview.cspSource} blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src ${webview.cspSource} data: https://fonts.gstatic.com; img-src ${webview.cspSource} data: blob:; connect-src ${webview.cspSource} blob:; worker-src blob:; media-src ${webview.cspSource} blob: data:;`;
            html = html.replace(/<head>/i, `<head><meta http-equiv="Content-Security-Policy" content="${attribute(csp)}"><base href="${attribute(base)}">${bootstrap}`);
            html = html.replace(/<body>/i, '<body><div id="ohif-startup-status" role="status" style="position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:#101014;color:#eee;font:16px sans-serif">Preparing series…</div>');
            if (isCancelled()) { return; }
            webview.html = html;
            htmlAssigned = true;
            const instance = document.folder ? undefined : await readDicomMetadata(document.uri.fsPath, isCancelled);
            if (!document.folder && !instance?.SeriesInstanceUID) { throw new Error('The selected file has no DICOM series.'); }
            let lastProgress = 0;
            const json = await doConversion(document.dir.fsPath, '', undefined,
                (file: string) => webview.asWebviewUri(vscode.Uri.file(file)).toString(), {
                    selectedInstance: instance,
                    recursive: document.folder,
                    isCancelled,
                    onProgress: (completed: number, total: number) => {
                        if (Date.now() - lastProgress < 100 && completed !== total) { return; }
                        lastProgress = Date.now();
                        state = { type: 'metadata-progress', completed, total };
                        sendState();
                    },
                });
            if (!json.studies.length || !json.studies[0].series.length) {
                throw new Error(document.folder ? 'No DICOM instances with study and series identifiers were found in this folder.' : 'The selected DICOM series could not be loaded.');
            }
            if (isCancelled()) { return; }
            await vscode.workspace.fs.writeFile(jsonUri, Buffer.from(JSON.stringify(json)));
            state = { type: 'metadata-ready' };
            sendState();
        } catch (error) {
            if (!isCancelled()) {
                state = { type: 'metadata-error', message: String(error) };
                sendState();
                if (!htmlAssigned) {
                    webview.html = `<html><body><h2>Unable to open DICOM series</h2><p>${attribute(String(error))}</p></body></html>`;
                }
            }
        }
    }
}
